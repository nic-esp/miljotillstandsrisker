import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { handleRequest } from '../worker.mjs';

const endpoint = 'https://mcp.example.test/mcp';

function request(path, options = {}) {
  return handleRequest(new Request(`https://mcp.example.test${path}`, options));
}

test('health, manifest, CORS, and not-found routes are public', async () => {
  const health = await request('/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await health.json(), {
    status: 'ok',
    service: 'miljotillstandsrisker',
    version: '2.0.0',
    transport: 'streamable-http',
    authentication: 'none',
    risks: 342,
    nodes: 160,
  });

  const manifest = await request('/');
  assert.equal(manifest.status, 200);
  assert.equal((await manifest.json()).mcp_endpoint, endpoint);

  const preflight = await request('/mcp', {
    method: 'OPTIONS',
    headers: { Origin: 'https://arbitrary-ai-client.example' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.match(preflight.headers.get('access-control-allow-headers'), /MCP-Protocol-Version/i);

  const missing = await request('/nope');
  assert.equal(missing.status, 404);
});

test('raw Streamable HTTP initialize and tool calls work without sessions', async () => {
  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  const initialize = await handleRequest(new Request(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'raw-test', version: '1.0.0' },
      },
    }),
  }));
  assert.equal(initialize.status, 200);
  assert.equal(initialize.headers.get('mcp-session-id'), null);
  const initBody = await initialize.json();
  assert.equal(initBody.id, 1);
  assert.equal(initBody.result.serverInfo.name, 'miljotillstandsrisker');
  assert.ok(initBody.result.capabilities.tools);

  const list = await handleRequest(new Request(endpoint, {
    method: 'POST',
    headers: { ...headers, 'MCP-Protocol-Version': initBody.result.protocolVersion },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  }));
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.ok(listBody.result.tools.some(tool => tool.name === 'search'));

  const call = await handleRequest(new Request(endpoint, {
    method: 'POST',
    headers: { ...headers, 'MCP-Protocol-Version': initBody.result.protocolVersion },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'fetch', arguments: { id: 'R-B10-010-01' } },
    }),
  }));
  assert.equal(call.status, 200);
  const callBody = await call.json();
  assert.equal(callBody.result.structuredContent.id, 'R-B10-010-01');
});

test('official SDK Streamable HTTP client connects and calls tools', async () => {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    fetch: async (input, init) => handleRequest(new Request(input, init)),
  });
  const client = new Client({ name: 'http-sdk-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.ok(tools.some(tool => tool.name === 'search'));
    const result = await client.callTool({
      name: 'search',
      arguments: { query: 'vattenverksamhet' },
    });
    assert.ok(result.structuredContent.results.length > 0);
  } finally {
    await client.close();
  }
});

test('stateless MCP endpoint rejects standalone GET and DELETE', async () => {
  for (const method of ['GET', 'DELETE']) {
    const response = await handleRequest(new Request(endpoint, {
      method,
      headers: { Accept: 'application/json, text/event-stream' },
    }));
    assert.equal(response.status, 405);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const remoteMcpUrl = process.env.MCP_URL;
const temporaryPreview = process.env.MCP_PREVIEW === '1';

test('deployed endpoint passes health, discovery, search, fetch, and exhaustive retrieval', {
  skip: !remoteMcpUrl,
  timeout: 60_000,
}, async () => {
  const endpoint = new URL(remoteMcpUrl);
  const healthUrl = new URL('/health', endpoint);
  const healthResponse = await fetch(healthUrl);
  if (!temporaryPreview || healthResponse.ok) {
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.status, 'ok');
    assert.equal(health.risks, 342);
    assert.equal(health.nodes, 160);
  }

  const client = new Client({ name: 'remote-deployment-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(endpoint);
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.ok(tools.some(tool => tool.name === 'search'));
    assert.ok(tools.every(tool => tool.annotations?.readOnlyHint === true));

    const search = await client.callTool({
      name: 'search',
      arguments: { query: 'Prövningsobjektet låses för snävt' },
    });
    assert.equal(search.structuredContent.results[0].id, 'R-B10-010-01');

    const fetched = await client.callTool({
      name: 'fetch',
      arguments: { id: search.structuredContent.results[0].id },
    });
    assert.equal(fetched.structuredContent.id, 'R-B10-010-01');

    const ids = [];
    let cursor;
    do {
      const result = await client.callTool({
        name: 'get_dataset_page',
        arguments: { limit: 25, ...(cursor ? { cursor } : {}) },
      });
      ids.push(...result.structuredContent.risks.map(risk => risk.risk_id));
      cursor = result.structuredContent.next_cursor;
    } while (cursor);
    assert.equal(ids.length, 342);
    assert.equal(new Set(ids).size, 342);
  } finally {
    await client.close();
  }
});

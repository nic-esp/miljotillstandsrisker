import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import risks from '../Artefakt_C_riskregister.json' with { type: 'json' };
import nodesByChart from '../_build/mappable_nodes.json' with { type: 'json' };
import processCharts from '../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json' with { type: 'json' };
import sources from './data/sources.json' with { type: 'json' };
import { SERVICE_NAME, SERVICE_VERSION, createRiskRegistry } from './risk-service.mjs';

const registry = createRiskRegistry({ risks, nodesByChart, sources, processCharts });

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type, Last-Event-ID, MCP-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'MCP-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '') || '/';

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (path === '/health' && request.method === 'GET') {
    const stats = registry.stats();
    return json({
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      transport: 'streamable-http',
      authentication: 'none',
      risks: stats.total_risks,
      nodes: stats.mappable_nodes,
    });
  }

  if (path === '/' && request.method === 'GET') {
    return json({
      ...registry.manifest(),
      mcp_endpoint: `${url.origin}/mcp`,
      health_endpoint: `${url.origin}/health`,
      transport: 'Streamable HTTP',
      authentication: 'none',
    });
  }

  if (path === '/mcp') {
    if (request.method !== 'POST') {
      return json({ error: 'Stateless endpoint accepts POST requests only' }, 405, { Allow: 'POST, OPTIONS' });
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = registry.createServer();
    try {
      await server.connect(transport);
      return withCors(await transport.handleRequest(request));
    } catch (error) {
      console.error('MCP request failed', error instanceof Error ? error.message : error);
      return json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      }, 500);
    }
  }

  return json({ error: 'Not found' }, 404);
}

export default { fetch: handleRequest };

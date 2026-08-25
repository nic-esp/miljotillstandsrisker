import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import risks from '../Artefakt_C_riskregister.json' with { type: 'json' };
import nodesByChart from '../_build/mappable_nodes.json' with { type: 'json' };
import processCharts from '../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json' with { type: 'json' };
import sources from './data/sources.json' with { type: 'json' };
import { SERVICE_NAME, SERVICE_VERSION, createRiskRegistry } from './risk-service.mjs';
import { serializeRiskCsv, serializeRiskItemCsv } from '../_build/risk_fields.mjs';

const registry = createRiskRegistry({ risks, nodesByChart, sources, processCharts });
const riskById = new Map(registry.orderedRisks.map(risk => [risk.risk_id, risk]));
const chartNames = Object.fromEntries(processCharts.charts.map(chart => [chart.metadata.chartKey, chart.name]));
const riskCsv = serializeRiskCsv(risks, chartNames);
const riskItemCsv = serializeRiskItemCsv(risks, chartNames);
const RISK_CSV_PATH = '/data/riskregister.csv';
const RISK_ITEM_CSV_PATH = '/data/riskregister-items.csv';

const RAW_DATA = new Map([
  ['/data/riskregister.json', risks],
  ['/data/nodes.json', nodesByChart],
  ['/data/sources.json', sources],
  ['/data/process-charts.json', processCharts],
]);

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
      'X-Content-Type-Options': 'nosniff',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function text(value, contentType = 'text/plain; charset=utf-8', status = 200, extraHeaders = {}) {
  return new Response(value, {
    status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function boundedInteger(value, fallback, { min, max, name }) {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} måste vara ett heltal mellan ${min} och ${max}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} måste vara ett heltal mellan ${min} och ${max}`);
  }
  return parsed;
}

function aiAccessHtml(origin) {
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Miljötillståndsrisker – MCP och REST</title><meta name="robots" content="index,follow">
<meta name="description" content="Publik MCP- och REST-åtkomst till 342 risker i den svenska miljötillståndsprocessen.">
<link rel="canonical" href="${origin}/ai-access"><link rel="sitemap" type="application/xml" href="${origin}/sitemap.xml">
<style>body{max-width:850px;margin:48px auto;padding:0 24px;font:16px/1.6 system-ui;color:#212a35}code,pre{font-family:ui-monospace,monospace}pre{padding:14px;background:#eef0f3;overflow:auto}a{color:#33506e}</style></head>
<body><main><h1>Miljötillståndsrisker – AI-åtkomst</h1>
<p>Offentlig, autentiseringsfri och skrivskyddad åtkomst till 342 riskposter, 160 riskmappbara noder, källor och processkartor B00–B70. Varje risk har 3–5 möjliga utlösande faktorer och 3–5 möjliga konsekvenser, där varje post skiljer en källförankrad premiss från en analytisk riskbedömning.</p>
<h2>MCP</h2><pre>${origin}/mcp</pre><p>Transport: Streamable HTTP. Använd <code>search</code>/<code>fetch</code> eller hämta allt med <code>get_dataset_page</code>.</p>
<h2>REST och rådata</h2><ul>
<li><a href="${origin}/api/risks?limit=20&amp;offset=0">Sök/lista risker med paginering</a></li>
<li><a href="${origin}/api/risks/R-B10-010-01">Hämta en risk via ID</a></li>
<li><a href="${origin}/data/riskregister.json">Alla riskposter</a></li>
<li><a href="${origin}${RISK_CSV_PATH}">Alla riskposter som bow-tie-CSV</a></li>
<li><a href="${origin}${RISK_ITEM_CSV_PATH}">Normaliserad CSV – en rad per orsak eller konsekvens</a></li>
<li><a href="${origin}/data/nodes.json">Alla riskmappbara noder</a></li>
<li><a href="${origin}/data/sources.json">Källregister</a></li>
<li><a href="${origin}/data/process-charts.json">Processkartor B00–B70</a></li>
</ul><p><a href="${origin}/openapi.json">OpenAPI 3.1</a> · <a href="${origin}/llms.txt">llms.txt</a> · <a href="${origin}/health">Hälsokontroll</a> · <a href="https://nic-esp.github.io/miljotillstandsrisker/">Webbapp</a></p>
</main></body></html>`;
}

function llmsText(origin) {
  return `# Miljötillståndsrisker

Public, read-only Swedish risk registry: 342 complete risks, 160 risk-mappable nodes, sources, and process charts B00-B70. Each risk contains 3-5 possible trigger factors and 3-5 possible consequences. A source item identifies a source-grounded premise; an analysis item is an analytical risk inference.

- AI access guide: ${origin}/ai-access
- MCP (Streamable HTTP, no auth): ${origin}/mcp
- OpenAPI: ${origin}/openapi.json
- REST list/search: ${origin}/api/risks?limit=20&offset=0
- Complete risks: ${origin}/data/riskregister.json
- Complete risks (CSV with bow_tie_json): ${origin}${RISK_CSV_PATH}
- Normalized trigger/consequence rows (CSV): ${origin}${RISK_ITEM_CSV_PATH}
- Nodes: ${origin}/data/nodes.json
- Sources: ${origin}/data/sources.json
- Process charts: ${origin}/data/process-charts.json

For MCP, use search then fetch. For exhaustive MCP retrieval without oversized tool responses, call get_dataset_page with limit 25 and follow next_cursor until null.
`;
}

function openApiDocument(origin) {
  const jsonContent = schema => ({ 'application/json': { schema } });
  return {
    openapi: '3.1.0',
    info: {
      title: 'Miljötillståndsrisker read-only API',
      version: SERVICE_VERSION,
      description: 'Public, authentication-free retrieval of the Swedish environmental permitting risk registry. Each event includes several possible trigger factors and consequences with explicit evidence status.',
    },
    servers: [{ url: origin }],
    security: [],
    paths: {
      '/health': {
        get: {
          operationId: 'getHealth',
          summary: 'Service health and dataset counts',
          responses: { 200: { description: 'Healthy', content: jsonContent({ $ref: '#/components/schemas/Health' }) } },
        },
      },
      '/api/risks': {
        get: {
          operationId: 'listRisks',
          summary: 'Search, filter, and page through complete risk records',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 500 } },
            { name: 'chart_key', in: 'query', schema: { type: 'string' } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'origin', in: 'query', schema: { type: 'string' } },
            { name: 'node_id', in: 'query', schema: { type: 'string' } },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 342, default: 0 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          ],
          responses: {
            200: { description: 'A deterministic page of complete risk records', content: jsonContent({ $ref: '#/components/schemas/RiskPage' }) },
            400: { description: 'Invalid query parameter', content: jsonContent({ $ref: '#/components/schemas/Error' }) },
          },
        },
      },
      '/api/risks/{risk_id}': {
        get: {
          operationId: 'getRisk',
          summary: 'Retrieve one complete risk record by ID',
          parameters: [{ name: 'risk_id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Complete risk record', content: jsonContent({ $ref: '#/components/schemas/RiskWithUrl' }) },
            404: { description: 'Risk not found', content: jsonContent({ $ref: '#/components/schemas/Error' }) },
          },
        },
      },
      '/data/riskregister.json': {
        get: {
          operationId: 'downloadRiskRegister', summary: 'Download all 342 complete risk records',
          responses: { 200: { description: 'JSON array', content: jsonContent({ type: 'array', items: { $ref: '#/components/schemas/Risk' } }) } },
        },
      },
      '/data/riskregister.csv': {
        get: {
          operationId: 'downloadRiskRegisterCsv', summary: 'Download all 342 risk records as comma-delimited UTF-8 CSV',
          responses: { 200: { description: 'One row per risk with rubrik plus a lossless causes-event-effects bow_tie_json column', content: { 'text/csv': { schema: { type: 'string' } } } } },
        },
      },
      '/data/riskregister-items.csv': {
        get: {
          operationId: 'downloadRiskItemsCsv', summary: 'Download normalized trigger-factor and consequence rows',
          responses: { 200: { description: 'One CSV row per trigger factor or consequence', content: { 'text/csv': { schema: { type: 'string' } } } } },
        },
      },
      '/data/nodes.json': {
        get: {
          operationId: 'downloadNodes', summary: 'Download all risk-mappable nodes grouped by chart',
          responses: { 200: { description: 'JSON object', content: jsonContent({ type: 'object', additionalProperties: { type: 'array', items: { type: 'object', additionalProperties: true } } }) } },
        },
      },
      '/data/sources.json': {
        get: {
          operationId: 'downloadSources', summary: 'Download the source registry',
          responses: { 200: { description: 'JSON array', content: jsonContent({ type: 'array', items: { type: 'object', additionalProperties: true } }) } },
        },
      },
      '/data/process-charts.json': {
        get: {
          operationId: 'downloadProcessCharts', summary: 'Download process charts B00-B70',
          responses: { 200: { description: 'JSON object', content: jsonContent({ type: 'object', additionalProperties: true }) } },
        },
      },
    },
    components: {
      schemas: {
        Health: {
          type: 'object',
          required: ['status', 'service', 'version', 'transport', 'authentication', 'risks', 'nodes'],
          properties: {
            status: { type: 'string' }, service: { type: 'string' }, version: { type: 'string' },
            transport: { type: 'string' }, authentication: { type: 'string' },
            risks: { type: 'integer' }, nodes: { type: 'integer' },
          },
        },
        Risk: {
          type: 'object',
          required: ['risk_id', 'node_id', 'chart_key', 'node_label', 'title', 'category', 'origin', 'trigger', 'trigger_factors', 'description', 'motivation', 'affects', 'impact', 'consequences', 'mitigation', 'source_refs', 'scenario_tags'],
          properties: {
            risk_id: { type: 'string' }, node_id: { type: 'string' }, chart_key: { type: 'string' },
            node_label: { type: 'string' }, title: { type: 'string' }, category: { type: 'string' },
            origin: { type: 'string' }, trigger: { type: 'string' }, description: { type: 'string' },
            trigger_factors: { type: 'array', minItems: 3, maxItems: 5, items: { $ref: '#/components/schemas/RiskItem' } },
            motivation: { type: 'string' }, affects: { type: 'string' }, impact: { type: 'string' },
            consequences: { type: 'array', minItems: 3, maxItems: 5, items: { $ref: '#/components/schemas/RiskItem' } },
            mitigation: { type: 'string' }, source_refs: { type: 'array', items: { type: 'string' } },
            scenario_tags: { type: 'string' },
          },
        },
        RiskItem: {
          type: 'object',
          description: 'En atomär möjlig utlösande faktor eller konsekvens. source anger källförankrad premiss; analysis anger kvalificerad kausal eller scenarioanalytisk bedömning.',
          required: ['text', 'basis', 'source_refs'],
          properties: {
            text: { type: 'string', minLength: 1 },
            basis: { type: 'string', enum: ['source', 'analysis'] },
            source_refs: { type: 'array', items: { type: 'string' } },
          },
        },
        RiskWithUrl: {
          allOf: [
            { $ref: '#/components/schemas/Risk' },
            { type: 'object', required: ['canonical_url'], properties: { canonical_url: { type: 'string', format: 'uri' } } },
          ],
        },
        RiskPage: {
          type: 'object',
          required: ['total', 'offset', 'shown', 'next_offset', 'next_url', 'risks'],
          properties: {
            total: { type: 'integer' }, offset: { type: 'integer' }, shown: { type: 'integer' },
            next_offset: { type: ['integer', 'null'] }, next_url: { type: ['string', 'null'], format: 'uri' },
            risks: { type: 'array', items: { $ref: '#/components/schemas/RiskWithUrl' } },
          },
        },
        Error: {
          type: 'object', required: ['error'], properties: { error: { type: 'string' } },
        },
      },
    },
  };
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

  if (request.method === 'HEAD') {
    const response = await handleRequest(new Request(request.url, { method: 'GET', headers: request.headers }));
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

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

  if (request.method === 'GET' && path === '/ai-access') {
    return text(aiAccessHtml(url.origin), 'text/html; charset=utf-8');
  }

  if (request.method === 'GET' && path === '/llms.txt') {
    return text(llmsText(url.origin));
  }

  if (request.method === 'GET' && path === '/robots.txt') {
    return text(`User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`);
  }

  if (request.method === 'GET' && path === '/sitemap.xml') {
    const locations = ['/', '/ai-access', '/openapi.json', '/llms.txt', RISK_CSV_PATH, RISK_ITEM_CSV_PATH, ...RAW_DATA.keys()];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map(location => `\n  <url><loc>${url.origin}${location}</loc></url>`).join('')}\n</urlset>\n`;
    return text(body, 'application/xml; charset=utf-8');
  }

  if (request.method === 'GET' && path === '/openapi.json') {
    return json(openApiDocument(url.origin));
  }

  if (request.method === 'GET' && RAW_DATA.has(path)) {
    return json(RAW_DATA.get(path), 200, { 'Cache-Control': 'public, max-age=3600' });
  }

  if (request.method === 'GET' && path === RISK_CSV_PATH) {
    return text(riskCsv, 'text/csv; charset=utf-8', 200, {
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': 'attachment; filename="riskregister.csv"',
    });
  }

  if (request.method === 'GET' && path === RISK_ITEM_CSV_PATH) {
    return text(riskItemCsv, 'text/csv; charset=utf-8', 200, {
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': 'attachment; filename="riskregister-items.csv"',
    });
  }

  if (request.method === 'GET' && path === '/data') {
    return json({
      riskregister: `${url.origin}/data/riskregister.json`,
      riskregister_csv: `${url.origin}${RISK_CSV_PATH}`,
      riskregister_items_csv: `${url.origin}${RISK_ITEM_CSV_PATH}`,
      nodes: `${url.origin}/data/nodes.json`,
      sources: `${url.origin}/data/sources.json`,
      process_charts: `${url.origin}/data/process-charts.json`,
    });
  }

  if (request.method === 'GET' && path === '/api/risks') {
    try {
      const query = url.searchParams.get('q') ?? '';
      if (query.length > 500) throw new Error('q får vara högst 500 tecken');
      const offset = boundedInteger(url.searchParams.get('offset'), 0, { min: 0, max: registry.orderedRisks.length, name: 'offset' });
      const limit = boundedInteger(url.searchParams.get('limit'), 20, { min: 1, max: 100, name: 'limit' });
      const matches = registry.queryRisks({
        query,
        chartKey: url.searchParams.get('chart_key') || undefined,
        category: url.searchParams.get('category') || undefined,
        origin: url.searchParams.get('origin') || undefined,
        nodeId: url.searchParams.get('node_id') || undefined,
      });
      const page = matches.slice(offset, offset + limit);
      const nextOffset = offset + page.length < matches.length ? offset + page.length : null;
      const nextUrl = nextOffset === null ? null : new URL(url);
      if (nextUrl) nextUrl.searchParams.set('offset', String(nextOffset));
      return json({
        total: matches.length,
        offset,
        shown: page.length,
        next_offset: nextOffset,
        next_url: nextUrl?.toString() ?? null,
        risks: page.map(risk => ({ ...risk, canonical_url: registry.riskUrl(risk.risk_id) })),
      });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Ogiltiga parametrar' }, 400);
    }
  }

  if (request.method === 'GET' && path.startsWith('/api/risks/')) {
    let riskId;
    try {
      riskId = decodeURIComponent(path.slice('/api/risks/'.length));
    } catch {
      return json({ error: 'Ogiltigt risk-ID' }, 400);
    }
    const risk = riskById.get(riskId);
    if (!risk) return json({ error: `Ingen risk med id ${riskId}` }, 404);
    return json({ ...risk, canonical_url: registry.riskUrl(risk.risk_id) });
  }

  if (path === '/' && request.method === 'GET') {
    return json({
      ...registry.manifest(),
      mcp_endpoint: `${url.origin}/mcp`,
      health_endpoint: `${url.origin}/health`,
      ai_access_url: `${url.origin}/ai-access`,
      llms_url: `${url.origin}/llms.txt`,
      openapi_url: `${url.origin}/openapi.json`,
      rest_api_url: `${url.origin}/api/risks`,
      raw_data_mirror: `${url.origin}/data/riskregister.json`,
      raw_csv_mirror: `${url.origin}${RISK_CSV_PATH}`,
      normalized_csv_mirror: `${url.origin}${RISK_ITEM_CSV_PATH}`,
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

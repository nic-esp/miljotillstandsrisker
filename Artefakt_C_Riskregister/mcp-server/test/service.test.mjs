import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRiskRegistry } from '../risk-service.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const readJson = path => JSON.parse(readFileSync(join(here, path), 'utf8'));
const risks = readJson('../../Artefakt_C_riskregister.json');
const nodesByChart = readJson('../../_build/mappable_nodes.json');
const sources = readJson('../data/sources.json');
const processCharts = readJson('../../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json');
const registry = createRiskRegistry({ risks, nodesByChart, sources, processCharts });

async function withClient(callback) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = registry.createServer();
  const client = new Client({ name: 'riskregister-test', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await callback(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function structured(result) {
  assert.ok(result.structuredContent);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  return result.structuredContent;
}

test('dataset oracle is complete and internally consistent', () => {
  assert.equal(risks.length, 342);
  assert.equal(new Set(risks.map(risk => risk.risk_id)).size, 342);
  assert.equal(registry.nodes.length, 160);
  assert.equal(new Set(risks.map(risk => risk.node_id)).size, 160);
  assert.equal(registry.processChartList.length, 8);
  assert.equal(registry.stats().total_risks, 342);
  assert.deepEqual(registry.stats().by_chart, {
    B10: 23,
    B20: 26,
    B30: 44,
    B40: 72,
    B50: 82,
    B60: 58,
    B70: 37,
  });
});

test('all tools are declared read-only and standard tools have output schemas', async () => {
  await withClient(async client => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map(tool => tool.name));
    for (const required of [
      'search', 'fetch', 'search_risks', 'get_risk', 'get_dataset_page',
      'risks_by_node', 'list_nodes', 'register_stats', 'get_dataset_manifest',
      'list_sources', 'get_source', 'list_process_charts', 'get_process_chart',
    ]) assert.ok(names.has(required), `saknat verktyg: ${required}`);

    for (const tool of tools) {
      assert.equal(tool.inputSchema.type, 'object', tool.name);
      assert.equal(tool.annotations.readOnlyHint, true, tool.name);
      assert.equal(tool.annotations.destructiveHint, false, tool.name);
      assert.equal(tool.annotations.openWorldHint, false, tool.name);
    }
    assert.ok(tools.find(tool => tool.name === 'search').outputSchema);
    assert.ok(tools.find(tool => tool.name === 'fetch').outputSchema);
  });
});

test('OpenAI-compatible search and fetch mirror structured content as JSON text', async () => {
  await withClient(async client => {
    const searchResult = structured(await client.callTool({
      name: 'search',
      arguments: { query: 'Prövningsobjektet låses för snävt' },
    }));
    assert.equal(searchResult.results[0].id, 'R-B10-010-01');
    assert.match(searchResult.results[0].url, /^https:\/\/nic-esp\.github\.io\/miljotillstandsrisker\/\?risk=/);

    const fetchResult = structured(await client.callTool({
      name: 'fetch',
      arguments: { id: 'R-B10-010-01' },
    }));
    assert.equal(fetchResult.id, 'R-B10-010-01');
    assert.match(fetchResult.text, /## Utlösande faktor/);
    for (const field of Object.keys(risks[0])) assert.deepEqual(fetchResult.metadata[field], risks[0][field]);

    const missing = await client.callTool({ name: 'fetch', arguments: { id: 'R-DOES-NOT-EXIST' } });
    assert.equal(missing.isError, true);
  });
});

test('cursor pagination retrieves all 342 risks exactly once', async () => {
  await withClient(async client => {
    const seen = [];
    const pageSizes = [];
    let cursor;
    do {
      const value = structured(await client.callTool({
        name: 'get_dataset_page',
        arguments: { limit: 100, ...(cursor ? { cursor } : {}) },
      }));
      assert.equal(value.total, 342);
      seen.push(...value.risks.map(risk => risk.risk_id));
      pageSizes.push(value.shown);
      cursor = value.next_cursor;
    } while (cursor);

    assert.deepEqual(pageSizes, [100, 100, 100, 42]);
    assert.equal(new Set(seen).size, 342);
    assert.deepEqual(seen, registry.orderedRisks.map(risk => risk.risk_id));

    const beyond = structured(await client.callTool({
      name: 'get_dataset_page',
      arguments: { limit: 100, cursor: 'o:999' },
    }));
    assert.equal(beyond.total, 342);
    assert.equal(beyond.shown, 0);
    assert.equal(beyond.next_cursor, null);
  });
});

test('advanced search paginates filtered results deterministically', async () => {
  await withClient(async client => {
    const ids = [];
    let cursor;
    do {
      const value = structured(await client.callTool({
        name: 'search_risks',
        arguments: { chart_key: 'B40', limit: 25, ...(cursor ? { cursor } : {}) },
      }));
      assert.equal(value.total_hits, 72);
      ids.push(...value.risks.map(risk => risk.risk_id));
      cursor = value.next_cursor;
    } while (cursor);
    assert.equal(ids.length, 72);
    assert.equal(new Set(ids).size, 72);
    assert.ok(ids.every(id => id.startsWith('R-B40-')));

    const uppercase = structured(await client.callTool({
      name: 'search_risks',
      arguments: { q: 'PRÖVNINGSOBJEKTET', limit: 100 },
    }));
    assert.ok(uppercase.risks.some(risk => risk.risk_id === 'R-B10-010-01'));
  });
});

test('specialized tools expose complete node, source, chart, and statistics data', async () => {
  await withClient(async client => {
    const byNode = structured(await client.callTool({ name: 'risks_by_node', arguments: { node_id: 'B60-250' } }));
    assert.equal(byNode.count, 3);

    const nodes = structured(await client.callTool({ name: 'list_nodes', arguments: {} }));
    assert.equal(nodes.total, 160);
    assert.equal(nodes.nodes.reduce((sum, node) => sum + node.risk_count, 0), 342);

    const stats = structured(await client.callTool({ name: 'register_stats', arguments: {} }));
    assert.equal(stats.total_risks, 342);
    assert.equal(stats.nodes_covered, 160);
    assert.equal(stats.mappable_nodes, 160);

    const listedSources = structured(await client.callTool({ name: 'list_sources', arguments: { q: 'Miljöbalk' } }));
    assert.ok(listedSources.sources.some(source => source.source_ref === 'MB'));
    const source = structured(await client.callTool({ name: 'get_source', arguments: { source_ref: 'MB' } }));
    assert.equal(source.authority, 'Sveriges riksdag');

    const charts = structured(await client.callTool({ name: 'list_process_charts', arguments: {} }));
    assert.equal(charts.charts.length, 8);
    const chart = structured(await client.callTool({ name: 'get_process_chart', arguments: { chart_key: 'B40' } }));
    assert.equal(chart.chart_key, 'B40');
    assert.equal(chart.chart.chartData.nodes.length, 35);
  });
});

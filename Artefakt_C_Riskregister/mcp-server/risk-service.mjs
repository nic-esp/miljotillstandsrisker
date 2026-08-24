import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { consequences, riskItemText, triggerFactors } from '../_build/risk_fields.mjs';

export const SERVICE_NAME = 'miljotillstandsrisker';
export const SERVICE_VERSION = '2.2.0';
export const DEFAULT_SITE_URL = 'https://nic-esp.github.io/miljotillstandsrisker/';
export const DEFAULT_DATA_URL = `${DEFAULT_SITE_URL}data/riskregister.json`;
export const DEFAULT_CSV_URL = `${DEFAULT_SITE_URL}data/riskregister.csv`;
export const DEFAULT_ITEM_CSV_URL = `${DEFAULT_SITE_URL}data/riskregister-items.csv`;
export const DEFAULT_NODES_URL = `${DEFAULT_SITE_URL}data/nodes.json`;
export const DEFAULT_SOURCES_URL = `${DEFAULT_SITE_URL}data/sources.json`;
export const DEFAULT_PROCESS_URL = `${DEFAULT_SITE_URL}data/process-charts.json`;

const TEXT_FIELDS = [
  'risk_id',
  'title',
  'node_id',
  'node_label',
  'trigger',
  'description',
  'motivation',
  'affects',
  'impact',
  'mitigation',
  'category',
  'origin',
  'scenario_tags',
];

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const resultLinkSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
});

const riskSummarySchema = z.object({
  risk_id: z.string(),
  node_id: z.string(),
  node_label: z.string(),
  title: z.string(),
  category: z.string(),
  origin: z.string(),
  trigger_factor_count: z.number().int(),
  consequence_count: z.number().int(),
  snippet: z.string(),
  url: z.string().url(),
});

function asToolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function asToolError(message) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function normalizeTerms(query = '') {
  return String(query).trim().toLocaleLowerCase('sv-SE').split(/\s+/).filter(Boolean);
}

function searchableText(risk) {
  return [
    ...TEXT_FIELDS.map(field => risk[field] ?? ''),
    riskItemText(triggerFactors(risk)),
    riskItemText(consequences(risk)),
    (risk.source_refs ?? []).join(' '),
  ].join(' ').toLocaleLowerCase('sv-SE');
}

function matchesTerms(risk, terms) {
  if (!terms.length) return true;
  const haystack = searchableText(risk);
  return terms.every(term => haystack.includes(term));
}

function relevance(risk, terms) {
  if (!terms.length) return 0;
  const id = risk.risk_id.toLocaleLowerCase('sv-SE');
  const title = risk.title.toLocaleLowerCase('sv-SE');
  const node = `${risk.node_id} ${risk.node_label}`.toLocaleLowerCase('sv-SE');
  const factors = riskItemText(triggerFactors(risk)).toLocaleLowerCase('sv-SE');
  const effects = riskItemText(consequences(risk)).toLocaleLowerCase('sv-SE');
  const description = risk.description.toLocaleLowerCase('sv-SE');
  const motivation = risk.motivation.toLocaleLowerCase('sv-SE');
  const sources = (risk.source_refs ?? []).join(' ').toLocaleLowerCase('sv-SE');
  let score = 0;
  for (const term of terms) {
    if (id === term) score += 100;
    else if (id.includes(term)) score += 30;
    if (title.includes(term)) score += 12;
    if (node.includes(term)) score += 5;
    if (factors.includes(term)) score += 10;
    if (effects.includes(term)) score += 9;
    if (description.includes(term)) score += 6;
    if (motivation.includes(term)) score += 3;
    if (sources.includes(term)) score += 4;
  }
  return score;
}

function excerpt(risk, terms) {
  const candidates = [
    risk.description,
    riskItemText(triggerFactors(risk)),
    risk.trigger,
    risk.motivation,
    riskItemText(consequences(risk)),
    risk.impact,
    risk.mitigation,
  ];
  const text = candidates.find(value => terms.some(term => value.toLocaleLowerCase('sv-SE').includes(term)))
    ?? risk.description;
  if (!terms.length) return text.slice(0, 260);
  const lower = text.toLocaleLowerCase('sv-SE');
  const positions = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
  const index = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, index - 70);
  const slice = text.slice(start, start + 260);
  return `${start > 0 ? '…' : ''}${slice}${start + 260 < text.length ? '…' : ''}`;
}

function encodeCursor(offset) {
  return `o:${offset}`;
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  const match = /^o:(\d+)$/.exec(cursor);
  if (!match) throw new Error('Ogiltig cursor. Använd next_cursor från föregående svar.');
  return Number(match[1]);
}

function page(items, cursor, limit) {
  const offset = decodeCursor(cursor);
  const values = items.slice(offset, offset + limit);
  const nextOffset = offset + values.length;
  return {
    offset,
    values,
    nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
  };
}

function riskText(risk) {
  const itemLines = items => items.map((item, index) => {
    const basis = item.basis === 'source'
      ? `källförankrad premiss: ${item.source_refs.join(', ')}`
      : 'analytisk bedömning';
    return `${index + 1}. ${item.text} (${basis})`;
  }).join('\n');
  return [
    `# ${risk.title}`,
    '',
    `Risk-ID: ${risk.risk_id}`,
    `Nod: ${risk.node_id} – ${risk.node_label}`,
    `Delprocess: ${risk.chart_key}`,
    `Kategori: ${risk.category}`,
    `Ursprung: ${risk.origin}`,
    '',
    `## Sammanfattande utlösande faktor (bakåtkompatibelt fält)\n${risk.trigger}`,
    `## Utlösande faktorer\n${itemLines(triggerFactors(risk))}`,
    `## Beskrivning\n${risk.description}`,
    `## Motivering och underbyggnad\n${risk.motivation}`,
    `## Drabbar\n${risk.affects}`,
    `## Sammanfattande konsekvens (bakåtkompatibelt fält)\n${risk.impact}`,
    `## Möjliga konsekvenser\n${itemLines(consequences(risk))}`,
    `## Motåtgärder\n${risk.mitigation}`,
    `## Källreferenser\n${risk.source_refs.map(source => `- ${source}`).join('\n')}`,
    `## Scenario\n${risk.scenario_tags}`,
  ].join('\n');
}

export function createRiskRegistry({
  risks,
  nodesByChart,
  sources = [],
  processCharts = { charts: [] },
  siteUrl = DEFAULT_SITE_URL,
  dataUrl = DEFAULT_DATA_URL,
  csvUrl = DEFAULT_CSV_URL,
  itemCsvUrl = DEFAULT_ITEM_CSV_URL,
  nodesUrl = DEFAULT_NODES_URL,
  sourcesUrl = DEFAULT_SOURCES_URL,
  processUrl = DEFAULT_PROCESS_URL,
} = {}) {
  if (!Array.isArray(risks) || !risks.length) throw new Error('risker måste vara en icke-tom array');
  if (!nodesByChart || typeof nodesByChart !== 'object') throw new Error('nodesByChart måste vara ett objekt');

  const normalizedSiteUrl = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  const orderedRisks = [...risks].sort((a, b) => a.risk_id.localeCompare(b.risk_id, 'sv'));
  const riskById = new Map(orderedRisks.map(risk => [risk.risk_id, risk]));
  const nodes = Object.values(nodesByChart).flat().sort((a, b) => a.node_id.localeCompare(b.node_id, 'sv'));
  const nodeById = new Map(nodes.map(node => [node.node_id, node]));
  const charts = Object.keys(nodesByChart).sort();
  const categories = [...new Set(orderedRisks.map(risk => risk.category))].sort((a, b) => a.localeCompare(b, 'sv'));
  const origins = [...new Set(orderedRisks.map(risk => risk.origin))].sort((a, b) => a.localeCompare(b, 'sv'));
  const riskCount = orderedRisks.reduce((counts, risk) => {
    counts[risk.node_id] = (counts[risk.node_id] ?? 0) + 1;
    return counts;
  }, {});
  const internalSources = (Array.isArray(sources)
    ? sources
    : Object.entries(sources).map(([source_ref, value]) => ({ source_ref, ...value })))
    .sort((a, b) => a.source_ref.localeCompare(b.source_ref, 'sv'));
  const sourceByRef = new Map(internalSources.map(source => [source.source_ref, {
    ...source,
    kind: 'registry',
  }]));
  for (const risk of orderedRisks) {
    for (const sourceRef of risk.source_refs) {
      if (sourceByRef.has(sourceRef) || !sourceRef.startsWith('EXT:')) continue;
      const body = sourceRef.slice(4).trim();
      const match = /^(.*?)\s+(https?:\/\/.*)$/.exec(body);
      const rawUrl = match?.[2] ?? '';
      sourceByRef.set(sourceRef, {
        source_ref: sourceRef,
        title: match?.[1] || body,
        authority: 'Extern källa',
        url: rawUrl ? encodeURI(rawUrl) : '',
        kind: 'external',
      });
    }
  }
  const allSources = [...sourceByRef.values()].sort((a, b) => a.source_ref.localeCompare(b.source_ref, 'sv'));
  const processChartList = Array.isArray(processCharts?.charts) ? processCharts.charts : [];
  const processChartKey = chart => {
    const key = chart?.metadata?.chartKey;
    if (!key) throw new Error(`Processdiagrammet ${chart?.name ?? '(utan namn)'} saknar metadata.chartKey`);
    return key;
  };
  const processChartByKey = new Map(processChartList.map(chart => [processChartKey(chart), chart]));

  const riskUrl = riskId => `${normalizedSiteUrl}?risk=${encodeURIComponent(riskId)}`;

  function queryRisks({ query = '', chartKey, category, origin, nodeId } = {}) {
    const terms = normalizeTerms(query);
    return orderedRisks
      .filter(risk =>
        (!chartKey || risk.chart_key === chartKey)
        && (!category || risk.category === category)
        && (!origin || risk.origin === origin)
        && (!nodeId || risk.node_id === nodeId)
        && matchesTerms(risk, terms))
      .map(risk => ({ risk, score: relevance(risk, terms) }))
      .sort((a, b) => b.score - a.score || a.risk.risk_id.localeCompare(b.risk.risk_id, 'sv'))
      .map(entry => entry.risk);
  }

  function summary(risk, terms = []) {
    return {
      risk_id: risk.risk_id,
      node_id: risk.node_id,
      node_label: risk.node_label,
      title: risk.title,
      category: risk.category,
      origin: risk.origin,
      trigger_factor_count: triggerFactors(risk).length,
      consequence_count: consequences(risk).length,
      snippet: excerpt(risk, terms),
      url: riskUrl(risk.risk_id),
    };
  }

  function stats() {
    const countBy = key => orderedRisks.reduce((counts, risk) => {
      counts[risk[key]] = (counts[risk[key]] ?? 0) + 1;
      return counts;
    }, {});
    const factors = orderedRisks.flatMap(triggerFactors);
    const effects = orderedRisks.flatMap(consequences);
    return {
      total_risks: orderedRisks.length,
      total_trigger_factors: factors.length,
      source_grounded_trigger_factors: factors.filter(item => item.basis === 'source').length,
      total_consequences: effects.length,
      source_grounded_consequences: effects.filter(item => item.basis === 'source').length,
      nodes_covered: Object.keys(riskCount).length,
      mappable_nodes: nodes.length,
      by_chart: countBy('chart_key'),
      by_category: countBy('category'),
      by_origin: countBy('origin'),
    };
  }

  function manifest() {
    return {
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
      language: 'sv',
      description: 'Offentligt riskregister för den svenska miljötillståndsprocessen med flera möjliga utlösande faktorer och konsekvenser per riskhändelse.',
      site_url: normalizedSiteUrl,
      raw_data_url: dataUrl,
      csv_data_url: csvUrl,
      normalized_csv_data_url: itemCsvUrl,
      raw_nodes_url: nodesUrl,
      raw_sources_url: sourcesUrl,
      raw_process_charts_url: processUrl,
      total_risks: orderedRisks.length,
      total_trigger_factors: orderedRisks.reduce((sum, risk) => sum + triggerFactors(risk).length, 0),
      total_consequences: orderedRisks.reduce((sum, risk) => sum + consequences(risk).length, 0),
      mappable_nodes: nodes.length,
      total_sources: allSources.length,
      process_charts: processChartList.length,
      charts,
      categories,
      origins,
      retrieval: {
        standard: ['search', 'fetch'],
        exhaustive: 'Anropa get_dataset_page med limit 25 utan cursor och följ next_cursor tills den är null.',
        raw: dataUrl,
        csv: csvUrl,
        normalized_csv: itemCsvUrl,
      },
    };
  }

  function createServer() {
    const server = new McpServer({
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
    }, {
      instructions: 'Sök och hämta offentliga riskdata om den svenska miljötillståndsprocessen. Alla verktyg är skrivskyddade. Använd search och fetch för ChatGPT-kompatibel sökning; använd get_dataset_page eller rådata-URL:en för fullständig hämtning.',
    });

    server.registerTool('search', {
      title: 'Sök i miljötillståndsrisker',
      description: 'Sök relevanta riskposter. Returnerar stabila ID:n och offentliga HTTPS-länkar som kan skickas till fetch.',
      inputSchema: {
        query: z.string().describe('Fritextsökning på svenska. Flera ord använder AND-logik.'),
      },
      outputSchema: {
        results: z.array(resultLinkSchema),
      },
      annotations: READ_ONLY,
    }, async ({ query }) => {
      const results = queryRisks({ query }).slice(0, 20).map(risk => ({
        id: risk.risk_id,
        title: `${risk.risk_id} – ${risk.title}`,
        url: riskUrl(risk.risk_id),
      }));
      return asToolResult({ results });
    });

    server.registerTool('fetch', {
      title: 'Hämta en miljötillståndsrisk',
      description: 'Hämta en hel riskpost med samtliga textfält, källreferenser och metadata via ett ID från search.',
      inputSchema: {
        id: z.string().describe('Ett risk-ID, t.ex. R-B40-GE110-01.'),
      },
      outputSchema: {
        id: z.string(),
        title: z.string(),
        text: z.string(),
        url: z.string().url(),
        metadata: z.record(z.unknown()),
      },
      annotations: READ_ONLY,
    }, async ({ id }) => {
      const risk = riskById.get(id);
      if (!risk) return asToolError(`Ingen risk med id ${id}`);
      return asToolResult({
        id: risk.risk_id,
        title: risk.title,
        text: riskText(risk),
        url: riskUrl(risk.risk_id),
        metadata: { ...risk },
      });
    });

    server.registerTool('search_risks', {
      title: 'Avancerad risksökning',
      description: 'Fulltextsök och filtrera riskregistret med cursorbaserad paginering.',
      inputSchema: {
        q: z.string().optional().describe('Sökord med AND-logik. Utelämna för att lista alla matchande risker.'),
        chart_key: z.enum(charts).optional().describe('Delprocess, t.ex. B40.'),
        category: z.enum(categories).optional().describe('Riskkategori.'),
        origin: z.enum(origins).optional().describe('Riskens primära ursprung.'),
        node_id: z.string().optional().describe('Exakt nod-ID, t.ex. B40-GE110.'),
        cursor: z.string().regex(/^o:\d+$/).optional().describe('Opaque cursor från next_cursor i föregående svar.'),
        limit: z.number().int().min(1).max(100).default(20).describe('Antal poster per sida, 1–100.'),
      },
      outputSchema: {
        total_hits: z.number().int(),
        offset: z.number().int(),
        shown: z.number().int(),
        next_cursor: z.string().nullable(),
        risks: z.array(riskSummarySchema),
      },
      annotations: READ_ONLY,
    }, async ({ q, chart_key, category, origin, node_id, cursor, limit }) => {
      const terms = normalizeTerms(q);
      const matches = queryRisks({ query: q, chartKey: chart_key, category, origin, nodeId: node_id });
      const current = page(matches, cursor, limit);
      return asToolResult({
        total_hits: matches.length,
        offset: current.offset,
        shown: current.values.length,
        next_cursor: current.nextCursor,
        risks: current.values.map(risk => summary(risk, terms)),
      });
    });

    server.registerTool('fetch_risk', {
      title: 'Hämta komplett riskpost',
      description: 'Hämta en komplett riskpost som strukturerad JSON.',
      inputSchema: {
        risk_id: z.string().describe('Risk-ID, t.ex. R-B40-GE110-01.'),
      },
      annotations: READ_ONLY,
    }, async ({ risk_id }) => {
      const risk = riskById.get(risk_id);
      if (!risk) return asToolError(`Ingen risk med id ${risk_id}`);
      return asToolResult({ risk, url: riskUrl(risk.risk_id) });
    });

    server.registerTool('get_risk', {
      title: 'Hämta komplett riskpost (bakåtkompatibel)',
      description: 'Bakåtkompatibelt alias för fetch_risk. Hämta en komplett riskpost som strukturerad JSON.',
      inputSchema: {
        risk_id: z.string().describe('Risk-ID, t.ex. R-B40-GE110-01.'),
      },
      annotations: READ_ONLY,
    }, async ({ risk_id }) => {
      const risk = riskById.get(risk_id);
      if (!risk) return asToolError(`Ingen risk med id ${risk_id}`);
      return asToolResult({ risk, url: riskUrl(risk.risk_id) });
    });

    server.registerTool('get_dataset_page', {
      title: 'Hämta riskregistret sida för sida',
      description: 'Hämta alla kompletta riskposter deterministiskt. Följ next_cursor tills den är null.',
      inputSchema: {
        cursor: z.string().regex(/^o:\d+$/).optional().describe('Cursor från next_cursor; utelämna för första sidan.'),
        limit: z.number().int().min(1).max(25).default(25).describe('Antal kompletta poster per sida, 1–25. Mindre sidor minskar risken för trunkering i AI-klienter.'),
      },
      annotations: READ_ONLY,
    }, async ({ cursor, limit }) => {
      const current = page(orderedRisks, cursor, limit);
      return asToolResult({
        total: orderedRisks.length,
        offset: current.offset,
        shown: current.values.length,
        next_cursor: current.nextCursor,
        risks: current.values,
      });
    });

    server.registerTool('risks_by_node', {
      title: 'Risker per processnod',
      description: 'Lista samtliga risker som är mappade till en given nod i processkartan.',
      inputSchema: {
        node_id: z.string().describe('Nod-ID, t.ex. B60-250.'),
      },
      annotations: READ_ONLY,
    }, async ({ node_id }) => {
      const node = nodeById.get(node_id);
      const matchingRisks = orderedRisks.filter(risk => risk.node_id === node_id);
      return asToolResult({
        node_id,
        node_label: node?.label ?? null,
        chart: node?.chart_key ?? null,
        count: matchingRisks.length,
        risks: matchingRisks,
      });
    });

    server.registerTool('list_nodes', {
      title: 'Lista processnoder',
      description: 'Lista riskmappbara processnoder och antal risker, med valfritt delprocessfilter och paginering.',
      inputSchema: {
        chart_key: z.enum(charts).optional(),
        cursor: z.string().regex(/^o:\d+$/).optional(),
        limit: z.number().int().min(1).max(160).default(160),
      },
      annotations: READ_ONLY,
    }, async ({ chart_key, cursor, limit }) => {
      const matchingNodes = chart_key ? nodesByChart[chart_key] : nodes;
      const orderedNodes = [...matchingNodes].sort((a, b) => a.node_id.localeCompare(b.node_id, 'sv'));
      const current = page(orderedNodes, cursor, limit);
      return asToolResult({
        total: orderedNodes.length,
        offset: current.offset,
        shown: current.values.length,
        next_cursor: current.nextCursor,
        nodes: current.values.map(node => ({
          node_id: node.node_id,
          chart_key: node.chart_key,
          label: node.label,
          phase: node.phase,
          actor: node.actor,
          risk_count: riskCount[node.node_id] ?? 0,
        })),
      });
    });

    server.registerTool('register_stats', {
      title: 'Riskregistrets statistik',
      description: 'Hämta antal risker, utlösande faktorer och konsekvenser samt fördelning per delprocess, kategori och ursprung och nodtäckning.',
      inputSchema: {},
      annotations: READ_ONLY,
    }, async () => asToolResult(stats()));

    server.registerTool('get_dataset_manifest', {
      title: 'Riskregistrets manifest',
      description: 'Hämta datamängdens omfattning, rådata-URL:er och instruktion för fullständig hämtning.',
      inputSchema: {},
      annotations: READ_ONLY,
    }, async () => asToolResult(manifest()));

    server.registerTool('list_sources', {
      title: 'Lista riskregistrets källor',
      description: 'Sök och lista både interna källregisterposter och externa källhänvisningar från riskerna.',
      inputSchema: {
        q: z.string().optional().describe('Fritext i källreferens, titel, ansvarig aktör eller URL.'),
        cursor: z.string().regex(/^o:\d+$/).optional(),
        limit: z.number().int().min(1).max(100).default(100),
      },
      annotations: READ_ONLY,
    }, async ({ q, cursor, limit }) => {
      const terms = normalizeTerms(q);
      const matchingSources = allSources.filter(source => {
        const haystack = Object.values(source).join(' ').toLocaleLowerCase('sv-SE');
        return terms.every(term => haystack.includes(term));
      });
      const current = page(matchingSources, cursor, limit);
      return asToolResult({
        total: matchingSources.length,
        offset: current.offset,
        shown: current.values.length,
        next_cursor: current.nextCursor,
        sources: current.values,
      });
    });

    server.registerTool('get_source', {
      title: 'Hämta en källpost',
      description: 'Hämta en komplett intern eller extern källpost via source_ref från list_sources eller en riskpost.',
      inputSchema: {
        source_ref: z.string(),
      },
      annotations: READ_ONLY,
    }, async ({ source_ref }) => {
      const source = sourceByRef.get(source_ref);
      if (!source) return asToolError(`Ingen källa med referens ${source_ref}`);
      return asToolResult(source);
    });

    server.registerTool('list_process_charts', {
      title: 'Lista processkartor',
      description: 'Lista processkartorna B00–B70 och deras antal noder och kanter.',
      inputSchema: {},
      annotations: READ_ONLY,
    }, async () => asToolResult({
      charts: processChartList.map(chart => ({
        chart_key: processChartKey(chart),
        name: chart.name,
        nodes: chart.chartData?.nodes?.length ?? 0,
        edges: chart.chartData?.edges?.length ?? 0,
      })),
    }));

    server.registerTool('get_process_chart', {
      title: 'Hämta en processkarta',
      description: 'Hämta en komplett processkarta med samtliga noder, kanter och metadata.',
      inputSchema: {
        chart_key: z.enum([...processChartByKey.keys()]).describe('B00, B10, B20, B30, B40, B50, B60 eller B70.'),
      },
      annotations: READ_ONLY,
    }, async ({ chart_key }) => {
      const chart = processChartByKey.get(chart_key);
      if (!chart) return asToolError(`Ingen processkarta med nyckel ${chart_key}`);
      return asToolResult({ chart_key, chart });
    });

    server.registerResource('dataset-manifest', 'riskregister://manifest', {
      title: 'Miljötillståndsrisker – manifest',
      description: 'Omfattning och publika URL:er för riskregistret.',
      mimeType: 'application/json',
    }, async uri => ({
      contents: [{ uri: uri.toString(), mimeType: 'application/json', text: JSON.stringify(manifest(), null, 2) }],
    }));

    server.registerResource('risk-dataset', 'riskregister://dataset', {
      title: 'Miljötillståndsrisker – fullständig datamängd',
      description: 'Alla kompletta riskposter i JSON-format.',
      mimeType: 'application/json',
    }, async uri => ({
      contents: [{ uri: uri.toString(), mimeType: 'application/json', text: JSON.stringify(orderedRisks) }],
    }));

    server.registerResource('process-charts', 'riskregister://process-charts', {
      title: 'Miljötillståndsprocessens processkartor',
      description: 'Processkartorna B00–B70 med noder och kanter.',
      mimeType: 'application/json',
    }, async uri => ({
      contents: [{ uri: uri.toString(), mimeType: 'application/json', text: JSON.stringify(processCharts) }],
    }));

    return server;
  }

  return {
    charts,
    categories,
    origins,
    orderedRisks,
    nodes,
    allSources,
    processChartList,
    queryRisks,
    riskUrl,
    stats,
    manifest,
    createServer,
  };
}

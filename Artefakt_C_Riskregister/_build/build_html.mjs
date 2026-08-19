#!/usr/bin/env node
// Generates Artefakt_C_riskregister.html — a fully self-contained single-file app
// with all risk data embedded (no external dependencies, works offline).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const risks = JSON.parse(readFileSync(join(root, 'Artefakt_C_riskregister.json'), 'utf8'));
const nodesByChart = JSON.parse(readFileSync(join(here, 'mappable_nodes.json'), 'utf8'));

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
const kallr = parseCSV(readFileSync(join(root, '../Artefakt_B_Processkarta_nodordbok/Artefakt_B_kallregister.csv'), 'utf8'));
const sources = Object.fromEntries(kallr.map(r => [r.source_ref, { title: r.title, authority: r.authority, url: r.url }]));

// Process layouts (nodes with positions + edges) from the Artefakt B Cardinal export
const imp = JSON.parse(readFileSync(join(root, '../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json'), 'utf8'));
const proc = {};
for (const c of imp.charts) {
  const key = c.name.split(' ')[0];
  proc[key] = {
    name: c.name,
    nodes: c.chartData.nodes.map(n => ({
      id: n.id, type: n.type, x: n.position.x, y: n.position.y,
      label: n.data.label, desc: n.data.description || '',
      phase: n.data.phase || '', actor: n.data.actor || n.data.s0Actor || '',
      legal: (n.data.legalBasis || []).join('; '), refs: n.data.sourceRefs || [],
      rma: !!n.data.riskMappingAllowed,
      hf: n.data.handoffFrom || [], ht: n.data.handoffTo || [],
    })),
    edges: c.chartData.edges.map(e => ({ id: e.id, s: e.source, t: e.target, label: (e.data && e.data.label) || '' })),
  };
}

const CHART_NAMES = {
  B00: 'B00 Masterprocess',
  B10: 'B10 Förstudie och prövningsväg',
  B20: 'B20 Samråd och miljöbedömning',
  B30: 'B30 Miljöfarlig verksamhet',
  B40: 'B40 Vattenverksamhet',
  B50: 'B50 Tvärgående och sektorsspår',
  B60: 'B60 Ansökan, beslut och överprövning',
  B70: 'B70 Laga kraft och byggberedskap',
};

const payload = JSON.stringify({ risks, nodesByChart, sources, chartNames: CHART_NAMES, proc })
  .replace(/</g, '\\u003c');
const processGeometry = readFileSync(join(here, 'process_geometry.mjs'), 'utf8')
  .replace(/^export\s*\{\s*createProcessGeometry\s*\};?\s*$/m, '');

const template = readFileSync(join(here, 'app_template.html'), 'utf8');
if (!template.includes('/*__PAYLOAD__*/')) throw new Error('Mall saknar /*__PAYLOAD__*/-placeholder');
if (!template.includes('/*__PROCESS_GEOMETRY__*/')) throw new Error('Mall saknar /*__PROCESS_GEOMETRY__*/-placeholder');
const html = template
  .replace('/*__PROCESS_GEOMETRY__*/', () => processGeometry)
  .replace('/*__PAYLOAD__*/', () => payload);
writeFileSync(join(root, 'Artefakt_C_riskregister.html'), html);
console.log(`Skrev Artefakt_C_riskregister.html (${(html.length / 1024).toFixed(0)} KB, ${risks.length} risker)`);

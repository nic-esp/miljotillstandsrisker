#!/usr/bin/env node
// Generates Artefakt_C_riskregister.html — a fully self-contained single-file app
// with all risk data embedded (no external dependencies, works offline).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readSourceRegister } from './source_register.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const risks = JSON.parse(readFileSync(join(root, 'Artefakt_C_riskregister.json'), 'utf8'));
const nodesByChart = JSON.parse(readFileSync(join(here, 'mappable_nodes.json'), 'utf8'));

const kallr = readSourceRegister(join(root, '../Artefakt_B_Processkarta_nodordbok/Artefakt_B_kallregister.csv'));
const sources = Object.fromEntries(kallr.map(r => [r.source_ref, { title: r.title, authority: r.authority, url: r.url }]));

// Process layouts (nodes with positions + edges) from the Artefakt B Cardinal export
const imp = JSON.parse(readFileSync(join(root, '../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json'), 'utf8'));
const proc = {};
for (const c of imp.charts) {
  const key = c.metadata.chartKey;
  if (!key) throw new Error(`Diagrammet ${c.name} saknar metadata.chartKey`);
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

const chartNames = Object.fromEntries(imp.charts.map(chart => {
  const key = chart.metadata.chartKey;
  if (!key) throw new Error(`Diagrammet ${chart.name} saknar metadata.chartKey`);
  return [key, chart.name];
}));

const payload = JSON.stringify({ risks, nodesByChart, sources, chartNames, proc })
  .replace(/</g, '\\u003c');
const processGeometry = readFileSync(join(here, 'process_geometry.mjs'), 'utf8')
  .replace(/^export\s*\{\s*createProcessGeometry\s*\};?\s*$/m, '');
const riskFields = readFileSync(join(here, 'risk_fields.mjs'), 'utf8')
  .replace(/export\s*\{[\s\S]*?\};?\s*$/, '');

const template = readFileSync(join(here, 'app_template.html'), 'utf8');
if (!template.includes('/*__PAYLOAD__*/')) throw new Error('Mall saknar /*__PAYLOAD__*/-placeholder');
if (!template.includes('/*__PROCESS_GEOMETRY__*/')) throw new Error('Mall saknar /*__PROCESS_GEOMETRY__*/-placeholder');
if (!template.includes('/*__RISK_FIELDS__*/')) throw new Error('Mall saknar /*__RISK_FIELDS__*/-placeholder');
const html = template
  .replace('/*__PROCESS_GEOMETRY__*/', () => processGeometry)
  .replace('/*__RISK_FIELDS__*/', () => riskFields)
  .replace('/*__PAYLOAD__*/', () => payload);
writeFileSync(join(root, 'Artefakt_C_riskregister.html'), html);
console.log(`Skrev Artefakt_C_riskregister.html (${(html.length / 1024).toFixed(0)} KB, ${risks.length} risker)`);

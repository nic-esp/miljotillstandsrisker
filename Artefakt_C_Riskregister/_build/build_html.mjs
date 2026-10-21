#!/usr/bin/env node
// Generates Artefakt_C_riskregister.html — a fully self-contained single-file app
// with all risk data embedded (no external dependencies, works offline).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readSourceRegister } from './source_register.mjs';
import { createRankingModel } from './btl_ranking.mjs';
import { createExplorationData } from './exploration_model.mjs';
import { loadAuthorityPackage } from './authority_controls.mjs';
import { validateMeasurement } from './measurement_model.mjs';
import { validateReport } from './report_model.mjs';
import { renderSiteHeader } from './site_navigation.mjs';

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

const measurement = JSON.parse(readFileSync(join(root, '../publication/measurement.json'), 'utf8'));
const ranking = measurement.ranking || JSON.parse(readFileSync(join(here, 'btl_snapshot.json'), 'utf8'));
createRankingModel(risks, ranking, proc); // Fail the build on stale or ambiguous risk mappings.
const exploration = createExplorationData(risks, JSON.parse(readFileSync(join(here, 'exploration_curations.json'), 'utf8')), loadAuthorityPackage());
validateMeasurement(measurement, risks.map(r=>r.risk_id), exploration.controls.map(c=>c.id));
const report = JSON.parse(readFileSync(join(root,'../report/manuscript.json'),'utf8'));
const interviews = JSON.parse(readFileSync(join(root,'../publication/interviews.json'),'utf8'));
const reportMeasurement = JSON.parse(readFileSync(join(root,'../report/measurement.json'),'utf8'));
const reportInterviews = JSON.parse(readFileSync(join(root,'../report/interviews.json'),'utf8'));
validateMeasurement(reportMeasurement,risks.map(r=>r.risk_id),exploration.controls.map(c=>c.id));
if(report.measurementEditionId!==reportMeasurement.editionId)throw new Error('Rapportmanus och låst mätutgåva skiljer sig');
validateReport(report,reportInterviews,risks.map(r=>r.risk_id),exploration.controls.map(c=>c.id));
const payload = JSON.stringify({ risks, nodesByChart, sources, chartNames, proc, processExport: imp, ranking, exploration, measurement, report, interviews, reportMeasurement, reportInterviews })
  .replace(/</g, '\\u003c');
const processGeometry = readFileSync(join(here, 'process_geometry.mjs'), 'utf8')
  .replace(/^export\s*\{\s*createProcessGeometry\s*\};?\s*$/m, '');
const riskFields = readFileSync(join(here, 'risk_fields.mjs'), 'utf8')
  .replace(/export\s*\{[\s\S]*?\};?\s*$/, '');
const processChartExport = readFileSync(join(here, 'process_chart_export.mjs'), 'utf8')
  .replace(/export\s*\{[\s\S]*?\};?\s*$/, '');

const template = readFileSync(join(here, 'app_template.html'), 'utf8');
const publicationModel = ['measurement_model.mjs','report_model.mjs'].map(file=>readFileSync(join(here,file),'utf8').replace(/^export /gm,'')).join('\n');
const rankingModel = readFileSync(join(here, 'btl_ranking.mjs'), 'utf8').replace(/export\s*\{[\s\S]*?\};?\s*$/, '');
const rankingView = readFileSync(join(here, 'ranking_view.mjs'), 'utf8');
const brandCss = readFileSync(join(here, 'svenskt-naringsliv.css'), 'utf8');
const explorationView = readFileSync(join(here, 'exploration_view.mjs'), 'utf8');
const explorationGraph = readFileSync(join(here, 'exploration_graph.mjs'), 'utf8').replace(/\bexport\s+(?=function|const|class)/g, '').replace(/export\s*\{[\s\S]*?\};?\s*$/, '');
const explorationCss = readFileSync(join(here, 'exploration.css'), 'utf8') + '\n' + readFileSync(join(here, 'exploration_graph.css'), 'utf8') + '\n' + readFileSync(join(here, 'measurement.css'), 'utf8') + '\n' + readFileSync(join(root,'../site/assets/site-navigation.css'),'utf8');
const logoHorizontal = readFileSync(join(root, '../site/assets/svenskt-naringsliv-logo.svg'), 'utf8').trim();
if (!template.includes('/*__PAYLOAD__*/')) throw new Error('Mall saknar /*__PAYLOAD__*/-placeholder');
if (!template.includes('/*__PROCESS_GEOMETRY__*/')) throw new Error('Mall saknar /*__PROCESS_GEOMETRY__*/-placeholder');
if (!template.includes('/*__RISK_FIELDS__*/')) throw new Error('Mall saknar /*__RISK_FIELDS__*/-placeholder');
if (!template.includes('/*__PROCESS_CHART_EXPORT__*/')) throw new Error('Mall saknar /*__PROCESS_CHART_EXPORT__*/-placeholder');
for (const marker of ['/*__BRAND_CSS__*/', '/*__RANKING_MODEL__*/', '/*__RANKING_VIEW__*/', '<!--__SITE_HEADER__-->']) {
  if (!template.includes(marker)) throw new Error(`Mall saknar ${marker}-placeholder`);
}
for (const marker of ['/*__EXPLORATION_CSS__*/','/*__EXPLORATION_VIEW__*/','/*__EXPLORATION_GRAPH__*/']) {
  if (!template.includes(marker)) throw new Error(`Mall saknar ${marker}-placeholder`);
}
const html = template
  .replace('<!--__SITE_HEADER__-->',()=>renderSiteHeader({logo:logoHorizontal,firstChapter:report.chapters[0].id}))
  .replace('/*__SITE_NAVIGATION__*/',()=>readFileSync(join(here,'site_navigation.mjs'),'utf8').replace(/^export /gm,''))
  .replace('/*__NAVIGATION_VIEW__*/',()=>readFileSync(join(here,'navigation_view.mjs'),'utf8'))
  .replace('/*__PUBLICATION_MODEL__*/', () => publicationModel)
  .replace('/*__MEASUREMENT_VIEW__*/', () => readFileSync(join(here,'measurement_view.mjs'),'utf8'))
  .replace('/*__BRAND_CSS__*/', () => brandCss)
  .replace('/*__EXPLORATION_CSS__*/', () => explorationCss)
  .replace('/*__EXPLORATION_GRAPH__*/', () => explorationGraph)
  .replace('/*__EXPLORATION_VIEW__*/', () => explorationView)
  .replace('/*__RANKING_MODEL__*/', () => rankingModel)
  .replace('/*__RANKING_VIEW__*/', () => rankingView)
  .replace('/*__PROCESS_GEOMETRY__*/', () => processGeometry)
  .replace('/*__RISK_FIELDS__*/', () => riskFields)
  .replace('/*__PROCESS_CHART_EXPORT__*/', () => processChartExport)
  .replace('/*__PAYLOAD__*/', () => payload);
writeFileSync(join(root, 'Artefakt_C_riskregister.html'), html);
console.log(`Skrev Artefakt_C_riskregister.html (${(html.length / 1024).toFixed(0)} KB, ${risks.length} risker)`);

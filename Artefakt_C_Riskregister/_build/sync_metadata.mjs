#!/usr/bin/env node
// Keeps duplicated process metadata, source links and risk-node labels aligned
// with the canonical process export and source register before each build.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceRegister, toEmbeddedSourceRegister } from './source_register.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const processFile = join(here, '../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json');
const sourceFile = join(here, '../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_kallregister.csv');
const riskFile = join(here, '../Artefakt_C_riskregister.json');
const RELEASE = Object.freeze({
  artifactVersion: '0.9',
  effectiveDate: '2026-08-20',
  exportedAt: '2026-08-20T08:00:00+02:00',
  baseline: 'S0: gällande system per 2026-08-20; Miljöprövningsmyndigheten träder i kraft 2027-07-01 och modelleras endast i S1',
});

const processExport = JSON.parse(readFileSync(processFile, 'utf8'));
const risks = JSON.parse(readFileSync(riskFile, 'utf8'));
const sourceRows = readSourceRegister(sourceFile);
const sourceRegister = toEmbeddedSourceRegister(sourceRows);

processExport.exportedAt = RELEASE.exportedAt;
processExport.artifactMetadata.artifactVersion = RELEASE.artifactVersion;
processExport.artifactMetadata.effectiveDate = RELEASE.effectiveDate;
processExport.artifactMetadata.validation.chartCount = processExport.charts.length;

const nodeById = new Map();
const chartKeys = new Set();
const edgeIds = new Set();
let edgeCount = 0;
for (const chart of processExport.charts) {
  const chartKey = chart.metadata?.chartKey;
  if (!chartKey || !/^B(?:00|10|20|30|40|50|60|70)$/.test(chartKey)) {
    throw new Error(`Invalid metadata.chartKey on ${chart.name}`);
  }
  if (chartKeys.has(chartKey)) throw new Error(`Duplicated chart key: ${chartKey}`);
  chartKeys.add(chartKey);
  chart.metadata.artifactVersion = RELEASE.artifactVersion;
  chart.metadata.effectiveDate = RELEASE.effectiveDate;
  chart.metadata.baseline = RELEASE.baseline;
  chart.metadata.sourceRegister = sourceRegister;
  edgeCount += chart.chartData.edges.length;

  for (const node of chart.chartData.nodes) {
    if (nodeById.has(node.id)) throw new Error(`Duplicated process node: ${node.id}`);
    if (!node.id.startsWith(`${chartKey}-`)) throw new Error(`Node ${node.id} does not belong to ${chartKey}`);
    nodeById.set(node.id, node);
    node.data.effectiveDate = RELEASE.effectiveDate;

    if (!Array.isArray(node.data.legalBasis) || node.data.legalBasis.length === 0) {
      node.data.legalBasis = ['Operativ processnod – ingen självständig rättsregel'];
      const note = 'Noden är operativ och uttrycker inte i sig en självständig rättsregel.';
      if (!String(node.data.notes ?? '').includes(note)) {
        node.data.notes = [node.data.notes, note].filter(Boolean).join(' ');
      }
    }

    node.data.sourceUrls = (node.data.sourceRefs ?? []).map((sourceRef) => {
      const source = sourceRegister[sourceRef];
      if (!source) throw new Error(`Unknown source reference ${sourceRef} on ${node.id}`);
      return source.url;
    });
  }
}

for (const chart of processExport.charts) {
  const chartKey = chart.metadata.chartKey;
  const localNodeIds = new Set(chart.chartData.nodes.map(node => node.id));
  for (const edge of chart.chartData.edges) {
    if (edgeIds.has(edge.id)) throw new Error(`Duplicated process edge: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!edge.id.startsWith(`${chartKey}-`)) throw new Error(`Edge ${edge.id} does not belong to ${chartKey}`);
    if (!localNodeIds.has(edge.source)) throw new Error(`Unknown edge source ${edge.source} on ${edge.id}`);
    if (!localNodeIds.has(edge.target)) throw new Error(`Unknown edge target ${edge.target} on ${edge.id}`);
  }
}

for (const node of nodeById.values()) {
  for (const handoff of [...(node.data.handoffFrom ?? []), ...(node.data.handoffTo ?? [])]) {
    if (!nodeById.has(handoff)) throw new Error(`Unknown handoff ${handoff} on ${node.id}`);
  }
}

processExport.artifactMetadata.validation.nodeCount = nodeById.size;
processExport.artifactMetadata.validation.edgeCount = edgeCount;
processExport.artifactMetadata.validation.valid = true;
processExport.artifactMetadata.validation.errors = [];
processExport.artifactMetadata.validation.warnings = [...nodeById.values()]
  .filter(node => node.data.confidence && node.data.confidence !== 'high')
  .map(node => `${node.id}: confidence=${node.data.confidence}`);

const riskIds = new Set();
for (const risk of risks) {
  if (riskIds.has(risk.risk_id)) throw new Error(`Duplicated risk id: ${risk.risk_id}`);
  riskIds.add(risk.risk_id);
  const node = nodeById.get(risk.node_id);
  if (!node) throw new Error(`Unknown node ${risk.node_id} on ${risk.risk_id}`);
  risk.node_label = node.data.label;
  risk.chart_key = risk.node_id.split('-')[0];
  risk.scenario_tags = (node.data.scenarioTags ?? []).join(' | ');

  for (const [field, legacyField] of [['trigger_factors', 'trigger'], ['consequences', 'impact']]) {
    const items = risk[field];
    if (!Array.isArray(items) || items.length < 3 || items.length > 5) {
      throw new Error(`${risk.risk_id}: ${field} must contain 3-5 items`);
    }
    if (typeof risk[legacyField] !== 'string' || !risk[legacyField].trim()) {
      throw new Error(`${risk.risk_id}: legacy summary ${legacyField} must remain a non-empty string`);
    }
    if (!items.some((item) => item?.basis === 'source')) {
      throw new Error(`${risk.risk_id}: ${field} must contain at least one source-grounded item`);
    }
    const seenTexts = new Set();
    for (const [index, item] of items.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`${risk.risk_id}: ${field}[${index}] must be an object`);
      }
      if (typeof item.text !== 'string' || !item.text.trim()) {
        throw new Error(`${risk.risk_id}: ${field}[${index}].text must be non-empty`);
      }
      const normalizedText = item.text.trim().toLocaleLowerCase('sv-SE').replace(/\s+/g, ' ');
      if (seenTexts.has(normalizedText)) throw new Error(`${risk.risk_id}: duplicate text in ${field}`);
      seenTexts.add(normalizedText);
      if (!['source', 'analysis'].includes(item.basis)) {
        throw new Error(`${risk.risk_id}: ${field}[${index}].basis must be source or analysis`);
      }
      if (!Array.isArray(item.source_refs)) {
        throw new Error(`${risk.risk_id}: ${field}[${index}].source_refs must be an array`);
      }
      if (new Set(item.source_refs).size !== item.source_refs.length) {
        throw new Error(`${risk.risk_id}: duplicated item source reference in ${field}[${index}]`);
      }
      for (const sourceRef of item.source_refs) {
        if (!risk.source_refs.includes(sourceRef)) {
          throw new Error(`${risk.risk_id}: ${field}[${index}] uses source outside risk.source_refs: ${sourceRef}`);
        }
      }
      if (item.basis === 'source' && item.source_refs.length === 0) {
        throw new Error(`${risk.risk_id}: source-backed ${field}[${index}] has no source reference`);
      }
      if (item.basis === 'analysis' && item.source_refs.length !== 0) {
        throw new Error(`${risk.risk_id}: analysis ${field}[${index}] must not claim direct source references`);
      }
    }
  }

  for (const sourceRef of risk.source_refs ?? []) {
    if (!sourceRef.startsWith('EXT:') && !sourceRegister[sourceRef]) {
      throw new Error(`Unknown source reference ${sourceRef} on ${risk.risk_id}`);
    }
  }
}

writeFileSync(processFile, `${JSON.stringify(processExport, null, 2)}\n`);
writeFileSync(riskFile, `${JSON.stringify(risks, null, 2)}\n`);
console.log(`Synkroniserade ${nodeById.size} processnoder, ${edgeCount} kanter, ${risks.length} risker och ${sourceRows.length} källor.`);

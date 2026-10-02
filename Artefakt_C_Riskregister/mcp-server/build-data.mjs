#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceRegister } from '../_build/source_register.mjs';
import { serializeRiskCsv, serializeRiskItemCsv } from '../_build/risk_fields.mjs';
import { createExplorationData } from '../_build/exploration_model.mjs';
import { loadAuthorityPackage } from '../_build/authority_controls.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sourceFile = join(here, '../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_kallregister.csv');
const riskFile = join(here, '../Artefakt_C_riskregister.json');
const processFile = join(here, '../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json');
const curationsFile = join(here, '../_build/exploration_curations.json');
const outputDirectory = join(here, 'data');

export const CONTROL_CSV_HEADER = Object.freeze([
  'control_id', 'title', 'description', 'kind', 'basis', 'review_status', 'role',
  'risk_ids_json', 'source_risk_ids_json', 'chart_keys_json', 'source_refs_json',
  'source_texts_json', 'targets_json', 'rationale',
  'driver', 'scenario', 'priority_scope', 'implementation_status', 'measurement_json',
  'authority_assessment_json', 'source_rows_json', 'provenance_json', 'authority_context_json',
]);

function csvCell(value) {
  let text = String(value ?? '');
  // CSV is a spreadsheet download: neutralize formulas while retaining raw text in JSON.
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeControlCsv(controls) {
  const rows = controls.map(control => [
    control.id, control.title, control.description, control.kind, control.basis,
    control.reviewStatus, control.role, JSON.stringify(control.riskIds),
    JSON.stringify(control.sourceRiskIds), JSON.stringify(control.chartKeys),
    JSON.stringify([...new Set(control.sourceTexts.flatMap(source => source.source_refs))].sort()),
    JSON.stringify(control.sourceTexts), JSON.stringify(control.targets), control.rationale ?? '',
    control.driver ?? 'unspecified', control.scenario ?? '', control.priorityScope ?? '', control.implementationStatus ?? '',
    JSON.stringify(control.measurement ?? null), JSON.stringify(control.authorityAssessment ?? null),
    JSON.stringify(control.sourceRows ?? null), JSON.stringify(control.provenance ?? null),
    JSON.stringify(control.kind === 'authority' ? Object.fromEntries([
      'owner', 'scope', 'legalBasis', 'indicators', 'verificationEvidence', 'baselineDifference', 'triggerFrequency',
      'exposure', 'overlap', 'mandateStatus', 'sourceStatus', 'sourceReviewStatus', 'mandateSources', 'roleBasis',
    ].map(key => [key, control[key]])) : null),
  ]);
  return [CONTROL_CSV_HEADER, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function buildData() {
  const sources = readSourceRegister(sourceFile);
  const risks = JSON.parse(readFileSync(riskFile, 'utf8'));
  const processCharts = JSON.parse(readFileSync(processFile, 'utf8'));
  const curations = JSON.parse(readFileSync(curationsFile, 'utf8'));
  const exploration = createExplorationData(risks, curations, loadAuthorityPackage());
  const chartNames = Object.fromEntries(processCharts.charts.map(chart => [chart.metadata.chartKey, chart.name]));
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, 'sources.json'), `${JSON.stringify(sources, null, 2)}\n`);
  writeFileSync(join(outputDirectory, 'riskregister.csv'), serializeRiskCsv(risks, chartNames));
  writeFileSync(join(outputDirectory, 'riskregister-items.csv'), serializeRiskItemCsv(risks, chartNames));
  writeFileSync(join(outputDirectory, 'exploration.json'), `${JSON.stringify(exploration, null, 2)}\n`);
  writeFileSync(join(outputDirectory, 'controls.csv'), serializeControlCsv(exploration.controls));
  console.log(`Skrev ${sources.length} källor, ${risks.length} risker och ${exploration.controls.length} motåtgärdsposter till mcp-server/data/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildData();

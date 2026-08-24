#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceRegister } from '../_build/source_register.mjs';
import { serializeRiskCsv, serializeRiskItemCsv } from '../_build/risk_fields.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sourceFile = join(here, '../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_kallregister.csv');
const riskFile = join(here, '../Artefakt_C_riskregister.json');
const processFile = join(here, '../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json');
const outputDirectory = join(here, 'data');

const sources = readSourceRegister(sourceFile);
const risks = JSON.parse(readFileSync(riskFile, 'utf8'));
const processCharts = JSON.parse(readFileSync(processFile, 'utf8'));
const chartNames = Object.fromEntries(processCharts.charts.map(chart => [chart.metadata.chartKey, chart.name]));
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, 'sources.json'), `${JSON.stringify(sources, null, 2)}\n`);
writeFileSync(join(outputDirectory, 'riskregister.csv'), serializeRiskCsv(risks, chartNames));
writeFileSync(join(outputDirectory, 'riskregister-items.csv'), serializeRiskItemCsv(risks, chartNames));
console.log(`Skrev ${sources.length} källor och ${risks.length} risker till mcp-server/data/`);

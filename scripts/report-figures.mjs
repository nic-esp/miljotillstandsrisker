#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportFigureData } from '../Artefakt_C_Riskregister/_build/report_model.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const report=read('report/manuscript.json'),measurement=read('report/measurement.json'),risks=read('Artefakt_C_Riskregister/Artefakt_C_riskregister.json');
if(report.measurementEditionId!==measurement.editionId)throw new Error('Rapportens mätutgåva avviker');
console.log(JSON.stringify(Object.fromEntries(report.chapters.flatMap(c=>c.blocks).filter(b=>b.type==='figure').map(b=>[b.figureId,reportFigureData(b.figureId,report,measurement,risks)]))));

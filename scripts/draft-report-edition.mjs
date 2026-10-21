#!/usr/bin/env node
import { readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync } from 'node:fs';
import { resolve,dirname,join,relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
export function draftReport(output) {
  const out=resolve(output),rel=relative(join(root,'work'),out);
  if(!rel||rel.startsWith('..')||existsSync(out))throw new Error('Använd en ny katalog i ignorerade work/');
  const measurement=read('publication/measurement.json');
  if(measurement.status!=='ready')throw new Error('Ingen ny mätutgåva är aktiverad');
  const previous=read('report/measurement.json'),manuscript=read('report/manuscript.json');
  const oldRows=new Map(previous.risks.map(r=>[r.riskId,r]));
  const changes=measurement.risks.filter(r=>JSON.stringify(oldRows.get(r.riskId))!==JSON.stringify(r)).map(r=>({riskId:r.riskId,previousLoss:oldRows.get(r.riskId)?.expectedLoss?.value??null,newLoss:r.expectedLoss?.value??null}));
  const reviewIds=['sammanfattning','kvantitativ-metod','osakerhetsmetod','riskresultat','processresultat','myndighetsatgarder','scenarier','samlad-analys','kanslighet','diskussion','slutsatser','uppfoljning','matbilaga'];
  const draft={...manuscript,editionId:`rapport-utkast-${measurement.editionId}`,measurementEditionId:measurement.editionId,status:'draft',date:new Date().toISOString().slice(0,10),chapters:manuscript.chapters.map(c=>reviewIds.includes(c.id)?{...c,status:'draft'}:c)};
  mkdirSync(out,{recursive:true});
  writeFileSync(join(out,'manuscript.json'),JSON.stringify(draft,null,2)+'\n');
  copyFileSync(join(root,'publication/measurement.json'),join(out,'measurement.json'));
  copyFileSync(join(root,'publication/interviews.json'),join(out,'interviews.json'));
  writeFileSync(join(out,'review-changes.json'),JSON.stringify({previousEdition:manuscript.editionId,newMeasurement:measurement.editionId,chaptersToReview:reviewIds,changedRisks:changes,removedRisks:previous.risks.filter(r=>!measurement.risks.some(n=>n.riskId===r.riskId)).map(r=>r.riskId),note:'Prosa har bevarats. Formuleringar, slutsatser, figurtexter och scenarioval behöver granskas före publicering.'},null,2)+'\n');
  return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{console.log(`Rapportutkast: ${draftReport(process.argv[2]||join(root,'work/report-draft'))}`);}catch(e){console.error(e.message);process.exitCode=1;}
}

#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateDescriptionReview} from '../Artefakt_C_Riskregister/_build/measurement_model.mjs';

// Description ranges are a separate evidence layer. Never infer a mean, median,
// annual total or ranking score from their endpoints.
export function applyDescriptionReview(measurement,audit) {
  const next=structuredClone(measurement);
  if(audit.sourceSnapshotSha256!==next.provenance.sourceSnapshotSha256||audit.sourceExecutionId!==next.provenance.executionId)throw Error('Description review belongs to another source');
  const reviewed=new Set(next.risks.filter(r=>r.qualityStatus==='review_required').map(r=>r.riskId));
  const audited=new Set(audit.entries.map(r=>r.riskId));
  if(audited.size!==audit.entries.length||[...reviewed].some(id=>!audited.has(id))||audit.entries.some(r=>!next.risks.some(x=>x.riskId===r.riskId)))throw Error('Description review must include every flagged risk and use unique known IDs');
  for(const entry of audit.entries)if((entry.annualCostStatus==='model_estimate')!==!!next.risks.find(r=>r.riskId===entry.riskId).expectedLoss)throw Error('Description review cost decision disagrees with model publication');
  for(const entry of audit.entries)validateDescriptionReview(entry);
  const byId=new Map(audit.entries.map(r=>[r.riskId,r]));
  for(const row of next.risks)if(byId.has(row.riskId))row.descriptionReview=byId.get(row.riskId);
  next.quality.descriptionEstimateCount=audit.entries.filter(r=>r.estimates.length).length;
  next.quality.descriptionReview={...audit.summary,id:audit.id,reviewedAt:audit.reviewedAt,sourceQualification:audit.sourceQualification};
  next.quality.descriptionReviewComplete=true;
  next.provenance.displayLabel='Riskbedömning oktober 2026';
  return next;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [measurementFile,auditFile,outputFile]=process.argv.slice(2);
  if(!outputFile)throw Error('usage: measurement.json description-review.json output.json');
  const read=file=>JSON.parse(readFileSync(file,'utf8'));
  const result=applyDescriptionReview(read(measurementFile),read(auditFile));
  writeFileSync(outputFile,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.quality.descriptionReview,null,2));
}

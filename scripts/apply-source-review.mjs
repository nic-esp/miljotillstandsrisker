#!/usr/bin/env node
// Deterministic publication adjustment. Raw measurement summaries remain intact.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateMeasurement} from '../Artefakt_C_Riskregister/_build/measurement_model.mjs';
import {canonicalContext} from './import-runs.mjs';

export function applySourceReview(measurement,audit) {
  const next=structuredClone(measurement),known=new Map(next.risks.map(r=>[r.riskId,r]));
  if(next.provenance.currency!=='SEK'||next.provenance.horizonYears!==1)throw Error('Källgranskningen kräver SEK och ett år');
  if(audit.schemaVersion!==1||audit.intervalPoint!=='arithmetic_midpoint'||audit.sourceSnapshotSha256!==next.provenance.sourceSnapshotSha256)throw Error('Källgranskningens identitet eller intervallregel avviker');
  if(new Set(audit.entries.map(r=>r.riskId)).size!==audit.entries.length||audit.entries.some(r=>!known.has(r.riskId)))throw Error('Okända eller dubbla granskningsposter');
  if(!Array.isArray(audit.originalTop50)||new Set(audit.originalTop50).size!==audit.originalTop50.length||audit.originalTop50.some(id=>!known.has(id)||!audit.entries.some(r=>r.riskId===id)))throw Error('Den ursprungliga topplistan är inte fullständigt granskad');
  for(const e of audit.entries) {
    if(!['retain_model','replace_source','withhold'].includes(e.decision)||!e.reason)throw Error('Okänt granskningsbeslut');
    for(const dimension of ['likelihood','impact'])if(!['retain','replace_range','replace_point','withhold'].includes(e[dimension]?.decision))throw Error('Okänt dimensionsbeslut');
  }
  for(const row of next.risks) {
    const review=audit.entries.find(r=>r.riskId===row.riskId);
    row.sourceReview=review||null;
    row.reviewedInputs={};
    for(const dimension of ['likelihood','impact']) {
      const original=row.summaries?.[dimension],r=review?.[dimension];
      const unit=dimension==='likelihood'?'events_per_year':'SEK_per_event';
      if(r?.decision==='withhold'){row.reviewedInputs[dimension]=null;continue;}
      if(['replace_range','replace_point'].includes(r?.decision)) {
        const lower=r.decision==='replace_range'?r.lower:r.value,upper=r.decision==='replace_range'?r.upper:r.value;
        if(!Number.isFinite(lower)||lower<0||!Number.isFinite(upper)||upper<lower||r.unit!==unit||!r.sourceQuote||!r.scope||!r.evidenceKind)throw Error(`Ofullständig jämförbar källa: ${row.riskId}/${dimension}`);
        row.reviewedInputs[dimension]={value:(lower+upper)/2,lower,upper,unit,method:r.decision==='replace_range'?'source_range_midpoint':'source_point',evidenceKind:r.evidenceKind,sourceQuote:r.sourceQuote,sourceUrl:r.sourceUrl||null,sourceTitle:r.sourceTitle||'Riskbeskrivningens bedömning',scope:r.scope,period:r.period||null,qualification:r.qualification||null};
      } else if(original?.median!=null)row.reviewedInputs[dimension]={value:original.median,lower:original.median,upper:original.median,unit,method:'model_median',runId:original.runId};
      else row.reviewedInputs[dimension]=null;
    }
    const l=row.reviewedInputs.likelihood,i=row.reviewedInputs.impact;
    const structural=(row.review||[]).some(f=>['population_mismatch','event_population_ambiguity','exposure_volume_conflict','source_ineligible','outside_execution'].includes(f.code));
    const changed=l?.method!=='model_median'||i?.method!=='model_median';
    row.reviewedCost=l&&i&&!structural&&review?.decision!=='withhold'?{value:l.value*i.value,lower:l.lower*i.lower,upper:l.upper*i.upper,unit:'SEK',horizonYears:1,method:changed?'source_guided_product':'product_of_medians',definition:changed?'Produkt av granskade frekvens- och kostnadsuppgifter. Källintervall representeras av sin aritmetiska mittpunkt; övriga uppgifter av modellmedianer. Ingen observerad årskostnad eller förlustmedian.':'Medianfrekvens × mediankostnad; modellbaserad jämförelseindikator.',reviewId:audit.id}:null;
  }
  next.modelMedianRanking=next.modelMedianRanking||next.ranking;
  next.priorityMetric='reviewed_cost_indicator';
  next.ranking={run:{...next.ranking.run,metric:next.priorityMetric,policyId:audit.id},entries:next.risks.filter(r=>r.reviewedCost).sort((a,b)=>b.reviewedCost.value-a.reviewedCost.value||a.riskId.localeCompare(b.riskId)).map((r,i)=>({riskId:r.riskId,sourceRiskId:r.sourceRiskId,rank:i+1,score:r.reviewedCost.value}))};
  next.editionId=`source-reviewed-${audit.id}`;
  next.sourceReview={...audit,entries:undefined};
  next.quality.reviewedCostCount=next.ranking.entries.length;
  next.quality.sourceReview={reviewed:audit.entries.length,originalTop50:audit.originalTop50.length,corrected:next.risks.filter(r=>r.sourceReview&&r.reviewedCost?.method==='source_guided_product').length,withheld:next.risks.filter(r=>r.sourceReview&&!r.reviewedCost).length};
  next.quality.note='Källgranskad kostnadsindikator. Jämförbara källintervall ersätter orimliga modellvärden med aritmetisk mittpunkt enligt publiceringsbeslutet. Hela intervallet och källan redovisas. Övriga uppgifter behåller modellmedianer. Alla råa mätresultat bevaras separat. Beloppen är inga observerade nationella kostnader och ekonomiska överlapp kvarstår.';
  return next;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [source,audit,out]=process.argv.slice(2);if(!out)throw Error('usage: measurement.json source-review.json output.json');
  const read=p=>JSON.parse(readFileSync(p,'utf8')),result=applySourceReview(read(source),read(audit)),canonical=canonicalContext();
  validateMeasurement(result,canonical.risks.map(r=>r.risk_id),canonical.controls.map(c=>c.id));
  writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(result.quality.sourceReview);
}

#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalContext} from './import-runs.mjs';
import {inputProvenance,costProvenance,controlEffectProvenance} from '../Artefakt_C_Riskregister/_build/measurement_provenance.mjs';
import {rankInvestments} from '../Artefakt_C_Riskregister/_build/investment_model.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const cell=value=>{const text=String(value==null?'':value);return '"'+(typeof value==='string'&&/^[=+@-]/.test(text)?"'"+text:text).replaceAll('"','""')+'"';};
export function evidenceExports(snapshot,canonical,audit) {
  const rows=new Map(snapshot.risks.map(r=>[r.riskId,r]));
  const audited=new Map((audit?.risks||[]).map(r=>[r.riskId,r]));
  const ranks=new Map(snapshot.ranking.entries.map(r=>[r.riskId,r.rank]));
  const csv=records=>{const columns=Object.keys(records[0]);return [columns.map(cell).join(','),...records.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';};
  const riskRows=canonical.risks.map(r=>{
    const row=rows.get(r.risk_id),a=audited.get(r.risk_id),f=inputProvenance(row,'likelihood'),s=inputProvenance(row,'impact'),c=costProvenance(row,snapshot.priorityMetric);
    const inputs={};
    for(const [prefix,v,d] of [['frekvens',f,'likelihood'],['kostnad_per_handelse',s,'impact']]) {
      inputs[prefix+'_anvand']=v.value;inputs[prefix+'_ursprung']=v.sourceLabel;inputs[prefix+'_statistiskt_matt']=v.statisticLabel;
      inputs[prefix+'_enhet']=row?.reviewedInputs?.[d]?.unit||row?.summaries?.[d]?.unit||(d==='likelihood'?'events_per_year':'SEK_per_event');
      inputs[prefix+'_intervall_nedre']=v.lower;inputs[prefix+'_intervall_ovre']=v.upper;
      inputs[prefix+'_kalla']=v.sourceUrl||v.runId;inputs[prefix+'_kallcitat']=row?.reviewedInputs?.[d]?.sourceQuote;
      const raw=row?.sourceStatistics?.[d==='likelihood'?'likelihood':'impactBelief']||row?.summaries?.[d];
      inputs[prefix+'_ursprunglig_modellmedian']=raw?.median;inputs[prefix+'_ursprungligt_modellmedel']=raw?.mean;
    }
    return {risk_id:r.risk_id,titel:r.title,rang:ranks.get(r.risk_id),...inputs,kostnadsindikator_sek_per_ar:c.value,indikator_ursprung:c.sourceLabel,indikator_berakning:c.statisticLabel,indikator_intervall_nedre:row?.reviewedCost?.lower,indikator_intervall_ovre:row?.reviewedCost?.upper,ursprunglig_medianprodukt:a?.rawModel?.medianProduct??row?.centralCost?.value,ursprungligt_arsmedel:a?.rawModel?.meanProduct??row?.expectedLoss?.value,publicerad_modellmedianprodukt:row?.centralCost?.value,publicerat_modellarsmedel:row?.expectedLoss?.value,ravarden_status:'Ursprungliga modellvärden är diagnostik och inte automatiskt godkända för prioritering',valuta:snapshot.provenance.currency,period_ar:snapshot.provenance.horizonYears,granskningsniva:a?.reviewLevel,rimlighetsbedomning:a?.sanityAssessment,saknade_uppgifter:(a?.missing||[]).join(' | '),matutgava:snapshot.editionId};
  });
  const ranked=rankInvestments(snapshot,canonical.controls),effect=controlEffectProvenance();
  const controls=ranked.map((r,i)=>({kontroll_id:r.control.id,titel:r.control.title,drivande_aktor:r.control.driver,scenario:r.control.scenario||'',rang_fristaende:i+1,berorda_risker:r.affectedCount,risker_med_kostnadsunderlag:r.pricedCount,utan_atgard_sek_per_ar:r.referenceExpectedLoss,med_atgard_sek_per_ar:r.residualExpectedLoss,indikatorminskning_sek_per_ar:r.reduction,relativ_indikatorminskning:r.reductionFraction,ursprung:effect.sourceLabel,matt:effect.statisticLabel,risk_idn:r.control.riskIds.join(' | '),genomforandekostnad:null,nettonytta:null,matutgava:snapshot.editionId}));
  const effects=ranked.flatMap(r=>r.rows.map(x=>({kontroll_id:r.control.id,risk_id:x.riskId,frekvensminskning:x.frequencyReduction,kostnadsminskning_vid_handelse:x.severityReduction,utan_atgard_sek_per_ar:x.baseline,med_atgard_sek_per_ar:x.residual,indikatorminskning_sek_per_ar:x.reduction,basvarde_ursprung:costProvenance(rows.get(x.riskId),snapshot.priorityMetric).sourceLabel,basvarde_berakning:costProvenance(rows.get(x.riskId),snapshot.priorityMetric).statisticLabel,effekt_ursprung:effect.sourceLabel,effekt_matt:effect.statisticLabel,saknat_effektunderlag:x.missing.join(' | '),saknad_kostnad:x.reason||'',matutgava:snapshot.editionId})));
  return {'risk-values.csv':csv(riskRows),'control-priorities.csv':csv(controls),'control-risk-effects.csv':csv(effects)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  for(const [name,content] of Object.entries(evidenceExports(read('publication/measurement.json'),canonicalContext(),read('publication/numeric-audit.json'))))writeFileSync(join(root,'publication',name),content);
  console.log('Skrev tre numeriska CSV-exporter med ursprung, mått och riskkopplingar.');
}

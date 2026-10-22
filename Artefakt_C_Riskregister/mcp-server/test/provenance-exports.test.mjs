import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inputProvenance,costProvenance,aggregateProvenance,controlEffectProvenance} from '../../_build/measurement_provenance.mjs';
import {evidenceExports} from '../../../scripts/build-evidence-exports.mjs';
import {canonicalContext} from '../../../scripts/import-runs.mjs';

const root=new URL('../../../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const snapshot=read('publication/measurement.json');
const audit=read('publication/numeric-audit.json');
const canonical=canonicalContext();

function parseCsv(value) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let index=0;index<value.length;index++) {
    const char=value[index];
    if(quoted) {
      if(char==='"'&&value[index+1]==='"'){cell+='"';index++;}
      else if(char==='"')quoted=false;
      else cell+=char;
    } else if(char==='"'&&cell==='')quoted=true;
    else if(char===','){row.push(cell);cell='';}
    else if(char==='\r'&&value[index+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';index++;}
    else cell+=char;
  }
  assert.equal(quoted,false,'Every quoted CSV field must close');
  assert.equal(cell,'','CSV terminates with CRLF');assert.equal(row.length,0);
  const [header,...data]=rows;
  assert.equal(new Set(header).size,header.length,'CSV field names must be unique');
  for(const row of data)assert.equal(row.length,header.length,'Quoted cells must not shift columns');
  return data.map(row=>Object.fromEntries(header.map((name,i)=>[name,row[i]])));
}
const exports=evidenceExports(snapshot,canonical,audit);
const riskCsv=parseCsv(exports['risk-values.csv']);
const controlsCsv=parseCsv(exports['control-priorities.csv']);
const effectsCsv=parseCsv(exports['control-risk-effects.csv']);
const byRisk=new Map(riskCsv.map(r=>[r.risk_id,r]));
const numeric=(actual,expected,message)=>{
  if(expected==null)assert.equal(actual,'',message);
  else {assert.notEqual(actual,'',message);assert.equal(Number(actual),expected,message);}
};

function sourceFixture(evidenceKind='description_estimate') {
  return {
    summaries:{likelihood:{median:10,mean:25,runId:'frequency'},impact:{median:100,mean:1000,runId:'impact'}},
    reviewedInputs:{likelihood:{value:10,method:'model_median',runId:'frequency'},impact:{value:30,lower:20,upper:40,method:'source_range_midpoint',evidenceKind,sourceUrl:'https://example.org/evidence'}},
    reviewedCost:{value:300,lower:200,upper:400},centralCost:{value:1000},expectedLoss:{value:25000},
  };
}

test('unknown source estimates never acquire historical provenance from having a source URL',()=>{
  for(const kind of [undefined,'expert_estimate','unclassified','description_estimate']){
    const row=sourceFixture();row.reviewedInputs.impact.evidenceKind=kind;
    const p=inputProvenance(row,'impact');
    assert.notEqual(p.origin,'adapted_history');assert.doesNotMatch(p.sourceLabel,/historisk/i);
  }
  const observed=inputProvenance(sourceFixture('historical_observation'),'impact');
  assert.equal(observed.origin,'adapted_history');
  assert.equal(inputProvenance(sourceFixture('expert_estimate'),'impact').origin,'source_estimate');
  const aggregate=aggregateProvenance({priorityMetric:'reviewed_cost_indicator',risks:[{riskId:'R1',...sourceFixture('expert_estimate')}]},['R1']);
  assert.equal(aggregate.counts.adapted_history,0);
});

test('source midpoint, raw model median and raw model mean remain separate values and statistics',()=>{
  const row=sourceFixture(),before=structuredClone(row);
  const effective=inputProvenance(row,'impact');
  assert.equal(effective.value,30);assert.equal(effective.lower,20);assert.equal(effective.upper,40);
  assert.equal(effective.origin,'description_estimate');assert.match(effective.statisticLabel,/aritmetisk mittpunkt/i);assert.doesNotMatch(effective.statisticLabel,/median/i);
  const rawMedian=inputProvenance(row,'impact',{effective:false,statistic:'median'});
  const rawMean=inputProvenance(row,'impact',{effective:false,statistic:'mean'});
  assert.equal(rawMedian.value,100);assert.match(rawMedian.statisticLabel,/median/i);
  assert.equal(rawMean.value,1000);assert.match(rawMean.statisticLabel,/medelvärde/i);
  const product=costProvenance(row,'reviewed_cost_indicator');
  assert.equal(product.origin,'mixed');assert.equal(product.value,300);assert.match(product.statisticLabel,/modellmedian × källintervallens mittpunkt/);
  assert.equal(costProvenance(row,'expected_annual_cost').value,25000);
  assert.deepEqual(row,before,'Provenance must not rewrite source values');
});

test('withheld inputs cannot silently fall back to available raw statistics or zero',()=>{
  const row=sourceFixture();row.reviewedInputs.impact=null;row.reviewedCost=null;
  const effective=inputProvenance(row,'impact');assert.equal(effective.value,null);assert.equal(effective.origin,'undefined');
  assert.equal(inputProvenance(row,'impact',{effective:false,statistic:'mean'}).value,1000);
  assert.equal(costProvenance(row).value,null);assert.match(costProvenance(row).statisticLabel,/odefinierad/i);
});

test('all 342 exported risk records retain numeric provenance and explicit explanations for missing values',()=>{
  assert.equal(riskCsv.length,342);
  assert.deepEqual([...byRisk.keys()].sort(),canonical.risks.map(r=>r.risk_id).sort());
  const missing=[];
  for(const row of snapshot.risks){
    const record=byRisk.get(row.riskId);assert.ok(record,row.riskId);
    assert.ok(record.granskningsniva,row.riskId+' review level');assert.ok(record.rimlighetsbedomning,row.riskId+' assessment');
    for(const [dimension,prefix] of [['likelihood','frekvens'],['impact','kostnad_per_handelse']]){
      const expected=inputProvenance(row,dimension);
      numeric(record[prefix+'_anvand'],expected.value,row.riskId+' '+dimension);
      assert.equal(record[prefix+'_ursprung'],expected.sourceLabel);
      assert.equal(record[prefix+'_statistiskt_matt'],expected.statisticLabel);
      if(expected.value===null){assert.match(record[prefix+'_ursprung'],/saknas/i);assert.ok(record.saknade_uppgifter);}
      if(expected.origin==='description_estimate'){
        assert.match(record[prefix+'_statistiskt_matt'],/mittpunkt/i);
        numeric(record[prefix+'_intervall_nedre'],expected.lower);numeric(record[prefix+'_intervall_ovre'],expected.upper);
        assert.ok(record[prefix+'_kallcitat']);
      }
      assert.notEqual(expected.origin,'adapted_history','This edition has no observed historical numeric replacements');
    }
    const cost=costProvenance(row,snapshot.priorityMetric);numeric(record.kostnadsindikator_sek_per_ar,cost.value);
    assert.equal(record.indikator_ursprung,cost.sourceLabel);assert.equal(record.indikator_berakning,cost.statisticLabel);
    if(cost.value===null){missing.push(record);assert.ok(record.saknade_uppgifter,row.riskId+' needs a missing reason');assert.equal(record.rang,'');}
  }
  assert.ok(missing.length>0);
  const unmeasured=snapshot.risks.filter(r=>r.qualityStatus==='outside_execution');assert.equal(unmeasured.length,1);
  const record=byRisk.get(unmeasured[0].riskId);assert.equal(record.frekvens_anvand,'');assert.equal(record.kostnad_per_handelse_anvand,'');assert.equal(record.kostnadsindikator_sek_per_ar,'');assert.equal(record.granskningsniva,'outside_execution');
});

test('raw model export preserves rejected values independently of approved publication values',()=>{
  let rejectedRaw=0;
  for(const row of snapshot.risks){
    const record=byRisk.get(row.riskId),a=audit.risks.find(a=>a.riskId===row.riskId);
    for(const [dimension,key,prefix] of [['likelihood','likelihood','frekvens'],['impact','impactBelief','kostnad_per_handelse']]){
      const raw=row.sourceStatistics?.[key]||row.summaries?.[dimension];
      numeric(record[prefix+'_ursprunglig_modellmedian'],raw?.median,row.riskId+' raw median');
      numeric(record[prefix+'_ursprungligt_modellmedel'],raw?.mean,row.riskId+' raw mean');
      if(raw&&!row.summaries?.[dimension]){rejectedRaw++;assert.notEqual(record[prefix+'_ursprunglig_modellmedian'],'');}
    }
    numeric(record.ursprunglig_medianprodukt,a?.rawModel?.medianProduct,row.riskId+' raw median product');
    numeric(record.ursprungligt_arsmedel,a?.rawModel?.meanProduct,row.riskId+' raw mean product');
  }
  assert.ok(rejectedRaw>0,'Fixture must exercise rejected raw values, not only accepted models');
});

test('all 378 controls and 500 explicit control-risk links survive export with unknown effects retained',()=>{
  assert.equal(controlsCsv.length,378);assert.equal(effectsCsv.length,500);
  const controlMap=new Map(controlsCsv.map(r=>[r.kontroll_id,r]));
  assert.deepEqual([...controlMap.keys()].sort(),canonical.controls.map(c=>c.id).sort());
  const expectedPairs=canonical.controls.flatMap(c=>c.riskIds.map(id=>c.id+'\0'+id)).sort();
  const actualPairs=effectsCsv.map(r=>r.kontroll_id+'\0'+r.risk_id).sort();
  assert.deepEqual(actualPairs,expectedPairs);assert.equal(new Set(actualPairs).size,500);
  const effect=controlEffectProvenance();assert.match(effect.detail,/ingen uppmätt besparing eller besparingsmedian/);
  for(const c of canonical.controls){const r=controlMap.get(c.id);assert.deepEqual(r.risk_idn.split(' | ').sort(),[...c.riskIds].sort());assert.equal(r.ursprung,effect.sourceLabel);assert.equal(r.matt,effect.statisticLabel);assert.equal(r.genomforandekostnad,'');assert.equal(r.nettonytta,'');}
  const unknown=effectsCsv.filter(r=>r.saknat_effektunderlag);assert.equal(unknown.length,1);
  for(const r of unknown){assert.equal(r.frekvensminskning,'');assert.equal(r.kostnadsminskning_vid_handelse,'');assert.equal(r.indikatorminskning_sek_per_ar,'');assert.ok(r.saknad_kostnad);}
  for(const r of effectsCsv){assert.ok(r.basvarde_ursprung);assert.ok(r.basvarde_berakning);assert.equal(r.effekt_ursprung,effect.sourceLabel);assert.equal(r.effekt_matt,effect.statisticLabel);if(r.indikatorminskning_sek_per_ar==='')assert.ok(r.saknat_effektunderlag||r.saknad_kostnad);}
  assert.ok(effectsCsv.some(r=>r.indikatorminskning_sek_per_ar!==''&&Number(r.indikatorminskning_sek_per_ar)<0),'Adverse model effects must stay negative');
});

test('CSV text round-trips Swedish quotes and line breaks and does not turn negative numbers into text',()=>{
  const changed={...canonical,risks:canonical.risks.map((r,i)=>i? r:{...r,title:'=Åtgärd, "kontroll"\nNästa rad'})};
  const value=parseCsv(evidenceExports(snapshot,changed,audit)['risk-values.csv'])[0];
  assert.equal(value.titel,"'=Åtgärd, \"kontroll\"\nNästa rad");
  const negative=effectsCsv.find(r=>Number(r.indikatorminskning_sek_per_ar)<0);
  assert.match(negative.indikatorminskning_sek_per_ar,/^-/);assert.equal(Number.isFinite(Number(negative.indikatorminskning_sek_per_ar)),true);
});

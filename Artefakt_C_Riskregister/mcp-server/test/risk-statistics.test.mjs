import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {convertRuns,sha256} from '../../../scripts/import-runs.mjs';
import {createMeasurementModel,validateMeasurement,validatePresentation} from '../../_build/measurement_model.mjs';

const canonical={risks:[{risk_id:'R1',title:'A'},{risk_id:'R2',title:'B'}],controls:[],mappingVersion:'mapping'};
const spec=(runId,kind,extra={})=>({runId,kind,functionId:`fn-${runId}`,status:'completed',completedAt:'2026-10-21T10:00:00Z',sha256:sha256(runId),inputRunIds:[],...extra});
const manifest=runs=>({schemaVersion:1,editionId:'synthetic-test',orgId:'org',experimentId:'experiment',executionId:'execution',mappingVersion:'mapping',currency:'SEK',horizonYears:1,scope:{description:'Two synthetic test risks',exposureBasis:'One synthetic case'},runs});
const loss=(id='loss')=>spec(id,'monte_carlo_loss',{recordPath:'data.exposures',unit:'SEK',horizonYears:1,lossDefinition:'Synthetic monetary loss over one year',distribution:false,fields:{mean:'mean',median:'quantiles.p50'}});
const rawLoss=()=>({data:{exposures:[{riskId:'R1',mean:10e6,quantiles:{p50:0},privateNote:'PRIVATE'},{riskId:'R2',mean:5e6,quantiles:{p50:4e6}}]}});
const convert=(runs,data)=>convertRuns(manifest(runs),new Map(Object.entries(data)),canonical);
const model=s=>createMeasurementModel(s,['R1','R2'],[]);
const rank=(id='R1',extra={})=>({riskId:id,rank:1,score:1,eligibleForAbsolute:true,calibrationStatus:'anchor_scaled',absolute:{point:.2},...extra});
const btl=(unit='probability')=>spec('L','btl_likelihood',{recordPath:'data.ranks',absolute:{valuePath:'absolute.point',unit,statistic:'median'}});
const occurrence=(unit='probability')=>spec('MC','monte_carlo_likelihood',{adapter:'cardinal_occurrence_v2',unit,calibrationRunId:'L',inputRunIds:['L']});
const rawOccurrence=()=>({data:{occurrence:{semanticsVersion:'v2',modelVersion:'occurrence-v2.0',horizonYears:1,results:[{riskId:'R1',probability:{mean:.25,median:.2},annualRate:{mean:.3,median:.22}}]}}});

test('Runs projection keeps mean and zero median separately with provenance and no private fields',()=>{
  const {snapshot,report}=convert([loss()],{loss:rawLoss()});
  assert.equal(model(snapshot).metric('R1','expectedLoss','median').value,0);
  assert.equal(model(snapshot).metric('R1','expectedLoss','mean').value,10e6);
  assert.equal(snapshot.risks[0].expectedLoss.value,10e6);
  assert.equal(snapshot.risks[0].summaries.expectedLoss.runId,'loss');
  assert.equal(snapshot.risks[0].lossDistribution,undefined);
  assert.equal(report.statistics.expectedLoss.median.available,2);
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
});
test('missing statistics never fall back to the other statistic or an unlabelled point',()=>{
  const raw=rawLoss();delete raw.data.exposures[0].quantiles.p50;delete raw.data.exposures[1].mean;
  const {snapshot,report}=convert([loss()],{loss:raw});
  assert.equal(model(snapshot).metric('R1','expectedLoss','median'),null);
  assert.equal(model(snapshot).metric('R2','expectedLoss','mean'),null);
  assert.deepEqual(report.statistics.expectedLoss.median.missingRiskIds,['R1']);
  const {snapshot:point}=convert([{...btl(),absolute:{valuePath:'absolute.point',unit:'probability'}}],{L:{data:{ranks:[rank()]}}});
  assert.equal(model(point).metric('R1','likelihood','mean'),null);
  assert.equal(model(point).metric('R1','likelihood','median'),null);
});
test('native occurrence imports both statistics only through a calibrated input lineage',()=>{
  for(const [unit,mean,median] of [['probability',.25,.2],['events_per_year',.3,.22]]){
    const {snapshot}=convert([occurrence(unit),btl(unit)],{L:{data:{ranks:[rank()]}},MC:rawOccurrence()});
    assert.equal(model(snapshot).metric('R1','likelihood','mean').value,mean);
    assert.equal(model(snapshot).metric('R1','likelihood','median').value,median);
    assert.equal(model(snapshot).metric('R1','likelihood','median').unit,unit);
  }
  assert.throws(()=>convert([btl(),{...occurrence(),inputRunIds:[]}],{L:{data:{ranks:[rank()]}},MC:rawOccurrence()}),/inputkedja/);
  assert.throws(()=>convert([btl(),occurrence()],{L:{data:{ranks:[rank('R1',{eligibleForAbsolute:false})]}},MC:rawOccurrence()}),/inputkedja/);
  const raw=rawOccurrence();raw.data.occurrence.horizonYears=2;
  assert.throws(()=>convert([btl(),occurrence()],{L:{data:{ranks:[rank()]}},MC:raw}),/period/);
  raw.data.occurrence.horizonYears=1;raw.data.occurrence.results[0].probability.mean=1.1;
  assert.throws(()=>convert([btl(),occurrence()],{L:{data:{ranks:[rank()]}},MC:raw}),/sannolikhet/);
});
test('native impact import excludes relative ranking diagnostics and preserves calibrated mean/P50',()=>{
  const input=spec('I','monte_carlo_impact',{adapter:'cardinal_impact_exposure',recordPath:'data.exposures',unit:'SEK_per_event'});
  const raw={data:{exposures:[{riskId:'R1',mean:8e6,quantiles:{p50:3e6},eligibleForAbsolute:true,calibrationStatus:'anchor_scaled',inputMeaning:'currency_per_event'},{riskId:'R2',mean:.7,quantiles:{p50:.3},eligibleForAbsolute:false,calibrationStatus:'relative_only',inputMeaning:'relative_share'}]}};
  const {snapshot,report}=convert([input],{I:raw});
  assert.equal(model(snapshot).metric('R1','impact','mean').value,8e6);
  assert.equal(model(snapshot).metric('R1','impact','median').value,3e6);
  assert.equal(model(snapshot).metric('R2','impact','median'),null);
  assert.equal(report.absoluteImpact,1);
  assert.throws(()=>convert([{...input,unit:'EUR_per_event'}],{I:raw}),/kostnad/);
});
test('invalid and ambiguous statistics are rejected, including blank CSV values',()=>{
  for(const invalid of ['',-1,NaN,Infinity,'10']) {
    const raw=rawLoss();raw.data.exposures[0].quantiles.p50=invalid;
    assert.throws(()=>convert([loss()],{loss:raw}),/ogiltigt median/);
  }
  assert.throws(()=>convert([loss('a'),loss('b')],{a:rawLoss(),b:rawLoss()}),/flera statistikresultat/);
  assert.throws(()=>convert([spec('MC','monte_carlo_likelihood',{adapter:'unknown'})],{MC:rawOccurrence()}),/okänd statistikadapter/);
});
test('portfolio median is never a sum of risk medians and applies only to the exact selection',()=>{
  const p=spec('P','portfolio_loss',{unit:'SEK',horizonYears:1,distribution:false,dependenceAssumption:'Joint simulated outcomes'});
  const {snapshot}=convert([loss(),p],{loss:rawLoss(),P:{riskIds:['R1','R2'],mean:15e6,p50:7e6}});
  assert.equal(model(snapshot).aggregate(['R1','R2'],'median').value,7e6);
  assert.equal(model(snapshot).aggregate(['R1'],'median').value,0);
  assert.equal(model(snapshot).aggregate(['R2'],'median').value,4e6);
  assert.equal(model(snapshot).aggregate(['R1','R2'],'mean').value,15e6);
  delete snapshot.portfolio;
  assert.equal(model(snapshot).aggregate(['R1','R2'],'median').value,null);
  assert.equal(model(snapshot).aggregate(['R1','R2'],'mean').value,15e6);
});
test('multiple process portfolios are matched by exact risk set and duplicate sets fail',()=>{
  const p=id=>spec(id,'portfolio_loss',{unit:'SEK',horizonYears:1,distribution:false,dependenceAssumption:'Joint simulation'});
  const data={loss:rawLoss(),P:{riskIds:['R1','R2'],mean:15e6,p50:7e6},P1:{riskIds:['R1'],mean:10e6,p50:0}};
  const {snapshot}=convert([loss(),p('P'),p('P1')],data);
  assert.equal(model(snapshot).aggregate(['R1'],'median').portfolio.runId,'P1');
  data.P1.riskIds=['R2','R1'];assert.throws(()=>convert([loss(),p('P'),p('P1')],data),/dubblerat portföljurval/);
});
test('a median-only portfolio does not turn a partial sum of means into a complete portfolio mean',()=>{
  const p=spec('P','portfolio_loss',{unit:'SEK',horizonYears:1,distribution:false,dependenceAssumption:'Joint simulation'});
  const raw=rawLoss();delete raw.data.exposures[1].mean;
  const {snapshot}=convert([loss(),p],{loss:raw,P:{riskIds:['R1','R2'],p50:7e6}});
  const mean=model(snapshot).aggregate(['R1','R2'],'mean'),median=model(snapshot).aggregate(['R1','R2'],'median');
  assert.equal(mean.value,10e6);assert.equal(mean.partial,true);assert.equal(mean.fromPortfolio,false);
  assert.equal(median.value,7e6);assert.equal(median.fromPortfolio,true);
});
test('median points cannot be multiplied into expected loss',()=>{
  const i=spec('I','btl_impact',{recordPath:'ranks',absolute:{valuePath:'absolute.point',unit:'SEK_per_event',statistic:'median'}});
  const m=manifest([btl(),i]);m.expectedLossRules=[{riskId:'R1',method:'product_of_means',assumption:'independent_frequency_and_severity'}];
  assert.throws(()=>convertRuns(m,new Map([['L',{data:{ranks:[rank()]}}],['I',{ranks:[rank('R1',{absolute:{point:100}})]}]]),canonical),/uttryckliga medelvärden/);
});
test('administrative setting validates; risk cards display the configured metric with no visitor toggle',()=>{
  const {snapshot}=convert([loss()],{loss:rawLoss()});
  const source=readFileSync(new URL('../../_build/measurement_view.mjs',import.meta.url),'utf8');
  for(const statistic of ['median','mean']){
    const context=vm.createContext({DATA:{measurement:snapshot,presentation:{schemaVersion:1,riskStatistic:statistic}},RISKS:canonical.risks,EX_DATA:{controls:[]},createMeasurementModel,validatePresentation,esc:s=>String(s)});
    vm.runInContext(source+"\nthis.card=measurementStrip('R1');this.formula=measurementFormula('R1');",context);
    assert.match(context.card,statistic==='median'?/Medianförlust/:/Förväntad förlust/);
    assert.match(context.card,statistic==='median'?/<strong>0 mnkr<\/strong>/:/<strong>10 mnkr<\/strong>/);
    assert.doesNotMatch(context.card,/<button|<select|<input/);
    assert.match(context.formula,statistic==='median'?/multipliceras inte/:/Exporterat medelvärde/);
  }
  for(const value of ['p50','average',null])assert.throws(()=>validatePresentation({schemaVersion:1,riskStatistic:value}),/riskStatistic/);
  const checkedIn=JSON.parse(readFileSync(new URL('../../../publication/presentation.json',import.meta.url),'utf8'));
  // Both published choices are valid: changing this admin setting must not break CI.
  assert.ok(['median','mean'].includes(validatePresentation(checkedIn).riskStatistic));
  const tampered=structuredClone(snapshot);tampered.risks[0].summaries.expectedLoss.mean=9;
  assert.throws(()=>validateMeasurement(tampered,['R1','R2'],[]),/medelvärden skiljer/);
});

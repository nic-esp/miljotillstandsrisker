import test from 'node:test';
import assert from 'node:assert/strict';
import { convertRuns,sha256,canonicalContext,importPackage,verifyCandidate } from '../../../scripts/import-runs.mjs';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { dirname,resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectInterviews } from '../../../scripts/import-interviews.mjs';
import { createMeasurementModel,validateMeasurement } from '../../_build/measurement_model.mjs';
import { validateReport,renderReportChapter } from '../../_build/report_model.mjs';
import { reportFigureData } from '../../_build/report_model.mjs';

// Synthetic records are confined to tests. Production starts with no measurements.
const canonical={risks:[{risk_id:'R1'},{risk_id:'R2'}],controls:[{id:'C1',riskIds:['R1']},{id:'C2',riskIds:['R1','R2']}],mappingVersion:'mapping-v1'};
const manifest=()=>({schemaVersion:1,editionId:'test-edition',executionId:'exec',experimentId:'experiment',orgId:'org',mappingVersion:'mapping-v1',currency:'SEK',horizonYears:1,scope:{description:'Test scope',exposureBasis:'Two specified risks'},runs:[]});
const run=(id,kind,extra={})=>({runId:id,kind,functionId:`function-${id}`,status:'completed',completedAt:'2026-10-21T10:00:00Z',sha256:sha256(id),inputRunIds:[],...extra});
const rank=(riskId,value,extra={})=>({riskId,rank:riskId==='R1'?1:2,score:riskId==='R1'?0.6:0.4,eligibleForAbsolute:true,calibrationStatus:'anchor_scaled',absolute:{point:value},...extra});
function measured() {
  const m=manifest();
  m.runs=[run('L','btl_likelihood',{recordPath:'ranks',absolute:{valuePath:'absolute.point',unit:'probability'}}),run('I','btl_impact',{recordPath:'ranks',absolute:{valuePath:'absolute.point',unit:'SEK_per_event',statistic:'conditional_mean'}})];
  m.expectedLossRules=[{riskId:'R1',method:'product_of_means',assumption:'independent_frequency_and_severity'}];
  return convertRuns(m,new Map([['L',{ranks:[rank('R1',.3)]}],['I',{ranks:[rank('R1',6e6)]}]]),canonical).snapshot;
}
test('native BTL ranks preserve relative scores and explicitly calibrated absolutes',()=>{
  const s=measured();
  assert.equal(s.ranking.entries[0].score,.6);
  assert.equal(s.risks[0].likelihood.value,.3);
  assert.equal(s.risks[0].expectedLoss.value,1.8e6);
  const a=createMeasurementModel(s,['R1','R2'],['C1','C2']).aggregate(['R1','R2']);
  assert.equal(a.quantified,1);assert.equal(a.partial,true);assert.equal(a.portfolio,null);
  assert.deepEqual(a.missing,['R2']);
});
test('relative/bounded/ineligible BTL is never promoted to a probability',()=>{
  const m=manifest();m.runs=[run('L','btl_likelihood',{recordPath:'ranks',absolute:{valuePath:'absolute.point',unit:'probability'}})];
  const result=convertRuns(m,new Map([['L',{ranks:[rank('R1',.6,{eligibleForAbsolute:false,calibrationStatus:'bounded'})]}]]),canonical);
  assert.equal(result.snapshot.risks[0].likelihood,undefined);
  assert.equal(result.report.absoluteLikelihood,0);assert.equal(result.snapshot.ranking.entries[0].score,.6);
});
test('frequency preserves events/year and scales loss by declared horizon',()=>{
  const m=manifest();m.horizonYears=2;
  m.runs=[run('L','btl_likelihood',{recordPath:'ranks',absolute:{valuePath:'absolute.point',unit:'events_per_year'}}),run('I','btl_impact',{recordPath:'ranks',absolute:{valuePath:'absolute.point',unit:'SEK_per_event',statistic:'conditional_mean'}})];
  m.expectedLossRules=[{riskId:'R1',method:'product_of_means',assumption:'independent_frequency_and_severity'}];
  const result=convertRuns(m,new Map([['L',{ranks:[rank('R1',3)]}],['I',{ranks:[rank('R1',100)]}]]),canonical);
  assert.equal(result.snapshot.risks[0].expectedLoss.value,600);
  assert.equal(result.snapshot.risks[0].likelihood.unit,'events_per_year');
});
test('unknown identity, double match, mapping drift and inconsistent currency block import',()=>{
  const m=manifest();m.runs=[run('L','btl_likelihood',{recordPath:'ranks'})];
  assert.throws(()=>convertRuns(m,new Map([['L',{ranks:[rank('unknown',.3)]}]]),canonical),/ingen explicit/);
  assert.throws(()=>convertRuns({...m,mappingVersion:'old'},new Map(),canonical),/version/);
  assert.throws(()=>convertRuns({...m,runs:[{...m.runs[0],currency:'EUR'}]},new Map([['L',{}]]),canonical),/valuta/);
  assert.throws(()=>convertRuns(m,new Map([['L',{ranks:[rank('A',.3),rank('B',.3)]}]]),canonical,{risks:{A:'R1',B:'R1'}}),/flera käll-ID/);
});
test('mixed execution without explicit lineage and missing inputs are rejected',()=>{
  const s=measured();s.provenance.runs[0].executionId='other';
  assert.throws(()=>validateMeasurement(s,['R1','R2'],['C1','C2']),/lineage/);
  s.provenance.runs[0].upstreamOf=['I'];s.provenance.runs[1].inputRunIds=['L'];
  assert.doesNotThrow(()=>validateMeasurement(s,['R1','R2'],['C1','C2']));
  s.provenance.runs[1].inputRunIds=['absent'];assert.throws(()=>validateMeasurement(s,['R1','R2'],['C1','C2']),/input-Run/);
});
test('likelihood Monte Carlo is archived only, not a loss curve',()=>{
  const m=manifest();m.runs=[run('MC','monte_carlo_likelihood')];
  const {snapshot,report}=convertRuns(m,new Map([['MC',{draws:[.1,.2,.3]}]]),canonical);
  assert.equal(snapshot.risks.length,0);assert.equal(report.withLossDistribution,0);assert.equal(report.diagnostics[0].status,'archived_only');
});
test('a monetary MC export validates bin counts, quantiles and loss mean',()=>{
  const m=manifest();m.runs=[run('MC','monte_carlo_loss',{recordPath:'results',unit:'SEK',horizonYears:1,lossDefinition:'Loss over one year'})];
  const record={riskId:'R1',sampleCount:10,p50:0,p95:100,mean:10,bins:[{lower:0,upper:0,count:9},{lower:0,upper:100,count:1}],privatePrompt:'NEVER PUBLISH'};
  const result=convertRuns(m,new Map([['MC',{results:[record],privateEmail:'NEVER PUBLISH'}]]),canonical);
  assert.equal(result.snapshot.risks[0].expectedLoss.value,10);
  assert.ok(!JSON.stringify(result.snapshot).includes('NEVER PUBLISH'));
  record.sampleCount=11;
  assert.throws(()=>convertRuns(m,new Map([['MC',{results:[record]}]]),canonical),/antal/);
});
test('control effects must retain existing mappings and remain latent',()=>{
  const m=manifest();m.runs=[run('C','control_effects',{recordPath:'effects'})];
  const raw={effects:[{controlId:'C1',riskId:'R1',dimension:'likelihood',delta:-.2,privateText:'secret'}]};
  const result=convertRuns(m,new Map([['C',raw]]),canonical);
  assert.equal(result.snapshot.controls[0].effects[0].scale,'latent');assert.equal(result.snapshot.scenarios.length,0);
  raw.effects[0].riskId='R2';assert.throws(()=>convertRuns(m,new Map([['C',raw]]),canonical),/kanonisk kontrollkoppling/);
});
test('scenarios require exact control sets, preserve unknown costs, and validate waterfall totals',()=>{
  const s=measured();s.scenarios=[{id:'S1',controlIds:['C1','C2'],riskIds:['R1'],referenceExpectedLoss:100,residualExpectedLoss:70,controlCost:null,runId:'L',method:'exported scenario',overlapTreatment:'joint model',contributions:[{controlId:'C1',reduction:10},{controlId:'C2',reduction:20}]}];
  const model=createMeasurementModel(s,['R1','R2'],['C1','C2']);
  assert.equal(model.scenario(['C1']),null);assert.equal(model.scenario(['C2','C1']).controlCost,null);
  s.scenarios[0].contributions[0].reduction=15;
  assert.throws(()=>validateMeasurement(s,['R1','R2'],['C1','C2']),/vattenfall/);
});
test('public interview projection excludes identities/transcripts and requires explicit excerpt approval',()=>{
  const source={schemaVersion:1,interviews:[{id:'INT1',publicLabel:'Intervjuperson A',role:'Handläggare',name:'PRIVATE NAME',email:'PRIVATE EMAIL',transcript:'PRIVATE TRANSCRIPT',date:'2026-10-21',publicationAllowed:true,reviewStatus:'approved',excerpts:[{id:'Q1',text:'Ett godkänt citat.',locator:'s. 2, stycke 3',publicationAllowed:true,reviewStatus:'approved',topicIds:['intervjufynd'],riskIds:['R1']}]}]};
  const projection=projectInterviews(source);
  assert.ok(!JSON.stringify(projection).includes('PRIVATE'));assert.equal(projection.interviews[0].date,null);
  source.interviews[0].excerpts[0].reviewStatus='draft';assert.throws(()=>projectInterviews(source),/godkänt/);
});
test('report quotes resolve exact approved source text, escape content and reject unknown citations',()=>{
  const interviews={interviews:[{id:'I1',publicLabel:'Person A',role:'Roll',publicationAllowed:true,reviewStatus:'approved',excerpts:[{id:'Q1',text:'<script>quoted</script>',locator:'00:12',publicationAllowed:true,reviewStatus:'approved'}]}]};
  const report={schemaVersion:1,editionId:'draft',title:'Title',sources:[],chapters:[{id:'c1',number:'01',title:'Chapter',status:'draft',blocks:[{type:'quote',excerptId:'Q1'}]}]};
  validateReport(report,interviews,['R1'],['C1']);
  const html=renderReportChapter(report.chapters[0],report,interviews);
  assert.ok(html.includes('&lt;script&gt;quoted&lt;/script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('00:12'));
  report.chapters[0].blocks.push({type:'p',text:'Claim',sourceIds:['unknown']});
  assert.throws(()=>validateReport(report,interviews,['R1'],['C1']),/okänd källa/);
});
test('full-file import checks the original checksum, archives raw data, and emits only safe fields',()=>{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
  mkdirSync(join(root,'work'),{recursive:true});
  const directory=mkdtempSync(join(root,'work/test-runs-'));
  try {
    const ctx=canonicalContext(),m=manifest(),source={ranks:[rank(ctx.risks[0].risk_id,.3)],prompt:'PRIVATE SENTINEL'};
    const bytes=JSON.stringify(source);writeFileSync(join(directory,'run.json'),bytes);
    m.mappingVersion=ctx.mappingVersion;m.runs=[run('L','btl_likelihood',{file:'run.json',sha256:sha256(bytes),recordPath:'ranks'})];
    writeFileSync(join(directory,'manifest.json'),JSON.stringify(m));
    const candidate=join(directory,'candidate'),report=importPackage(join(directory,'manifest.json'),candidate);
    assert.equal(report.ranked,1);
    assert.equal(readFileSync(join(candidate,'raw/L.json'),'utf8'),bytes);
    assert.ok(!readFileSync(join(candidate,'measurement.json'),'utf8').includes('PRIVATE SENTINEL'));
    assert.equal(verifyCandidate(candidate).editionId,m.editionId);
    const replay=join(directory,'replay');importPackage(join(candidate,'archive-manifest.json'),replay);
    assert.equal(readFileSync(join(replay,'measurement.json'),'utf8'),readFileSync(join(candidate,'measurement.json'),'utf8'));
    writeFileSync(join(candidate,'raw/L.json'),bytes+' ');
    assert.throws(()=>verifyCandidate(candidate),/råfil har ändrats/);
    writeFileSync(join(directory,'run.json'),bytes+' ');
    assert.throws(()=>importPackage(join(directory,'manifest.json'),candidate),/checksum/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
test('report figures bind to their own measurement edition',()=>{
  const measuredData=measured(),report={measurementEditionId:'test-edition'};
  const figure=reportFigureData('risk-contributions',report,measuredData,[{risk_id:'R1',title:'Risk 1'}]);
  assert.equal(figure.rows[0].value,1.8e6);
  assert.deepEqual(reportFigureData('risk-contributions',{measurementEditionId:'other'},measuredData,[]),{kind:'pending'});
});
test('a cyclic input chain or an unconnected upstream declaration is rejected',()=>{
  const s=measured();s.provenance.runs[0].inputRunIds=['I'];s.provenance.runs[1].inputRunIds=['L'];
  assert.throws(()=>validateMeasurement(s,['R1','R2'],['C1','C2']),/cykel/);
  s.provenance.runs[0].inputRunIds=[];s.provenance.runs[1].inputRunIds=[];s.provenance.runs[0].executionId='other';s.provenance.runs[0].upstreamOf=['I'];
  assert.throws(()=>validateMeasurement(s,['R1','R2'],['C1','C2']),/inputkedja/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectSnapshot,severityBelief} from '../../../scripts/project-cardinal-snapshot.mjs';
import {createMeasurementModel} from '../../_build/measurement_model.mjs';
import {reportStatus} from '../../_build/report_model.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const policy={schemaVersion:1,id:'test-review',maxMeanMedianRatio:10,maxAnnualFrequency:10000,maxCostPerEventSEK:1e10,maxExpectedAnnualCostSEK:1e10,descriptionEstimates:[]};
function fixture() {
 const org='org',execution='execution',experiment='experiment',basis='residual_implemented_controls';
 const canonical={risks:['R1','R2','R3'].map(risk_id=>({risk_id})),controls:[{id:'C1',riskIds:['R1'],targets:[]}]};
 const crosswalk={orgId:org,risks:{r1:'R1',r2:'R2',r3:'R3'},controls:{c1:'C1'},targets:[],processMappings:[]};
 const rank=(riskId,rank,point)=>({riskId,rank,score:1/rank,eligibleForAbsolute:true,calibrationStatus:'anchor_scaled',absolute:{status:'estimated',point,latentStdDev:1}});
 const run=(id,type,dimension,data,inputs=[],control_basis=basis)=>({id,type,dimension,data_jsonb:data,organization_id:org,experiment_id:experiment,execution_id:execution,control_basis,status:'completed',function_type:type,completed_at:'2026-10-22T00:00:00Z',provenance_json:{inputRunIds:inputs}});
 const ranks=[rank('r1',1,100),rank('r2',2,50)];
 const runs=[run('l','risk_probability_rank','likelihood',{ranks,stats:{calibration:{scopeHash:'scope'}}}),run('i','risk_impact_rank','impact',{ranks,stats:{}}),run('ml','risk_exposure','likelihood',{occurrence:{results:[{riskId:'r1',annualRate:{mean:3,median:2}},{riskId:'r2',annualRate:{mean:40,median:1}}]},stats:{totalDraws:10000}},['l']),run('mi','risk_exposure','impact',{exposures:ranks.map(r=>({riskId:r.riskId,mean:999999,quantiles:{p50:900000},eligibleForAbsolute:true}))},['i']),run('effects','control_effects','likelihood',{effects:[{controlId:'c1',riskId:'r1',dimension:'likelihood',delta:-.2,share:1,voteCount:3,status:'identified'}]}),run('scenario','risk_probability_rank','likelihood',{ranks},['l','effects'],'control_scenario'),run('scenario-mc','risk_exposure','likelihood',{},['scenario'],'control_scenario')];
 runs.find(r=>r.id==='scenario').provenance_json.controlScenario={controlEffectsRunId:'effects'};
 const relations={risks:['r1','r2','r3'].map(id=>({id,organization_id:org})),controls:[{id:'c1',organization_id:org}],risk_controls:[{id:'link',organization_id:org,risk_id:'r1',control_id:'c1'}],risk_process_mappings:[],control_process_mappings:[],cause_effect_node_mappings:[],risk_analyses:[],org_process_charts:[]};
 const d={organization:{id:org},execution:{id:execution,experiment_id:experiment,status:'completed',name:'Fixture',completed_at:'2026-10-22T00:00:00Z'},scope:{id:'frozen',scope_hash:'scope',currency:'SEK',horizon_years:'1',exposure_statement:'Swedish permit events per year'},runs,relations,capturedAt:'2026-10-22T01:00:00Z'};
 return {d,crosswalk,canonical};
}
const project=f=>projectSnapshot(f.d,f.crosswalk,f.canonical,policy,'source-hash');

test('cost projection uses calibrated lognormal severity, never diagnostic MC mean or median products',()=>{
 const {snapshot}=project(fixture()),r=snapshot.risks[0];
 assert.equal(r.summaries.impact.median,100);
 assert.equal(r.summaries.impact.mean,100*Math.exp(.5));
 assert.equal(r.sourceStatistics.impactMonteCarloDiagnostic.mean,999999);
 assert.equal(r.expectedLoss.value,3*100*Math.exp(.5));
 assert.notEqual(r.expectedLoss.value,2*100);
 assert.equal(r.expectedLoss.method,'product_of_means');
 assert.equal(r.expectedLoss.assumption,'independent_frequency_and_severity');
 assert.equal(snapshot.quality.monetaryLossDistributionAvailable,false);
 assert.equal(snapshot.portfolio,undefined);
 assert.deepEqual(snapshot.scenarios,[]);
});
test('screened means remain archived while publishable medians survive and costs stay undefined',()=>{
 const {snapshot}=project(fixture()),r=snapshot.risks[1];
 assert.equal(r.summaries.likelihood.mean,null);
 assert.equal(r.summaries.likelihood.median,1);
 assert.equal(r.sourceStatistics.likelihood.mean,40);
 assert.equal(r.expectedLoss,undefined);
 assert.equal(r.qualityStatus,'review_required');
 assert.equal(snapshot.risks[2].qualityStatus,'outside_execution');
 assert.deepEqual(snapshot.ranking.entries.map(r=>r.riskId),['R1']);
 assert.equal(snapshot.likelihoodRanking.entries.length,2);
 const model=createMeasurementModel(snapshot,['R1','R2','R3'],['C1']);
 assert.equal(model.metric('R2','likelihood','median').value,1);
 assert.equal(model.metric('R2','likelihood','mean'),null);
 assert.equal(model.metric('R1','expectedLoss','median'),null);
});
test('projection rejects foreign or unfinished Runs, changed scope and detached Monte Carlo lineage',()=>{
 for(const mutate of [d=>{d.execution.status='running';},d=>{d.runs[0].organization_id='foreign';},d=>{d.scope.scope_hash='other';},d=>{d.runs.find(r=>r.id==='ml').provenance_json.inputRunIds=['i'];},d=>{d.runs.find(r=>r.id==='scenario').provenance_json.controlScenario.controlEffectsRunId='i';}]){
  const f=fixture();mutate(f.d);assert.throws(()=>project(f),/Snapshot projection/);
 }
});
test('cost projection never repairs relationship mismatches or uses an unrelated effects Run',()=>{
 const f=fixture(),before=JSON.stringify(f.canonical);const {snapshot,links}=project(f);
 assert.equal(JSON.stringify(f.canonical),before);
 assert.equal(snapshot.controls[0].effects[0].riskId,'R1');
 assert.equal(snapshot.controls[0].effects[0].runId,'effects');
 assert.equal(links.additionalTargets.length,1);
 f.d.relations.risk_controls=[];
 assert.throws(()=>project(f),/risk-control or process mapping changed/);
});
test('severity parameters reject invalid values and retain exact deterministic median at zero spread',()=>{
 assert.deepEqual(severityBelief(100,0),{mean:100,median:100,logStdDev:0,interval90:[100,100]});
 for(const args of [[-1,1],[100,-1],[Infinity,1],[1,1000]])assert.equal(severityBelief(...args),null);
});
test('published edition reconciles ranks, statistics, report tables and read-only median default',()=>{
 const snapshot=read('../../../publication/measurement.json'),report=read('../../../report/manuscript.json'),reportMeasurement=read('../../../report/measurement.json'),presentation=read('../../../publication/presentation.json');
 assert.deepEqual(snapshot,reportMeasurement);
 assert.equal(snapshot.provenance.executionId,'41398273-5724-4f08-8fef-ed92832f527b');
 assert.equal(report.measurementEditionId,snapshot.editionId);
 assert.equal(presentation.riskStatistic,'median');assert.equal(presentation.costPriority,true);
 const priced=snapshot.risks.filter(r=>r.expectedLoss);
 assert.equal(priced.length,snapshot.quality.expectedCostCount);
 assert.equal(priced.length,145);
 assert.equal(snapshot.risks.length,342);
 assert.equal(snapshot.ranking.entries.length,priced.length);
 for(const entry of snapshot.ranking.entries){const row=priced.find(r=>r.riskId===entry.riskId);assert.equal(entry.score,row.expectedLoss.value);assert.equal(entry.score,row.summaries.likelihood.mean*row.summaries.impact.mean);}
 const top=report.chapters.find(c=>c.number==='F').blocks.find(b=>b.type==='table').rows;
 assert.equal(top.length,50);
 top.forEach((row,i)=>assert.ok(row[0].includes(snapshot.ranking.entries[i].riskId)));
 assert.equal(reportStatus('published'),'');
 assert.ok(report.chapters.every(c=>c.status==='published'));
 assert.ok(report.chapters.filter(c=>/^[A-Z]$/.test(c.number)).length===8);
 assert.ok(!snapshot.portfolio&&!snapshot.risks.some(r=>r.lossDistribution));
});

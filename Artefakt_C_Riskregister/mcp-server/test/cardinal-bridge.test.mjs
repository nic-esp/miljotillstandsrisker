import test from 'node:test';
import assert from 'node:assert/strict';
import {collectCardinalBundle,downloadCardinalBundle} from '../../../scripts/cardinal-bridge.mjs';
import {convertCardinalBundle,auditRelations,decodeDocument} from '../../../scripts/import-cardinal.mjs';
import {sha256} from '../../../scripts/import-runs.mjs';
import {createMeasurementModel,validateMeasurement} from '../../_build/measurement_model.mjs';
import {collectStoredLossCache,downloadStoredLossCache} from '../../../scripts/cardinal-loss-cache.mjs';
import {prepareBridge} from '../../../scripts/export-cardinal.mjs';
import {mkdtempSync,readFileSync,rmSync,statSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [org,experiment,execution,r1,r2,c1,l,i,ml,mi,ce,el,chart]=Array.from({length:13},(_,n)=>id(n+1));
const time='2026-10-21T12:00:00Z',basis='residual_implemented_controls';
const config={orgId:org,orgSlug:'test-org',experimentId:experiment,executionId:execution,mappingVersion:'links-v1',includeControlAnalysis:true};
const absolute=value=>({kind:'absolute',value});
const canonical={risks:[{risk_id:'R1'},{risk_id:'R2'}],controls:[{id:'C1',riskIds:['R1'],targets:[{id:'T1',riskId:'R1',type:'cause',targetId:'O1'}]}],mappingVersion:'links-v1'};
const crosswalk={orgId:org,risks:{[r1]:'R1',[r2]:'R2'},controls:{[c1]:'C1'},targets:[{sourceTargetLinkId:'T1',nrControlId:c1,nrRiskId:r1,nrElementId:el,nrElementType:'cause'}],processMappings:[{nrRiskId:r1,nrChartId:chart,nrNodeId:'N1'},{nrRiskId:r2,nrChartId:chart,nrNodeId:'N2'}]};
function fixture(){
 const scope={scopeSnapshotId:id(50),scopeHash:'scope-hash',horizonYears:1,currency:'SEK',riskCount:2,scopeStatement:'Fixture scope',exposureStatement:'Two risks'};
 const run=(runId,type,dimension,data,inputs=[])=>({id:runId,organizationId:org,experimentId:experiment,executionId:execution,controlBasis:basis,type,dimension,functionType:type==='control_effects'?'control_scenario':type==='risk_exposure'?'monte_carlo':'btl',status:'completed',completedAt:time,version:1,inputRunIds:inputs,provenanceJson:{nodeId:`node-${runId}`,inputRunIds:inputs},dataJsonb:data,statsJson:{}});
 const rank=(riskId,n)=>({riskId,rank:n,score:1/n,eligibleForAbsolute:true,calibrationStatus:'anchor_scaled',absolute:{point:.2}});
 const exposure=riskId=>({riskId,mean:50,quantiles:{p50:25},eligibleForAbsolute:true,calibrationStatus:'anchor_scaled',inputMeaning:'currency_per_event'});
 const runs=[run(l,'risk_probability_rank','likelihood',{ranks:[rank(r1,1),rank(r2,2)]}),run(i,'risk_impact_rank','impact',{ranks:[rank(r1,1),rank(r2,2)]}),run(ml,'risk_exposure','likelihood',{occurrence:{semanticsVersion:'v2',modelVersion:'model-v2',horizonYears:1,results:[r1,r2].map(riskId=>({riskId,probability:{mean:.2,median:.1},annualRate:{mean:2,median:1}}))}},[l]),run(mi,'risk_exposure','impact',{exposures:[exposure(r1),exposure(r2)]},[i]),run(ce,'control_effects','likelihood',{effects:[{controlId:c1,riskId:r1,dimension:'likelihood',delta:-.1,status:'identified'}]},[l,i])];
 const sourceScope={experimentId:experiment,executionId:execution,currency:'SEK',likelihoodRunId:ml,impactRunId:mi,horizonYears:1};
 const measured=(mean,median)=>({likelihood:absolute(.2),impact:absolute(50),expectedAnnualLoss:absolute(mean),annualLossMedian:absolute(median),annualLossP90:absolute(mean)});
 const docs=[];
 const add=(procedure,input,data)=>{const body=JSON.stringify({result:{data:{json:data}}});docs.push({procedure,input,encoding:'trpc-superjson',capturedAt:time,body,sha256:sha256(body)});};
 add('organizations.getCurrent',null,{id:org,slug:'test-org'});
 add('execution.list',{executionId:execution},[{id:execution,experimentId:experiment,status:'completed',name:'Fixture',completedAt:time}]);
 add('execution.getScope',{executionId:execution},scope);
 add('experiments.getGraph',{experimentId:experiment,executionId:execution},{nodes:[],edges:[]});
 add('runs.exportList',{experimentId:experiment,executionId:execution},runs.map(r=>({id:r.id,status:r.status,version:r.version,completedAt:r.completedAt,executionId:r.executionId,experimentId:r.experimentId})));
 for(const r of runs)add('runs.getById',{id:r.id},r);
 add('risks.list',{page:1,limit:100,runScope:{experimentId:experiment,executionId:execution}}, {items:[{id:r1,privateEmail:'NEVER-PUBLISH',measured:{residual:measured(100,0),inherent:measured(120,5)}},{id:r2,measured:{residual:measured(20,10),inherent:measured(25,12)}}],pagination:{page:1,total:2,hasMore:false},runScope:{experimentId:experiment,executionId:execution}});
 for(const controlBasis of [basis,'inherent_no_controls']){
  const input={experimentId:experiment,executionId:execution,controlBasis};
  add('analytics.riskPostureKpis',input,{scope:sourceScope,simulationPending:false,risksQuantified:2,risksTotal:2});
  add('analytics.portfolioLossDistribution',input,{risksIncluded:2,analyticalMean:120,percentiles:{p50:5,p95:90},draws:10,histogram:[{binStart:0,binEnd:100,frequency:1}],excludedRisks:[],lossModelVersion:'fixture-v1'});
  add('analytics.costProjection',input,{points:[{horizon:1,mean:118,analyticalMean:120,p50:5}]});
  add('analytics.controlAnalysis',input,{scope:sourceScope,costBenefit:{measurement:{runId:ce},residualExpectedLoss:120,inherentExpectedLoss:140,totalAttributedReduction:20,controls:[{controlId:c1,attributedReduction:20,annualCost:0,risksWithMeasuredEffect:1,risksListedWithoutCredit:0}]}});
 }
 add('analytics.scenarioSelections',{experimentId:experiment,executionId:execution},[]);
 const relations={risks:[r1,r2].map(id=>({id,organizationId:org})),controls:[{id:c1,organizationId:org}],org_process_charts:[{id:chart,organizationId:org}],risk_analyses:[{id:id(60),riskId:r1,organizationId:org,causes:JSON.stringify([{id:el}]),events:'[]',effects:'[]'}],risk_controls:[{id:id(61),organizationId:org,riskId:r1,controlId:c1,elementId:el,elementType:'cause'}],risk_process_mappings:[],control_process_mappings:[],cause_effect_node_mappings:[r1,r2].map((riskId,n)=>({id:id(62+n),organizationId:org,riskId,chartId:chart,nodeId:`N${n+1}`}))};
 return {bundle:{schemaVersion:1,kind:'cardinal_site_bridge',sourceOrigin:'https://nr.getcardinal.io',config:{...config},startedAt:time,completedAt:time,documents:docs},relations};
}
function change(f,procedure,fn){const d=f.bundle.documents.find(d=>d.procedure===procedure);const e=JSON.parse(d.body);fn(e.result.data.json);d.body=JSON.stringify(e);d.sha256=sha256(d.body);}
function convert(f=fixture(),opts){return convertCardinalBundle(f.bundle,crosswalk,canonical,f.relations,opts);}
function replay(f,overrides={}){const calls=[];return {calls,io:{now:()=>time,hash:async v=>sha256(v),relationships:async()=>{calls.push('relationships');return 'UEs=';},request:async(p,input)=>{calls.push(p);const key=JSON.stringify(input);const d=f.bundle.documents.find(d=>d.procedure===p&&JSON.stringify(d.input)===key);if(!d)throw Error('Unexpected request '+p);return d.body;},...overrides}};}

test('real adapter preserves zero median, mean, direct portfolio median, effect links and unknown cost',()=>{
 const {snapshot,report}=convert();assert.deepEqual(report.activationBlockers,[]);
 const row=snapshot.risks.find(r=>r.riskId==='R1');assert.equal(row.summaries.expectedLoss.median,0);assert.equal(row.summaries.expectedLoss.mean,100);
 assert.equal(row.summaries.likelihood.mean,.2);assert.equal(row.summaries.likelihood.median,.1);
 assert.equal(row.summaries.impact.mean,50);assert.equal(row.summaries.impact.median,25);
 assert.equal(snapshot.portfolio.summary.mean,120);assert.equal(snapshot.portfolio.summary.simulatedMean,118);
 assert.equal(snapshot.portfolio.summary.median,5);assert.equal(snapshot.controlAnalysis.controls[0].annualCost,null);
 assert.equal(snapshot.controls[0].effects[0].riskId,'R1');assert.equal(snapshot.controls[0].effects[0].delta,-.1);
 assert.ok(!JSON.stringify(snapshot).includes('NEVER-PUBLISH'));
 const m=createMeasurementModel(snapshot,['R1','R2'],['C1']);assert.equal(m.aggregate(['R1','R2'],'median').value,5);assert.equal(m.aggregate(['R1'],'median').value,0);
});
test('pending medians remain absent and block activation',()=>{
 const f=fixture();change(f,'risks.list',d=>{d.items[0].measured.residual.annualLossMedian={kind:'pending'};});change(f,'analytics.riskPostureKpis',d=>{d.simulationPending=true;});
 const r=convert(f);assert.equal(r.snapshot.risks[0].summaries.expectedLoss.median,undefined);assert.ok(r.report.activationBlockers.includes('annual_loss_simulation_pending'));
});
test('all current relations are checked without overwriting canonical targets',()=>{
 const f=fixture(),before=JSON.stringify(canonical);f.relations.risk_controls.push({...f.relations.risk_controls[0],id:id(70),elementId:'',elementType:''});
 const r=convert(f);assert.equal(r.report.links.additionalTargets.length,1);assert.equal(r.report.links.status,'review_required');assert.equal(JSON.stringify(canonical),before);
});
test('missing links block publication even when measured pairs still exist',()=>{
 const f=fixture();f.relations.risk_controls[0].elementId='';f.relations.risk_controls[0].elementType='';const r=convert(f);assert.equal(r.report.links.missingTargets.length,1);assert.ok(r.report.activationBlockers.includes('relationship_changes_require_review'));
});
test('unknown/dangling mappings and duplicate source IDs fail closed',()=>{
 const f=fixture();f.relations.risk_controls[0].elementId='missing';assert.throws(()=>convert(f),/dangling bow-tie/);
 const g=fixture();g.relations.controls.push(g.relations.controls[0]);assert.throws(()=>convert(g),/duplicate IDs/);
 const h=fixture();h.relations.risk_controls[0].riskId='missing';assert.throws(()=>convert(h),/dangling risk/);
});
test('crosswalk must be complete and bijective',()=>{
 const f=fixture();assert.throws(()=>auditRelations(f.relations,{...crosswalk,risks:{[r1]:'R1',[r2]:'R1'}},canonical,org),/crosswalk/);
 assert.throws(()=>auditRelations(f.relations,{...crosswalk,targets:[]},canonical,org),/target crosswalk/);
});
test('wrong organizations, incomplete executions and changed mapping versions are refused',()=>{
 for(const status of ['running','cancelled','failed']){const f=fixture();change(f,'execution.list',d=>{d[0].status=status;});assert.throws(()=>convert(f),/not completed/);}
 const f=fixture();f.bundle.config.orgId=id(99);assert.throws(()=>convert(f),/organization mismatch/);
 const g=fixture();g.bundle.config.mappingVersion='different';assert.throws(()=>convert(g),/mapping changed/);
});
test('tampered source response and unsupported numeric serialization are refused',()=>{
 const f=fixture();f.bundle.documents[0].body+=' ';assert.throws(()=>convert(f),/checksum/);
 const d={encoding:'trpc-superjson',body:JSON.stringify({result:{data:{json:{mean:'NaN'},meta:{values:{mean:['number']}}}}})};d.sha256=sha256(d.body);assert.throws(()=>decodeDocument(d),/SuperJSON/);
});
test('missing dependencies, mixed analytics execution and basis mismatch are refused',()=>{
 const f=fixture();change(f,'runs.getById',r=>{r.inputRunIds=[id(99)];});assert.throws(()=>convert(f),/dependency/);
 const g=fixture();change(g,'analytics.riskPostureKpis',d=>{d.scope.executionId=id(99);});assert.throws(()=>convert(g),/scope mismatch/);
 const h=fixture();change(h,'runs.getById',r=>{r.controlBasis='control_scenario';});assert.throws(()=>convert(h),/inputkedja|scope|källa|basis/);
});
test('incomplete or repeated risk pages and ambiguous BTL sources are refused',()=>{
 const f=fixture();change(f,'risks.list',d=>{d.pagination.hasMore=true;});assert.throws(()=>convert(f),/incomplete risk/);
 const g=fixture();change(g,'risks.list',d=>{d.items.push(d.items[0]);});assert.throws(()=>convert(g),/duplicate risk/);
 const h=fixture();const d=structuredClone(h.bundle.documents.find(d=>d.procedure==='runs.getById'));h.bundle.documents.push(d);assert.throws(()=>convert(h),/duplicate Run/);
});
test('portfolio membership, histogram normalization and mean reconciliation are validated',()=>{
 const f=fixture();change(f,'analytics.portfolioLossDistribution',d=>{d.risksIncluded=1;});assert.throws(()=>convert(f),/membership/);
 const g=fixture();change(g,'analytics.portfolioLossDistribution',d=>{d.analyticalMean=500;});assert.throws(()=>convert(g),/reconcile/);
 const h=fixture();change(h,'analytics.portfolioLossDistribution',d=>{d.histogram[0].frequency=.333;});assert.throws(()=>convert(h),/sample fractions/);
});
test('unreconciled control attribution is flagged, never redistributed',()=>{
 const f=fixture();change(f,'analytics.controlAnalysis',d=>{d.costBenefit.totalAttributedReduction=100;});const r=convert(f);assert.ok(r.report.activationBlockers.includes('control_attribution_total_does_not_reconcile'));assert.equal(r.snapshot.controlAnalysis.controls[0].attributedReduction,20);
});
test('assessment and annual loss horizons stay distinct',()=>{
 const {snapshot}=convert();snapshot.provenance.assessmentHorizonYears=3;
 for(const r of snapshot.risks){for(const k of ['likelihood','impact']){if(r[k])r[k].horizonYears=3;if(r.summaries?.[k])r.summaries[k].horizonYears=3;}}
 assert.doesNotThrow(()=>validateMeasurement(snapshot,['R1','R2'],['C1']));assert.equal(snapshot.risks[0].summaries.expectedLoss.horizonYears,1);
});
test('collector rejects unfinished execution before fetching results',async()=>{
 const f=fixture();change(f,'execution.list',d=>{d[0].status='running';});const r=replay(f);
 await assert.rejects(()=>collectCardinalBundle(config,r.io),/completed execution/);assert.ok(!r.calls.includes('runs.getById'));
});
test('collector captures upstream Runs, relations and both control bases without simulation readers',async()=>{
 const r=replay(fixture()),b=await collectCardinalBundle(config,r.io);
 assert.equal(b.policy.measurementCalls,0);assert.equal(b.documents.filter(d=>d.procedure==='runs.getById').length,5);
 assert.equal(b.documents.filter(d=>d.procedure==='analytics.controlAnalysis').length,2);assert.ok(r.calls.includes('relationships'));
 assert.ok(r.calls.every(p=>!/(execute|resume|replay|create|update|stop)/i.test(p)));
 assert.ok(!r.calls.includes('risks.list'));assert.ok(!r.calls.some(p=>['analytics.riskPostureKpis','analytics.portfolioLossDistribution','analytics.costProjection'].includes(p)));
 assert.equal(b.policy.simulationCalls,0);assert.equal(b.policy.analyticsMayFillDerivedLossCache,false);
 const source=downloadCardinalBundle.toString();assert.ok(source.includes("method:'GET'"));assert.ok(!source.includes('document.cookie'));assert.ok(!source.includes('localStorage'));
});
test('collector stops if organization changes during capture',async()=>{
 const f=fixture(),r=replay(f);const request=r.io.request;let n=0;r.io.request=async(p,i)=>p==='organizations.getCurrent'&&++n===2?JSON.stringify({result:{data:{json:{id:id(99)}}}}):request(p,i);
 await assert.rejects(()=>collectCardinalBundle(config,r.io),/Organization changed/);
});
test('collector archive-only mode omits all analytics and risk-list readers',async()=>{
 const r=replay(fixture());await collectCardinalBundle({...config,includeControlAnalysis:false},r.io);assert.ok(!r.calls.includes('risks.list'));assert.ok(!r.calls.some(x=>x.startsWith('analytics.')));
});

function cacheFixture(){
 const f=fixture();f.bundle.documents=f.bundle.documents.filter(d=>!['risks.list','analytics.riskPostureKpis','analytics.portfolioLossDistribution','analytics.costProjection'].includes(d.procedure));
 const runDocs=f.bundle.documents.filter(d=>d.procedure==='runs.getById').map(d=>JSON.parse(d.body).result.data.json);
 const q=(p50=15)=>({p50,p75:25,p90:50,p95:90,p99:110});
 const annual=(mean,p50)=>({horizon:1,supported:true,analyticalMean:mean,simulatedMean:mean-1,quantiles:q(p50)});
 f.lossCache={schemaVersion:1,kind:'cardinal_stored_loss_cache',sourceOrigin:'https://nr.getcardinal.io',capturedAt:time,config:{...config},
 context:{orgId:org,experimentId:experiment,executionId:execution,status:'completed',scopeSnapshotId:id(50),scopeHash:'scope-hash',currency:'SEK',horizonYears:1},runs:runDocs,
 models:[{id:id(80),likelihoodRunId:ml,impactRunId:mi,controlBasis:basis,result:{type:'loss_model_result',
 assumptions:{lossModelVersion:'loss-model-v2.1',seed:42,draws:10000,independenceAcrossRisks:true,occurrenceSeverityIndependence:true,iidPerEventSeverity:true,parameterUncertaintyInterpretation:'uncertainty_in_constant_parameter'},
 perRisk:{[r1]:[annual(100,0)],[r2]:[annual(20,10)]},
 portfolio:[1,2,3,5,10,15,20,25].map(horizon=>({horizon,mean:118,analyticalMean:120,quantiles:q(),histogram:[{binStart:0,binEnd:200,frequency:1}],includedRiskIds:[r1,r2],excludedRisks:[]}))}}]};
 return f;
}
test('stored-only adapter preserves both means, zero median and actual joint portfolio median',()=>{
 const f=cacheFixture(),{snapshot,report}=convert(f,{lossCache:f.lossCache});
 assert.deepEqual(report.activationBlockers,[]);assert.equal(report.lossSource,'stored_loss_cache');
 assert.equal(snapshot.risks[0].summaries.expectedLoss.mean,100);assert.equal(snapshot.risks[0].summaries.expectedLoss.simulatedMean,99);
 assert.equal(snapshot.risks[0].summaries.expectedLoss.median,0);assert.equal(snapshot.portfolio.summary.median,15);
 assert.equal(snapshot.portfolio.summary.mean,120);assert.equal(snapshot.portfolio.summary.simulatedMean,118);
 assert.equal(snapshot.provenance.bridge.lossCacheSha256,sha256(JSON.stringify(f.lossCache)));
});
test('absent stored results block activation without inventing losses or dropping native statistics',()=>{
 const f=cacheFixture();f.lossCache.models=[];
 for(const lossCache of [null,f.lossCache]) {
  const r=convert(f,{lossCache});assert.ok(r.report.activationBlockers.includes('stored_annual_loss_missing'));
  assert.equal(r.snapshot.risks[0].summaries.expectedLoss,undefined);assert.equal(r.snapshot.risks[0].summaries.likelihood.median,.1);
 }
});
test('stored results must match source execution, basis, model version, membership and Run versions',()=>{
 for(const mutate of [
  c=>{c.context.executionId=id(99);},c=>{c.context.scopeHash='other';},c=>{c.runs[0].version++;},
  c=>{c.models[0].controlBasis='inherent_no_controls';},c=>{c.models.push(c.models[0]);},
  c=>{c.models[0].result.assumptions.lossModelVersion='unreviewed';},
  c=>{c.models[0].result.portfolio[0].includedRiskIds=[r1];},
  c=>{c.models[0].result.perRisk[r1][0].quantiles.p50=-1;},
 ]) {const f=cacheFixture();mutate(f.lossCache);assert.throws(()=>convert(f,{lossCache:f.lossCache}),/Stored loss cache/);}
});
test('MC impact cannot be relabelled as another dimension or detached from its calibrated source',()=>{
 for(const update of [r=>{r.dimension='likelihood';},r=>{r.inputRunIds=[l];r.provenanceJson.inputRunIds=[l];}]) {
  const f=fixture(),doc=f.bundle.documents.find(d=>d.procedure==='runs.getById'&&d.input.id===mi);
  const body=JSON.parse(doc.body);update(body.result.data.json);doc.body=JSON.stringify(body);doc.sha256=sha256(doc.body);
  assert.throws(()=>convert(f),/Monte Carlo source/);
 }
});
test('unsafe legacy analytics flag and unknown configuration are refused before network requests',async()=>{
 for(const extra of [{includeAnalytics:true},{token:'not-a-real-token'}]) {
  const r=replay(fixture());await assert.rejects(()=>collectCardinalBundle({...config,...extra},r.io));assert.equal(r.calls.length,0);
 }
});
test('read-only stored cache collector issues scoped SELECTs and refuses running executions',async()=>{
 const f=cacheFixture(),queries=[];
 const query=async(sql,args)=>{queries.push(sql);assert.deepEqual(args,[org,experiment,execution]);assert.match(sql.trim(),/^select /i);return /from experiment_executions/.test(sql)?[f.lossCache.context]:/from loss_model_results/.test(sql)?f.lossCache.models:f.lossCache.runs;};
 const cache=await collectStoredLossCache(config,query);assert.equal(cache.models.length,1);assert.equal(queries.length,3);
 assert.equal(cache.policy.transaction,'repeatable read read only');assert.match(downloadStoredLossCache.toString(),/isolation level repeatable read read only/);
 f.lossCache.context.status='running';await assert.rejects(()=>collectStoredLossCache(config,query),/Completed execution/);
});
test('preparation creates reviewable scripts without network access or replacing existing files',()=>{
 const work=resolve(import.meta.dirname,'../../../work');mkdirSync(work,{recursive:true});const dir=mkdtempSync(resolve(work,'bridge-test-'));
 try {
  for(const mode of ['browser','loss-cache']) {
   const output=resolve(dir,`${mode}.txt`),r=prepareBridge(config,output,{mode});
   assert.equal(r.networkRequestsDuringPreparation,0);assert.equal(r.simulationCalls,0);
   assert.doesNotThrow(()=>new vm.Script(readFileSync(output,'utf8')));assert.equal(statSync(output).mode&0o777,0o600);
   assert.throws(()=>prepareBridge(config,output,{mode}),/EEXIST/);
  }
 } finally {rmSync(dir,{recursive:true,force:true});}
});

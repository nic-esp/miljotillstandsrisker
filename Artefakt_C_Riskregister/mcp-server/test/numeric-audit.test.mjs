import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditPublication,parseRegisterCsv} from '../../../scripts/audit-publication.mjs';
import {evaluateInvestment} from '../../_build/investment_model.mjs';

const hash='a'.repeat(64);
function fixture(){
 const raw=(median,runId)=>({median,mean:median,logStdDev:0,runId});
 const risk=(id,f,c)=>({riskId:id,review:[],sourceStatistics:{likelihood:raw(f,'rate'),impactBelief:raw(c,'cost')},summaries:{likelihood:{...raw(f,'rate'),eligible:true,calibrationStatus:'anchor_scaled',horizonYears:1,unit:'events_per_year'},impact:{...raw(c,'cost'),eligible:true,calibrationStatus:'anchor_scaled',horizonYears:1,unit:'SEK_per_event'}},centralCost:{value:f*c,inputRunIds:['rate','cost']},expectedLoss:{value:f*c,inputRunIds:['rate','cost']},reviewedInputs:{likelihood:{value:f,lower:f,upper:f,method:'model_median',unit:'events_per_year'},impact:{value:c,lower:c,upper:c,method:'model_median',unit:'SEK_per_event'}},reviewedCost:{value:f*c,lower:f*c,upper:f*c}});
 const r1=risk('R1',10,100),r2=risk('R2',2,50),r3={riskId:'R3',review:[{code:'outside_execution',reason:'Risken ingick inte i urvalet.'}],sourceStatistics:{},summaries:{},reviewedInputs:{likelihood:null,impact:null},reviewedCost:null};
 r1.reviewedInputs.impact={value:30,lower:20,upper:40,method:'source_range_midpoint',unit:'SEK_per_event',sourceQuote:'20–40 kronor per händelse'};r1.reviewedCost={value:300,lower:200,upper:400};
 const ranking=(a)=>({entries:a.map(([riskId,score],i)=>({riskId,score,rank:i+1}))});
 const sourceReview={schemaVersion:1,reviewedAt:'2026-10-22',sourceSnapshotSha256:hash,intervalPoint:'arithmetic_midpoint',entries:[{riskId:'R1',decision:'replace_source',reason:'Beskrivningsramen styr.',likelihood:{decision:'retain'},impact:{decision:'replace_range',lower:20,upper:40,unit:'SEK_per_event',evidenceKind:'description_estimate',sourceQuote:'20–40 kronor per händelse',scope:'Samma händelse'}}]};
 const effects=(id,delta)=>({controlId:id,implementationStatus:'proposed',annualCost:null,effects:[{riskId:'R1',dimension:'likelihood',delta,status:'identified',runId:'effects'},{riskId:'R1',dimension:'impact',delta:0,status:'identified',runId:'effects'}]});
 const measurement={priorityMetric:'reviewed_cost_indicator',provenance:{currency:'SEK',horizonYears:1,controlBasis:'inherent_no_controls',executionId:'private-execution',orgId:'private-org',sourceSnapshotSha256:hash,runs:['rate','cost','effects'].map(runId=>({runId,status:'completed',executionId:'private-execution',sha256:hash,inputRunIds:[]}))},risks:[r1,r2,r3],controls:[effects('C1',Math.log(2)),effects('C2',Math.log(.8))],controlInvestment:{baseline:'inherent_no_controls',effectRunId:'effects'},ranking:ranking([['R1',300],['R2',100]]),meanRanking:ranking([['R1',1000],['R2',100]]),modelMedianRanking:ranking([['R1',1000],['R2',100]])};
 const exploration={controls:[{id:'C1',title:'Minskar',riskIds:['R1'],driver:'authority',priorityScope:'main'},{id:'C2',title:'Ökar',riskIds:['R1'],driver:'authority',priorityScope:'main'},{id:'C3',title:'Saknas',riskIds:['R3']}]};
 const register=['R1','R2','R3'].map(risk_id=>({risk_id,rubrik:risk_id,node_id:'B10'}));return {measurement,sourceReview,exploration,register};
}

test('independent audit retains zero/missing distinctions and separates source midpoints from observations',()=>{
 const f=fixture(),before=structuredClone(f),a=auditPublication(f);
 assert.deepEqual(f,before);assert.equal(a.status,'arithmetic_checks_passed');assert.equal(a.summary.arithmeticRiskPassCount,3);
 assert.equal(a.summary.sourceClasses.description_midpoint,1);assert.equal(a.summary.sourceClasses.adapted_historical_observation,0);assert.equal(a.summary.empiricallyValidatedRiskCount,0);
 assert.equal(a.risks[0].comparisonIndicator.value,300);assert.equal(a.risks[0].rawModel.medianProduct,1000);assert.equal(a.risks[0].reviewLevel,'source_review');
 assert.equal(a.risks[1].reviewLevel,'arithmetic_only');assert.equal(a.risks[2].reviewLevel,'outside_execution');assert.equal(a.risks[2].comparisonIndicator,null);assert.ok(a.risks[2].missing.length);
 assert.equal(a.summary.missingEffectPairCount,1);assert.equal(a.controlAnalysis.pairs.at(-1).reduction,null);
 const serialized=JSON.stringify(a);assert.ok(!serialized.includes('private-execution'));assert.ok(!serialized.includes('private-org'));assert.ok(!serialized.includes('runId'));
 assert.deepEqual(auditPublication(f),a);
});

test('negative effects are preserved and a combined control result is not the sum of standalone results',()=>{
 const a=auditPublication(fixture()),[one,two]=a.controlAnalysis.standalone;
 assert.equal(one.comparisonReductionSum,150);assert.equal(two.comparisonReductionSum,-75);
 assert.equal(a.controlAnalysis.combinations.authorityMain.comparisonReductionSum,112.5);
 assert.notEqual(one.comparisonReductionSum+two.comparisonReductionSum,112.5);
 assert.equal(a.summary.negativeEffectDimensionCount,1);assert.equal(a.summary.adverseStandalonePairCount,1);
});

test('independent audit detects coherent published-value tampering against source intervals and raw models',()=>{
 const changes=[f=>f.measurement.risks[0].reviewedInputs.impact.value=35,f=>f.measurement.risks[0].reviewedCost.lower=199,f=>f.measurement.risks[0].sourceStatistics.likelihood.mean=11,f=>f.measurement.modelMedianRanking.entries.reverse(),f=>f.measurement.controls[0].effects[0].runId='unknown',f=>f.measurement.controls[0].effects.push({...f.measurement.controls[0].effects[0]}),f=>f.sourceReview.entries[0].impact.unit='EUR_per_event'];
 for(const change of changes){const f=fixture();change(f);const a=auditPublication(f);assert.equal(a.status,'needs_revision',change.toString());assert.ok(a.errors.length);}
});

test('quoted register CSV fields preserve commas, newlines and escaped quotation marks',()=>{
 const rows=parseRegisterCsv('risk_id,rubrik,beskrivning\r\nR1,"A, B","rad 1\nrad ""2"""\r\n');assert.deepEqual(rows,[{risk_id:'R1',rubrik:'A, B',beskrivning:'rad 1\nrad "2"'}]);
});

test('all published risks, control-risk pairs and standalone and combined effects agree with an independent recomputation',()=>{
 const root=new URL('../../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
 const measurement=JSON.parse(read('publication/measurement.json')),sourceReview=JSON.parse(read('publication/source-review.json')),exploration=JSON.parse(read('Artefakt_C_Riskregister/mcp-server/data/exploration.json')),register=parseRegisterCsv(read('Artefakt_C_Riskregister/mcp-server/data/riskregister.csv'));
 const a=auditPublication({measurement,sourceReview,exploration,register});
 assert.deepEqual(a.errors,[]);assert.equal(a.risks.length,342);assert.equal(a.controlAnalysis.standalone.length,378);assert.equal(a.controlAnalysis.pairs.length,500);
 const close=(x,y)=>{if(x===null||y===null)assert.equal(x,y);else assert.ok(Math.abs(x-y)<Math.max(1e-5,Math.abs(x)*1e-12),`${x} ≠ ${y}`);};
 for(const independent of [...a.controlAnalysis.standalone,...Object.values(a.controlAnalysis.combinations)]){
  const shared=evaluateInvestment(measurement,exploration.controls,independent.controlIds);
  close(independent.comparisonBaselineSum,shared.referenceExpectedLoss);close(independent.comparisonResidualSum,shared.residualExpectedLoss);close(independent.comparisonReductionSum,shared.reduction);
  assert.equal(independent.pricedRiskCount,shared.pricedCount);assert.equal(independent.unknownRiskCount,shared.unknownCount);
 }
});

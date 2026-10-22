import test from 'node:test';
import assert from 'node:assert/strict';
import {applySourceReview} from '../../../scripts/apply-source-review.mjs';
import {validateMeasurement,priorityCost,riskStatistic} from '../../_build/measurement_model.mjs';
import {evaluateInvestment} from '../../_build/investment_model.mjs';

const hash='a'.repeat(64);
const clone=x=>structuredClone(x);
function fixture() {
 const risk=(id,rate,cost,meanRate=rate,meanCost=cost)=>({riskId:id,sourceRiskId:`source-${id}`,review:[],sourceStatistics:{likelihood:{median:rate,mean:meanRate},impactBelief:{median:cost,mean:meanCost}},summaries:{
  likelihood:{median:rate,mean:meanRate,unit:'events_per_year',horizonYears:1,runId:'rate',eligible:true,calibrationStatus:'anchor_scaled',definition:'Nationella händelser per år'},
  impact:{median:cost,mean:meanCost,unit:'SEK_per_event',horizonYears:1,runId:'impact',eligible:true,calibrationStatus:'anchor_scaled',definition:'Kostnad per inträffad händelse'},
 },expectedLoss:{value:meanRate*meanCost,runId:'rate',inputRunIds:['rate','impact'],unit:'SEK',horizonYears:1,method:'product_of_means',assumption:'independent_frequency_and_severity'},centralCost:{value:rate*cost,runId:'rate',inputRunIds:['rate','impact'],unit:'SEK',horizonYears:1,method:'product_of_medians',definition:'Medianprodukt'}});
 const risks=[risk('R1',10,1000,20,2000),risk('R2',20,200,25,250),risk('R3',2,100),risk('R4',0,100)];
 const ranking=(metric,key)=>({run:{id:'execution',metric},entries:[...risks].sort((a,b)=>b[key].value-a[key].value).map((r,i)=>({riskId:r.riskId,sourceRiskId:r.sourceRiskId,rank:i+1,score:r[key].value}))});
 const measurement={schemaVersion:1,status:'ready',editionId:'model-edition',priorityMetric:'median_product_annual_cost',provenance:{sourceSnapshotSha256:hash,executionId:'execution',experimentId:'experiment',orgId:'org',currency:'SEK',horizonYears:1,controlBasis:'inherent_no_controls',scope:{description:'Nationella riskhändelser',exposureBasis:'Händelser i Sverige per år'},runs:['rate','impact','effects'].map(runId=>({runId,functionId:runId,status:'completed',completedAt:'2026-10-22T01:00:00Z',sha256:hash,executionId:'execution',inputRunIds:[]}))},risks,controls:[{controlId:'C1',implementationStatus:'proposed',annualCost:null,effects:[{riskId:'R1',dimension:'likelihood',delta:Math.log(2),status:'identified',runId:'effects'},{riskId:'R1',dimension:'impact',delta:0,status:'identified',runId:'effects'}]}],controlInvestment:{schemaVersion:1,baseline:'inherent_no_controls',implementationStatus:'none_implemented',method:'additive_log_shifts_fixed_uncertainty',effectRunId:'effects',interactionsEstimated:false,costsAvailable:false},ranking:ranking('median_product_annual_cost','centralCost'),meanRanking:ranking('expected_annual_cost','expectedLoss'),quality:{centralCostCount:4,centralUndefinedCount:0,expectedCostCount:4},scenarios:[]};
 const range=(lower,upper,unit)=>({decision:'replace_range',lower,upper,unit,evidenceKind:'description_estimate',sourceQuote:`Källan anger ${lower}–${upper}.`,sourceTitle:'Riskbeskrivningen',scope:'Samma riskhändelse i Sverige',period:'Per år respektive per händelse',qualification:'Bedömningsintervall, inte observerad statistik'});
 const audit={schemaVersion:1,id:'source-review-fixture',sourceSnapshotSha256:hash,intervalPoint:'arithmetic_midpoint',originalTop50:risks.map(r=>r.riskId),entries:[{riskId:'R1',decision:'replace_source',reason:'Jämförbar beskrivningsram styr',likelihood:range(4,8,'events_per_year'),impact:range(10,30,'SEK_per_event')},{riskId:'R2',decision:'replace_source',reason:'Jämförbart punktvärde',likelihood:{decision:'retain'},impact:{...range(50,50,'SEK_per_event'),decision:'replace_point',value:50,evidenceKind:'observed_loss'}},{riskId:'R3',decision:'withhold',reason:'Population kan inte förenas',likelihood:{decision:'withhold'},impact:{decision:'retain'}},{riskId:'R4',decision:'retain_model',reason:'Ingen källkonflikt',likelihood:{decision:'retain'},impact:{decision:'retain'}}]};
 return {measurement,audit};
}
const validate=s=>validateMeasurement(s,['R1','R2','R3','R4'],['C1']);

test('source review changes comparison values while preserving model medians, means, effects and caller input',()=>{
 const {measurement,audit}=fixture(),before=clone(measurement),result=applySourceReview(measurement,audit);
 assert.deepEqual(measurement,before);
 assert.equal(result.priorityMetric,'reviewed_cost_indicator');
 for(const original of before.risks){const row=result.risks.find(r=>r.riskId===original.riskId);assert.deepEqual(row.summaries,original.summaries);assert.deepEqual(row.sourceStatistics,original.sourceStatistics);assert.deepEqual(row.expectedLoss,original.expectedLoss);assert.deepEqual(row.centralCost,original.centralCost);}
 assert.deepEqual(result.controls,before.controls);
 assert.deepEqual(result.meanRanking,before.meanRanking);
 assert.deepEqual(result.modelMedianRanking,before.ranking);
 assert.equal(riskStatistic(result.risks[0],'impact','median').value,1000);
 assert.equal(riskStatistic(result.risks[0],'impact','mean').value,2000);
 validate(result);
});

test('arithmetic source midpoints and endpoint products are explicit comparison quantities',()=>{
 const {measurement,audit}=fixture(),s=applySourceReview(measurement,audit),r=s.risks[0];
 assert.equal(r.reviewedInputs.likelihood.value,6);
 assert.equal(r.reviewedInputs.impact.value,20);
 assert.equal(r.reviewedInputs.impact.method,'source_range_midpoint');
 assert.equal(r.reviewedInputs.impact.median,undefined);
 assert.equal(r.reviewedInputs.impact.mean,undefined);
 assert.equal(r.reviewedCost.value,120);
 assert.equal(r.reviewedCost.lower,40);
 assert.equal(r.reviewedCost.upper,240);
 assert.equal(r.reviewedCost.method,'source_guided_product');
 assert.equal(r.lossDistribution,undefined);
 assert.equal(s.portfolio,undefined);
 assert.equal(priorityCost(r,'reviewed_cost_indicator').value,120);
 assert.equal(priorityCost(r,'median_product_annual_cost').value,10000);
 assert.equal(priorityCost(r,'expected_annual_cost').value,40000);
 assert.equal(s.risks[1].reviewedInputs.impact.method,'source_point');
 assert.equal(s.risks[1].reviewedCost.value,1000);
});

test('withheld and zero values are distinct and the corrected ranking retains every risk record',()=>{
 const {measurement,audit}=fixture(),s=applySourceReview(measurement,audit);
 assert.equal(s.risks.length,4);
 assert.equal(s.risks[2].reviewedInputs.likelihood,null);
 assert.equal(s.risks[2].reviewedCost,null);
 assert.equal(s.risks[2].expectedLoss.value,200);
 assert.equal(s.risks[3].reviewedCost.value,0);
 assert.deepEqual(s.ranking.entries.map(r=>[r.riskId,r.rank,r.score]),[['R2',1,1000],['R1',2,120],['R4',3,0]]);
 assert.equal(s.quality.reviewedCostCount,3);
 assert.deepEqual(s.quality.sourceReview,{reviewed:4,originalTop50:4,corrected:2,withheld:1});
});

test('reapplying an audit is idempotent and retains the original model ranking',()=>{
 const {measurement,audit}=fixture(),once=applySourceReview(measurement,audit),twice=applySourceReview(once,audit);
 assert.deepEqual(twice,once);
 assert.deepEqual(twice.modelMedianRanking,measurement.ranking);
});

test('control comparisons use revised source values without altering measured control effects',()=>{
 const {measurement,audit}=fixture(),s=applySourceReview(measurement,audit),cs=[{id:'C1',riskIds:['R1']}];
 const investment=evaluateInvestment(s,cs,['C1']);
 assert.equal(investment.referenceExpectedLoss,120);
 assert.equal(investment.residualExpectedLoss,60);
 assert.equal(investment.reduction,60);
 assert.equal(investment.valueBasis,'reviewed_cost_indicator');
 assert.deepEqual(s.controls,measurement.controls);
});

test('foreign, duplicate, inverted, nonnumeric and incomplete source evidence fails closed',()=>{
 const mutations=[a=>a.sourceSnapshotSha256='b'.repeat(64),a=>a.intervalPoint='geometric_midpoint',a=>a.entries.push(clone(a.entries[0])),a=>a.entries[0].riskId='unknown',a=>a.entries[0].impact.lower=31,a=>a.entries[0].impact.upper=Infinity,a=>a.entries[0].impact.unit='EUR_per_event',a=>a.entries[0].impact.sourceQuote='',a=>a.entries[0].impact.scope=''];
 for(const mutate of mutations){const {measurement,audit}=fixture();mutate(audit);assert.throws(()=>applySourceReview(measurement,audit));}
});

test('validator rejects changes to revised value, interval or ranking',()=>{
 const mutations=[s=>s.risks[0].reviewedCost.value++,s=>s.risks[0].reviewedCost.lower++,s=>s.risks[0].reviewedInputs.impact.value++,s=>s.risks[0].reviewedInputs.impact.sourceQuote='',s=>s.ranking.entries[0].score++,s=>s.quality.reviewedCostCount++];
 for(const mutate of mutations){const {measurement,audit}=fixture(),s=applySourceReview(measurement,audit);mutate(s);assert.throws(()=>validate(s));}
});

test('audit decisions, original-top coverage and supported period/currency are explicit contracts',()=>{
 for(const mutate of [a=>a.entries[0].decision='replace_soruce',a=>a.entries[0].impact.decision='replace_ragne',a=>a.originalTop50.push('R1'),a=>a.originalTop50.push('unknown'),a=>a.entries.pop()]){
  const {measurement,audit}=fixture();mutate(audit);assert.throws(()=>applySourceReview(measurement,audit),undefined,mutate.toString());
 }
 for(const mutate of [m=>m.provenance.currency='EUR',m=>m.provenance.horizonYears=2]){
  const {measurement,audit}=fixture();mutate(measurement);assert.throws(()=>applySourceReview(measurement,audit),undefined,mutate.toString());
 }
});

test('validator rejects invented input methods, altered model medians and unsupported source points',()=>{
 const mutations=[s=>s.risks[0].reviewedInputs.impact.method='invented',s=>s.risks[0].reviewedInputs.impact.unit='EUR_per_event',s=>s.risks[1].reviewedInputs.impact.sourceQuote='',s=>s.risks[1].reviewedInputs.impact.scope='',s=>{const d=s.risks[1].reviewedInputs.likelihood;d.value=d.lower=d.upper=21;const c=s.risks[1].reviewedCost;c.value=c.lower=c.upper=1050;s.ranking.entries[0].score=1050;},s=>{const d=s.risks[1].reviewedInputs.impact;d.lower=49;d.upper=51;const c=s.risks[1].reviewedCost;c.lower=980;c.upper=1020;}];
 for(const mutate of mutations){const {measurement,audit}=fixture(),s=applySourceReview(measurement,audit);mutate(s);assert.throws(()=>validate(s));}
});

test('a withholding decision cannot coexist with an otherwise arithmetically valid ranked value',()=>{
 for(const mutate of [s=>s.risks[0].sourceReview.decision='withhold',s=>s.risks[0].sourceReview.likelihood.decision='withhold',s=>s.risks[0].sourceReview.impact.decision='withhold']){
  const {measurement,audit}=fixture(),s=applySourceReview(measurement,audit);mutate(s);
  assert.equal(s.risks[0].reviewedCost.value,120);
  assert.throws(()=>validate(s));
 }
});

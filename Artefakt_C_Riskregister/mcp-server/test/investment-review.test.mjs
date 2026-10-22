import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateInvestment,rankInvestments} from '../../_build/investment_model.mjs';
import {frequencyBelief} from '../../../scripts/project-cardinal-snapshot.mjs';
import {applyDescriptionReview} from '../../../scripts/apply-description-review.mjs';
import {reportFigureData,renderReportChapter} from '../../_build/report_model.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const measurement=read('../../../publication/measurement.json'),audit=read('../../../publication/description-review.json'),report=read('../../../report/manuscript.json'),interviews=read('../../../report/interviews.json'),risks=read('../../Artefakt_C_riskregister.json'),controls=read('../data/exploration.json').controls;
const cs=[{id:'a',riskIds:['r','missing']},{id:'b',riskIds:['r']},{id:'bad',riskIds:['r']}];
const model={provenance:{controlBasis:'inherent_no_controls'},controlInvestment:{baseline:'inherent_no_controls',method:'additive_log_shifts_fixed_uncertainty'},risks:[{riskId:'r',expectedLoss:{value:100}},{riskId:'missing'}],controls:[['a',Math.log(2)],['b',Math.log(2)],['bad',-Math.log(2)]].map(([controlId,delta])=>({controlId,effects:[{riskId:'r',dimension:'likelihood',delta,status:'identified'},{riskId:'r',dimension:'impact',delta:0,status:'identified'}]}))};
test('investment combinations compound measured shifts and never add standalone savings',()=>{
 const a=evaluateInvestment(model,cs,['a']),both=evaluateInvestment(model,cs,['a','b','a']);
 assert.equal(a.reduction,50);assert.equal(both.reduction,75);assert.equal(both.pricedCount,1);assert.equal(both.affectedCount,2);assert.equal(both.unknownCount,1);
 assert.equal(both.netBenefit,null);assert.equal(both.annualCost,null);assert.equal(both.rows.find(r=>r.riskId==='missing').reduction,null);
 assert.equal(evaluateInvestment(model,cs,['bad']).reduction,-100);
 assert.equal(evaluateInvestment(model,cs,[]).referenceExpectedLoss,null);
 assert.throws(()=>evaluateInvestment(model,cs,['unknown']),/Okänd/);
});
test('missing dimension or incompatible baseline cannot produce a monetary saving',()=>{
 const copy=structuredClone(model);copy.controls[0].effects.pop();assert.equal(evaluateInvestment(copy,cs,['a']).reduction,null);
 copy.provenance.controlBasis='residual_implemented_controls';assert.equal(evaluateInvestment(copy,cs,['b']),null);
});
test('unmitigated rate belief preserves mean and median without treating saturated probability as a frequency',()=>{
 const r={eligibleForAbsolute:true,calibrationStatus:'anchor_scaled',absolute:{status:'estimated',boundUnit:'events_per_year',point:1,joint:{theta:Math.log(20),rateHorizonYears:2},latentStdDev:1}};
 const f=frequencyBelief(r);assert.ok(Math.abs(f.median-10)<1e-10);assert.ok(Math.abs(f.mean-10*Math.exp(.5))<1e-10);
 assert.notEqual(f.median,r.absolute.point);assert.equal(frequencyBelief({...r,eligibleForAbsolute:false}),null);
});
test('description audit never manufactures point values or changes cost ranks',()=>{
 const before=JSON.stringify(measurement.ranking),result=applyDescriptionReview(measurement,audit);
 assert.equal(JSON.stringify(result.ranking),before);assert.equal(result.quality.descriptionEstimateCount,32);
 assert.equal(audit.entries.length,198);assert.equal(audit.entries.flatMap(e=>e.estimates).length,40);
 assert.ok(audit.entries.flatMap(e=>e.estimates).every(e=>e.mean===null&&e.median===null));
 assert.throws(()=>applyDescriptionReview(measurement,{...audit,sourceSnapshotSha256:'wrong'}),/another source/);
 const missing=structuredClone(audit);missing.entries=missing.entries.filter(e=>e.riskId!=='R-B50-GN040-01');assert.throws(()=>applyDescriptionReview(measurement,missing),/every flagged/);
});
test('published baseline and authorities reconcile to the source-derived comparison',()=>{
 assert.equal(measurement.provenance.controlBasis,'inherent_no_controls');assert.equal(measurement.quality.expectedCostCount,307);assert.equal(measurement.quality.flaggedCount,34);
 assert.equal(measurement.reviewPolicy.maxMeanMedianRatio,null);assert.equal(measurement.reviewPolicy.maxExpectedAnnualCostSEK,null);
 const authority=controls.filter(c=>c.driver==='authority'&&c.scenario==='S1_beslutat_uppdrag'),meanMeasurement={...measurement,priorityMetric:'expected_annual_cost'},s=evaluateInvestment(meanMeasurement,controls,authority.map(c=>c.id));
 assert.equal(s.affectedCount,78);assert.equal(s.pricedCount,72);assert.ok(Math.abs(s.reductionFraction-.2341617858610496)<1e-10);
 const ranked=rankInvestments(meanMeasurement,controls,authority);assert.equal(ranked[0].control.id,'MPM-16');assert.ok(ranked.find(r=>r.control.id==='MPM-14').reduction<0);
});
test('reader report has supported figures, no internal execution labels, and methods in appendices',()=>{
 let html='';
 for(const c of report.chapters){html+=renderReportChapter(c,report,interviews);for(const b of c.blocks.filter(b=>b.type==='figure'))assert.notEqual(reportFigureData(b.figureId,report,measurement,risks,controls).kind,'pending',b.figureId);}
 assert.doesNotMatch(html,/cosmic rhino|execution|930101cd|residual_implemented|Run-ID|sammanhängande underlag/i);
 assert.ok(!report.chapters.some(c=>c.id==='metod'));assert.ok(report.chapters.find(c=>c.id==='bilaga-metod'));
 assert.ok(report.chapters.flatMap(c=>c.blocks).filter(b=>b.type==='p').reduce((n,b)=>n+b.text.split(/\s+/).length,0)>9000);
});

test('central indicator never replaces loss mean or fabricates predictive annual median',()=>{
 const risk=measurement.risks.find(r=>r.riskId==='R-B60-250-02');
 assert.ok(Math.abs(risk.centralCost.value-8239210693.005016)<.01);
 assert.ok(Math.abs(risk.expectedLoss.value-601948246899.331)<.01);
 assert.equal(risk.lossDistribution,undefined);assert.equal(risk.centralCost.method,'product_of_medians');
 for(const id of ['R-B60-G210-01','R-B40-N110-01','R-B40-GE120-02'])assert.equal(measurement.risks.find(r=>r.riskId===id).centralCost,undefined);
 const m={...model,priorityMetric:'median_product_annual_cost',risks:[{riskId:'r',expectedLoss:{value:10000},centralCost:{value:100}},{riskId:'missing'}]};
 assert.equal(evaluateInvestment(m,cs,['a','b']).reduction,75);
 assert.equal(evaluateInvestment({...m,priorityMetric:'expected_annual_cost'},cs,['a','b']).reduction,7500);
});

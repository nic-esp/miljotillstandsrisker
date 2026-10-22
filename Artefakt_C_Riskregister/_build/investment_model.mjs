// Deterministic counterfactuals from measured log-rate/log-cost shifts.
// Unknown effects and unpriced risks remain visible, never silently zero-filled.
import {priorityCost} from './measurement_model.mjs';
export function evaluateInvestment(snapshot, controls, selectedIds) {
  const selected=[...new Set(selectedIds)];
  const canonical=new Map(controls.map(c=>[c.id,c]));
  if(selected.some(id=>!canonical.has(id)))throw Error('Okänd motåtgärd');
  if(snapshot.controlInvestment?.baseline!=='inherent_no_controls'||snapshot.provenance.controlBasis!=='inherent_no_controls')return null;
  const valueBasis=snapshot.priorityMetric||'expected_annual_cost';
  const measured=new Map((snapshot.controls||[]).map(c=>[c.controlId,c]));
  const byRisk=new Map(snapshot.risks.map(r=>[r.riskId,r]));
  const affected=[...new Set(selected.flatMap(id=>canonical.get(id).riskIds))];
  const rows=affected.map(riskId=>{
    const risk=byRisk.get(riskId),ids=selected.filter(id=>canonical.get(id).riskIds.includes(riskId));
    const missing=[];let likelihoodShift=0,impactShift=0;
    for(const controlId of ids)for(const dimension of ['likelihood','impact']) {
      const effects=measured.get(controlId)?.effects.filter(e=>e.riskId===riskId&&e.dimension===dimension)||[];
      if(effects.length!==1||effects[0].status!=='identified'||!Number.isFinite(effects[0].delta))missing.push(`${controlId}:${dimension}`);
      else if(dimension==='likelihood')likelihoodShift+=effects[0].delta;else impactShift+=effects[0].delta;
    }
    const supported=!missing.length;
    const factor=supported?Math.exp(-likelihoodShift-impactShift):null;
    const baseline=priorityCost(risk,valueBasis)?.value??null;
    const residual=baseline!=null&&factor!=null&&Number.isFinite(baseline*factor)?baseline*factor:null;
    return {riskId,controlIds:ids,likelihoodShift,impactShift,missing,factor,
      frequencyReduction:supported?1-Math.exp(-likelihoodShift):null,
      severityReduction:supported?1-Math.exp(-impactShift):null,
      reductionFraction:factor!=null?1-factor:null,
      baseline:residual!=null?baseline:null,residual,reduction:residual!=null?baseline-residual:null,
      reason:!supported?'Effektunderlag saknas för vald kombination':baseline==null?(valueBasis==='median_product_annual_cost'?'Medianbaserat kostnadsunderlag saknas':'Jämförbar årskostnad saknas'):null};
  });
  const priced=rows.filter(r=>r.reduction!=null);
  const sum=key=>priced.reduce((a,r)=>a+r[key],0);
  return {selectedIds:selected,rows,pricedCount:priced.length,affectedCount:affected.length,valueBasis,
    referenceExpectedLoss:priced.length?sum('baseline'):null,residualExpectedLoss:priced.length?sum('residual'):null,
    reduction:priced.length?sum('reduction'):null,
    reductionFraction:sum('baseline')>0?sum('reduction')/sum('baseline'):null,
    adverseCount:rows.filter(r=>r.reductionFraction<0).length,
    unknownCount:rows.filter(r=>r.reduction==null).length,
    annualCost:null,netBenefit:null,
    method:snapshot.controlInvestment.method};
}
export function rankInvestments(snapshot, controls, visible=controls) {
  return visible.map(control=>({control,...evaluateInvestment(snapshot,controls,[control.id])}))
    .sort((a,b)=>(b.reduction??-Infinity)-(a.reduction??-Infinity)||a.control.id.localeCompare(b.control.id));
}

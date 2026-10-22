/** Offline adapter for stored loss-model-v2.1 documents. Never simulates. */
export function projectStoredLoss(cache,{config,frozen,runMap,likelihood,impact,riskIds,controlBasis,sourceHash}) {
  const fail=m=>{throw Error(`Stored loss cache: ${m}`);};
  const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const known=new Set(riskIds),quantileKeys=['p50','p75','p90','p95','p99'];
  const quantiles=q=>{if(!q||quantileKeys.some(k=>!finite(q[k]))||quantileKeys.some((k,i)=>i&&q[k]<q[quantileKeys[i-1]]))fail('invalid quantiles');};
  let model;
  if(cache) {
    if(cache.schemaVersion!==1||cache.kind!=='cardinal_stored_loss_cache'||cache.sourceOrigin!=='https://nr.getcardinal.io'||!Number.isFinite(Date.parse(cache.capturedAt)))fail('invalid export');
    for(const key of ['orgId','experimentId','executionId'])if(cache.context?.[key]!==config[key]||cache.config?.[key]!==config[key])fail('execution or organization mismatch');
    if(cache.config.mappingVersion!==config.mappingVersion||cache.context.status!=='completed'||cache.context.scopeHash!==frozen.scopeHash||cache.context.scopeSnapshotId!==frozen.scopeSnapshotId||cache.context.currency!==frozen.currency||cache.context.horizonYears!==frozen.horizonYears)fail('scope mismatch');
    const expected=[...runMap.values()].filter(r=>r.executionId===config.executionId);
    if(!Array.isArray(cache.runs)||cache.runs.length!==expected.length||new Set(cache.runs.map(r=>r.id)).size!==expected.length)fail('Run inventory mismatch');
    for(const r of cache.runs) {
      const source=runMap.get(r.id);
      if(!source||source.executionId!==config.executionId||['type','dimension','controlBasis','status','version'].some(k=>r[k]!==source[k])||Date.parse(r.completedAt)!==Date.parse(source.completedAt))fail('Run identity or version mismatch');
    }
    if(!Array.isArray(cache.models))fail('missing model inventory');
    const keys=new Set();
    for(const row of cache.models) {
      const l=runMap.get(row.likelihoodRunId),i=runMap.get(row.impactRunId),key=`${row.likelihoodRunId}|${row.impactRunId}`;
      if(keys.has(key)||!l||!i||l.type!=='risk_exposure'||i.type!=='risk_exposure'||l.dimension!=='likelihood'||i.dimension!=='impact'||[l,i].some(r=>r.executionId!==config.executionId||r.controlBasis!==row.controlBasis))fail('model pair mismatch');
      keys.add(key);
    }
    model=cache.models.find(m=>m.likelihoodRunId===likelihood?.id&&m.impactRunId===impact?.id&&m.controlBasis===controlBasis);
  }
  const scope={experimentId:config.experimentId,executionId:config.executionId,currency:frozen.currency,horizonYears:1,
    likelihoodRunId:likelihood?.id||null,impactRunId:impact?.id||null,
    responseModelValidated:likelihood?.dataJsonb?.stats?.calibration?.responseModelValidated===true};
  const records=new Map(),summaries=new Map();let portfolio=null,distribution=null,projection=null;
  if(model) {
    const result=model.result,a=result?.assumptions;
    if(result?.type!=='loss_model_result'||a?.lossModelVersion!=='loss-model-v2.1'||a.draws!==10000||a.seed!==42||a.independenceAcrossRisks!==true||a.occurrenceSeverityIndependence!==true||a.iidPerEventSeverity!==true||a.parameterUncertaintyInterpretation!=='uncertainty_in_constant_parameter')fail('unsupported model assumptions or settings; review the adapter');
    if(!Array.isArray(result.portfolio)||JSON.stringify(result.portfolio.map(p=>p.horizon))!=='[1,2,3,5,10,15,20,25]')fail('unexpected horizons');
    portfolio=result.portfolio.find(p=>p.horizon===1);
    const members=new Set(portfolio.includedRiskIds),excluded=new Set(portfolio.excludedRisks?.map(r=>r.riskId));
    if(members.size!==portfolio.includedRiskIds.length||excluded.size!==portfolio.excludedRisks?.length||[...members,...excluded].some(id=>!known.has(id))||[...members].some(id=>excluded.has(id)))fail('invalid portfolio membership');
    if(!result.perRisk||typeof result.perRisk!=='object')fail('missing per-risk summaries');
    for(const [id,horizons] of Object.entries(result.perRisk)) {
      if(!known.has(id)||!Array.isArray(horizons)||new Set(horizons.map(h=>h.horizon)).size!==horizons.length)fail('invalid per-risk membership or horizons');
      const annual=horizons.find(h=>h.horizon===1);
      if(!annual)fail('annual horizon missing');
      if(annual.supported===true) {
        if(!members.has(id)||!finite(annual.analyticalMean)||!finite(annual.simulatedMean))fail('annual result is not a portfolio member');
        quantiles(annual.quantiles);summaries.set(id,annual);
      } else if(annual.supported!==false||members.has(id)||!annual.unsupportedReason)fail('invalid unsupported result');
    }
    if([...members].some(id=>!summaries.has(id)))fail('portfolio member missing annual statistics');
    quantiles(portfolio.quantiles);
    if(!finite(portfolio.mean)||!finite(portfolio.analyticalMean))fail('invalid portfolio mean');
    distribution={risksIncluded:members.size,analyticalMean:portfolio.analyticalMean,percentiles:portfolio.quantiles,
      draws:a.draws,histogram:portfolio.histogram,excludedRisks:portfolio.excludedRisks,lossModelVersion:a.lossModelVersion};
    projection={points:[{horizon:1,mean:portfolio.mean,analyticalMean:portfolio.analyticalMean,p50:portfolio.quantiles.p50}]};
    for(const r of portfolio.excludedRisks)records.set(r.riskId,{kind:'excluded',reason:r.reason});
  }
  const items=riskIds.map(id=>{
    const s=summaries.get(id),abs=value=>({kind:'absolute',value});
    const unavailable=records.get(id)||{kind:model?'not_measured':'not_exported',reason:model?'outside_stored_loss_membership':'stored_loss_cache_unavailable'};
    const measured=s?{expectedAnnualLoss:abs(s.analyticalMean),annualLossMedian:abs(s.quantiles.p50),annualLossP90:abs(s.quantiles.p90)}:{expectedAnnualLoss:unavailable,annualLossMedian:unavailable,annualLossP90:unavailable};
    return {id,measured:{[controlBasis==='inherent_no_controls'?'inherent':'residual']:measured}};
  });
  return {kpi:{scope,risksQuantified:summaries.size,simulationPending:false},distribution,projection,summaries,
    missing:!model,modelId:model?.id||null,
    riskPages:[{input:{page:1},sha256:sourceHash,data:{items,pagination:{page:1,total:items.length,hasMore:false},runScope:scope}}]};
}

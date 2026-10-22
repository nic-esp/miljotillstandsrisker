#!/usr/bin/env node
/** Offline projection of an immutable read-only database export. No simulation,
 * network call or write to Cardinal. Keep source statistics apart from published
 * estimates; review exclusions never replace missing values with zero. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalContext,sha256} from './import-runs.mjs';
import {auditRelations} from './import-cardinal.mjs';
import {validateMeasurement,priorityCost} from '../Artefakt_C_Riskregister/_build/measurement_model.mjs';

const fail=text=>{throw Error(`Snapshot projection: ${text}`);};
const camel=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v]));
export function severityBelief(point,sigma) {
  if(!(point>0)||!Number.isFinite(point)||!Number.isFinite(sigma)||sigma<0)return null;
  const mean=point*Math.exp(sigma*sigma/2);
  return Number.isFinite(mean)?{mean,median:point,logStdDev:sigma,interval90:[point*Math.exp(-1.6448536269514722*sigma),point*Math.exp(1.6448536269514722*sigma)]}:null;
}
export function frequencyBelief(rank) {
  const a=rank?.absolute;
  if(!rank?.eligibleForAbsolute||rank.calibrationStatus!=='anchor_scaled'||a?.status!=='estimated'||a.boundUnit!=='events_per_year'||!(a.joint?.rateHorizonYears>0)||!Number.isFinite(a.joint.theta)||!Number.isFinite(a.latentStdDev)||a.latentStdDev<0)return null;
  const mu=a.joint.theta-Math.log(a.joint.rateHorizonYears),sigma=a.latentStdDev;
  const median=Math.exp(mu),mean=Math.exp(mu+sigma*sigma/2);
  if(!Number.isFinite(mean))return null;
  return {mean,median,logStdDev:sigma,quantiles:{p5:Math.exp(mu-1.6448536269514722*sigma),p50:median,p95:Math.exp(mu+1.6448536269514722*sigma)},method:'analytical_lognormal_rate'};
}
export function projectSnapshot(d,crosswalk,canonical,policy,sourceHash) {
  if(d.execution?.status!=='completed'||d.organization?.id!==crosswalk.orgId)fail('completed execution / organization mismatch');
  if(policy.schemaVersion!==1||policy.descriptionEstimates?.length)fail('description replacements need a separately reviewed comparable-value adapter');
  for(const key of ['maxAnnualFrequency','maxCostPerEventSEK'])if(!(policy[key]>0))fail(`invalid policy ${key}`);
  for(const key of ['maxMeanMedianRatio','maxExpectedAnnualCostSEK'])if(policy[key]!=null&&!(policy[key]>0))fail(`invalid policy ${key}`);
  const runs=new Map(d.runs.map(r=>[r.id,r]));
  if(runs.size!==d.runs.length)fail('duplicate Runs');
  const scope=d.scope,ex=d.execution;
  if(!scope.scope_hash||scope.currency!=='SEK'||!['1',1].includes(scope.horizon_years)||!scope.exposure_statement)fail('unsupported or incomplete measurement scope');
  for(const r of runs.values()) {
    if(r.organization_id!==d.organization.id||r.execution_id!==ex.id||r.experiment_id!==ex.experiment_id||r.status!=='completed')fail('mixed execution or unfinished source');
    if(r.data_jsonb?.stats?.calibration?.scopeHash&&r.data_jsonb.stats.calibration.scopeHash!==scope.scope_hash)fail('scope hash mismatch');
    for(const id of r.provenance_json?.inputRunIds||[])if(!runs.has(id))fail('missing source input');
  }
  const select=(type,dimension,basis='residual_implemented_controls')=>{
    const found=d.runs.filter(r=>r.type===type&&r.dimension===dimension&&r.control_basis===basis);
    if(found.length!==1)fail(`ambiguous ${type}/${dimension}/${basis}`);return found[0];
  };
  const basis=policy.controlBasis||'residual_implemented_controls';
  const priorityMetric=policy.priorityMetric||'expected_annual_cost';
  if(!['expected_annual_cost','median_product_annual_cost'].includes(priorityMetric))fail('unknown priority metric');
  const likelihood=select('risk_probability_rank','likelihood',basis),impact=select('risk_impact_rank','impact',basis);
  const residualL=select('risk_probability_rank','likelihood'),residualI=select('risk_impact_rank','impact');
  const mcL=select('risk_exposure','likelihood'),mcI=select('risk_exposure','impact');
  if(!mcL.provenance_json.inputRunIds.includes(residualL.id)||!mcI.provenance_json.inputRunIds.includes(residualI.id))fail('Monte Carlo lineage mismatch');
  const relations=Object.fromEntries(Object.entries(d.relations).map(([k,rows])=>[k,rows.map(camel)]));
  const links=auditRelations(relations,crosswalk,canonical,d.organization.id);
  if(links.missingRiskControlPairs.length||links.additionalRiskControlPairs.length||links.missingProcessNodes.length||links.additionalProcessNodes.length)fail('site risk-control or process mapping changed');
  const byId=rows=>new Map(rows.map(r=>[r.riskId,r]));
  const lRanks=byId(likelihood.data_jsonb.ranks),iRanks=byId(impact.data_jsonb.ranks);
  const residualIRanks=byId(residualI.data_jsonb.ranks);
  const frequencies=byId(mcL.data_jsonb.occurrence.results),iExposures=byId(mcI.data_jsonb.exposures);
  const sourceIdBySite=new Map(Object.entries(crosswalk.risks).map(([source,site])=>[site,source]));
  const risks=canonical.risks.map(risk=>{
    const sourceRiskId=sourceIdBySite.get(risk.risk_id),l=lRanks.get(sourceRiskId),i=iRanks.get(sourceRiskId);
    const frequency=basis==='inherent_no_controls'?frequencyBelief(l):frequencies.get(sourceRiskId)?.annualRate,exposure=iExposures.get(sourceRiskId);
    const frequencyRunId=basis==='inherent_no_controls'?likelihood.id:mcL.id;
    const severity=i?.eligibleForAbsolute&&i.calibrationStatus==='anchor_scaled'&&i.absolute?.status==='estimated'?severityBelief(i.absolute.point,i.absolute.latentStdDev):null;
    const row={riskId:risk.risk_id,sourceRiskId,summaries:{},review:[],sourceStatistics:{
      likelihood:frequency?{...frequency,runId:frequencyRunId}:null,
      assessedWithControls:{likelihood:frequencies.get(sourceRiskId)?.annualRate?{...frequencies.get(sourceRiskId).annualRate,runId:mcL.id}:null,impact:residualIRanks.get(sourceRiskId)?.absolute?.status==='estimated'?{...severityBelief(residualIRanks.get(sourceRiskId).absolute.point,residualIRanks.get(sourceRiskId).absolute.latentStdDev),runId:residualI.id}:null},
      impactBelief:severity?{...severity,runId:impact.id}:null,
      impactMonteCarloDiagnostic:exposure?{mean:exposure.mean,median:exposure.quantiles?.p50,quantiles:exposure.quantiles,runId:mcI.id}:null,
    }};
    const flag=(dimension,code,reason)=>row.review.push({dimension,code,reason});
    for(const exclusion of policy.riskExclusions||[])if(exclusion.riskId===risk.risk_id)flag(exclusion.dimension,exclusion.code,exclusion.reason);
    row.distributionNotes=(policy.sourceCaveats||[]).filter(note=>note.riskId===risk.risk_id).map(({riskId,...note})=>note);
    for(const [dimension,s] of [['likelihood',frequency],['impact',severity]])if(s?.mean/s?.median>(policy.warningMeanMedianRatio||10))row.distributionNotes.push({dimension,code:'skewed_distribution',reason:'Medelvärdet ligger långt över medianen. Det kalibrerade medelvärdet behålls om ingen separat brist motiverar att det utelämnas.'});
    if(!l)flag('likelihood','outside_execution','Risken ingår inte i körningens frysta urval.');
    else if(!frequency||!l.eligibleForAbsolute||l.calibrationStatus!=='anchor_scaled')flag('likelihood','source_ineligible','Absolut frekvens saknas eller har endast ett gränsvärde.');
    else {
      if(policy.maxMeanMedianRatio!=null&&frequency.mean/frequency.median>policy.maxMeanMedianRatio)flag('likelihood','tail_review','Frekvensens medelvärde överstiger medianen mer än tio gånger; medelvärdet lämnas odefinierat tills fördelningens svans har granskats.');
      if(frequency.mean>policy.maxAnnualFrequency)flag('likelihood','frequency_scale_review','Frekvensens medelvärde överstiger 10 000 händelser per år; stöd för ärendevolymen behöver granskas.');
      if(frequency.median<=policy.maxAnnualFrequency)row.summaries.likelihood={mean:row.review.some(f=>f.dimension==='likelihood')?null:frequency.mean,median:frequency.median,quantiles:frequency.quantiles,unit:'events_per_year',horizonYears:1,runId:frequencyRunId,eligible:true,calibrationStatus:'anchor_scaled',definition:basis==='inherent_no_controls'?'Modellens årliga händelsefrekvens i Sverige utan införda kontroller. Analytiskt medel och median ur den exporterade kalibrerade lognormala frekvensbedömningen.':'Modellens årliga händelsefrekvens i Sverige från exporterad Monte Carlo. Parameterosäkerhet, inte observerat antal ärenden.'};
    }
    if(!severity||(basis!=='inherent_no_controls'&&!exposure?.eligibleForAbsolute))flag('impact',i?'source_ineligible':'outside_execution','Kalibrerad kostnadsfördelning saknas eller har endast ett gränsvärde.');
    else {
      if(policy.maxMeanMedianRatio!=null&&severity.mean/severity.median>policy.maxMeanMedianRatio)flag('impact','tail_review','Kostnadens medelvärde överstiger medianen mer än tio gånger; medelvärdet lämnas odefinierat tills fördelningens svans har granskats.');
      if(severity.mean>policy.maxCostPerEventSEK)flag('impact','event_cost_review','Medelkostnaden överstiger 10 miljarder kronor per händelse och saknar särskild beläggning i riskbeskrivningen.');
      if(severity.median<=policy.maxCostPerEventSEK)row.summaries.impact={...severity,mean:row.review.some(f=>f.dimension==='impact')?null:severity.mean,unit:'SEK_per_event',horizonYears:1,runId:impact.id,eligible:true,calibrationStatus:'anchor_scaled',method:'lognormal_severity_belief',definition:'Bedömning av genomsnittlig kostnad per inträffad händelse. Median är det kalibrerade punktvärdet; medelvärde beräknas som punkt × exp(logStdDev²/2), enligt Cardinals severity-beliefs.'};
    }
    if(row.summaries.likelihood?.mean!=null&&row.summaries.impact?.mean!=null) {
      const loss=row.summaries.likelihood.mean*row.summaries.impact.mean;
      if(policy.maxExpectedAnnualCostSEK!=null&&loss>policy.maxExpectedAnnualCostSEK)flag('expectedLoss','annual_cost_review','Beräknat årsmedelvärde överstiger 10 miljarder kronor för en risk; storleksordningen kräver separat sakgranskning.');
      else row.expectedLoss={value:loss,runId:frequencyRunId,inputRunIds:[frequencyRunId,impact.id],unit:'SEK',horizonYears:1,method:'product_of_means',assumption:'independent_frequency_and_severity',definition:'Förväntad årlig riskkostnad från kalibrerade frekvens- och kostnadsmedel. Deterministisk beräkning på exporterat underlag; ingen ny simulering.'};
    }
    const structuralIssue=row.review.some(f=>['population_mismatch','event_population_ambiguity','exposure_volume_conflict','source_ineligible','outside_execution'].includes(f.code));
    const lm=row.summaries.likelihood?.median,im=row.summaries.impact?.median;
    if(!structuralIssue&&Number.isFinite(lm)&&Number.isFinite(im)&&lm>=0&&im>=0&&Number.isFinite(lm*im))row.centralCost={value:lm*im,runId:frequencyRunId,inputRunIds:[frequencyRunId,impact.id],unit:'SEK',horizonYears:1,method:'product_of_medians',definition:'Medianbaserad årlig kostnadsindikator: median för nationell händelsefrekvens multiplicerad med median för bedömd medelkostnad per händelse. Ett centralmått för prioritering, inte en skattning av förlustmedelvärdet eller medianen för verklig årlig förlust.'};
    row.qualityStatus=row.expectedLoss?'model_estimate':l?'review_required':'outside_execution';
    return row;
  });
  const scopeDescription='Händelser i enskilda miljötillståndsärenden och projekt i Sverige under ett år. Kostnaden gäller den händelse som inträffar i ett projekt.';
  const runMeta={id:likelihood.id,executionId:ex.id,executionName:ex.name||'Cosmic Rhino',experimentName:'Miljötillståndsrisker',createdAt:ex.completed_at,completedAt:ex.completed_at,verifiedAt:d.capturedAt,
    sourceUrl:'https://nr.getcardinal.io',calibration:likelihood.data_jsonb.stats.calibration};
  const likelihoodRanking={run:{...runMeta,metric:'relative_likelihood'},entries:likelihood.data_jsonb.ranks.map(r=>({riskId:crosswalk.risks[r.riskId],sourceRiskId:r.riskId,rank:r.rank,score:r.score}))};
  if(likelihoodRanking.entries.some(e=>!e.riskId))fail('unmapped rank');
  const costRanking=metric=>({run:{...runMeta,id:ex.id,metric,unit:'SEK_per_year',derived:true,policyId:policy.id},entries:risks.filter(r=>priorityCost(r,metric)).sort((a,b)=>priorityCost(b,metric).value-priorityCost(a,metric).value||a.riskId.localeCompare(b.riskId)).map((r,index)=>({riskId:r.riskId,sourceRiskId:r.sourceRiskId,rank:index+1,score:priorityCost(r,metric).value}))});
  const ranking=costRanking(priorityMetric),meanRanking=costRanking('expected_annual_cost');
  // Select control effects by the actual scenario Monte Carlo's ancestors.
  const mcScenario=select('risk_exposure','likelihood','control_scenario');
  const scenarioRank=runs.get(mcScenario.provenance_json.inputRunIds[0]);
  const effectRun=runs.get(scenarioRank.provenance_json.controlScenario.controlEffectsRunId);
  if(effectRun?.type!=='control_effects'||!scenarioRank.provenance_json.inputRunIds.includes(effectRun.id))fail('unverified control-effect lineage');
  if(basis==='inherent_no_controls') {
    const dimensions={likelihood:lRanks,impact:iRanks};
    for(const gap of effectRun.data_jsonb.riskDeltas||[]) {
      const rank=dimensions[gap.dimension]?.get(gap.riskId);
      if(!rank||Math.abs(rank.absolute?.joint?.theta-gap.thetaInherent)>1e-8)fail('control baseline does not match measured inherent rank');
      const sum=effectRun.data_jsonb.effects.filter(e=>e.riskId===gap.riskId&&e.dimension===gap.dimension).reduce((n,e)=>n+e.delta,0);
      if(gap.status==='identified'&&Math.abs(sum-gap.totalDelta)>1e-8)fail('attribution shifts do not reconcile to measured basis gap');
    }
    if(effectRun.data_jsonb.riskDeltas?.length!==lRanks.size+iRanks.size)fail('control basis evidence missing');
  }
  const controlsMap=new Map();
  for(const e of effectRun.data_jsonb.effects) {
    const controlId=crosswalk.controls[e.controlId],riskId=crosswalk.risks[e.riskId];
    if(!controlId||!riskId)fail('unmapped control effect');
    if(!canonical.controls.find(c=>c.id===controlId)?.riskIds.includes(riskId))fail('effect has no canonical risk-control link');
    if(!controlsMap.has(controlId))controlsMap.set(controlId,{controlId,effects:[]});
    controlsMap.get(controlId).effects.push({riskId,dimension:e.dimension,delta:e.delta,share:e.share,voteCount:e.voteCount,status:e.status,runId:effectRun.id});
  }
  const snapshot={schemaVersion:1,status:'ready',priorityMetric,editionId:`cosmic-rhino-2026-10-22-${policy.id}`,provenance:{label:'Cosmic Rhino',executionId:ex.id,experimentId:ex.experiment_id,orgId:d.organization.id,currency:'SEK',horizonYears:1,controlBasis:basis,implementationStatus:'none_implemented',baselineLabel:basis==='inherent_no_controls'?'Utan införda motåtgärder':'Mätning med åtgärdsantaganden',scope:{description:scopeDescription,exposureBasis:scope.exposure_statement},scopeHash:scope.scope_hash,scopeSnapshotId:scope.id,sourceSnapshotSha256:sourceHash,completedAt:ex.completed_at,
    runs:d.runs.map(r=>({runId:r.id,functionId:r.function_type,kind:r.type,status:r.status,executionId:r.execution_id,completedAt:r.completed_at,sha256:sha256(JSON.stringify(r)),inputRunIds:r.provenance_json?.inputRunIds||[]}))},
    risks,controls:[...controlsMap.values()].map(c=>({...c,implementationStatus:'proposed',annualCost:null})),controlInvestment:basis==='inherent_no_controls'?{schemaVersion:1,baseline:'inherent_no_controls',implementationStatus:'none_implemented',method:'additive_log_shifts_fixed_uncertainty',effectRunId:effectRun.id,interactionsEstimated:false,costsAvailable:false,definition:'Potentiell modellberäknad förändring när valda åtgärder införs från en bas utan kontroller. Frekvens och händelsekostnad multipliceras med exp(-summa delta) i respektive dimension. Osäkerhetens bredd hålls konstant. Ingen ny mätning eller simulering.'}:undefined,ranking,meanRanking,likelihoodRanking,scenarios:[],reviewPolicy:policy,
    quality:{registerCount:risks.length,executionCount:lRanks.size,expectedCostCount:meanRanking.entries.length,centralCostCount:risks.filter(r=>r.centralCost).length,centralUndefinedCount:risks.filter(r=>!r.centralCost).length,flaggedCount:risks.filter(r=>r.qualityStatus==='review_required').length,outsideExecution:risks.filter(r=>r.qualityStatus==='outside_execution').map(r=>r.riskId),descriptionEstimateCount:0,responseModelValidated:false,monetaryLossDistributionAvailable:false,
      relationCounts:links.counts,relations:{riskControlPairsMatch:true,processNodesMatch:true,missingElementTargets:links.missingTargets.length,additionalElementTargets:links.additionalTargets.length,wholeRiskEventTargets:links.wholeRiskEventTargets.length},
      note:'Medianbaserad kostnadsindikator och förlustmedelvärde har separat täckning och rangordning. Ett granskat extremt medelvärde utesluter inte en användbar median, medan saknad kalibrering och dokumenterade populations- eller exponeringskonflikter hindrar båda måtten. Modellvärdena saknar oberoende empirisk validering. Saknade indikatorer betyder inte låg risk. Överlappande kostnadsposter gör summan olämplig som nationell totalskattning.'},
    diagnostics:{likelihood:likelihood.data_jsonb.stats,impact:impact.data_jsonb.stats,draws:mcL.data_jsonb.stats.totalDraws,controlEffectRunId:effectRun.id}};
  validateMeasurement(snapshot,canonical.risks.map(r=>r.risk_id),canonical.controls.map(c=>c.id));
  return {snapshot,links};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [input,crosswalkFile,policyFile,out]=process.argv.slice(2);if(!out)fail('usage: snapshot.json crosswalk.json value-policy.json output-directory');
  const raw=readFileSync(input),read=p=>JSON.parse(readFileSync(p,'utf8'));
  const result=projectSnapshot(JSON.parse(raw),read(crosswalkFile),canonicalContext(),read(policyFile),sha256(raw));mkdirSync(out,{recursive:true});
  writeFileSync(`${out}/measurement.json`,JSON.stringify(result.snapshot,null,2)+'\n');writeFileSync(`${out}/link-audit.json`,JSON.stringify(result.links,null,2)+'\n');
  console.log(JSON.stringify(result.snapshot.quality,null,2));
}

#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {canonicalContext,convertRuns,sha256} from './import-runs.mjs';
import {validateMeasurement,riskStatistic} from '../Artefakt_C_Riskregister/_build/measurement_model.mjs';
import {projectStoredLoss} from './cardinal-cache-projection.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const fail=message=>{throw Error(`Cardinal bridge: ${message}`);};
const stable=value=>JSON.stringify(value);
const eq=(a,b)=>stable(a)===stable(b);
const value=q=>q?.kind==='absolute'?q.value:null;
const bases=['residual_implemented_controls','inherent_no_controls'];
const number=(n,label)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0)fail(`invalid ${label}`);return n;};

export function decodeDocument(document) {
  if(typeof document.body!=='string'||sha256(document.body)!==document.sha256)fail('document checksum mismatch');
  if(document.encoding!=='trpc-superjson')fail('expected a tRPC JSON document');
  const response=JSON.parse(document.body);
  if(response.error||!Object.hasOwn(response.result?.data||{},'json'))fail(`invalid response for ${document.procedure}`);
  // Numeric results/IDs/ISO dates are JSON-native. SuperJSON's meta is retained
  // losslessly in body. Reject transformed numeric values instead of coercing.
  const meta=response.result.data.meta?.values||{};
  for(const tags of Object.values(meta))if(!Array.isArray(tags)||!['Date','undefined'].includes(tags[0]))fail('unsupported SuperJSON transformation');
  return response.result.data.json;
}

export function auditRelations(relations,crosswalk,canonical,orgId) {
  const names=['risks','controls','risk_controls','risk_process_mappings','control_process_mappings','cause_effect_node_mappings','risk_analyses','org_process_charts'];
  for(const table of names) {
    if(!Array.isArray(relations[table]))fail(`missing relationship table: ${table}`);
    if(relations[table].some(r=>r.organizationId!==orgId))fail(`foreign organization in ${table}`);
    if(new Set(relations[table].map(r=>r.id)).size!==relations[table].length)fail(`duplicate IDs in ${table}`);
  }
  const risks=new Set(relations.risks.map(r=>r.id)), controls=new Set(relations.controls.map(c=>c.id));
  const charts=new Set(relations.org_process_charts.map(c=>c.id));
  const check=(id,set,label)=>{if(!set.has(id))fail(`dangling ${label}: ${id}`);};
  const elements=new Map();
  for(const analysis of relations.risk_analyses) {
    check(analysis.riskId,risks,'analysis risk');
    for(const [list,type] of [['causes','cause'],['events','event'],['effects','effect']])
      for(const item of (Array.isArray(analysis[list])?analysis[list]:JSON.parse(analysis[list]||'[]')))elements.set(`${analysis.riskId}|${item.id}`,type);
  }
  const tuple=r=>[r.controlId,r.riskId,r.elementId||'',r.elementType||''].join('|');
  for(const link of relations.risk_controls) {
    check(link.riskId,risks,'risk');check(link.controlId,controls,'control');
    if(link.elementId&&elements.get(`${link.riskId}|${link.elementId}`)!==link.elementType)fail(`dangling bow-tie element ${link.elementId}`);
  }
  for(const name of ['risk_process_mappings','cause_effect_node_mappings','control_process_mappings'])
    for(const link of relations[name]) {check(link.chartId,charts,'process');if(link.riskId)check(link.riskId,risks,'process risk');if(link.controlId)check(link.controlId,controls,'process control');}
  const riskMap=crosswalk.risks||{},controlMap=crosswalk.controls||{};
  for(const [map,source,site,label] of [[riskMap,risks,canonical.risks.map(r=>r.risk_id),'risk'],[controlMap,controls,canonical.controls.map(c=>c.id),'control']]) {
    if(Object.keys(map).length!==source.size||Object.keys(map).some(id=>!source.has(id))||new Set(Object.values(map)).size!==site.length||site.some(id=>!Object.values(map).includes(id)))fail(`incomplete or non-bijective ${label} crosswalk`);
  }
  if(!Array.isArray(crosswalk.targets)||!Array.isArray(crosswalk.processMappings))fail('full target and process crosswalk required');
  const currentTargets=new Set(canonical.controls.flatMap(c=>c.targets.map(t=>t.id)));
  if(crosswalk.targets.length!==currentTargets.size||crosswalk.targets.some(t=>!currentTargets.has(t.sourceTargetLinkId))||new Set(crosswalk.targets.map(t=>t.sourceTargetLinkId)).size!==currentTargets.size)fail('target crosswalk no longer matches site');
  const targetById=new Map(canonical.controls.flatMap(c=>c.targets.map(t=>[t.id,{...t,controlId:c.id}])));
  const wholeRiskTargets=[];
  for(const t of crosswalk.targets) {
    const site=targetById.get(t.sourceTargetLinkId);
    // The existing no-code parity import represents top events as whole-risk
    // links. Retain that explicit crosswalk; never infer a cause/effect target.
    const wholeRiskEvent=site.type==='event'&&!t.nrElementId&&!t.nrElementType;
    if(riskMap[t.nrRiskId]!==site.riskId||controlMap[t.nrControlId]!==site.controlId||t.nrElementType!==site.type&&!wholeRiskEvent)fail('target crosswalk connects the wrong risk, control or type');
    if(wholeRiskEvent)wholeRiskTargets.push(t.sourceTargetLinkId);
  }
  for(const m of crosswalk.processMappings) {check(m.nrRiskId,risks,'mapped risk');check(m.nrChartId,charts,'mapped process');if(!m.nrNodeId)fail('missing process node');}
  const expected=new Set(crosswalk.targets.map(t=>tuple({controlId:t.nrControlId,riskId:t.nrRiskId,elementId:t.nrElementId,elementType:t.nrElementType})));
  const actual=new Set(relations.risk_controls.map(tuple));
  const expectedNodes=new Set(crosswalk.processMappings.map(r=>[r.nrRiskId,r.nrChartId,r.nrNodeId].join('|')));
  const actualNodes=new Set(relations.cause_effect_node_mappings.map(r=>[r.riskId,r.chartId,r.nodeId].join('|')));
  const difference=(a,b)=>[...a].filter(x=>!b.has(x));
  const changes={missingTargets:difference(expected,actual),additionalTargets:difference(actual,expected),
    duplicateTargets:relations.risk_controls.length-actual.size,missingProcessNodes:difference(expectedNodes,actualNodes),additionalProcessNodes:difference(actualNodes,expectedNodes)};
  const pair=r=>[riskMap[r.riskId],controlMap[r.controlId]].join('|');
  const sitePairs=new Set(canonical.controls.flatMap(c=>c.riskIds.map(r=>[r,c.id].join('|'))));
  const nrPairs=new Set(relations.risk_controls.map(pair));
  const missingRiskControlPairs=difference(sitePairs,nrPairs),additionalRiskControlPairs=difference(nrPairs,sitePairs);
  return {status:Object.values(changes).every(v=>Array.isArray(v)?!v.length:v===0)&&!missingRiskControlPairs.length&&!additionalRiskControlPairs.length?'matched':'review_required',
    counts:Object.fromEntries(names.map(n=>[n,relations[n].length])),...changes,wholeRiskEventTargets:wholeRiskTargets,
    missingRiskControlPairs,additionalRiskControlPairs,
    note:'Current nr links and site links are archived separately; this import never rewrites either.'};
}

export function convertCardinalBundle(bundle,crosswalk,canonical,relations,{controlBasis='residual_implemented_controls',lossCache=null}={}) {
  if(bundle.schemaVersion!==1||bundle.kind!=='cardinal_site_bridge'||bundle.sourceOrigin!=='https://nr.getcardinal.io'||!bundle.completedAt)fail('invalid or incomplete export bundle');
  if(!bases.includes(controlBasis))fail('select an explicit inherent or residual basis');
  const config=bundle.config;
  if(config.mappingVersion!==canonical.mappingVersion)fail('site mapping changed since export');
  const documents=bundle.documents.filter(d=>d.encoding==='trpc-superjson').map(d=>({...d,data:decodeDocument(d)}));
  const find=(name,predicate=()=>true)=>documents.filter(d=>d.procedure===name&&predicate(d)).at(-1);
  const get=(name,predicate=()=>true)=>{const match=find(name,predicate);if(!match)fail(`missing ${name}`);return match;};
  const org=get('organizations.getCurrent').data;
  if(org.id!==config.orgId||org.slug!==config.orgSlug||crosswalk.orgId!==org.id)fail('organization mismatch');
  if(documents.some(d=>d.procedure==='organizations.getCurrent'&&(d.data.id!==org.id||d.data.slug!==org.slug)))fail('organization changed during export');
  const execution=get('execution.list').data.find(e=>e.id===config.executionId);
  if(execution?.status!=='completed'||execution.experimentId!==config.experimentId)fail('execution is not completed in selected experiment');
  const frozen=get('execution.getScope').data;
  if(!frozen?.scopeHash||!frozen.scopeSnapshotId||!(frozen.horizonYears>0))fail('frozen scope missing');
  for(const d of documents) {
    if(['execution.list','execution.getScope'].includes(d.procedure)&&d.input?.executionId!==config.executionId)fail('document execution mismatch');
    if(['experiments.getGraph','runs.exportList','runs.list'].includes(d.procedure)&&(d.input?.experimentId!==config.experimentId||d.input?.executionId!==config.executionId))fail('document Run scope mismatch');
    if(d.procedure==='execution.getScope'&&(d.data.scopeHash!==frozen.scopeHash||d.data.scopeSnapshotId!==frozen.scopeSnapshotId))fail('frozen scope changed during export');
    if(d.procedure==='execution.list'&&!d.data.some(e=>e.id===config.executionId&&e.experimentId===config.experimentId&&e.status==='completed'))fail('execution changed during export');
    if(d.procedure.startsWith('analytics.')&&(d.input?.executionId!==config.executionId||d.input?.experimentId!==config.experimentId))fail('analytics document selector mismatch');
  }
  const links=auditRelations(relations,crosswalk,canonical,org.id);
  const runDocuments=documents.filter(d=>d.procedure==='runs.getById');
  const runMap=new Map(runDocuments.map(d=>[d.data.id,d.data]));
  if(runMap.size!==runDocuments.length)fail('duplicate Run documents');
  if(runDocuments.some(d=>d.input?.id!==d.data.id))fail('Run request identity mismatch');
  const inventories=documents.filter(d=>d.procedure==='runs.exportList');
  const signature=rows=>stable(rows.map(r=>[r.id,r.status,r.version,r.completedAt]).sort((a,b)=>a[0].localeCompare(b[0])));
  if(inventories.some(d=>signature(d.data)!==signature(inventories[0].data)))fail('Run inventory changed during export');
  let listed=inventories.at(-1)?.data;
  if(!listed) {
    const pages=documents.filter(d=>d.procedure==='runs.list');const captures=[];let current=[];
    for(const page of pages) {
      if(page.input?.page===1&&current.length){captures.push(current);current=[];}
      if(page.input?.page!==current.length+1||page.data.pagination?.page!==page.input.page||!Array.isArray(page.data.items))fail('Run pagination mismatch');
      current.push(page);
    }
    if(current.length)captures.push(current);
    const lists=captures.map(pages=>{
      const rows=pages.flatMap(p=>p.data.items),total=pages[0].data.pagination.total;
      if(pages.at(-1).data.pagination.hasMore||rows.length!==total||pages.some((p,i)=>p.data.pagination.total!==total||p.data.pagination.hasMore!==(i<pages.length-1)))fail('incomplete Run pagination');
      return rows;
    });
    if(lists.some(l=>signature(l)!==signature(lists[0])))fail('Run inventory changed during export');
    listed=lists[0]||[];
  }
  if(!listed.length)fail('Run inventory missing');
  if(new Set(listed.map(r=>r.id)).size!==listed.length||listed.some(r=>r.executionId!==config.executionId||r.experimentId!==config.experimentId||r.status!=='completed'))fail('mixed or duplicate Run inventory');
  if(listed.some(r=>!runMap.has(r.id)))fail('listed Run missing from archive');
  for(const item of listed) {
    const run=runMap.get(item.id);
    if(run.version!==item.version||Date.parse(run.completedAt)!==Date.parse(item.completedAt))fail('Run content version differs from inventory');
  }
  for(const run of runMap.values()) {
    if(run.organizationId!==org.id||run.status!=='completed')fail('foreign or unfinished Run');
    if(run.executionId===config.executionId&&run.experimentId!==config.experimentId)fail('Run experiment mismatch');
    for(const id of [run.basisSiblingRunId,run.provenanceJson?.siblingRunId,run.provenanceJson?.controlScenario?.controlEffectsRunId,run.dataJsonb?.stats?.controlScenario?.controlEffectsRunId,...(run.inputRunIds||[]),...(run.provenanceJson?.inputRunIds||[])].filter(Boolean))if(!runMap.has(id))fail(`missing Run dependency ${id}`);
    const scopeHash=run.dataJsonb?.stats?.calibration?.scopeHash;
    if(run.executionId===config.executionId&&scopeHash&&scopeHash!==frozen.scopeHash)fail('Run frozen scope mismatch');
  }
  const select=(type,dimension)=>{const rows=[...runMap.values()].filter(r=>r.executionId===config.executionId&&r.controlBasis===controlBasis&&r.type===type&&(!dimension||r.dimension===dimension));if(rows.length>1)fail(`ambiguous ${type}; select an execution with one source per basis`);return rows[0];};
  const likelihood=select('risk_probability_rank'),impact=select('risk_impact_rank');
  const scopePredicate=d=>d.input?.controlBasis===controlBasis;
  const cached=lossCache||!find('analytics.riskPostureKpis',scopePredicate)?projectStoredLoss(lossCache,{config,frozen,runMap,
    likelihood:select('risk_exposure','likelihood'),impact:select('risk_exposure','impact'),riskIds:relations.risks.map(r=>r.id),controlBasis,sourceHash:sha256(stable(lossCache||bundle))}):null;
  const kpi=cached?.kpi||get('analytics.riskPostureKpis',scopePredicate).data;
  const analysis=find('analytics.controlAnalysis',scopePredicate)?.data||{};
  if(kpi.scope?.likelihoodRunId&&!likelihood||kpi.scope?.impactRunId&&!impact)fail('analytics basis lacks matching BTL source');
  for(const scope of [kpi.scope,analysis.scope].filter(Boolean)) {
    if(scope.executionId!==config.executionId||scope.experimentId!==config.experimentId||scope.currency!==frozen.currency)fail('analytics scope mismatch');
    for(const id of [scope.likelihoodRunId,scope.impactRunId].filter(Boolean))if(!runMap.has(id)||runMap.get(id).controlBasis!==controlBasis)fail('analytics source basis mismatch');
  }
  const dependsOn=(id,ancestor,seen=new Set())=>{if(seen.has(id))return false;seen.add(id);const r=runMap.get(id);return [...(r?.inputRunIds||[]),...(r?.provenanceJson?.inputRunIds||[])].some(p=>p===ancestor||dependsOn(p,ancestor,seen));};
  for(const [id,rank,dimension] of [[kpi.scope?.likelihoodRunId,likelihood,'likelihood'],[kpi.scope?.impactRunId,impact,'impact']])if(id) {
    const r=runMap.get(id);
    if(r.type!=='risk_exposure'||r.dimension!==dimension||r.executionId!==config.executionId||!rank||!dependsOn(id,rank.id))fail('Monte Carlo source lacks matching BTL input lineage');
  }
  if(analysis.scope&&['likelihoodRunId','impactRunId'].some(k=>analysis.scope[k]!==kpi.scope?.[k]))fail('control analysis and loss source pairs differ');
  const effectSource=analysis.costBenefit?.measurement?.runId;
  if(effectSource&&(runMap.get(effectSource)?.type!=='control_effects'||runMap.get(effectSource)?.executionId!==config.executionId))fail('control effect source mismatch');
  const sources=new Map(),specs=[];
  for(const doc of runDocuments) {
    const run=doc.data,raw={run,data:run.dataJsonb,provenance:run.provenanceJson,stats:run.statsJson};
    const inputRunIds=[...new Set([...(run.inputRunIds||[]),...(run.provenanceJson?.inputRunIds||[])])];
    const spec={runId:run.id,functionId:run.provenanceJson?.nodeId||`stored-${run.functionType}`,kind:'lineage',
      status:run.status,completedAt:run.completedAt,executionId:run.executionId,inputRunIds,
      sha256:sha256(stable(raw)),identityPaths:{runId:'run.id',orgId:'run.organizationId',executionId:'run.executionId',status:'run.status'}};
    if(run.id===likelihood?.id)Object.assign(spec,{kind:'btl_likelihood',recordPath:'data.ranks',absolute:{valuePath:'absolute.point',unit:'probability'}});
    if(run.id===impact?.id)Object.assign(spec,{kind:'btl_impact',recordPath:'data.ranks',absolute:{valuePath:'absolute.point',unit:`${frozen.currency}_per_event`}});
    if(run.id===kpi.scope?.likelihoodRunId&&likelihood)Object.assign(spec,{kind:'monte_carlo_likelihood',adapter:'cardinal_occurrence_v2',unit:'probability',calibrationRunId:likelihood.id});
    if(run.id===kpi.scope?.impactRunId)Object.assign(spec,{kind:'monte_carlo_impact',adapter:'cardinal_impact_exposure',recordPath:'data.exposures',unit:`${frozen.currency}_per_event`});
    if(run.type==='control_effects') {
      // No arbitrary selection between multiple measured effect sets.
      if(analysis.costBenefit?.measurement?.runId===run.id)Object.assign(spec,{kind:'control_effects',recordPath:'data.effects'});
    }
    sources.set(run.id,raw);specs.push(spec);
  }
  // Explicitly document reused upstream Runs from another execution.
  const depends=(id,ancestor,seen=new Set())=>{if(seen.has(id))return false;seen.add(id);return specs.find(s=>s.runId===id)?.inputRunIds.some(p=>p===ancestor||depends(p,ancestor,seen));};
  for(const spec of specs)if(spec.executionId!==config.executionId)spec.upstreamOf=specs.filter(t=>t.executionId===config.executionId&&depends(t.runId,spec.runId)).map(t=>t.runId);
  const manifest={schemaVersion:1,editionId:`cardinal-${config.executionId}-${controlBasis}`,label:execution.name,
    orgId:org.id,experimentId:config.experimentId,executionId:config.executionId,mappingVersion:canonical.mappingVersion,
    currency:frozen.currency,horizonYears:frozen.horizonYears,scope:{description:frozen.scopeStatement,exposureBasis:frozen.exposureStatement},runs:specs};
  const result=convertRuns(manifest,sources,canonical,crosswalk);
  const snapshot=result.snapshot,rows=new Map(snapshot.risks.map(r=>[r.riskId,r]));
  const mapRisk=id=>{if(!crosswalk.risks[id])fail(`unknown risk ${id}`);return crosswalk.risks[id];};
  const mapControl=id=>{if(!crosswalk.controls[id])fail(`unknown control ${id}`);return crosswalk.controls[id];};
  const riskPages=cached?.riskPages||documents.filter(d=>d.procedure==='risks.list').sort((a,b)=>a.input.page-b.input.page);
  const seen=new Set(),availability=[];
  const basisKey=controlBasis==='inherent_no_controls'?'inherent':'residual';
  for(let i=0;i<riskPages.length;i++) {
    const page=riskPages[i];
    if(page.input.page!==i+1||page.data.pagination.page!==i+1||page.data.pagination.total!==riskPages[0].data.pagination.total||page.data.pagination.hasMore!==(i<riskPages.length-1)||page.data.runScope?.executionId!==config.executionId||page.data.runScope?.experimentId!==config.experimentId)fail('incomplete risk pagination/scope mismatch');
    for(const record of page.data.items) {
      if(seen.has(record.id))fail('duplicate risk page item');seen.add(record.id);
      const id=mapRisk(record.id),m=record.measured?.[basisKey];if(!m)fail('missing measurement state');
      const row=rows.get(id)||{riskId:id};rows.set(id,row);
      availability.push({riskId:id,mean:m.expectedAnnualLoss.kind,median:m.annualLossMedian.kind,reason:m.expectedAnnualLoss.reason||null});
      const mean=value(m.expectedAnnualLoss),median=value(m.annualLossMedian),p90=value(m.annualLossP90);
      if(mean!==null||median!==null) {
        const runId=kpi.scope?.likelihoodRunId;if(!runMap.has(runId))fail('loss result without source Run');
        const summary={unit:frozen.currency,horizonYears:1,definition:'Årlig monetär förlust från Cardinals förlustmodell',runId,sourceDocumentSha256:page.sha256};
        if(mean!==null) {summary.mean=number(mean,'annual mean');row.expectedLoss={value:mean,horizonYears:1,method:'exported_loss_mean',runId};}
        if(median!==null)summary.median=number(median,'annual median');
        if(p90!==null)summary.p90=number(p90,'annual P90');
        if(cached?.summaries.has(record.id))summary.simulatedMean=number(cached.summaries.get(record.id).simulatedMean,'annual simulated mean');
        row.summaries={...row.summaries,expectedLoss:summary};
      }
    }
  }
  if(!riskPages.length||riskPages.at(-1).data.pagination.hasMore||seen.size!==riskPages[0].data.pagination.total)fail('incomplete risk register capture');
  snapshot.risks=[...rows.values()];
  snapshot.provenance.assessmentHorizonYears=frozen.horizonYears;
  snapshot.provenance.horizonYears=1;
  snapshot.provenance.controlBasis=controlBasis;
  snapshot.provenance.scopeSnapshotId=frozen.scopeSnapshotId;snapshot.provenance.scopeHash=frozen.scopeHash;
  snapshot.provenance.bridge={source:'nr.getcardinal.io',capturedAt:bundle.completedAt,bundleSha256:sha256(stable(bundle)),responseModelValidated:kpi.scope?.responseModelValidated===true,
    lossSource:cached?'stored_loss_cache':'legacy_analytics_export',...(lossCache?{lossCacheSha256:sha256(stable(lossCache)),lossModelId:cached.modelId}:{})};
  const distribution=cached?cached.distribution:get('analytics.portfolioLossDistribution',scopePredicate).data;
  const projection=cached?cached.projection:get('analytics.costProjection',scopePredicate).data;
  const losses=snapshot.risks.filter(r=>r.summaries?.expectedLoss?.mean!=null);
  if(distribution) {
    if(distribution.risksIncluded!==losses.length||kpi.risksQuantified!==losses.length)fail('portfolio membership cannot be reconciled');
    const excluded=new Set((distribution.excludedRisks||[]).map(r=>mapRisk(r.riskId)));
    if(losses.some(r=>excluded.has(r.riskId)))fail('portfolio exclusions disagree with risk statistics');
    const annual=projection?.points?.find(p=>p.horizon===1);
    const mean=number(distribution.analyticalMean,'portfolio analytical mean'),median=number(distribution.percentiles?.p50,'portfolio median');
    const sum=losses.reduce((n,r)=>n+r.summaries.expectedLoss.mean,0);
    if(Math.abs(sum-mean)>Math.max(.01,mean*1e-8))fail('risk means do not reconcile with portfolio');
    if(annual&&(Math.abs(annual.analyticalMean-mean)>Math.max(.01,mean*1e-8)||annual.p50!==median))fail('projection and portfolio disagree');
    const runId=kpi.scope.likelihoodRunId;
    const bins=distribution.histogram.map(b=>({lower:b.binStart,upper:b.binEnd,count:Math.round(b.frequency*distribution.draws)}));
    for(let i=0;i<bins.length;i++)if(Math.abs(bins[i].count-distribution.histogram[i].frequency*distribution.draws)>1e-6)fail('histogram frequencies are not sample fractions');
    snapshot.portfolio={riskIds:losses.map(r=>r.riskId),expectedLoss:mean,runId,scopeDescription:frozen.scopeStatement,
      dependenceAssumption:'Cardinal loss model: independent risks, independent frequency and severity',
      summary:{mean,median,...(annual?{simulatedMean:number(annual.mean,'simulated mean')}:{}),unit:frozen.currency,horizonYears:1,definition:'Gemensamt simulerad årlig portföljförlust',runId},
      lossDistribution:{sampleCount:distribution.draws,p50:median,p95:distribution.percentiles.p95,bins,runId}};
  }
  snapshot.controlAnalysis={statistic:'mean',horizonYears:1,controlBasis,runId:analysis.costBenefit?.measurement?.runId||null,
    residualExpectedLoss:analysis.costBenefit?.residualExpectedLoss??null,inherentExpectedLoss:analysis.costBenefit?.inherentExpectedLoss??null,
    totalAttributedReduction:analysis.costBenefit?.totalAttributedReduction??null,
    controls:(analysis.costBenefit?.controls||[]).map(c=>({controlId:mapControl(c.controlId),attributedReduction:c.attributedReduction,
      risksWithMeasuredEffect:c.risksWithMeasuredEffect,risksListedWithoutCredit:c.risksListedWithoutCredit,
      annualCost:typeof c.annualCost==='number'&&Number.isFinite(c.annualCost)&&c.annualCost>0?c.annualCost:null,
      costStatus:typeof c.annualCost==='number'&&Number.isFinite(c.annualCost)&&c.annualCost>0?'known':'unknown'})),
    interpretation:'Attributed allocation, not marginal toggle effects; technical zero costs are unknown.'};
  validateMeasurement(snapshot,canonical.risks.map(r=>r.risk_id),canonical.controls.map(c=>c.id));
  const statistics=Object.fromEntries(['likelihood','impact','expectedLoss'].map(d=>[d,Object.fromEntries(['mean','median'].map(s=>[s,snapshot.risks.filter(r=>riskStatistic(r,d,s)).length]))]));
  const blockers=[];
  if(cached?.missing)blockers.push('stored_annual_loss_missing');
  if(!analysis.scope)blockers.push('control_analysis_missing');
  if(links.status!=='matched')blockers.push('relationship_changes_require_review');
  if(kpi.simulationPending||availability.some(r=>r.median==='pending'))blockers.push('annual_loss_simulation_pending');
  const allocated=snapshot.controlAnalysis.controls.reduce((sum,c)=>sum+(c.attributedReduction??0),0);
  const total=snapshot.controlAnalysis.totalAttributedReduction;
  const controlReconciliation={allocated,total,difference:total==null?null:total-allocated};
  if(total!=null&&Math.abs(total-allocated)>Math.max(.01,total*1e-8))blockers.push('control_attribution_total_does_not_reconcile');
  snapshot.provenance.bridge.activationBlockers=blockers;
  const report={editionId:manifest.editionId,status:blockers.length?'review_required':'validated',activationBlockers:blockers,
    controlBasis,scopeRiskCount:frozen.riskCount,registerRiskCount:seen.size,statistics,availability,links,controlReconciliation,
    annualLossModelVersion:distribution?.lossModelVersion||null,portfolioAvailable:!!distribution,
    noNewMeasurements:true,lossSource:snapshot.provenance.bridge.lossSource,rawRunCount:runMap.size,controlEffects:snapshot.controls.reduce((n,c)=>n+c.effects.length,0),
    scenarios:'Raw scenario selections and Runs preserved; no marginal effects inferred from attributed benefits.'};
  return {snapshot,report,sources};
}

export function importCardinalPackage(bundlePath,crosswalkPath,output,options={}) {
  const out=resolve(output),rel=relative(join(root,'work'),out);
  if(!rel||rel.startsWith('..')||rel.startsWith('/'))fail('candidate must be under private work/');
  if(existsSync(out))fail('candidate directory already exists; use a new edition directory');
  const bundle=read(bundlePath),crosswalk=read(crosswalkPath);
  const zipDocs=bundle.documents.filter(d=>d.procedure==='export/risk-management');
  if(zipDocs.length!==1||zipDocs[0].encoding!=='base64-zip'||sha256(zipDocs[0].body)!==zipDocs[0].sha256)fail('missing or invalid full relationship backup');
  mkdirSync(out,{recursive:true,mode:0o700});
  writeFileSync(join(out,'relationships.zip'),Buffer.from(zipDocs[0].body,'base64'),{mode:0o600});
  copyFileSync(bundlePath,join(out,'bridge-bundle.json'));copyFileSync(crosswalkPath,join(out,'crosswalk.json'));
  const parsed=spawnSync('python3',[join(root,'scripts/read-cardinal-relations.py'),join(out,'relationships.zip')],{encoding:'utf8',maxBuffer:128*1024*1024});
  if(parsed.status!==0)fail(`relationship archive could not be read: ${parsed.stderr}`);
  const lossCache=options.lossCachePath?read(options.lossCachePath):null;
  const result=convertCardinalBundle(bundle,crosswalk,canonicalContext(),JSON.parse(parsed.stdout),{...options,lossCache});
  if(lossCache)writeFileSync(join(out,'loss-cache.json'),stable(lossCache),{mode:0o600});
  mkdirSync(join(out,'raw'));
  for(const [id,raw] of result.sources)writeFileSync(join(out,'raw',`${id}.json`),stable(raw),{mode:0o600});
  writeFileSync(join(out,'measurement.json'),JSON.stringify(result.snapshot,null,2)+'\n');
  const archiveChecksums=Object.fromEntries(['crosswalk.json','relationships.zip'].map(name=>[name,sha256(readFileSync(join(out,name)))]));
  writeFileSync(join(out,'validation.json'),JSON.stringify({...result.report,archiveChecksums,projectionSha256:sha256(stable(result.snapshot))},null,2)+'\n');
  return result.report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [command,bundle,crosswalk,output,...args]=process.argv.slice(2),options={};
    if(command!=='inspect'||!bundle||!crosswalk||!output)fail('Usage: import-cardinal.mjs inspect bundle.json crosswalk.json work/candidate [--basis basis] [--loss-cache cache.json]');
    for(let i=0;i<args.length;i++) {
      if(args[i]==='--loss-cache'&&args[i+1])options.lossCachePath=args[++i];
      else if(args[i]==='--basis'&&args[i+1])options.controlBasis=args[++i];
      else if(i===0&&bases.includes(args[i]))options.controlBasis=args[i];
      else fail('Unknown or incomplete import option');
    }
    console.log(JSON.stringify(importCardinalPackage(bundle,crosswalk,output,options),null,2));
  } catch(error){console.error(error.message);process.exitCode=1;}
}

#!/usr/bin/env node
/** Offline only. Full private Runs -> inspected candidate -> explicit activation.
 * Native exports change; recordPath/fields are declared in the manifest, never guessed.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateMeasurement } from '../Artefakt_C_Riskregister/_build/measurement_model.mjs';
import { createRankingModel } from '../Artefakt_C_Riskregister/_build/btl_ranking.mjs';
import { createExplorationData } from '../Artefakt_C_Riskregister/_build/exploration_model.mjs';
import { loadAuthorityPackage } from '../Artefakt_C_Riskregister/_build/authority_controls.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const digest = value => sha256(JSON.stringify(value));
const fail = message => { throw new Error(`Runs-import: ${message}`); };
export function field(value, path) {
  if (!path || path === '$') return value;
  return path.split('.').reduce((v,key)=>v == null ? undefined : v[key], value);
}
function inside(base, name) {
  const candidate = resolve(base, name), rel = relative(base,candidate);
  if (isAbsolute(name) || rel.startsWith('..') || isAbsolute(rel)) fail('filer måste ligga inom importpaketet');
  return candidate;
}
export function canonicalContext() {
  const risks = read(join(root,'Artefakt_C_Riskregister/Artefakt_C_riskregister.json'));
  const curations = read(join(root,'Artefakt_C_Riskregister/_build/exploration_curations.json'));
  const exploration = createExplorationData(risks,curations,loadAuthorityPackage());
  return { risks, controls:exploration.controls, mappingVersion:digest(exploration.controls.map(c=>({id:c.id,targets:c.targets}))) };
}

export function convertRuns(manifest, sources, canonical, crosswalk={risks:{},controls:{}}) {
  if (manifest.schemaVersion !== 1 || !manifest.editionId || !manifest.executionId || !manifest.experimentId || !manifest.orgId) fail('manifestets identiteter/formatversion saknas');
  if (manifest.mappingVersion !== canonical.mappingVersion) fail('kontrollkopplingarnas version har ändrats; exportera nytt importunderlag');
  const riskIds = canonical.risks.map(r=>r.risk_id), controlIds = canonical.controls.map(c=>c.id);
  const riskSet = new Set(riskIds), controlSet = new Set(controlIds);
  const riskRows = new Map(), controlRows = new Map(), sourceRisks = new Map(), sourceControls = new Map();
  const getRisk = id => { if (!riskRows.has(id)) riskRows.set(id,{riskId:id}); return riskRows.get(id); };
  const mapId = (id, type) => {
    const mapped = crosswalk[type]?.[id] || id, allowed = type==='risks'?riskSet:controlSet;
    if (!allowed.has(mapped)) fail(`ingen explicit ${type}-match för ${id}`);
    const seen = type==='risks'?sourceRisks:sourceControls;
    if (seen.has(mapped) && seen.get(mapped)!==id) fail(`flera käll-ID matchar ${mapped}`);
    seen.set(mapped,id); return mapped;
  };
  const runs = [], rankEntries = [], diagnostics = [], scenarios = [];
  let rankingRun = null, portfolio = null;
  for (const spec of manifest.runs || []) {
    const raw = sources.get(spec.runId);
    if (!raw) fail(`Run saknas: ${spec.runId}`);
    if (!/^[a-zA-Z0-9_-]+$/.test(spec.runId||'') || !spec.functionId || spec.status !== 'completed' || !Number.isFinite(Date.parse(spec.completedAt)) || !spec.sha256) fail(`ofullständig Run: ${spec.runId}`);
    if (spec.currency && spec.currency !== manifest.currency || spec.horizonYears != null && spec.horizonYears !== manifest.horizonYears) fail('Run använder annan valuta eller period');
    // Verify exported envelope fields when available. Never execute exported content.
    for (const [key,path] of Object.entries(spec.identityPaths || {})) {
      const expected = spec[key] ?? manifest[key];
      if (!['runId','functionId','executionId','experimentId','orgId','status','modelVersion','calibrationVersion'].includes(key) || expected==null || field(raw,path) !== expected) fail(`${spec.runId}: ${key} avviker från exporten`);
    }
    runs.push({runId:spec.runId,functionId:spec.functionId,kind:spec.kind,executionId:spec.executionId || manifest.executionId,status:spec.status,completedAt:spec.completedAt,sha256:spec.sha256,inputRunIds:spec.inputRunIds || [],upstreamOf:spec.upstreamOf || [],modelVersion:spec.modelVersion || null,calibrationVersion:spec.calibrationVersion || null});
    const provenance = {runId:spec.runId};
    const records = field(raw,spec.recordPath || '$');
    if (['btl_likelihood','btl_impact'].includes(spec.kind)) {
      if (!Array.isArray(records)) fail(`${spec.runId}: recordPath måste peka på ranks-listan`);
      const seen = new Set();
      for (const record of records) {
        const sourceId = field(record,spec.fields?.riskId || 'riskId');
        const riskId = mapId(sourceId,'risks');
        if (seen.has(riskId)) fail(`dubblerad risk i Run ${riskId}`); seen.add(riskId);
        const row = getRisk(riskId), dimension = spec.kind==='btl_likelihood'?'likelihood':'impact';
        if (dimension==='likelihood') rankEntries.push({riskId,sourceRiskId:sourceId,rank:field(record,spec.fields?.rank || 'rank'),score:field(record,spec.fields?.score || 'score'),uncertainty:field(record,spec.fields?.uncertainty || 'uncertainty') ?? null});
        const a = spec.absolute;
        if (!a) { diagnostics.push({riskId,dimension,status:'relative_only'}); continue; }
        const eligible = field(record,a.eligiblePath || 'eligibleForAbsolute') === true;
        const status = field(record,a.calibrationStatusPath || 'calibrationStatus');
        const value = field(record,a.valuePath);
        if (!eligible || status !== 'anchor_scaled' || typeof value !== 'number' || !Number.isFinite(value)) {
          diagnostics.push({riskId,dimension,status:'absolute_unavailable',calibrationStatus:typeof status==='string'?status:null}); continue;
        }
        if (row[dimension]) fail(`flera absoluta ${dimension}-resultat för ${riskId}`);
        row[dimension]={value,unit:a.unit,statistic:a.statistic||null,horizonYears:manifest.horizonYears,eligible:true,calibrationStatus:status,...provenance};
        const interval = a.interval90Path && field(record,a.interval90Path);
        if (Array.isArray(interval)) row[dimension].interval90 = interval;
      }
      if (spec.kind==='btl_likelihood') { if(rankingRun)fail('välj en enda likelihood-rankning'); rankingRun=spec; }
    } else if (spec.kind==='monte_carlo_loss') {
      // Only monetary LOSS distributions. Likelihood/impact MC draws are not losses.
      if (spec.unit !== manifest.currency || spec.horizonYears !== manifest.horizonYears || !spec.lossDefinition || !Array.isArray(records)) fail('MC måste uttryckligen vara monetär förlust med rätt period och definition');
      for (const record of records) {
        const riskId = mapId(field(record,spec.fields?.riskId || 'riskId'),'risks'), row=getRisk(riskId);
        if (row.lossDistribution) fail(`dubblerad MC för ${riskId}`);
        row.lossDistribution = pickDistribution(record,spec.fields,provenance);
        const mean=field(record,spec.fields?.mean || 'mean');
        if (typeof mean !== 'number') fail('MC saknar exporterad förlustmedelpunkt');
        row.expectedLoss={value:mean,horizonYears:manifest.horizonYears,method:'exported_loss_mean',...provenance};
        if(spec.fields?.sensitivity){
          const s=field(record,spec.fields.sensitivity);
          row.sensitivity={method:s.method,items:s.items.map(i=>({label:i.label,value:i.value})),...provenance};
        }
      }
    } else if (spec.kind==='control_effects') {
      if (!Array.isArray(records)) fail('kontrolleffekter måste vara en lista');
      for (const record of records) {
        const controlId=mapId(field(record,spec.fields?.controlId || 'controlId'),'controls');
        const riskId=mapId(field(record,spec.fields?.riskId || 'riskId'),'risks');
        if (!canonical.controls.find(c=>c.id===controlId)?.riskIds.includes(riskId)) fail(`effekt saknar kanonisk kontrollkoppling: ${controlId} → ${riskId}`);
        if(!controlRows.has(controlId))controlRows.set(controlId,{controlId,effects:[]});
        const dimension=field(record,spec.fields?.dimension || 'dimension');
        if(controlRows.get(controlId).effects.some(e=>e.riskId===riskId&&e.dimension===dimension))fail('dubblerad kontrolleffektdimension');
        controlRows.get(controlId).effects.push({riskId,dimension,delta:field(record,spec.fields?.delta || 'delta'),status:field(record,'status') || 'exported',scale:'latent',...provenance});
      }
    } else if (spec.kind==='portfolio_loss') {
      if(portfolio)fail('välj en enda referensportfölj');
      if(spec.unit!==manifest.currency||spec.horizonYears!==manifest.horizonYears)fail('portföljens enhet eller period avviker');
      const a=records;
      portfolio={riskIds:(field(a,spec.fields?.riskIds || 'riskIds')||[]).map(id=>mapId(id,'risks')),expectedLoss:field(a,spec.fields?.mean || 'mean'),scopeDescription:manifest.scope?.description,dependenceAssumption:spec.dependenceAssumption,lossDistribution:spec.distribution===false?null:pickDistribution(a,spec.fields,provenance),...provenance};
    } else if (spec.kind==='scenarios') {
      if(spec.unit!==manifest.currency||spec.horizonYears!==manifest.horizonYears||!Array.isArray(records))fail('scenarier måste ha rätt enhet och period');
      for (const s of records) {
        // Deliberate whitelist: raw NR records may contain private text/prompts.
        scenarios.push({id:s.id,title:s.title,controlIds:(s.controlIds||[]).map(id=>mapId(id,'controls')),riskIds:(s.riskIds||[]).map(id=>mapId(id,'risks')),referenceExpectedLoss:s.referenceExpectedLoss,residualExpectedLoss:s.residualExpectedLoss,controlCost:s.costStatus==='known'?s.controlCost:null,method:s.method,overlapTreatment:s.overlapTreatment,contributions:(s.contributions||[]).map(c=>({controlId:mapId(c.controlId,'controls'),reduction:c.reduction})),riskEffects:(s.riskEffects||[]).map(e=>({riskId:mapId(e.riskId,'risks'),referenceExpectedLoss:e.referenceExpectedLoss,residualExpectedLoss:e.residualExpectedLoss})),...provenance});
      }
    } else if (['monte_carlo_likelihood','monte_carlo_impact','lineage'].includes(spec.kind)) {
      diagnostics.push({runId:spec.runId,status:'archived_only',reason:'Inte en monetär förlustfördelning; råfilen bevaras lokalt.'});
    } else fail(`okänt Run-format ${spec.kind}; lägg till en granskad adapter`);
  }
  for(const rule of manifest.expectedLossRules || []) {
    if(rule.method!=='product_of_means'||rule.assumption!=='independent_frequency_and_severity')fail('förlustberäkning kräver explicit godkänt antagande');
    const riskId=mapId(rule.riskId,'risks'), r=getRisk(riskId);
    if(r.expectedLoss)fail('förlust får inte skrivas över');
    if(!r.likelihood||!r.impact)fail(`förlustregel saknar absoluta indata för ${riskId}`);
    r.expectedLoss={value:r.likelihood.value*r.impact.value*(r.likelihood.unit==='events_per_year'?manifest.horizonYears:1),horizonYears:manifest.horizonYears,method:rule.method,assumption:rule.assumption,runId:r.likelihood.runId,inputRunIds:[r.likelihood.runId,r.impact.runId]};
  }
  const snapshot={schemaVersion:1,status:'ready',editionId:manifest.editionId,mappingVersion:manifest.mappingVersion,provenance:{orgId:manifest.orgId,experimentId:manifest.experimentId,executionId:manifest.executionId,label:manifest.label||manifest.editionId,currency:manifest.currency,horizonYears:manifest.horizonYears,scope:{description:manifest.scope?.description,exposureBasis:manifest.scope?.exposureBasis},runs},risks:[...riskRows.values()],controls:[...controlRows.values()],portfolio,scenarios};
  if(rankingRun) snapshot.ranking={run:{id:rankingRun.runId,name:manifest.label||manifest.editionId,label:manifest.label||manifest.editionId,completedAt:rankingRun.completedAt,experimentName:manifest.experimentId,executionName:manifest.label||manifest.executionId,sourceUrl:rankingRun.sourceUrl||null},entries:rankEntries};
  validateMeasurement(snapshot,riskIds,controlIds);
  if(snapshot.ranking)createRankingModel(canonical.risks,snapshot.ranking);
  return {snapshot,report:{editionId:manifest.editionId,riskCount:riskIds.length,controlCount:controlIds.length,ranked:rankEntries.length,absoluteLikelihood:snapshot.risks.filter(r=>r.likelihood).length,absoluteImpact:snapshot.risks.filter(r=>r.impact).length,lossQuantified:snapshot.risks.filter(r=>r.expectedLoss).length,withLossDistribution:snapshot.risks.filter(r=>r.lossDistribution).length,controlsWithLatentEffects:snapshot.controls.length,scenarios:scenarios.length,missingRiskIds:riskIds.filter(id=>!riskRows.get(id)?.expectedLoss),missingControlIds:controlIds.filter(id=>!controlRows.has(id)),diagnostics}};
}
function pickDistribution(record,fields={},provenance) {
  const bins=field(record,fields?.bins || 'bins');
  return {sampleCount:field(record,fields?.sampleCount || 'sampleCount'),p50:field(record,fields?.p50 || 'p50'),p95:field(record,fields?.p95 || 'p95'),bins:Array.isArray(bins)?bins.map(b=>({lower:b.lower,upper:b.upper,count:b.count})):null,...provenance};
}
export function importPackage(manifestPath, outputDirectory) {
  const manifest=read(manifestPath), base=dirname(resolve(manifestPath)), sources=new Map();
  const canonical=canonicalContext();
  for(const spec of manifest.runs || []) {
    const data=readFileSync(inside(base,spec.file));
    if(sha256(data)!==spec.sha256)fail(`checksum stämmer inte: ${spec.file}`);
    if(sources.has(spec.runId))fail('dubbelt Run-ID');
    sources.set(spec.runId,JSON.parse(data.toString('utf8')));
  }
  const crosswalk=manifest.crosswalkFile?read(inside(base,manifest.crosswalkFile)):{risks:{},controls:{}};
  const result=convertRuns(manifest,sources,canonical,crosswalk);
  const out=resolve(outputDirectory);
  if(!relative(join(root,'work'),out).startsWith('..') && out!==join(root,'work')) {
    mkdirSync(out,{recursive:true});mkdirSync(join(out,'raw'),{recursive:true});
    for(const spec of manifest.runs)copyFileSync(inside(base,spec.file),join(out,'raw',`${spec.runId}.json`));
    copyFileSync(manifestPath,join(out,'manifest.json'));
    if(manifest.crosswalkFile)copyFileSync(inside(base,manifest.crosswalkFile),join(out,'crosswalk.json'));
    writeFileSync(join(out,'archive-manifest.json'),JSON.stringify({...manifest,...(manifest.crosswalkFile?{crosswalkFile:'crosswalk.json'}:{}),runs:manifest.runs.map(r=>({...r,file:`raw/${r.runId}.json`}))},null,2)+'\n');
    writeFileSync(join(out,'measurement.json'),JSON.stringify(result.snapshot,null,2)+'\n');
    writeFileSync(join(out,'validation.json'),JSON.stringify({...result.report,projectionSha256:digest(result.snapshot)},null,2)+'\n');
  } else fail('kandidaten ska sparas i ignorerade work/');
  return result.report;
}
export function verifyCandidate(directory) {
  const canonical=canonicalContext(), snapshot=read(join(directory,'measurement.json')), report=read(join(directory,'validation.json'));
  if(snapshot.mappingVersion!==canonical.mappingVersion||digest(snapshot)!==report.projectionSha256)fail('kandidaten har ändrats sedan valideringen');
  validateMeasurement(snapshot,canonical.risks.map(r=>r.risk_id),canonical.controls.map(c=>c.id));
  if(snapshot.ranking)createRankingModel(canonical.risks,snapshot.ranking);
  for(const run of snapshot.provenance.runs)if(sha256(readFileSync(join(directory,'raw',`${run.runId}.json`)))!==run.sha256)fail('arkiverad råfil har ändrats efter granskning');
  return snapshot;
}
export function activateCandidate(directory) {
  const snapshot=verifyCandidate(directory);
  const target=join(root,'publication/measurement.json');
  // Preserve the previous edition and the report manuscript, including reviewed prose.
  mkdirSync(join(root,'work/measurement-history'),{recursive:true});
  if(existsSync(target))copyFileSync(target,join(root,'work/measurement-history',`${Date.now()}.json`));
  writeFileSync(target,JSON.stringify(snapshot,null,2)+'\n');
  return {editionId:snapshot.editionId,status:'activated_locally',report:'Report edition is unchanged; create/review a new report draft explicitly.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [command,input,out]=process.argv.slice(2);
    if(command==='inspect')console.log(JSON.stringify(importPackage(resolve(input),out||join(root,'work/measurement-candidate')),null,2));
    else if(command==='activate')console.log(JSON.stringify(activateCandidate(resolve(input)),null,2));
    else if(command==='mapping-version')console.log(canonicalContext().mappingVersion);
    else {console.log('Usage: node scripts/import-runs.mjs inspect <manifest.json> [work/candidate]\n       node scripts/import-runs.mjs activate <work/candidate>\n       node scripts/import-runs.mjs mapping-version');process.exitCode=1;}
  }catch(error){console.error(error.message);process.exitCode=1;}
}

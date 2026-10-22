#!/usr/bin/env node
// Independent arithmetic audit. Deliberately imports no publication math/model helper.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const finite=x=>typeof x==='number'&&Number.isFinite(x);
const nonnegative=x=>finite(x)&&x>=0;
const equal=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=Math.max(1e-7,Math.abs(b)*1e-9);
const unique=xs=>[...new Set(xs)];
const structuralCodes=new Set(['population_mismatch','event_population_ambiguity','exposure_volume_conflict','source_ineligible','outside_execution']);
const dimensions=['likelihood','impact'];
const sum=(rows,key)=>rows.reduce((s,r)=>s+r[key],0);

export function parseRegisterCsv(text){
 const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(Boolean))rows.push(row);row=[];value='';}else value+=c;}
 if(value||row.length){row.push(value);rows.push(row);}if(quoted)throw Error('Unclosed CSV field');
 const headers=rows.shift()||[];return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
}

export function auditPublication({measurement:m,sourceReview:a,exploration:e,register,generatedAt=null,inputHashes={}}){
 generatedAt=generatedAt||a.reviewedAt||m.provenance.completedAt?.slice(0,10)||null;
 const errors=[],warnings=[];
 const issue=(code,entityId,detail)=>errors.push({code,entityId,detail});
 const check=(condition,code,entityId,detail)=>{if(!condition)issue(code,entityId,detail);};
 const idMap=(rows,key,label)=>{const map=new Map();for(const r of rows){if(map.has(r[key]))issue('duplicate_id',key==='runId'?null:r[key],label);map.set(r[key],r);}return map;};
 const canonical=idMap(register,'risk_id','riskregister'),risks=idMap(m.risks,'riskId','measurement risks'),controls=idMap(e.controls,'id','canonical controls'),measured=idMap(m.controls,'controlId','measurement controls'),reviews=idMap(a.entries,'riskId','source reviews'),runs=idMap(m.provenance.runs,'runId','run provenance');
 check(m.provenance.currency==='SEK'&&m.provenance.horizonYears===1,'unsupported_units',null,'Audit is defined for annual SEK indicators.');
 check(m.provenance.controlBasis==='inherent_no_controls','baseline',null,'Controls require an inherent baseline.');
 check(a.sourceSnapshotSha256===m.provenance.sourceSnapshotSha256,'source_snapshot_mismatch',null,'The audit must refer to the same frozen source snapshot.');
 check(a.intervalPoint==='arithmetic_midpoint','interval_policy',null,'Source intervals use the approved arithmetic midpoint.');
 for(const [id,r] of runs){check(r.status==='completed'&&r.executionId===m.provenance.executionId&&/^[a-f0-9]{64}$/i.test(r.sha256||''),'run_provenance',null,'A source run is incomplete, belongs to another execution or has no digest.');for(const parent of r.inputRunIds||[])check(runs.has(parent),'run_parent_missing',null,'A source run dependency is absent.');}
 const validRun=(id,entity)=>check(runs.has(id),'missing_run_provenance',entity,'A numerical source references an absent run.');
 for(const id of canonical.keys())check(risks.has(id),'risk_missing',id,'Canonical risk is absent from measurement.');
 for(const id of risks.keys())check(canonical.has(id),'risk_not_canonical',id,'Measurement risk is absent from register.');
 const sourceClasses={model_median:0,description_midpoint:0,description_point:0,adapted_historical_observation:0,other_source_estimate:0,undefined:0};
 const dimensionCounts={likelihood:{rawMean:0,rawMedian:0,publishedMean:0,publishedMedian:0},impact:{rawMean:0,rawMedian:0,publishedMean:0,publishedMedian:0}};
 const recomputed=new Map();
 const resultRisks=m.risks.map(r=>{
  const start=errors.length,id=r.riskId,review=reviews.get(id),pub=r.reviewedInputs||{},inputs={},raw={},missing=[];
  for(const dimension of dimensions){
   const s=r.summaries?.[dimension],original=dimension==='likelihood'?r.sourceStatistics?.likelihood:r.sourceStatistics?.impactBelief;
   raw[dimension]={median:nonnegative(original?.median)?original.median:null,mean:nonnegative(original?.mean)?original.mean:null};
   for(const stat of ['mean','median']){if(nonnegative(original?.[stat]))dimensionCounts[dimension][stat==='mean'?'rawMean':'rawMedian']++;if(nonnegative(s?.[stat])){dimensionCounts[dimension][stat==='mean'?'publishedMean':'publishedMedian']++;check(equal(s[stat],original?.[stat]),'raw_statistic_changed',id,`${dimension} ${stat} differs from its archived model statistic.`);}}
   if(original){validRun(original.runId,id);if(nonnegative(original.median)&&nonnegative(original.logStdDev)&&nonnegative(original.mean))check(equal(original.mean,original.median*Math.exp(original.logStdDev**2/2)),'lognormal_mean_mismatch',id,`${dimension} mean does not equal median × exp(log-sigma²/2).`);}
   if(s){validRun(s.runId,id);check(s.unit===(dimension==='likelihood'?'events_per_year':'SEK_per_event')&&s.horizonYears===1,'summary_units',id,dimension);}
   const d=review?.[dimension];let expected=null;
   if(d?.decision==='replace_range'){
    check(nonnegative(d.lower)&&nonnegative(d.upper)&&d.upper>=d.lower,'invalid_source_range',id,dimension);
    check(!!d.sourceQuote&&!!d.scope&&!!d.evidenceKind,'source_evidence_missing',id,dimension);
    check(d.unit===(dimension==='likelihood'?'events_per_year':'SEK_per_event'),'source_unit_mismatch',id,dimension);
    const basis=d.evidenceKind==='description_estimate'?'description_midpoint':/observ|histor/i.test(d.evidenceKind||'')?'adapted_historical_observation':'other_source_estimate';
    expected={value:(d.lower+d.upper)/2,lower:d.lower,upper:d.upper,basis,method:'source_range_midpoint'};
   }else if(d?.decision==='replace_point'){
    check(nonnegative(d.value)&&!!d.sourceQuote&&!!d.scope&&!!d.evidenceKind,'invalid_source_point',id,dimension);
    check(d.unit===(dimension==='likelihood'?'events_per_year':'SEK_per_event'),'source_unit_mismatch',id,dimension);
    const basis=d.evidenceKind==='description_estimate'?'description_point':/observ|histor/i.test(d.evidenceKind||'')?'adapted_historical_observation':'other_source_estimate';
    expected={value:d.value,lower:d.value,upper:d.value,basis,method:'source_point'};
   }else if(d?.decision!=='withhold'&&s?.eligible===true&&s.calibrationStatus==='anchor_scaled'&&nonnegative(s.median))expected={value:s.median,lower:s.median,upper:s.median,basis:'model_median',method:'model_median'};
   inputs[dimension]=expected;
   sourceClasses[expected?.basis||'undefined']++;
   if(expected){check(!!pub[dimension]&&equal(pub[dimension].value,expected.value)&&equal(pub[dimension].lower,expected.lower)&&equal(pub[dimension].upper,expected.upper)&&pub[dimension].method===expected.method&&pub[dimension].unit===(dimension==='likelihood'?'events_per_year':'SEK_per_event'),'reviewed_input_mismatch',id,dimension);if(expected.method!=='model_median')check(pub[dimension].sourceQuote===d.sourceQuote,'source_quote_changed',id,dimension);}
   else {check(pub[dimension]==null,'unexpected_reviewed_input',id,dimension);missing.push(`${dimension==='likelihood'?'Frekvens':'Kostnad per händelse'} saknar ett godkänt jämförbart punktvärde.`);}
  }
  const rawMedianProduct=nonnegative(raw.likelihood.median)&&nonnegative(raw.impact.median)?raw.likelihood.median*raw.impact.median:null;
  const rawMeanProduct=nonnegative(raw.likelihood.mean)&&nonnegative(raw.impact.mean)?raw.likelihood.mean*raw.impact.mean:null;
  if(r.centralCost){check(equal(r.centralCost.value,rawMedianProduct),'median_product_mismatch',id,'Published median product differs from independently multiplied raw medians.');for(const runId of r.centralCost.inputRunIds||[])validRun(runId,id);}
  if(r.expectedLoss){check(equal(r.expectedLoss.value,rawMeanProduct),'mean_product_mismatch',id,'Published mean product differs from independently multiplied raw means.');for(const runId of r.expectedLoss.inputRunIds||[])validRun(runId,id);}
  const blocked=(r.review||[]).some(f=>structuralCodes.has(f.code))||review?.decision==='withhold';
  const l=inputs.likelihood,i=inputs.impact;
  const cost=l&&i&&!blocked?{value:l.value*i.value,lower:l.lower*i.lower,upper:l.upper*i.upper}:null;
  if(cost)check(!!r.reviewedCost&&equal(r.reviewedCost.value,cost.value)&&equal(r.reviewedCost.lower,cost.lower)&&equal(r.reviewedCost.upper,cost.upper),'reviewed_product_mismatch',id,'Reviewed product or endpoint range differs from independent multiplication.');
  else check(r.reviewedCost==null,'withheld_value_ranked',id,'No comparable approved indicator exists.');
  recomputed.set(id,cost);
  if(!cost){missing.push(...(review?.missing||[]),...(r.review||[]).map(f=>f.reason).filter(Boolean));if(review?.reason)missing.push(review.reason);}
  const desc=r.descriptionReview;
  const outside=(r.review||[]).some(f=>f.code==='outside_execution');
  const reviewLevel=outside?'outside_execution':review?'source_review':desc?'description_screen':'arithmetic_only';
  const sanityAssessment=outside?'Risken finns i registret men ingick inte i det frysta mäturvalet. Numeriska modellvärden och kontrolleffekter kan därför inte återvinnas från den här mätningen.':review?(review.sanityAssessment||review.reason):desc?`${desc.assessment} Den här kontrollen avser beskrivningens numeriska innehåll och beräkningarnas överensstämmelse med indata. En individuell prövning mot representativ historisk statistik har inte genomförts i denna källgranskning.`:'Modellens arkiverade medelvärden och medianer samt de publicerade beräkningarna har räknats igenom. Risken har inte fått någon individuell källgranskning av nivåerna; aritmetisk överensstämmelse visar därför inte att frekvens och kostnad är representativa för faktiska händelser.';
  return {riskId:id,title:canonical.get(id)?.rubrik||'',nodeId:canonical.get(id)?.node_id||null,arithmeticChecked:true,arithmeticPassed:errors.length===start,reviewLevel,sanityAssessment,missing:cost?[]:unique(missing),reviewStatus:review?(review.decision==='replace_source'?'source_values_applied':review.decision==='withhold'?'source_review_withheld':'model_retained_after_source_review'):'no_individual_source_audit',sourceCoverage:{individualSourceReview:!!review,descriptionExtractionAvailable:!!desc,descriptionExtractionStatus:desc?.status||null,likelihoodBasis:l?.basis||'undefined',impactBasis:i?.basis||'undefined',adaptedHistoricalNumericInput:dimensions.some(d=>inputs[d]?.basis==='adapted_historical_observation'),empiricalValidationEstablished:false,qualification:'Räknekontrollen visar att publicerade tal följer angivna indata och regler. Den bekräftar inte att modellvärden eller beskrivningsskattningar motsvarar observerad historik.'},rawModel:{...raw,medianProduct:rawMedianProduct,meanProduct:rawMeanProduct,usage:'Arkiverade modellvärden; råa produkter är diagnostik och är inte automatiskt godkända för rangordning.'},comparisonInputs:inputs,comparisonIndicator:cost,missingReason:cost?null:unique(missing).join(' ')||'Jämförbara indata saknas.',sourceLinks:unique(dimensions.map(d=>review?.[d]?.sourceUrl).filter(Boolean))};
 });
 const rank=(getter)=>m.risks.map(r=>({riskId:r.riskId,value:getter(r)})).filter(r=>nonnegative(r.value)).sort((x,y)=>y.value-x.value||x.riskId.localeCompare(y.riskId));
 const checkRank=(name,expected)=>{const entries=m[name]?.entries||[];check(entries.length===expected.length,'ranking_count',name,'Published and recomputed ranking lengths differ.');for(const [i,r]of expected.entries()){const p=entries[i];check(p?.riskId===r.riskId&&p?.rank===i+1&&equal(p?.score,r.value),'ranking_order_or_score',r.riskId,name);}};
 const correctedRank=rank(r=>recomputed.get(r.riskId)?.value);
 checkRank('ranking',correctedRank);checkRank('meanRanking',rank(r=>r.expectedLoss?r.sourceStatistics.likelihood.mean*r.sourceStatistics.impactBelief.mean:null));checkRank('modelMedianRanking',rank(r=>r.centralCost?r.sourceStatistics.likelihood.median*r.sourceStatistics.impactBelief.median:null));
 const rankMap=new Map(correctedRank.map((r,i)=>[r.riskId,i+1]));resultRisks.forEach(r=>r.rank=rankMap.get(r.riskId)||null);
 const pairMap=new Map();
 for(const c of controls.values())for(const rid of c.riskIds){check(canonical.has(rid),'control_unknown_risk',c.id,rid);const key=`${c.id}|${rid}`;check(!pairMap.has(key),'duplicate_canonical_pair',c.id,rid);pairMap.set(key,{controlId:c.id,riskId:rid,effects:{}});}
 let negativeDeltas=0,unidentifiedDeltas=0,effectCount=0;
 for(const c of measured.values()){
  check(controls.has(c.controlId),'control_not_canonical',c.controlId,'Measured control is absent from exploration.');
  check(c.implementationStatus==='proposed'&&c.annualCost===null,'control_baseline_or_cost',c.controlId,'All controls are proposed and implementation costs are unknown.');
  for(const effect of c.effects){effectCount++;const pair=pairMap.get(`${c.controlId}|${effect.riskId}`);if(!pair){issue('effect_not_mapped',c.controlId,effect.riskId);continue;}
   check(dimensions.includes(effect.dimension),'effect_dimension',c.controlId,effect.riskId);check(!pair.effects[effect.dimension],'duplicate_effect',c.controlId,`${effect.riskId}:${effect.dimension}`);
   check(finite(effect.delta),'nonfinite_delta',c.controlId,effect.riskId);validRun(effect.runId,c.controlId);check(effect.runId===m.controlInvestment.effectRunId,'effect_source_mismatch',c.controlId,'Control effects do not use the selected effect run.');
   if(effect.delta<0)negativeDeltas++;if(effect.status!=='identified')unidentifiedDeltas++;
   pair.effects[effect.dimension]=effect;
  }
 }
 const pairRows=[...pairMap.values()].map(p=>{const l=p.effects.likelihood,i=p.effects.impact,supported=l?.status==='identified'&&i?.status==='identified'&&finite(l.delta)&&finite(i.delta),factor=supported?Math.exp(-(l.delta+i.delta)):null,base=recomputed.get(p.riskId)?.value??null,residual=base!=null&&finite(factor)?base*factor:null;return {controlId:p.controlId,riskId:p.riskId,likelihoodDelta:l?.delta??null,impactDelta:i?.delta??null,effectsComplete:!!supported,factor,reductionFraction:factor!=null?1-factor:null,baseline:base,residual,reduction:residual!=null?base-residual:null,adverse:supported&&factor>1,missingReason:!supported?'En eller båda effektkomponenterna saknas eller är inte identifierade.':base==null?'Riskens jämförbara kostnadsindikator saknas.':null};});
 const bundle=(ids)=>{
  const chosen=new Set(ids),byRisk=new Map();for(const p of pairRows)if(chosen.has(p.controlId)){if(!byRisk.has(p.riskId))byRisk.set(p.riskId,[]);byRisk.get(p.riskId).push(p);}
  const rows=[...byRisk].map(([riskId,pairs])=>{const supported=pairs.every(p=>p.effectsComplete),likelihoodDelta=supported?sum(pairs,'likelihoodDelta'):null,impactDelta=supported?sum(pairs,'impactDelta'):null,factor=supported?Math.exp(-(likelihoodDelta+impactDelta)):null,baseline=recomputed.get(riskId)?.value??null,residual=baseline!=null&&finite(factor)?baseline*factor:null;return {riskId,controlIds:pairs.map(p=>p.controlId),likelihoodDelta,impactDelta,factor,baseline,residual,reduction:residual!=null?baseline-residual:null,reductionFraction:finite(factor)?1-factor:null,missingReason:!supported?'Effektunderlag saknas för någon vald kontroll.':baseline==null?'Jämförbart kostnadsunderlag saknas.':null};});
  const priced=rows.filter(r=>r.reduction!=null);return {controlIds:ids,affectedRiskCount:rows.length,pricedRiskCount:priced.length,unknownRiskCount:rows.length-priced.length,adverseRiskCount:rows.filter(r=>r.reductionFraction<0).length,comparisonBaselineSum:priced.length?sum(priced,'baseline'):null,comparisonResidualSum:priced.length?sum(priced,'residual'):null,comparisonReductionSum:priced.length?sum(priced,'reduction'):null,rows};
 };
 const authority=e.controls.filter(c=>c.driver==='authority');
 const standalone=e.controls.map(c=>({controlId:c.id,title:c.title,driver:c.driver||null,priorityScope:c.priorityScope||null,measured:measured.has(c.id),...bundle([c.id])}));
 const combinations={allControls:{...bundle([...controls.keys()]),scopeQualification:'Matematisk kontroll av alla länkar samtidigt. Blandar ordinarie, framtida och övergångsanknutna åtgärder och är därför inget genomförbart gemensamt myndighetsscenario.'},authorityMain:{...bundle(authority.filter(c=>c.priorityScope==='main').map(c=>c.id)),scopeQualification:'Myndighetsåtgärder i beslutat huvudscenario, utan framtida mandat och införandeövergång.'},authorityFuture:{...bundle(authority.filter(c=>c.priorityScope==='future').map(c=>c.id)),scopeQualification:'Framtida mandat redovisas separat från beslutat huvudscenario.'},authorityTransition:{...bundle(authority.filter(c=>c.priorityScope==='transition').map(c=>c.id)),scopeQualification:'Övergångsåtgärder avser införandet och adderas inte till en varaktig årlig effekt.'}};
 const top20=([...combinations.authorityMain.rows].filter(r=>r.reduction!=null).sort((x,y)=>y.reduction-x.reduction||x.riskId.localeCompare(y.riskId)).slice(0,20)).map((r,i)=>({...r,rank:i+1,title:canonical.get(r.riskId)?.rubrik||''}));
 const unmeasured=e.controls.filter(c=>!measured.has(c.id)).map(c=>c.id);
 const missingPairs=pairRows.filter(p=>!p.effectsComplete);if(missingPairs.length)warnings.push({code:'missing_control_effects',count:missingPairs.length,detail:'Saknade effekter förblir odefinierade och används inte som noll.'});
 if(negativeDeltas)warnings.push({code:'negative_effect_deltas',count:negativeDeltas,detail:'Negativa skattade logeffekter bevaras. De kan öka en dimension eller den samlade kostnadsindikatorn och är inga verifierade skadeverkningar.'});
 const descOnly=resultRisks.filter(r=>r.sourceCoverage.descriptionExtractionAvailable&&!r.sourceCoverage.individualSourceReview).length;
 return {schemaVersion:1,auditId:'independent-publication-arithmetic-2026-10-22',generatedAt,inputHashes,status:errors.length?'needs_revision':'arithmetic_checks_passed',scope:'Samtliga registerrisker, kanoniska kontrollkopplingar och publicerade modell- och jämförelsevärden. Ingen ny mätning och ingen empirisk validering av de skattade nivåerna.',method:{comparison:'Frekvenspunkt × kostnadspunkt. Aritmetisk mittpunkt för godkända källintervall; annars oförändrad modellmedian. Intervalländpunkterna multipliceras var för sig och är inte konfidensgränser.',rawMean:'Arkiverad lognormal medelskattning kontrolleras som median × exp(logStdDev²/2). Publicerad förväntad kostnad kontrolleras mot frekvensmedel × kostnadsmedel.',controls:'Per risk summeras valda kontrollers frekvens- och kostnadsdelta. Restfaktor = exp(−summa delta). Reduktion = jämförelsevärde × (1 − restfaktor). Effekterna är modellbaserade, samverkan är inte skattad och fasta osäkerhetsparametrar antas.',aggregation:'Summorna avser jämförelseindikatorer över det prissatta urvalet. Risker kan avse överlappande ekonomiska förluster; summorna är inte en validerad nationell årskostnad. Fristående kontrollbidrag får inte summeras som ett kombinerat åtgärdspaket.',investment:'Ingen kontroll antas införd. Investerings- och driftskostnader saknas, så nettonytta och avkastning kan inte beräknas.'},summary:{riskCount:canonical.size,arithmeticRiskCount:resultRisks.length,arithmeticRiskPassCount:resultRisks.filter(r=>r.arithmeticPassed).length,rankedRiskCount:correctedRank.length,undefinedIndicatorCount:resultRisks.filter(r=>!r.comparisonIndicator).length,sourceReviewedRiskCount:reviews.size,descriptionExtractionOnlyRiskCount:descOnly,noIndividualSourceAuditCount:resultRisks.filter(r=>!r.sourceCoverage.individualSourceReview).length,empiricallyValidatedRiskCount:0,sourceClasses,dimensionCounts,publishedMeanProductCount:m.risks.filter(r=>r.expectedLoss).length,publishedMedianProductCount:m.risks.filter(r=>r.centralCost).length,controlCount:controls.size,measuredControlCount:measured.size,unmeasuredControlIds:unmeasured,canonicalControlRiskPairCount:pairRows.length,completeEffectPairCount:pairRows.filter(p=>p.effectsComplete).length,missingEffectPairCount:missingPairs.length,effectDimensionCount:effectCount,negativeEffectDimensionCount:negativeDeltas,unidentifiedEffectDimensionCount:unidentifiedDeltas,adverseStandalonePairCount:pairRows.filter(p=>p.adverse).length,errorCount:errors.length,warningCount:warnings.length},errors,warnings,risks:resultRisks,controlAnalysis:{pairs:pairRows,standalone,combinations,top20AuthorityRiskContributions:top20}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const files={measurement:'publication/measurement.json',sourceReview:'publication/source-review.json',exploration:'Artefakt_C_Riskregister/mcp-server/data/exploration.json',register:'Artefakt_C_Riskregister/mcp-server/data/riskregister.csv'};
 const content=Object.fromEntries(Object.entries(files).map(([key,p])=>[key,fs.readFileSync(path.join(root,p),'utf8')]));
 const result=auditPublication({measurement:JSON.parse(content.measurement),sourceReview:JSON.parse(content.sourceReview),exploration:JSON.parse(content.exploration),register:parseRegisterCsv(content.register),inputHashes:Object.fromEntries(Object.entries(content).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]))});
 fs.writeFileSync(path.join(root,'publication/numeric-audit.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.summary,null,2));if(result.errors.length){console.error(JSON.stringify(result.errors.slice(0,30),null,2));process.exitCode=1;}
}

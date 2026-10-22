// Shared by the offline importer and the browser. Missing values remain missing.
export function validatePresentation(settings) {
  if(settings?.schemaVersion!==1||!['median','mean'].includes(settings.riskStatistic))throw new Error('Visningsinställning: riskStatistic måste vara median eller mean');
  return settings;
}
export function riskStatistic(row,dimension,statistic) {
  if(!['mean','median'].includes(statistic))throw new Error('Okänt riskmått');
  const summary=row?.summaries?.[dimension];
  if(summary?.[statistic]!=null)return {...summary,value:summary[statistic],statistic};
  if(dimension==='expectedLoss') {
    if(statistic==='mean'&&row?.expectedLoss)return {...row.expectedLoss,statistic};
    if(statistic==='median'&&row?.lossDistribution?.p50!=null)return {...row.lossDistribution,value:row.lossDistribution.p50,statistic};
  } else {
    const point=row?.[dimension];
    const declared=point?.statistic==='conditional_mean'?'mean':point?.statistic==='p50'?'median':point?.statistic;
    if(point&&declared===statistic)return {...point,statistic};
  }
  return null;
}

export function validateDescriptionReview(review) {
  const fail = message => { throw new Error(`Beskrivningsgranskning: ${message}`); };
  if(!review?.riskId||!Array.isArray(review.estimates)||!Array.isArray(review.contextValues)||!Array.isArray(review.missing)||!review.assessment||!/^[a-f0-9]{64}$/.test(review.source?.sha256||''))fail('källposition eller granskning saknas');
  for(const [key,items] of [['estimates',review.estimates],['contextValues',review.contextValues]])for(const item of items) {
    if(!['likelihood','impact'].includes(item.dimension)||!Number.isFinite(item.lower)||!Number.isFinite(item.upper)||item.lower<0||item.upper<item.lower||item.mean!==null||item.median!==null||item.statistic!=='unspecified_range'||item.sourceKind!=='description_estimate'||!item.sourceQuote||!item.scope||item.verification!=='attributed_estimate_not_independently_verified')fail('intervall får inte bli ett centralmått');
    if(item.dimension==='impact'&&item.unit!=='SEK_per_event'||item.dimension==='likelihood'&&!(key==='contextValues'?['events_per_year','events_in_period']:['events_per_year']).includes(item.unit))fail('fel enhet eller period');
  }
  if(!['undefined','model_estimate'].includes(review.annualCostStatus))fail('beskrivningsintervall ger ingen årskostnad');
  return review;
}

export function validateMeasurement(snapshot, riskIds, controlIds) {
  const fail = text => { throw new Error(`Mätpaket: ${text}`); };
  const ids = (values, allowed, label) => {
    if (!Array.isArray(values) || new Set(values).size !== values.length || values.some(id => !allowed.has(id))) fail(`okända eller dubbla ${label}`);
  };
  const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (snapshot?.schemaVersion !== 1) fail('okänd formatversion');
  if (!['awaiting_measurement', 'ready'].includes(snapshot.status)) fail('ogiltig status');
  const risks = new Set(riskIds), controls = new Set(controlIds);
  ids((snapshot.risks || []).map(r => r.riskId), risks, 'risk-ID');
  ids((snapshot.controls || []).map(c => c.controlId), controls, 'kontroll-ID');
  if (snapshot.status === 'awaiting_measurement') {
    if (snapshot.risks?.length || snapshot.controls?.length || snapshot.portfolio || snapshot.portfolios?.length || snapshot.scenarios?.length || snapshot.ranking) fail('väntande paket får inte innehålla mätresultat');
    return snapshot;
  }
  const p = snapshot.provenance;
  if (!snapshot.editionId || !p?.executionId || !p.experimentId || !p.orgId || !p.currency || !finite(p.horizonYears) || p.horizonYears === 0 || !Array.isArray(p.runs) || !p.runs.length || !p.scope?.description || !p.scope.exposureBasis) fail('körningsidentitet, valuta, period och exponeringsbas krävs');
  const runIds = new Set(p.runs.map(r => r.runId));
  if (runIds.size !== p.runs.length) fail('dubbla Runs');
  for (const r of p.runs) {
    if (!/^[a-zA-Z0-9_-]+$/.test(r.runId||'') || !r.functionId || r.status !== 'completed' || !Number.isFinite(Date.parse(r.completedAt)) || !/^[a-f0-9]{64}$/.test(r.sha256 || '')) fail('ofullständig Run-proveniens');
    if (r.executionId !== p.executionId && !r.upstreamOf?.some(id => runIds.has(id))) fail('Run från annan execution saknar deklarerad lineage');
    if (!Array.isArray(r.inputRunIds) || r.inputRunIds.some(id => !runIds.has(id))) fail('input-Run saknas i paketet');
  }
  const visiting=new Set(),visited=new Set(),runById=new Map(p.runs.map(r=>[r.runId,r]));
  const visit=id=>{if(visiting.has(id))fail('cykel i Run-lineage');if(visited.has(id))return;visiting.add(id);for(const input of runById.get(id).inputRunIds)visit(input);visiting.delete(id);visited.add(id);};
  for(const id of runIds)visit(id);
  const dependsOn=(id,ancestor)=>runById.get(id).inputRunIds.some(input=>input===ancestor||dependsOn(input,ancestor));
  for(const r of p.runs)if(r.executionId!==p.executionId&&!p.runs.some(target=>target.executionId===p.executionId&&r.upstreamOf?.includes(target.runId)&&dependsOn(target.runId,r.runId)))fail('deklarerad upstream-Run saknar verifierbar inputkedja');
  const source = value => { if (!value?.runId || !runIds.has(value.runId)) fail('resultat saknar känt Run-ID'); };
  const summary = (s,dimension) => {
    source(s);
    if(!['mean','median'].some(k=>s[k]!=null)||['mean','median'].some(k=>s[k]!=null&&!finite(s[k])))fail('ogiltig median eller medelvärde');
    const horizon=dimension==='expectedLoss'?p.horizonYears:(p.assessmentHorizonYears??p.horizonYears);
    if(s.horizonYears!==horizon||!s.definition)fail('statistikens period eller definition saknas');
    if(dimension==='likelihood'&&(!['probability','events_per_year'].includes(s.unit)||s.unit==='probability'&&['mean','median'].some(k=>s[k]>1)))fail('ogiltig sannolikhet/frekvens i statistik');
    if(dimension==='impact'&&s.unit!==`${p.currency}_per_event`||dimension==='expectedLoss'&&s.unit!==p.currency)fail('statistikens valuta/enhet avviker');
    if(dimension!=='expectedLoss'&&(s.eligible!==true||s.calibrationStatus!=='anchor_scaled'))fail('absolut statistik kräver anchor_scaled och eligibleForAbsolute');
  };
  const distribution = d => {
    if (!d) return;
    source(d);
    if (!Number.isSafeInteger(d.sampleCount) || d.sampleCount < 1 || !finite(d.p50) || !finite(d.p95) || d.p95 < d.p50 || !Array.isArray(d.bins) || !d.bins.length) fail('ofullständig förlustfördelning');
    let count = 0, previous = -Infinity;
    for (const b of d.bins) {
      if (!finite(b.lower) || !finite(b.upper) || b.upper < b.lower || b.lower < previous || !Number.isSafeInteger(b.count) || b.count < 0) fail('ogiltiga histogramintervall');
      previous = b.upper; count += b.count;
    }
    if (count !== d.sampleCount) fail('histogrammets antal avviker från sampleCount');
    if (d.p50 < d.bins[0].lower || d.p95 > d.bins.at(-1).upper) fail('kvantiler utanför fördelningens intervall');
  };
  for (const r of snapshot.risks) {
    if(r.descriptionReview){validateDescriptionReview(r.descriptionReview);if(r.descriptionReview.riskId!==r.riskId)fail('beskrivning avser annan risk');}
    for(const [dimension,s] of Object.entries(r.summaries||{})) {
      if(!['likelihood','impact','expectedLoss'].includes(dimension))fail('okänd statistikdimension');
      summary(s,dimension);
      if(r[dimension]?.unit&&r[dimension].unit!==s.unit)fail('punkt och statistik har olika enheter');
      if(s.calibrationSourceRunId) {
        if(dimension!=='likelihood'||r.likelihood?.runId!==s.calibrationSourceRunId||!dependsOn(s.runId,s.calibrationSourceRunId))fail('occurrence-statistik saknar kalibrerad inputkedja');
      }
    }
    for (const dimension of ['likelihood', 'impact']) {
      const m = r[dimension]; if (!m) continue;
      source(m);
      if (!finite(m.value) || m.eligible !== true || m.calibrationStatus !== 'anchor_scaled') fail('absoluta mått kräver anchor_scaled och eligibleForAbsolute');
      if (dimension === 'likelihood' && (!['probability', 'events_per_year'].includes(m.unit) || (m.unit === 'probability' && m.value > 1))) fail('ogiltig sannolikhet/frekvens');
      if (m.horizonYears !== (p.assessmentHorizonYears??p.horizonYears)) fail('perioderna skiljer sig');
      if (dimension === 'impact' && m.unit !== `${p.currency}_per_event`) fail('konsekvensens valuta/enhet avviker');
      if (m.interval90 && (!Array.isArray(m.interval90) || m.interval90.length !== 2 || m.interval90.some(v => !finite(v)) || m.interval90[1] < m.interval90[0])) fail('ogiltigt osäkerhetsintervall');
    }
    if (r.expectedLoss) {
      source(r.expectedLoss);
      if (!finite(r.expectedLoss.value) || r.expectedLoss.horizonYears !== p.horizonYears) fail('ogiltig förväntad förlust');
      if (r.expectedLoss.method === 'product_of_means') {
        const likelihood=riskStatistic(r,'likelihood','mean'),impact=riskStatistic(r,'impact','mean');
        if (!likelihood || !impact || r.expectedLoss.assumption !== 'independent_frequency_and_severity') fail('produktberäkning saknar villkorat medelvärde eller oberoendeantagande');
        const expected = likelihood.value * impact.value * (likelihood.unit === 'events_per_year' ? p.horizonYears : 1);
        if (Math.abs(expected - r.expectedLoss.value) > Math.max(0.01, expected * 1e-8)) fail('förväntad förlust stämmer inte med formeln');
      } else if (r.expectedLoss.method !== 'exported_loss_mean') fail('okänd förlustmetod');
    }
    distribution(r.lossDistribution);
    if(r.summaries?.expectedLoss?.mean!=null&&r.expectedLoss?.value!==r.summaries.expectedLoss.mean)fail('förlustmedelvärden skiljer sig');
    if(r.summaries?.expectedLoss?.median!=null&&r.lossDistribution&&r.lossDistribution.p50!==r.summaries.expectedLoss.median)fail('förlustmedianer skiljer sig');
    if (r.sensitivity) {
      source(r.sensitivity);
      if (!r.sensitivity.method || !Array.isArray(r.sensitivity.items) || r.sensitivity.items.some(i => !i.label || !finite(i.value) || i.value > 1)) fail('ogiltig känslighetsanalys');
    }
  }
  for (const c of snapshot.controls || []) {
    for (const e of c.effects || []) {
      source(e);
      if (!risks.has(e.riskId) || !['likelihood', 'impact'].includes(e.dimension) || typeof e.delta !== 'number' || !Number.isFinite(e.delta)) fail('ogiltig latent kontrolleffekt');
    }
  }
  if(snapshot.controlInvestment) {
    const a=snapshot.controlInvestment;
    if(a.schemaVersion!==1||a.baseline!=='inherent_no_controls'||p.controlBasis!==a.baseline||a.implementationStatus!=='none_implemented'||a.method!=='additive_log_shifts_fixed_uncertainty'||a.interactionsEstimated!==false||a.costsAvailable!==false||!runIds.has(a.effectRunId))fail('ogiltig investeringsbas eller effektkälla');
    for(const c of snapshot.controls)if(c.implementationStatus!=='proposed'||c.annualCost!==null||c.effects.some(e=>e.runId!==a.effectRunId))fail('investeringsanalysen kräver föreslagna kontroller och en gemensam effektkälla');
  }
  if(snapshot.controlAnalysis) {
    const a=snapshot.controlAnalysis;
    if(a.statistic!=='mean'||a.horizonYears!==p.horizonYears||!Array.isArray(a.controls))fail('ogiltig kontrollanalys');
    ids(a.controls.map(c=>c.controlId),controls,'kontrollanalys-ID');
    if(a.runId)source(a);
    for(const key of ['residualExpectedLoss','inherentExpectedLoss','totalAttributedReduction'])if(a[key]!=null&&!finite(a[key]))fail('ogiltig kontrollanalysstatistik');
    for(const c of a.controls)if(c.attributedReduction!=null&&!finite(c.attributedReduction)||c.annualCost!=null&&!finite(c.annualCost))fail('ogiltigt kontrollbidrag');
  }
  const portfolios = [...(snapshot.portfolio ? [snapshot.portfolio] : []),...(snapshot.portfolios||[])],portfolioScopes=new Set();
  for (const a of portfolios) {
    ids(a.riskIds, risks, 'portföljrisker'); source(a);
    const key=[...a.riskIds].sort().join('|');if(portfolioScopes.has(key))fail('dubblerat portföljurval');portfolioScopes.add(key);
    if (!a.riskIds.length || a.expectedLoss!=null&&!finite(a.expectedLoss) || !a.dependenceAssumption || !a.scopeDescription) fail('portföljens avgränsning/beroendemodell saknas');
    if(a.summary)summary(a.summary,'expectedLoss');
    if(a.expectedLoss==null&&a.summary?.median==null&&a.lossDistribution?.p50==null)fail('portföljen saknar statistik');
    if(a.summary?.mean!=null&&a.summary.mean!==a.expectedLoss)fail('portföljens medelvärden skiljer sig');
    if(a.summary?.median!=null&&a.lossDistribution&&a.summary.median!==a.lossDistribution.p50)fail('portföljens medianer skiljer sig');
    distribution(a.lossDistribution);
  }
  const scenarioIds = new Set(), combinations = new Set();
  for (const s of snapshot.scenarios || []) {
    ids(s.controlIds, controls, 'scenariokontroller'); ids(s.riskIds, risks, 'scenariorisker'); source(s);
    const combination = [...s.controlIds].sort().join('|');
    if (!s.id || scenarioIds.has(s.id) || combinations.has(combination) || !s.controlIds.length || !s.riskIds.length || !s.method || !s.overlapTreatment || !finite(s.referenceExpectedLoss) || !finite(s.residualExpectedLoss) || (s.controlCost != null && !finite(s.controlCost))) fail('ogiltigt eller dubblerat scenario');
    scenarioIds.add(s.id); combinations.add(combination);
    if (s.contributions?.length) {
      if (s.contributions.some(c => !s.controlIds.includes(c.controlId) || !finite(c.reduction))) fail('ogiltiga scenariobidrag');
      const sum = s.contributions.reduce((a,c) => a+c.reduction, 0);
      if (Math.abs(sum - (s.referenceExpectedLoss-s.residualExpectedLoss)) > Math.max(0.01, Math.abs(sum)*1e-6)) fail('vattenfallsbidragen stämmer inte med scenariot');
    }
    if (s.riskEffects?.some(e => !s.riskIds.includes(e.riskId) || !finite(e.referenceExpectedLoss) || !finite(e.residualExpectedLoss))) fail('ogiltiga riskbidrag i scenario');
  }
  return snapshot;
}

export function createMeasurementModel(snapshot, riskIds, controlIds) {
  validateMeasurement(snapshot, riskIds, controlIds);
  const byRisk = new Map((snapshot.risks || []).map(r => [r.riskId, r]));
  const byControl = new Map((snapshot.controls || []).map(c => [c.controlId, c]));
  const sameIds = (a,b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  return {
    snapshot, byRisk, byControl,
    metric(id,dimension,statistic) { return riskStatistic(byRisk.get(id),dimension,statistic); },
    aggregate(ids,statistic='mean') {
      const rows = ids.map(id => byRisk.get(id)).filter(r => riskStatistic(r,'expectedLoss',statistic));
      const portfolio = [snapshot.portfolio,...(snapshot.portfolios||[])].find(p=>p&&sameIds(ids,p.riskIds))||null;
      const expectedLoss=portfolio?.expectedLoss ?? (ids.some(id=>byRisk.get(id)?.expectedLoss)?ids.reduce((a,id)=>a+(byRisk.get(id)?.expectedLoss?.value??0),0):null);
      const median=portfolio?.summary?.median??portfolio?.lossDistribution?.p50??(ids.length===1?riskStatistic(byRisk.get(ids[0]),'expectedLoss','median')?.value:null)??null;
      const fromPortfolio=statistic==='median'?(portfolio?.summary?.median??portfolio?.lossDistribution?.p50)!=null:portfolio?.expectedLoss!=null;
      return { rows, quantified:rows.length, total:ids.length, missing:ids.filter(id=>!riskStatistic(byRisk.get(id),'expectedLoss',statistic)),
        expectedLoss,median,value:statistic==='median'?median:expectedLoss,statistic,
        portfolio, fromPortfolio, partial:rows.length !== ids.length };
    },
    scenario(ids) { return (snapshot.scenarios || []).find(s => sameIds(ids,s.controlIds)) || null; },
  };
}

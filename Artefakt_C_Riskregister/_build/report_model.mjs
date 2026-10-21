// One manuscript serves the web reader and the printable edition.
export function reportEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function validateReport(report, interviews, riskIds, controlIds) {
  const fail = text=>{throw new Error(`Rapport: ${text}`);};
  if(report?.schemaVersion!==1||!report.editionId||!report.title||!Array.isArray(report.chapters))fail('ogiltig manusversion');
  const chapters=new Set(), sources=new Set((report.sources||[]).map(s=>s.id));
  if(sources.size!==(report.sources||[]).length)fail('dubblerad källa');
  for(const s of report.sources||[])if(!s.id||!s.title||s.url&&!/^https:\/\//.test(s.url))fail('ogiltig rapportkälla');
  const excerpts=new Map();
  for(const interview of interviews?.interviews||[]) {
    if(!interview.id||!interview.publicLabel||interview.publicationAllowed!==true||interview.reviewStatus!=='approved')fail('intervjun är inte godkänd för publicering');
    sources.add(interview.id);
    for(const e of interview.excerpts||[]) {
      if(excerpts.has(e.id)||!e.id||!e.text||!e.locator||e.reviewStatus!=='approved'||e.publicationAllowed!==true)fail('citat saknar godkännande eller källposition');
      if((e.riskIds||[]).some(id=>!riskIds.includes(id))||(e.controlIds||[]).some(id=>!controlIds.includes(id)))fail('citat har okänd risk-/kontrollkoppling');
      excerpts.set(e.id,e);
    }
  }
  for(const c of report.chapters) {
    if(!c.id||chapters.has(c.id)||!c.title||!Array.isArray(c.blocks))fail('ogiltigt eller dubblerat kapitel');
    chapters.add(c.id);
    for(const b of c.blocks) {
      if(!['p','h3','note','highlight','quote','figure','table','integration'].includes(b.type))fail('okänd manusblocktyp');
      if((b.sourceIds||[]).some(id=>!sources.has(id)))fail('hänvisning till okänd källa');
      if(b.type==='quote'&&!excerpts.has(b.excerptId))fail('citat saknas i godkänt intervjuunderlag');
      if(b.type==='quote'&&b.text)fail('citattext hämtas från källan, inte en separat kopia');
    }
  }
  for(const f of report.findings||[]) {
    if(!f.id||!f.title||!f.interpretation||!Array.isArray(f.excerptIds)||!f.excerptIds.length||f.excerptIds.some(id=>!excerpts.has(id)))fail('intervjufynd saknar spårbart stöd');
    if((f.riskIds||[]).some(id=>!riskIds.includes(id))||(f.controlIds||[]).some(id=>!controlIds.includes(id)))fail('intervjufynd har okända kopplingar');
    if(f.measurementEditionId&&f.measurementEditionId!==report.measurementEditionId)fail('fynd pekar på annan mätversion');
  }
  return report;
}
export function reportStatus(status) {
  return ({draft:'Arbetsmanus',awaiting_measurement:'Inväntar mätresultat',awaiting_interviews:'Inväntar intervjumaterial',awaiting_integration:'Inväntar samlad analys',reviewed:'Sakgranskad'})[status]||'Arbetsmanus';
}
export function reportFigureData(id,report,measurement,risks,controls=[]) {
  if(!report.measurementEditionId||report.measurementEditionId!==measurement.editionId)return {kind:'pending'};
  const rows=new Map((measurement.risks||[]).map(r=>[r.riskId,r]));
  if(id==='portfolio-distribution')return measurement.portfolio?.lossDistribution?{kind:'histogram',...measurement.portfolio.lossDistribution}: {kind:'pending'};
  if(id==='risk-contributions')return {kind:'bars',rows:risks.map(r=>({id:r.risk_id,label:r.title,value:rows.get(r.risk_id)?.expectedLoss?.value})).filter(r=>r.value!=null).sort((a,b)=>b.value-a.value).slice(0,10)};
  if(id==='process-contributions') {
    const charts=[...new Set(risks.map(r=>r.chart_key))];
    return {kind:'bars',rows:charts.map(key=>({id:key,label:key,value:risks.filter(r=>r.chart_key===key).reduce((a,r)=>a+(rows.get(r.risk_id)?.expectedLoss?.value||0),0)})).filter(x=>risks.some(r=>r.chart_key===x.id&&rows.get(r.risk_id)?.expectedLoss))};
  }
  if(id==='control-scenario') {
    const s=measurement.scenarios?.find(s=>s.id===report.scenarioId);
    return s?{kind:'bars',rows:[{label:'Referensscenario',value:s.referenceExpectedLoss},{label:'Med valda åtgärder',value:s.residualExpectedLoss}],runId:s.runId}: {kind:'pending'};
  }
  return {kind:'pending'};
}
export function renderReportFigure(id,report,measurement,risks,controls=[]) {
  const data=reportFigureData(id,report,measurement,risks,controls),e=reportEscape;
  const money=v=>`${new Intl.NumberFormat('sv-SE',{maximumFractionDigits:2}).format(v/1e6)} ${measurement.provenance?.currency==='SEK'?'mnkr':`mn ${measurement.provenance?.currency||'SEK'}`}`;
  if(data.kind==='pending'||data.kind==='bars'&&!data.rows.length)return '<div class="ms-empty"><span class="ms-status">Inväntar rapportens mätutgåva</span><p>Figuren färdigställs med rapportens fastställda mätunderlag. En ny mätning ändrar inte den granskade rapporttexten automatiskt.</p></div>';
  if(data.kind==='histogram') {
    const max=Math.max(...data.bins.map(b=>b.count/data.sampleCount),.01);
    const lo=data.bins[0].lower,hi=data.bins.at(-1).upper,span=hi-lo||1;
    return `<svg class="ms-report-hist" viewBox="0 0 660 245" role="img" aria-label="Förlustfördelning. P50 ${money(data.p50)}, P95 ${money(data.p95)}">${[0,.5,1].map(f=>`<line x1="55" x2="640" y1="${200-f*180}" y2="${200-f*180}" stroke="#dfe4e7"/><text x="45" y="${204-f*180}" text-anchor="end">${Math.round(f*max*100)} %</text>`).join('')}${data.bins.map(b=>`<rect x="${55+(b.lower-lo)/span*585}" y="${200-b.count/data.sampleCount/max*180}" width="${Math.max(2,(b.upper-b.lower)/span*585-2)}" height="${b.count/data.sampleCount/max*180}" fill="#1d6362"><title>${money(b.lower)}–${money(b.upper)}: ${b.count} utfall</title></rect>`).join('')}<text x="55" y="225">${money(lo)}</text><text x="640" y="225" text-anchor="end">${money(hi)}</text></svg><div class="ms-quantiles"><span>P50<strong>${money(data.p50)}</strong></span><span>P95<strong>${money(data.p95)}</strong></span></div><p class="ex-note">${data.sampleCount} simulerade utfall · Run ${e(data.runId)}</p><details><summary>Visa figurdata</summary><table class="ex-table"><thead><tr><th>Från</th><th>Till</th><th>Antal</th></tr></thead><tbody>${data.bins.map(b=>`<tr><td>${money(b.lower)}</td><td>${money(b.upper)}</td><td>${b.count}</td></tr>`).join('')}</tbody></table></details>`;
  }
  const max=Math.max(...data.rows.map(r=>r.value),1);
  return `<div class="ms-bars">${data.rows.map((r,i)=>`<div class="ms-bar-row"><span>${e(r.label)}</span><div class="ms-bar-track"><span class="${i===0?'ms-bar-first':''}" style="width:${r.value/max*100}%"></span></div><strong>${money(r.value)}</strong></div>`).join('')}</div><p class="ex-note">${e(measurement.editionId)} · ${e(measurement.provenance.currency)} · ${measurement.provenance.horizonYears*12} månader</p>`;
}
export function renderReportChapter(chapter, report, interviews, {figure=()=>'',linkBase='?'}={}) {
  const e=reportEscape, quotes=new Map((interviews?.interviews||[]).flatMap(i=>(i.excerpts||[]).map(q=>[q.id,{...q,interview:i}])));
  const cite=b=>(b.sourceIds||[]).length?`<span class="rp-citations">${b.sourceIds.map(id=>`<a href="${e(linkBase)}view=report&amp;chapter=referenser#source-${e(id)}">[${e(id)}]</a>`).join(' ')}</span>`:'';
  const blocks=chapter.blocks.map(b=> {
    if(b.type==='h3')return `<h3>${e(b.text)}</h3>`;
    if(b.type==='p')return `<p>${e(b.text)} ${cite(b)}</p>`;
    if(b.type==='note')return `<aside class="rp-note"><strong>${e(b.title||'Avgränsning')}</strong><p>${e(b.text)}</p>${cite(b)}</aside>`;
    if(b.type==='highlight')return `<aside class="rp-highlight"><span>Redaktionellt lyft</span><p>${e(b.text)}</p>${cite(b)}</aside>`;
    if(b.type==='quote') {
      const q=quotes.get(b.excerptId); if(!q)return '';
      return `<figure class="rp-quote"><blockquote>${e(q.text)}</blockquote><figcaption>${e(q.interview.publicLabel)} · ${e(q.interview.role)}<br>${e(q.locator)} · ${e(q.id)}</figcaption></figure>`;
    }
    if(b.type==='figure')return `<figure class="rp-figure"><h3>${e(b.title)}</h3>${figure(b.figureId)}<figcaption>${e(b.caption)}${report.measurementEditionId?` · Mätversion ${e(report.measurementEditionId)}`:' · Mätresultat inväntas'}</figcaption></figure>`;
    if(b.type==='table')return `<div class="ex-table-wrap"><table class="ex-table"><caption>${e(b.title)}</caption><thead><tr>${b.columns.map(c=>`<th>${e(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(row=>`<tr>${row.map(cell=>`<td>${e(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    if(b.type==='integration') {
      const findings=(report.findings||[]).filter(f=>(f.chapterIds||[]).includes(chapter.id));
      return findings.length?`<section class="rp-findings"><h3>Sammanvägd evidens</h3>${findings.map(f=>`<article><h4>${e(f.title)}</h4><p>${e(f.interpretation)}</p><p class="ex-note">${e(f.relationship||'Tematiskt stöd')} · ${f.excerptIds.map(id=>{const q=quotes.get(id);return `${e(q.interview.publicLabel)}, ${e(q.locator)} [${e(id)}]`;}).join(' · ')}</p><p class="ex-note">${e(f.counterEvidence||'Motstridigt underlag har inte redovisats för detta fynd.')} ${e(f.limitations||'')}</p>${(f.riskIds||[]).map(id=>`<a class="ref" href="${e(linkBase)}risk=${e(id)}&amp;tab=analysis">${e(id)}</a>`).join('')}${(f.controlIds||[]).map(id=>`<a class="ref" href="${e(linkBase)}view=controls&amp;control=${e(id)}">${e(id)}</a>`).join('')}</article>`).join('')}</section>`:`<aside class="rp-pending"><span class="rp-section-label">Planerad syntes</span><h3>Här möts mätning och intervjuer</h3><p>När underlagen är klara binds varje tolkning till en mätversion och till källbelagda intervjuutdrag. Även skillnader, motexempel och kunskapsluckor redovisas.</p></aside>`;
    }
    return '';
  }).join('');
  const thematicQuotes=[...quotes.values()].filter(q=>(q.topicIds||[]).includes(chapter.id));
  return `<div class="rp-chapter-meta"><span>Kapitel ${e(chapter.number)}</span><span>${e(reportStatus(chapter.status))}</span></div><h2>${e(chapter.title)}</h2>${chapter.lead?`<p class="rp-lead">${e(chapter.lead)}</p>`:''}${blocks}${thematicQuotes.length?`<section class="rp-interview-evidence"><h3>Röster ur intervjumaterialet</h3>${thematicQuotes.map(q=>`<figure class="rp-quote"><blockquote>${e(q.text)}</blockquote><figcaption>${e(q.interview.publicLabel)} · ${e(q.interview.role)} · ${e(q.locator)} [${e(q.id)}]</figcaption></figure>`).join('')}</section>`:''}${chapter.id==='referenser'?`<ol class="rp-sources">${(report.sources||[]).map(s=>`<li id="source-${e(s.id)}"><strong>[${e(s.id)}] ${e(s.title)}</strong><p>${e(s.description||'')}${s.url?` <a href="${e(s.url)}">Öppna källa</a>`:''}</p></li>`).join('')}${(interviews?.interviews||[]).map(i=>`<li id="source-${e(i.id)}"><strong>[${e(i.id)}] ${e(i.publicLabel)}</strong><p>${e(i.role)} · ${e(i.date||'Datum ej publicerat')} · Godkända utdrag: ${i.excerpts.length}</p></li>`).join('')}</ol>`:''}`;
}

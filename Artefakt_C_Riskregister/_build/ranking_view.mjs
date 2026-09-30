// Inlined into the self-contained app. All views share the validated ranking model.
function rankingDate(){
  const date=RANKING.run?.createdAt;
  if(!date && RANKING.run?.createdAtDisplay) return RANKING.run.createdAtDisplay.replace('Europe/Stockholm','(Stockholm)');
  return date ? new Intl.DateTimeFormat('sv-SE',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(date))+' (Stockholm)' : 'datum saknas';
}
function scoreText(score){ return Number(score).toLocaleString('sv-SE',{minimumFractionDigits:6,maximumFractionDigits:6}); }
function rankBadge(id){
  const e=RANKING.byRiskId.get(id);
  return e ? `<span class="rank-badge ${e.isTop?'top50':''}">${e.isTop?'Topp 50 · ':''}#${e.rank}</span>` : '<span class="rank-badge unranked">Ej rankad</span>';
}
function rankDetail(r){
  const e=RANKING.byRiskId.get(r.risk_id);
  return `<div class="rank-detail">${e ? `<strong>Rang ${e.rank} av ${RANKING.rankedCount}</strong> · BTL-poäng ${scoreText(e.score)}<p>Relativ sannolikhet i körningen ${rankingDate()}. Poängen är inte en procentsats för att risken inträffar.</p>` : '<strong>Ingår inte i den senaste körningen.</strong><p>Risken finns i registret men saknas i källinstansen. Ingen placering eller sannolikhet har tilldelats.</p>'}<button class="btn" data-open-node="${esc(r.node_id)}">Visa noden i processkartan</button></div>`;
}
function resetRiskFilters(){
  state.q=''; $('#search').value=''; state.charts=new Set(CHARTS); state.cats=new Set(CATEGORIES); state.origins=new Set(ORIGINS); state.node=''; state.topOnly=false;
}
function showRisk(id){
  if (typeof openExplorerRisk === 'function') return openExplorerRisk(id);
  resetRiskFilters(); state.q=id; $('#search').value=id; state.expandAll=true;
  $('#expandAll').textContent='Minimera alla'; renderSidebar(); setView('risks');
  $('#main').scrollIntoView({block:'start'});
}
function showTopRisks(){
  resetRiskFilters(); state.topOnly=true; state.sort='rank'; state.expandAll=false;
  $('#sort').value='rank'; $('#expandAll').textContent='Expandera alla'; renderSidebar(); setView('risks');
  $('#main').scrollIntoView({block:'start'});
}
function openProcessNode(id){
  if(!PROC_NODE[id]) return;
  state.selChart=PROC_NODE[id].chart; state.selProcNode=id; setView('process');
  $('#procSvg').scrollIntoView({block:'center'});
}
function bindRankingLinks(root){
  root.querySelectorAll('[data-open-risk]').forEach(el=>el.onclick=()=>showRisk(el.dataset.openRisk));
  root.querySelectorAll('[data-open-node]').forEach(el=>el.onclick=()=>openProcessNode(el.dataset.openNode));
  root.querySelectorAll('[data-open-process]').forEach(el=>el.onclick=()=>{
    state.selChart=el.dataset.openProcess; state.selProcNode=null; setView('process'); $('#main').scrollIntoView({block:'start'});
  });
}
function nodeRankingSummary(id){
  const node=PROC_NODE[id];
  if(node?.type==='subprocess'){
    const key=node.label.match(/^B\d{2}/)?.[0];
    const chart=RANKING.chartExposure.get(key);
    if(chart?.topDirectCount) return `<div class="rank-detail"><strong>${chart.topDirectCount} direkt mappade risker i topp 50 i ${esc(key)}</strong><p>Högsta placering: #${chart.bestDirectRank}. Öppna delprocessen för att se vilka noder riskerna är kopplade till.</p></div>`;
  }
  const e=RANKING.nodeExposure.get(id);
  if(!e?.topRiskCount) return '<p class="ranking-note">Ingen topp 50-risk är kopplad till denna nod. Det innebär inte att noden saknar risk.</p>';
  return `<div class="rank-detail"><strong>${e.topDirectCount} direkt mappade risker i topp 50</strong>${e.topAffectedCount?` · ${e.topAffectedCount} via följdpåverkan`:''}<p>Högsta placering bland kopplade risker: #${e.bestRank}. Klicka på en risk för orsaker, konsekvenser och källor.</p></div>`;
}
function downstreamDetail(id){
  const e=RANKING.nodeExposure.get(id);
  if(!e?.topAffectedCount) return '';
  return `<h3 style="margin:20px 0 12px">Följdpåverkan från topp 50 (${e.topAffectedCount})</h3><p class="ranking-note">Dessa risker är mappade till en annan nod men nämner denna nod i fältet ”Drabbar”. Ingen ytterligare spridning har antagits.</p>${e.topAffectedEntries.map(x=>riskCard(x.risk)).join('')}`;
}
function processExposure(n){
  if(n.type==='subprocess'){
    const key=n.label.match(/^B\d{2}/)?.[0];
    return RANKING.chartExposure.get(key);
  }
  return RANKING.nodeExposure.get(n.id);
}
function nodeDisplayRank(n){ return state.showDownstream ? n.bestRank : n.bestDirectRank; }
function processRankingPanel(ck){
  const nodes=[...RANKING.nodeExposure.values()].filter(x=>x.chartKey===ck && (x.topDirectCount || (state.showDownstream&&x.topAffectedCount))).sort((a,b)=>nodeDisplayRank(a)-nodeDisplayRank(b) || b.topRiskCount-a.topRiskCount);
  const directCount=RANKING.chartExposure.get(ck)?.topDirectCount || 0;
  return `<div class="ranking-panel"><div class="ranking-actions"><strong>${ck==='B00'?'Översikt över samtliga delprocesser':`${directCount} direkt mappade topp 50-risker i ${esc(ck)}`}</strong><label><input id="showDownstream" type="checkbox" ${state.showDownstream?'checked':''}> Visa även följdpåverkan</label></div>
    ${ck==='B00'?`<p class="ranking-note">Orange delprocesser innehåller risker i topp 50. Välj en delprocess för att se de enskilda noderna.</p><div class="ranking-actions">${CHARTS.map(c=>`<button class="btn" data-open-process="${c}">${c} · ${RANKING.chartExposure.get(c)?.topDirectCount||0} i topp 50</button>`).join('')}</div>`:
    `<div class="ranking-node-list">${nodes.map(n=>`<button class="ranking-node-row" data-open-node="${esc(n.nodeId)}"><span class="rank-badge">#${nodeDisplayRank(n)}</span><span><strong>${esc(n.nodeId)}</strong> · ${esc(n.node.label)}</span><span>${n.topDirectCount} direkt${state.showDownstream&&n.topAffectedCount?` · ${n.topAffectedCount} följd`:''}</span></button>`).join('') || '<p class="ranking-note">Inga noder med topp 50-risker i denna vy.</p>'}</div>`}</div>`;
}
function exportRanking(entries){
  csvDownload('miljotillstandsrisks_btl_rangordning.csv', ['rang','risk_id','titel','btl_relativ_poang','osakerhet_kallvarde','topp_50','nod','delprocess','run_id','korning_skapad_visning'],entries.map(e=>[e.rank,e.riskId,e.risk.title,e.score,e.uncertainty??'',e.isTop,e.risk.node_id,CHART_NAME[e.risk.chart_key],RANKING.run.id,RANKING.run.createdAtDisplay]));
}
function renderRanking(){
  const directNodes=[...RANKING.nodeExposure.values()].filter(n=>n.topDirectCount).sort((a,b)=>a.bestDirectRank-b.bestDirectRank);
  const affectedNodes=[...RANKING.nodeExposure.values()].filter(n=>n.topRiskCount);
  const charts=CHARTS.map(c=>({key:c, count:RANKING.chartExposure.get(c)?.topDirectCount||0, total:CHART_RISKS[c]||0})).sort((a,b)=>b.count-a.count);
  const topScore=RANKING.entries[0]?.score||1;
  const tableEntries=state.rankScope==='all'?RANKING.entries:RANKING.topEntries;
  $('#main').innerHTML=`
    <section class="ranking-hero">
      <div class="eyebrow">Sannolikhet · BTL-rangordning</div>
      <h2>De 50 högst rankade riskerna.<br>Och var de träffar processen.</h2>
      <p>Se vilka risker som bedöms mest sannolika i den senaste körningen, jämför med hela registret och följ dem till rätt processnod.</p>
      <div class="ranking-meta">${rankingDate()} · ${esc(RANKING.run.experimentName||'')} / ${esc(RANKING.run.executionName||'')} · nr.getcardinal.io</div>
      <div class="ranking-kpis">
        <div class="ranking-kpi"><strong>${RISKS.length}</strong><span>risker i registret</span></div>
        <div class="ranking-kpi"><strong>${RANKING.rankedCount}</strong><span>rankade i körningen</span></div>
        <div class="ranking-kpi"><strong>${RANKING.topEntries.length}</strong><span>risker i fokus</span></div>
        <div class="ranking-kpi"><strong>${directNodes.length}</strong><span>direkt berörda noder</span></div>
      </div>
      <div class="ranking-actions"><button class="btn active" id="showTopRisks">Visa topp 50 i riskregistret</button><button class="btn" data-open-process="B00">Se processerna</button></div>
    </section>
    <section class="ranking-panel">
      <h3>Topp 50 i förhållande till hela registret</h3>
      <p class="ranking-note">Varje stapel är en risk, ordnad från högst till lägst BTL-poäng. Höjden visar relativ poäng med den högsta som referens. Orange visar topp 50; grått visar övriga rankade risker. Klicka för att läsa risken.</p>
      <div class="ranking-distribution" aria-label="Relativa BTL-poäng för samtliga rankade risker">${RANKING.entries.map(e=>`<button class="rank-mark ${e.isTop?'top50':''}" style="height:${100*e.score/topScore}%" data-open-risk="${esc(e.riskId)}" aria-label="Rang ${e.rank}: ${esc(e.risk.title)}, BTL-poäng ${scoreText(e.score)}" title="#${e.rank} · ${esc(e.risk.title)} · ${scoreText(e.score)}"></button>`).join('')}</div>
      <div class="ranking-legend"><span>1 · Högst relativ sannolikhet</span><strong>Topp 50 av ${RANKING.rankedCount}</strong><span>${RANKING.rankedCount} · Lägst i körningen</span></div>
      <p class="ranking-note">${RANKING.unranked.length} risk saknas i körningen och ligger utanför diagrammet: ${RANKING.unranked.map(r=>`<button class="text-link" data-open-risk="${esc(r.risk_id)}">${esc(r.risk_id)}</button>`).join(', ')}. BTL-poäng är relativa jämförelsevärden, inte sannolikheter i procent.</p>
    </section>
    <div class="ranking-grid">
      <section class="ranking-panel"><h3>Var finns topp 50-riskerna?</h3><p class="ranking-note">Direkt mappade risker per delprocess. Stapeln visar antal i topp 50 av delprocessens samtliga risker.</p>
        ${charts.map(c=>`<button class="ranking-process-row" data-open-process="${c.key}"><span>${esc(CHART_NAME[c.key])}</span><span class="ranking-track"><span class="ranking-fill" style="width:${100*c.count/c.total}%"></span></span><strong>${c.count} / ${c.total}</strong></button>`).join('')}
      </section>
      <section class="ranking-panel"><h3>Noder med de högst rankade riskerna</h3><p class="ranking-note">${directNodes.length} noder har en direkt mappad topp 50-risk. Med uttryckligen angiven följdpåverkan berörs ${affectedNodes.length} noder. Ordningen nedan följer nodens högst rankade risk.</p>
        <div class="ranking-node-list">${directNodes.slice(0,7).map(n=>`<button class="ranking-node-row" data-open-node="${esc(n.nodeId)}"><span class="rank-badge">#${n.bestDirectRank}</span><span><strong>${esc(n.nodeId)}</strong><br>${esc(n.node.label)}</span><span>${n.topDirectCount} i topp 50</span></button>`).join('')}</div>
        <button class="btn" data-open-process="B00">Utforska alla noder i processkartorna</button>
      </section>
    </div>
    <section class="ranking-panel"><div class="ranking-actions"><h3>${state.rankScope==='all'?'Hela rangordningen':'De 50 högst rankade riskerna'}</h3><button class="btn" id="toggleRankScope">${state.rankScope==='all'?'Visa topp 50':`Visa alla ${RANKING.rankedCount} rankade`}</button><button class="btn" id="exportRanking">Ladda ner rangordningen (CSV)</button></div>
      <div class="ranking-table-wrap"><table class="ranking-table"><thead><tr><th scope="col">Rang</th><th scope="col">Risk</th><th scope="col">Relativ BTL-poäng</th><th scope="col">Processnod</th></tr></thead><tbody>${tableEntries.map(e=>`<tr class="${e.isTop?'top-ranked':''}"><td>${rankBadge(e.riskId)}</td><td><button class="text-link" data-open-risk="${esc(e.riskId)}">${esc(e.risk.title)}</button><small>${esc(e.riskId)}</small></td><td><span>${scoreText(e.score)}</span><div class="ranking-score-track"><span class="ranking-score-fill" style="width:${100*e.score/topScore}%"></span></div></td><td><button class="text-link" data-open-node="${esc(e.risk.node_id)}">${esc(e.risk.node_id)}</button><small>${esc(e.risk.node_label)}</small></td></tr>`).join('')}</tbody></table></div>
    </section>
    <details class="ranking-panel"><summary>Om körningen, tolkningen och datakällan</summary><p>Rangordningen återger den senaste slutförda BTL-körningen för sannolikhet vid verifieringen ${new Intl.DateTimeFormat('sv-SE',{dateStyle:'long',timeZone:'Europe/Stockholm'}).format(new Date(RANKING.run.verifiedAt))}. Den beskriver relativ sannolikhet inom körningens ${RANKING.rankedCount} risker. Rang 1 ligger högst. Topp 50 följer källans rangordning, utan omräkning.</p><p>Körningen har även separat absolut kalibrering: ${RANKING.run.calibration?.eligibleCount ?? 0} risker berättigade till vidare beräkning, ${RANKING.run.calibration?.boundedCount ?? 0} med enbart gränsvärde och ${RANKING.run.calibration?.invalidCount ?? 0} med ogiltig kalibrering. Den här sidan visar den relativa BTL-rangordningen. Kalibreringens absoluta värden används inte i diagrammen.</p><p>Processernas färger visar kopplingar till topp 50, inte en beräknad störningssannolikhet för noden. Direkt mappning kommer från riskregistrets nod-ID. Följdpåverkan omfattar endast uttryckliga nod-ID:n i ”Drabbar”. Riskernas poäng summeras inte.</p><p>Alla 342 registerposter finns kvar. En post saknas i källinstansen och visas som ej rankad. Källans risker har matchats med exakta titlar och, vid tvetydighet, exakta beskrivningar.</p><p>Baslinje för risk- och processinnehållet: S0, 20 augusti 2026. Rangordningen är en daterad ögonblicksbild och uppdateras när en ny körning importeras.</p><p><a href="${esc(RANKING.run.sourceUrl)}" target="_blank" rel="noopener">Öppna källkörningen i Cardinal</a> (inloggning krävs). Körnings-ID: <code>${esc(RANKING.run.id)}</code>.</p></details>`;
  $('#showTopRisks').onclick=showTopRisks;
  $('#toggleRankScope').onclick=()=>{state.rankScope=state.rankScope==='all'?'top':'all';renderRanking();$('#toggleRankScope').scrollIntoView({block:'center'});};
  $('#exportRanking').onclick=()=>exportRanking(tableEntries);
  bindRankingLinks($('#main'));
}

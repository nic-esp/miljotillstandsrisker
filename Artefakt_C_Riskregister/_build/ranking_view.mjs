// Inlined into the self-contained app. All views share the validated ranking model.
function rankingDate(){
  const date=RANKING.run?.createdAt || RANKING.run?.completedAt;
  if(!date && RANKING.run?.createdAtDisplay) return RANKING.run.createdAtDisplay.replace('Europe/Stockholm','(Stockholm)');
  return date ? new Intl.DateTimeFormat('sv-SE',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(date))+' (Stockholm)' : 'datum saknas';
}
function scoreText(score){ return Number(score).toLocaleString('sv-SE',{minimumFractionDigits:6,maximumFractionDigits:6}); }
function rankBadge(id){
  const e=RANKING.byRiskId.get(id);
  return e ? `<span class="rank-badge ${e.isTop?'top50':''}">${e.isTop?'Topp 50 · ':''}#${e.rank}</span>` : '<span class="rank-badge unranked">Ej rankad</span>';
}
function rankDetail(r){
  const e=RANKING.byRiskId.get(r.risk_id), l=DATA.measurement.likelihoodRanking?.entries.find(x=>x.riskId===r.risk_id);
  return `<div class="rank-detail">${e?`<strong>Kostnadsrang ${e.rank} av ${RANKING.rankedCount}</strong><p>Förväntad kostnad ${measurementMoney(e.score)} per år, beräknad från medelvärden.</p>`:'<strong>Kostnadsrang saknas</strong><p>Kostnadsvärdet är odefinierat i denna utgåva. Risken finns kvar i registret.</p>'}${l?`<p>Relativ sannolikhet: rang ${l.rank} av ${DATA.measurement.likelihoodRanking.entries.length} i Cosmic Rhino.</p>`:''}<button class="btn" data-open-node="${esc(r.node_id)}">Visa noden i processkartan</button></div>`;
}
function resetRiskFilters(){
  state.q=''; $('#search').value=''; state.charts=new Set(CHARTS); state.cats=new Set(CATEGORIES); state.origins=new Set(ORIGINS); state.node=''; state.topOnly=false; state.quality='all';
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
function exportRanking(entries,metric='expected_annual_cost'){
  csvDownload('miljotillstandsrisks_'+metric+'.csv',['rang','risk_id','titel','matt','varde','topp_50_kostnad','nod','execution_id'],entries.map(e=>[e.rank,e.riskId,e.risk.title,metric,e.score,RANKING.topRiskIds.has(e.riskId),e.risk.node_id,DATA.measurement.provenance?.executionId||RANKING.run.id]));
}
function renderRanking(){
  const cost=RANKING.run?.metric==='expected_annual_cost';
  const likelihood=cost&&state.rankMetric==='likelihood';
  const relative=likelihood||!cost;
  const display=likelihood?createRankingModel(RISKS,DATA.measurement.likelihoodRanking,PROC):RANKING;
  const entries=state.rankScope==='all'?display.entries:display.entries.slice(0,50);
  const top=display.entries[0]?.score||1;
  const directNodes=[...RANKING.nodeExposure.values()].filter(n=>n.topDirectCount).sort((a,b)=>a.bestDirectRank-b.bestDirectRank);
  const value=e=>cost&&!likelihood?measurementMoney(e.score)+'/år':scoreText(e.score);
  $('#main').innerHTML=`<section class="ranking-hero"><div class="eyebrow">Prioritering · ${esc(RANKING.run?.executionName||'')}</div><h2>${cost?'Riskerna med högst förväntad kostnad':'Riskernas relativa sannolikhet'}</h2><p>${cost?`Topp 50 bland ${RANKING.rankedCount} risker med kostnadsunderlag i denna utgåva. Utforska riskerna, deras motåtgärder och berörda processer.`:'Jämför riskernas relativa rang och följ deras processkopplingar.'}</p><div class="ranking-meta">${rankingDate()} · ${cost?'Modellskattningar för Sverige · SEK per år':'BTL-rangordning'}</div><div class="ranking-kpis"><div class="ranking-kpi"><strong>${RISKS.length}</strong><span>risker i registret</span></div><div class="ranking-kpi"><strong>${RANKING.rankedCount}</strong><span>${cost?'kostnadsrankade':'rankade'}</span></div><div class="ranking-kpi"><strong>${RANKING.topEntries.length}</strong><span>risker i topp 50</span></div><div class="ranking-kpi"><strong>${directNodes.length}</strong><span>direkt berörda noder</span></div></div><div class="ranking-actions"><button class="btn active" id="showTopRisks">Visa topp 50 i riskregistret</button><button class="btn" data-open-process="B00">Se processerna</button><button class="btn" data-ex-view="report">Läs analysrapporten</button></div></section>
  ${cost?`<aside class="ms-quality-note"><strong>Hur urvalet ska läsas</strong><p>${DATA.measurement.quality.flaggedCount} risker har värden som behöver granskas och en risk saknas i körningen. Dessa kan vara kostsamma och ligger kvar i hela registret. Kostnadsrangordningen bygger på medelvärden; riskkortens frekvens och kostnad per händelse visas med ${RISK_STATISTIC==='median'?'median':'medelvärde'}. <a href="?view=report&chapter=bilaga-kvalitet">Se granskningsregler och metod.</a></p><button class="ex-text-link" id="showReviewRisks">Visa risker med granskningsbehov</button></aside><div class="ex-segment rank-perspectives" aria-label="Rangordningens mått"><button class="btn ${!likelihood?'active':''}" id="rankCost" aria-pressed="${!likelihood}">Förväntad kostnad</button><button class="btn ${relative?'active':''}" id="rankLikelihood" aria-pressed="${likelihood}">Relativ sannolikhet</button></div>`:''}
  <section class="ranking-panel"><h3>${relative?'Relativ sannolikhet i hela körningen':'Kostnadsrangordningen i sitt sammanhang'}</h3><p class="ranking-note">Varje stapel motsvarar en risk. Höjden visar ${relative?'relativ BTL-poäng':'förväntad årlig kostnad'} på en linjär skala. Orange markerar alltid sajtens topp 50 efter kostnad. Klicka för att läsa risken.</p><div class="ranking-distribution" aria-label="${relative?'Relativ sannolikhet':'Förväntad kostnad'} för rankade risker">${display.entries.map(e=>`<button class="rank-mark ${RANKING.topRiskIds.has(e.riskId)?'top50':''}" style="height:${100*e.score/top}%" data-open-risk="${esc(e.riskId)}" aria-label="${esc(e.risk.title)}, ${esc(value(e))}" title="${e.rank} · ${esc(e.risk.title)} · ${esc(value(e))}"></button>`).join('')}</div><div class="ranking-legend"><span>Högst ${relative?'relativ sannolikhet':'kostnad'}</span><span>${display.entries.length} risker med detta mått</span></div>${relative?'<p class="ranking-note">BTL-poängen uttrycker en relativ ordning. Den kan inte läsas som en procentsats för ett enskilt projekt.</p>':''}</section>
  <div class="ranking-grid"><section class="ranking-panel"><h3>Topp 50 efter delprocess</h3><p class="ranking-note">Antal direkt kopplade topprisker av delprocessens samtliga risker.</p>${CHARTS.map(key=>({key,count:RANKING.chartExposure.get(key)?.topDirectCount||0,total:CHART_RISKS[key]})).sort((a,b)=>b.count-a.count).map(c=>`<button class="ranking-process-row" data-open-process="${c.key}"><span>${esc(CHART_NAME[c.key])}</span><span class="ranking-track"><span class="ranking-fill" style="width:${100*c.count/c.total}%"></span></span><strong>${c.count} / ${c.total}</strong></button>`).join('')}</section><section class="ranking-panel"><h3>Processnoder med högst prioritet</h3><p class="ranking-note">Ordningen följer den högst kostnadsrankade risken på varje nod. En nods störningssannolikhet kan inte utläsas ur antalet riskkopplingar.</p>${directNodes.slice(0,7).map(n=>`<button class="ranking-node-row" data-open-node="${esc(n.nodeId)}"><span class="rank-badge">#${n.bestDirectRank}</span><span><strong>${esc(n.nodeId)}</strong><br>${esc(n.node.label)}</span><span>${n.topDirectCount} i topp 50</span></button>`).join('')}</section></div>
  <section class="ranking-panel"><div class="ranking-actions"><h3>${relative?'Rangordning efter relativ sannolikhet':'Rangordning efter förväntad kostnad'}</h3><button class="btn" id="toggleRankScope">${state.rankScope==='all'?'Visa de första 50':`Visa alla ${display.rankedCount}`}</button><button class="btn" id="exportRanking">Ladda ner CSV</button></div><div class="ranking-table-wrap"><table class="ranking-table"><thead><tr><th>Rang</th><th>Risk</th><th>${relative?'BTL-poäng':'Förväntad kostnad / år'}</th><th>Processnod</th><th>Motåtgärder</th></tr></thead><tbody>${entries.map(e=>`<tr class="${RANKING.topRiskIds.has(e.riskId)?'top-ranked':''}"><td><span class="rank-badge">${e.rank}</span></td><td><button class="text-link" data-open-risk="${esc(e.riskId)}">${esc(e.risk.title)}</button><small>${esc(e.riskId)}</small></td><td>${value(e)}</td><td><button class="text-link" data-open-node="${esc(e.risk.node_id)}">${esc(e.risk.node_id)}</button></td><td><button class="ex-text-link" data-ex-risk="${esc(e.riskId)}" data-ex-risk-tab="controls">${(EX_BY_RISK.get(e.riskId)||[]).length} motåtgärder</button></td></tr>`).join('')}</tbody></table></div></section><details class="ranking-panel"><summary>Beräkning och källor</summary><p>Förväntad kostnad beräknas som medelfrekvens per år multiplicerad med bedömd medelkostnad per händelse, med antagande om oberoende mellan dessa storheter. Resultatet används för prioritering av separata riskposter. Kostnader som överlappar mellan risker och alternativa processvägar har inte rensats till en nationell totalsumma.</p>${measurementProvenance()}</details>`;
  $('#showTopRisks').onclick=showTopRisks;
  $('#toggleRankScope').onclick=()=>{state.rankScope=state.rankScope==='all'?'top':'all';renderRanking();};
  $('#exportRanking').onclick=()=>exportRanking(entries,relative?'relative_likelihood':'expected_annual_cost');
  if(cost){$('#rankCost').onclick=()=>{state.rankMetric='cost';renderRanking();};$('#rankLikelihood').onclick=()=>{state.rankMetric='likelihood';renderRanking();};$('#showReviewRisks').onclick=()=>{resetRiskFilters();state.quality='review';renderSidebar();setView('risks');};}
  bindRankingLinks($('#main'));
}

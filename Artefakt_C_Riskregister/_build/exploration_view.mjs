// Read-only investigation views, embedded into the single-file application.
const EX_DATA = DATA.exploration;
const EX_RISKS = new Map(RISKS.map(r => [r.risk_id, r]));
const EX_CONTROLS = new Map(EX_DATA.controls.map(c => [c.id, c]));
const EX_OCCURRENCES = new Map(EX_DATA.occurrences.map(o => [o.id, o]));
const EX_CONCEPTS = new Map(EX_DATA.concepts.map(c => [c.id, c]));
const EX_BY_RISK = new Map(RISKS.map(r => [r.risk_id, EX_DATA.controls.filter(c => c.riskIds.includes(r.risk_id))]));
const EX_CONCEPTS_BY_OCCURRENCE = new Map(EX_DATA.occurrences.map(o => [o.id, EX_DATA.concepts.filter(c => c.occurrenceIds.includes(o.id))]));
const exState = { controlQ:'', controlKind:'all', controlDriver:'all', controlScenario:'S1_beslutat_uppdrag', controlChart:'', controlSort:'top', compare:new Set(), graph:null, graphSelection:null, dialog:null, stack:[], missingControls:false };
const exRoleNames = { prevention:'Förebyggande', preventive:'Förebyggande', monitoring:'Bevakning', detection:'Upptäckt', consequence_reduction:'Konsekvensbegränsande', mitigation:'Konsekvensbegränsande', recovery:'Återhämtning', combined:'Flera roller', unspecified:'Övergripande åtgärd', unclassified:'Ej preciserad roll' };
const exRole = role => exRoleNames[role] || role || 'Övergripande åtgärd';
const exTopCount = c => c.riskIds.filter(id => RANKING.topRiskIds.has(id)).length;
const exShort = (s, n=86) => String(s).length > n ? String(s).slice(0,n-1).trimEnd()+'…' : String(s);
const exRank = id => RANKING.byRiskId.get(id)?.rank ?? Infinity;
const exOrderedRisks = ids => [...new Set(ids)].map(id => EX_RISKS.get(id)).filter(Boolean).sort((a,b)=>exRank(a.risk_id)-exRank(b.risk_id)||a.risk_id.localeCompare(b.risk_id));
const exControlOrder = (a,b) => exTopCount(b)-exTopCount(a)||b.riskIds.length-a.riskIds.length||a.title.localeCompare(b.title,'sv');
const EX_AUTHORITY_MAIN = 'S1_beslutat_uppdrag';
const EX_AUTHORITY_SCENARIOS = {S1_beslutat_uppdrag:'Huvudscenario',Inforande_ej_S1:'Införande',Framtida_mandat_ej_beslutat:'Framtida mandat'};
const exAuthority = c => c.driver==='authority';
const exScenario = c => EX_AUTHORITY_SCENARIOS[c.scenario]||'Ej scenarioindelad';
const exControlLabel = c => exAuthority(c) ? 'Myndighetsdriven åtgärd' : c.kind === 'shared' ? 'Sammanförd åtgärd' : 'Åtgärd i riskregistret';
const exControlPriority = c => exAuthority(c) ? (c.scenario===EX_AUTHORITY_MAIN?3:1) : c.kind==='shared'?2:0;
const exAuthorityBadge = c => exAuthority(c) ? `<span class="ex-authority-badge ${c.scenario===EX_AUTHORITY_MAIN?'':'ex-authority-secondary'}">Myndighetsdriven · ${esc(exScenario(c))}</span>` : '';
function exAuthorityAssessment(assessment) {
  if(!assessment)return '';
  const a=assessment.sourceRecord||assessment;
  return `<details class="ex-method ex-assessment"><summary>Bedömning av originalförslagets myndighetsdel</summary><p><strong>${esc(a.bedomning||'Bedömning i underlaget')}</strong></p><dl class="ex-facts"><dt>Ursprunglig aktör</dt><dd>${esc(a.ursprunglig_aktor_bedomning)}</dd><dt>Myndighetsdel</dt><dd>${esc(a.myndighetsdel_som_kan_anpassas)}</dd><dt>Kvar hos andra</dt><dd>${esc(a.del_som_inte_overtas)}</dd></dl><p>${esc(a.bedomningsmotivering)}</p>${a.sarskild_avgransning?`<p>${esc(a.sarskild_avgransning)}</p>`:''}<p class="ex-note">Originalförslaget behålls oförändrat. Bedömningen av en möjlig myndighetsdel gör inte hela originalåtgärden myndighetsdriven.</p></details>`;
}
function exAuthorityDetails(c) {
  if(!exAuthority(c))return exAuthorityAssessment(c.authorityAssessment);
  const facts=(pairs)=>`<dl class="ex-authority-facts">${pairs.filter(([,value])=>value).map(([label,value])=>`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`;
  return `<section class="ex-authority-context"><div class="ex-authority-context-head"><div>${exAuthorityBadge(c)}<span class="ex-mono">${esc(c.id)}</span><h3>Föreslagen kontroll · effektmätning återstår</h3></div><span class="ex-measurement-status">Ej uppmätt</span></div><p class="ex-note">${c.scenario===EX_AUTHORITY_MAIN?'Ingår i underlagets huvudscenario. Kontrollens genomförande och effekt är ännu inte verifierade.':c.scenario==='Inforande_ej_S1'?'Avser införandet. Hålls separat från huvudscenariots löpande verksamhet.':'Förutsätter ett framtida mandat enligt underlaget. Ingår inte i huvudscenariot.'}</p><div class="ex-detail-columns"><section><h4>Ansvar och avgränsning</h4>${facts([['Kontrollägare',c.owner],['Ansvarsgräns',c.scope],['Används när',c.triggerFrequency]])}</section><section><h4>Förberett för effektmätning</h4>${facts([['Föreslagna mätetal',c.indicators],['Verifikationsunderlag',c.verificationEvidence],['Skillnad S0–S1 att undersöka',c.baselineDifference]])}<p class="ex-note">Mätresultat saknas. Kopplingarna är hypoteser om möjlig påverkan, inte uppmätt riskreduktion.</p></section></div><details class="ex-method"><summary>Exponering, överlapp och underlag</summary>${facts([['Exponering',c.exposure],['Dubbelräkning',c.overlap],['Mandat enligt underlaget',c.mandateStatus],['Rättsligt stöd i underlaget',c.legalBasis],['Granskningsstatus i underlaget',c.sourceReviewStatus]])}<div class="refs">${(c.mandateSources||[]).filter(url=>/^https:\/\//.test(url)).map((url,i)=>`<a class="ref" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Mandatkälla ${i+1} ↗</a>`).join('')}</div><p class="ex-note">Importerade kontrollförslag och bedömningar, version 0.10 · bedömningsdatum 30 september 2026. Fullständiga källfält följer med i dataexporten.</p></details></section>`;
}
function exAuthorityTarget(t) {
  if(!t.sourceItemId)return '';
  return `<details class="ex-target-scope"><summary>Villkor och effekthypotes</summary><p>${esc(t.applicationConditions)}</p><small>${esc(t.relationship)}</small><p>${esc(t.effectHypothesis)}</p><p class="ex-note">Ej uppmätt. ${esc(t.quantifiedEffectSource)}</p><small>Målpost: ${esc(t.sourceItemId)}<br>Koppling: ${esc(t.id)}</small>${t.sourceRecord?.kontrollens_relation_till_atgardsforslaget?`<p>${esc(t.sourceRecord.kontrollens_relation_till_atgardsforslaget)}</p><small>Myndighetsdel: ${esc(t.sourceRecord.beaktad_myndighetsdel)}</small><small>Avgränsning: ${esc(t.sourceRecord.avgransning_av_originalforslaget)}</small>`:''}</details>`;
}
function exControlChip(c) { return `<button class="ex-control-chip" data-ex-control="${esc(c.id)}" title="${esc(c.title)}">${esc(exShort(c.title,49))}${exAuthority(c)?`<span class="ex-chip-driver">Myndighet · ${esc(exScenario(c))}</span>`:''}</button>`; }
function exRiskButton(r) { return `<button class="ex-text-link" data-ex-risk="${esc(r.risk_id)}">${esc(r.title)}</button><small>${esc(r.risk_id)}</small>`; }
function exScopeNote() { return '<p class="ex-note">Kopplingarna visar vilka risker en åtgärd är avsedd att adressera. Antalet kopplingar mäter inte åtgärdens effekt.</p>'; }
function exGraphLink(type,id,label='Visa i sambandskartan') { return `<button class="btn" data-ex-graph-type="${esc(type)}" data-ex-graph-id="${esc(id)}">${esc(label)}</button>`; }
function exMetric(value,label) { return `<span class="ex-metric"><strong>${value}</strong><span>${label}</span></span>`; }

function renderCompactRisks() {
  let rs = sorted(filtered());
  if(exState.missingControls) rs=rs.filter(r=>!(EX_BY_RISK.get(r.risk_id)||[]).length);
  $('#main').innerHTML = `<div class="ex-page-head"><div><div class="eyebrow">Riskregistret</div><h2>Alla risker. Flera perspektiv.</h2><p>Följ en risk till dess orsaker, motåtgärder och berörda processer.</p></div><button class="btn" data-ex-view="graph">Utforska sambandskartan</button></div>
    <div class="ex-list-bar"><div class="ex-segment"><button class="btn ${!state.topOnly?'active':''}" id="exAllRisks">Alla ${RISKS.length}</button><button class="btn ${state.topOnly?'active':''}" id="exTopRisks">Topp 50</button></div><span class="ex-count" aria-live="polite">${rs.length} risker i urvalet</span><label class="ex-check"><input id="exMissingControls" type="checkbox" ${exState.missingControls?'checked':''}> Utan dokumenterad motåtgärd</label><details class="ex-export-menu"><summary class="btn ex-small">Exportera urval</summary><button class="btn ex-small" id="exRiskExport">En rad per risk (CSV)</button><button class="btn ex-small" id="exRiskItemExport">Orsaker och konsekvenser (CSV)</button></details></div>
    <div class="ex-table-wrap"><table class="ex-table ex-risk-table"><thead><tr><th scope="col">BTL-rang</th><th scope="col">Risk</th><th scope="col">Motåtgärder</th><th scope="col">Process</th><th scope="col">Processnod</th></tr></thead><tbody>${rs.map(r=>{
      const controls=[...(EX_BY_RISK.get(r.risk_id)||[])].sort((a,b)=>exControlPriority(b)-exControlPriority(a)||exControlOrder(a,b));
      return `<tr data-risk-row="${esc(r.risk_id)}" class="${RANKING.topRiskIds.has(r.risk_id)?'ex-top-row':''}"><td>${rankBadge(r.risk_id)}</td><td class="ex-risk-title">${exRiskButton(r)}</td><td class="ex-related-cell">${controls.slice(0,1).map(exControlChip).join('')}${controls.length>1?`<button class="ex-more" data-ex-risk="${esc(r.risk_id)}" data-ex-risk-tab="controls">+${controls.length-1} till</button>`:''}</td><td><button class="ex-text-link" data-open-process="${esc(r.chart_key)}" title="${esc(CHART_NAME[r.chart_key])}">${esc(r.chart_key)}</button><small>${esc(exShort(CHART_NAME[r.chart_key],45))}</small></td><td><button class="ex-text-link ex-mono" data-open-node="${esc(r.node_id)}">${esc(r.node_id)}</button><small>${esc(exShort(r.node_label,56))}</small></td></tr>`;
    }).join('')}</tbody></table>${rs.length?'':'<div class="empty">Inga risker matchar urvalet. Prova att rensa filter.</div>'}</div>
    <p class="ex-note">BTL-rang från ${rankingDate()}. Orange markerar topp 50. Rangordningen beskriver relativ sannolikhet; ${RANKING.unranked.length} risk saknar rang.</p>`;
  $('#exAllRisks').onclick=()=>{state.topOnly=false;renderSidebar();renderCompactRisks();exSyncRoute();};
  $('#exTopRisks').onclick=()=>{state.topOnly=true;state.sort='rank';$('#sort').value='rank';renderSidebar();renderCompactRisks();exSyncRoute();};
  $('#exMissingControls').onchange=e=>{exState.missingControls=e.target.checked;renderCompactRisks();};
  $('#exRiskExport').onclick=()=>exportRisks(rs,'miljotillstandsrisks_urval.csv');
  $('#exRiskItemExport').onclick=()=>exportRiskItems(rs,'riskregister_orsaker_konsekvenser_urval.csv');
  bindRankingLinks($('#main'));
}

function exFilteredControls() {
  const terms=exState.controlQ.toLocaleLowerCase('sv').trim().split(/\s+/).filter(Boolean);
  return EX_DATA.controls.filter(c=>(exState.controlDriver!=='authority'||(exAuthority(c)&&(exState.controlScenario==='all'||c.scenario===exState.controlScenario)))&&(exState.controlDriver!=='other'||!exAuthority(c))&&(exState.controlKind==='all'||c.kind===exState.controlKind)&&(!exState.controlChart||c.chartKeys.includes(exState.controlChart))&&terms.every(term=>(c.id+' '+c.title+' '+c.description+' '+c.riskIds.join(' ')).toLocaleLowerCase('sv').includes(term)))
    .sort((a,b)=>exState.controlSort==='name'?a.title.localeCompare(b.title,'sv'):exState.controlSort==='reach'?b.riskIds.length-a.riskIds.length||exControlOrder(a,b):exControlOrder(a,b));
}
function renderControls() {
  const controls=exFilteredControls();
  const shared=EX_DATA.controls.filter(c=>c.kind==='shared');
  const authority=EX_DATA.controls.filter(exAuthority);
  const linkedRisks=new Set(controls.flatMap(c=>c.riskIds));
  $('#main').innerHTML=`<div class="ex-page-head"><div><div class="eyebrow">Motåtgärder</div><h2>${exState.controlDriver==='authority'?'Myndighetens föreslagna åtgärder':'Vilka åtgärder når flera risker?'}</h2><p>Undersök ansvar, avsedda mål och kopplingar till de högst rankade riskerna.</p></div><button class="btn" id="exControlExport">Exportera motåtgärder</button></div>
    <div class="ex-summary-strip">${exMetric(shared.length,'sammanförda åtgärder')}${exMetric(EX_DATA.controls.filter(c=>c.kind==='source').length,'ursprungliga åtgärdsbeskrivningar')}${exMetric(authority.length,'myndighetsdrivna förslag')}</div>
    <div class="ex-authority-filter"><label>Drivs av<select id="exControlDriver" aria-label="Drivs av"><option value="all" ${exState.controlDriver==='all'?'selected':''}>Alla kontrollposter</option><option value="authority" ${exState.controlDriver==='authority'?'selected':''}>Myndigheten</option><option value="other" ${exState.controlDriver==='other'?'selected':''}>Övriga / ej klassificerade</option></select></label>${exState.controlDriver==='authority'?`<label>Scenario<select id="exControlScenario" aria-label="Myndighetsåtgärdernas scenario"><option value="all" ${exState.controlScenario==='all'?'selected':''}>Alla scenarier (${authority.length})</option>${Object.entries(EX_AUTHORITY_SCENARIOS).map(([id,label])=>`<option value="${id}" ${exState.controlScenario===id?'selected':''}>${label} (${authority.filter(c=>c.scenario===id).length})</option>`).join('')}</select></label><p>${exState.controlScenario===EX_AUTHORITY_MAIN?`${authority.filter(c=>c.scenario===EX_AUTHORITY_MAIN).length} åtgärder i underlagets huvudscenario.`:'Införande och framtida mandat hålls isär från huvudscenariot.'} <strong>Effekt: ej uppmätt.</strong></p>`:`<button class="btn" id="exAuthorityShortcut">Visa myndighetens huvudscenario (${authority.filter(c=>c.scenario===EX_AUTHORITY_MAIN).length})</button>`}</div>
    <div class="ex-filter-bar"><input id="exControlSearch" type="search" aria-label="Sök motåtgärder" placeholder="Sök åtgärd, risk eller begrepp…" value="${esc(exState.controlQ)}"><select id="exControlKind" aria-label="Typ av motåtgärd" ${exState.controlDriver==='authority'?'hidden':''}><option value="all" ${exState.controlKind==='all'?'selected':''}>Alla motåtgärder</option><option value="shared" ${exState.controlKind==='shared'?'selected':''}>Sammanförda åtgärder</option><option value="source" ${exState.controlKind==='source'?'selected':''}>Ursprungliga beskrivningar</option></select><select id="exControlChart" aria-label="Motåtgärder i process"><option value="">Alla processer</option>${CHARTS.map(c=>`<option value="${c}" ${exState.controlChart===c?'selected':''}>${esc(CHART_NAME[c])}</option>`).join('')}</select><select id="exControlSort" aria-label="Sortera motåtgärder"><option value="top" ${exState.controlSort==='top'?'selected':''}>Flest kopplade topp-50-risker</option><option value="reach" ${exState.controlSort==='reach'?'selected':''}>Flest kopplade risker</option><option value="name" ${exState.controlSort==='name'?'selected':''}>Namn A–Ö</option></select></div>
    <div class="ex-compare-bar"><span aria-live="polite">${controls.length} kontrollposter · ${linkedRisks.size} unika risker · ${exState.compare.size} valda för jämförelse</span><button class="btn ${exState.compare.size>=2?'active':''}" id="exCompareButton" ${exState.compare.size<2?'disabled':''}>Jämför valda (${exState.compare.size})</button>${exState.compare.size?'<button class="ex-text-link" id="exClearCompare">Rensa val</button>':''}</div>
    <div class="ex-table-wrap"><table class="ex-table ex-control-table"><thead><tr><th scope="col"><span class="ex-sr">Välj för jämförelse</span></th><th scope="col">Motåtgärd</th><th scope="col">Topp 50</th><th scope="col">Kopplade risker</th><th scope="col">Processer</th><th scope="col">Ansvar / scenario</th><th scope="col">Avsedd roll</th></tr></thead><tbody>${controls.map(c=>`<tr data-control-row="${esc(c.id)}"><td><input type="checkbox" data-ex-compare="${esc(c.id)}" aria-label="Jämför ${esc(c.title)}" ${exState.compare.has(c.id)?'checked':''} ${exState.compare.size>=3&&!exState.compare.has(c.id)?'disabled':''}></td><td><button class="ex-text-link ex-control-title" data-ex-control="${esc(c.id)}">${esc(c.title)}</button><small>${esc(exControlLabel(c))}${c.kind==='shared'?' · analytisk gruppering':exAuthority(c)?' · '+esc(c.id):''}</small></td><td><span class="ex-number ${exTopCount(c)?'ex-orange':''}">${exTopCount(c)}</span></td><td><button class="ex-text-link ex-number" data-ex-control="${esc(c.id)}">${c.riskIds.length}</button></td><td>${c.chartKeys.map(k=>`<span class="ex-chart-tag" title="${esc(CHART_NAME[k])}">${k}</span>`).join(' ')}</td><td>${exAuthority(c)?`${exAuthorityBadge(c)}<small>Effekt: ej uppmätt</small>`:'<span class="ex-note">Ej klassificerad som myndighetsdriven</span>'}</td><td><span class="ex-role">${esc(exRole(c.role))}</span></td></tr>`).join('')}</tbody></table>${controls.length?'':'<div class="empty">Ingen motåtgärd matchar sökningen.</div>'}</div>${exScopeNote()}<details class="ex-method"><summary>Så har motåtgärderna sammanställts</summary><p>Myndighetskontrollerna är föreslagna åtgärder från underlag version 0.10, bedömt 30 september 2026. Huvudscenario, införande och framtida mandat är separata urval. Ingen införandesannolikhet eller effektstorlek har skattats.</p><p><a href="data/authority-controls-source.csv">Ursprungliga kopplingar (CSV)</a> · <a href="data/authority-assessments-source.csv">Bedömningar (CSV)</a> · <a href="data/authority-reading-guide.txt">Läsanvisning och källor</a></p><p>Alla ursprungliga åtgärdsbeskrivningar finns kvar. Återkommande handlingar har sammanförts till separata åtgärder med uttryckliga riskkopplingar. Grupperingen och placeringen i bow tie är analytiska tolkningar. Öppna en åtgärd för originaltext, avgränsning och skälet för varje koppling.</p><p>Sammanföringen är partiell: ${new Set(shared.flatMap(c=>c.riskIds)).size} av ${RISKS.length} risker har kopplats till återkommande åtgärder. Alla ursprungliga åtgärdsbeskrivningar finns tillgängliga. Fler gemensamma åtgärder kan finnas i underlaget.</p><p>En risk räknas en gång, även om flera av dess orsaker eller konsekvenser är kopplade. Jämförelsen gäller dokumenterade kopplingar; genomförande, kostnad och uppmätt effekt ingår inte i underlaget.</p></details>`;
  let timer;
  $('#exControlSearch').oninput=e=>{clearTimeout(timer);const value=e.target.value;timer=setTimeout(()=>{exState.controlQ=value;renderControls();exSyncRoute();const el=$('#exControlSearch');el.focus();},150);};
  const updateControlFilters=()=>{renderControls();exSyncRoute();};
  $('#exControlDriver').onchange=e=>{exState.controlDriver=e.target.value;exState.controlKind='all';if(exState.controlDriver==='authority')exState.controlScenario=EX_AUTHORITY_MAIN;updateControlFilters();};
  if($('#exControlScenario'))$('#exControlScenario').onchange=e=>{exState.controlScenario=e.target.value;updateControlFilters();};
  if($('#exAuthorityShortcut'))$('#exAuthorityShortcut').onclick=()=>{exState.controlDriver='authority';exState.controlScenario=EX_AUTHORITY_MAIN;exState.controlKind='all';exState.controlQ='';exState.controlChart='';updateControlFilters();};
  $('#exControlKind').onchange=e=>{exState.controlKind=e.target.value;updateControlFilters();};
  $('#exControlChart').onchange=e=>{exState.controlChart=e.target.value;updateControlFilters();};
  $('#exControlSort').onchange=e=>{exState.controlSort=e.target.value;updateControlFilters();};
  $('#exCompareButton').onclick=()=>exOpenDialog({type:'compare'});
  if($('#exClearCompare')) $('#exClearCompare').onclick=()=>{exState.compare.clear();renderControls();};
  $('#exControlExport').onclick=()=>csvDownload('motatgarder_urval.csv',['id','titel','typ','avsedd_roll','kopplade_topp50','kopplade_risker','risk_id','processer','beskrivning','drivs_av','scenario','matstatus','kontroll_id_for_matning','kopplingar_json','matresultat_json'],controls.map(c=>[c.id,c.title,c.kind,exRole(c.role),exTopCount(c),c.riskIds.length,c.riskIds.join(' | '),c.chartKeys.join(' | '),c.description,c.driver||'unspecified',c.scenario||'',c.measurement?.status||'',c.measurement?.key||'',JSON.stringify(c.targets),JSON.stringify(c.measurement?.results||[])]));
}

function renderKnowledgeGraph() {
  $('#main').innerHTML=`<div class="ex-page-head"><div><div class="eyebrow">Sambandskartan</div><h2>Se mönstren mellan riskerna.</h2><p>Gemensamma orsaker, återkommande konsekvenser och åtgärder som berör flera risker.</p></div><button class="btn" data-ex-view="controls">Jämför motåtgärder</button></div><div id="exGraphHost"></div>`;
  exState.graph=createKnowledgeGraph({container:$('#exGraphHost'),risks:RISKS,data:EX_DATA,ranking:RANKING,chartNames:CHART_NAME,
    onRisk:id=>openExplorerRisk(typeof id==='string'?id:id.id||id.riskId),
    onControl:id=>exOpenControl(typeof id==='string'?id:id.id),
    onConcept:id=>exOpenConcept(typeof id==='string'?id:id.id),
    onSelection:selection=>{exState.graphSelection=selection;exSyncRoute();}});
  if(exState.graphSelection) exState.graph.select(exState.graphSelection);
}
function exShowGraph(type,id) {
  exCloseDialog();
  exState.graphSelection={type,id};
  setView('graph');
  exSyncRoute();
  $('#main').scrollIntoView({block:'start'});
}

function exRiskConnections(riskIds) {
  return `<div class="ex-linked-risks">${exOrderedRisks(riskIds).map(r=>`<div class="ex-linked-risk">${rankBadge(r.risk_id)}<div>${exRiskButton(r)}<span class="ex-note">${esc(CHART_NAME[r.chart_key])}</span></div><button class="ex-text-link" data-open-node="${esc(r.node_id)}">${esc(r.node_id)}</button></div>`).join('')}</div>`;
}
function exTargetText(t) { return t.type==='event'?EX_RISKS.get(t.riskId)?.title:EX_OCCURRENCES.get(t.targetId)?.text; }
function exTargetLabel(t) { return t.type==='cause'?'Orsak':t.type==='effect'?'Konsekvens':'Riskhändelse'; }
function exControlContent(c) {
  return `<div class="ex-detail-heading"><div class="eyebrow">${esc(exControlLabel(c))}</div><h2 id="exDialogTitle">${esc(c.title)}</h2><p>${esc(c.description)}</p></div>
    <div class="ex-summary-strip">${exMetric(exTopCount(c),'kopplade topp-50-risker')}${exMetric(c.riskIds.length,'kopplade risker')}${exMetric(c.chartKeys.length,'processer')}<span class="ex-role">${esc(exRole(c.role))}</span></div>
    <div class="ex-actions">${exGraphLink('control',c.id)}<button class="btn" data-ex-add-compare="${esc(c.id)}">${exState.compare.has(c.id)?'Vald för jämförelse':'Lägg till i jämförelse'}</button>${exState.compare.size>=2?'<button class="btn" data-ex-open-compare>Öppna jämförelse</button>':''}</div>${exScopeNote()}${exAuthorityDetails(c)}
    <div class="ex-detail-columns"><section><h3>Risker som åtgärden är kopplad till</h3>${exRiskConnections(c.riskIds)}</section><section><h3>Vad adresserar åtgärden?</h3><p class="ex-note">${c.kind==='source'?'Ursprunglig riskkoppling. Exakt placering i förloppet är inte preciserad.':'Placering och avsedd roll är en analytisk tolkning av åtgärdstexten.'}</p><div class="ex-target-list">${c.targets.map(t=>`<div><span class="ex-target-label ${t.type}">${exTargetLabel(t)}</span><p>${esc(exTargetText(t)||'Övergripande riskkoppling')}</p><button class="ex-text-link ex-mono" data-ex-risk="${esc(t.riskId)}">${esc(t.riskId)}</button><small>${esc(exRole(t.role))}${t.rationale?' · '+esc(t.rationale):''}</small>${exAuthorityTarget(t)}</div>`).join('')}</div></section></div>
    <details class="ex-method" open><summary>Originaltexter och avgränsning (${c.sourceTexts.length})</summary>${c.sourceTexts.map(s=>`<div class="ex-source-quote"><button class="ex-text-link ex-mono" data-ex-risk="${esc(s.riskId)}">${esc(s.riskId)}</button><p>${esc(s.text)}</p><div class="refs">${(EX_RISKS.get(s.riskId)?.source_refs||[]).map(refLink).join('')}</div></div>`).join('')}</details>`;
}
function exConceptContent(c) {
  const label=c.kind==='cause'?'Orsak':'Konsekvens';
  const controls=EX_DATA.controls.filter(ctrl=>ctrl.targets.some(t=>c.occurrenceIds.includes(t.targetId)));
  return `<div class="ex-detail-heading"><div class="eyebrow">${label} · ${c.matchType==='exact'?'Samma formulering':'Liknande innehåll'}</div><h2 id="exDialogTitle">${esc(c.label)}</h2><p>${c.matchType==='exact'?'Formuleringen återkommer i flera riskposter.':'Analytisk gruppering av närliggande formuleringar. Riskernas sammanhang kan skilja sig.'}</p></div><div class="ex-summary-strip">${exMetric(c.riskIds.length,'kopplade risker')}${exMetric(c.riskIds.filter(id=>RANKING.topRiskIds.has(id)).length,'i topp 50')}${exMetric(controls.length,'åtgärder med uttryckliga mål')}</div><div class="ex-actions">${exGraphLink('concept',c.id)}</div>${c.rationale?`<p class="ex-note">${esc(c.rationale)}</p>`:''}
    <div class="ex-detail-columns"><section><h3>Originalformuleringar</h3>${c.occurrenceIds.map(id=>{const o=EX_OCCURRENCES.get(id);return `<div class="ex-source-quote"><p>${esc(o.text)}</p><button class="ex-text-link ex-mono" data-ex-risk="${esc(o.riskId)}">${esc(o.riskId)}</button> ${rankBadge(o.riskId)}<small>${o.basis==='source'?'Källförankrad premiss':'Analytisk bedömning'}</small><div class="refs">${o.source_refs.map(refLink).join('')}</div></div>`;}).join('')}</section><section><h3>Motåtgärder vid dessa mål</h3>${controls.map(c=>`<div class="ex-control-summary">${exControlChip(c)}<p>${esc(exShort(c.description,220))}</p><small>${c.riskIds.length} kopplade risker · ${exTopCount(c)} i topp 50</small></div>`).join('')||'<p class="ex-note">Inga åtgärder har en preciserad koppling till just dessa mål. Riskernas ursprungliga åtgärdsbeskrivningar finns på risksidorna.</p>'}</section></div>`;
}
function exComparisonContent() {
  const controls=[...exState.compare].map(id=>EX_CONTROLS.get(id)).filter(Boolean);
  const union=[...new Set(controls.flatMap(c=>c.riskIds))];
  const shared=union.filter(id=>controls.every(c=>c.riskIds.includes(id)));
  const scenarios=new Set(controls.filter(exAuthority).map(c=>c.scenario));
  const pairwise=union.filter(id=>controls.filter(c=>c.riskIds.includes(id)).length>=2&&!shared.includes(id));
  return `<div class="ex-detail-heading"><div class="eyebrow">Jämför motåtgärder</div><h2 id="exDialogTitle">Var överlappar åtgärderna?</h2><p>Jämför vilka risker varje åtgärd är kopplad till. Välj upp till tre i registret.</p></div><div class="ex-summary-strip">${exMetric(union.length,'unika risker tillsammans')}${exMetric(union.filter(id=>RANKING.topRiskIds.has(id)).length,'unika topp-50-risker')}${exMetric(shared.length,'gemensamma för alla valda')}</div>
    ${scenarios.size>1?'<p class="ex-note">Urvalet innehåller flera scenarier. Jämförelsen visar gemensamma och ytterligare riskkopplingar; den summerar ingen riskreducerande effekt.</p>':''}<div class="ex-comparison" style="--ex-comparison-cols:${Math.max(controls.length,1)}">${controls.map(c=>{const others=controls.filter(x=>x.id!==c.id);const additional=c.riskIds.filter(id=>!others.some(o=>o.riskIds.includes(id)));return `<section><h3><button class="ex-text-link" data-ex-control="${esc(c.id)}">${esc(c.title)}</button></h3><dl><dt>Topp 50</dt><dd>${exTopCount(c)}</dd><dt>Alla kopplade risker</dt><dd>${c.riskIds.length}</dd><dt>Endast denna åtgärd i jämförelsen</dt><dd>${additional.length}</dd><dt>Processer</dt><dd>${c.chartKeys.join(', ')}</dd><dt>Avsedd roll</dt><dd>${esc(exRole(c.role))}</dd>${exAuthority(c)?`<dt>Ansvar / scenario</dt><dd>Myndigheten · ${esc(exScenario(c))}</dd><dt>Effekt</dt><dd>Ej uppmätt</dd>`:''}</dl><h4>Ytterligare kopplade risker</h4>${exRiskConnections(additional)}${additional.length?'':'<p class="ex-note">Alla riskkopplingar delas med någon annan vald åtgärd.</p>'}${exGraphLink('control',c.id)}</section>`;}).join('')}</div>${exScopeNote()}<section class="ex-shared-section"><h3>Gemensamma risker för alla valda (${shared.length})</h3>${exRiskConnections(shared)||''}${shared.length?'':'<p class="ex-note">Ingen risk är kopplad till samtliga valda åtgärder.</p>'}</section>${pairwise.length?`<section class="ex-shared-section"><h3>Risker som delas av två av de valda åtgärderna (${pairwise.length})</h3>${pairwise.map(id=>`<div>${exRiskConnections([id])}<p class="ex-note">${controls.filter(c=>c.riskIds.includes(id)).map(c=>esc(c.title)).join(' · ')}</p></div>`).join('')}</section>`:''}`;
}

function exBowTie(risk, selectedControlId) {
  const orderedOccurrences=(kind,items)=>items.map(item=>EX_DATA.occurrences.find(o=>o.riskId===risk.risk_id&&o.kind===kind&&o.text===item.text)).filter(Boolean);
  const causes=orderedOccurrences('cause',triggerFactors(risk));
  const effects=orderedOccurrences('effect',consequences(risk));
  const controls=[...(EX_BY_RISK.get(risk.risk_id)||[])].sort((a,b)=>exControlPriority(b)-exControlPriority(a)||exControlOrder(a,b));
  const selected=controls.find(c=>c.id===selectedControlId)||controls[0];
  const targets=(selected?.targets||[]).filter(t=>t.riskId===risk.risk_id);
  const targetIds=new Set(targets.map(t=>t.targetId));
  const count=Math.max(causes.length,effects.length,1), rowH=146, nodeH=126;
  const width=1260, height=count*rowH+205, eventY=count*rowH/2-56;
  const points=new Map();
  const causal=[];
  const occNode=(o,i,kind)=>{
    const x=kind==='cause'?20:895,y=50+i*rowH,w=345;
    points.set(o.id,{x:x+w/2,y:y+nodeH/2,side:kind,edgeX:kind==='cause'?x+w:x});
    causal.push(`<path d="${kind==='cause'?`M ${x+w} ${y+nodeH/2} C 415 ${y+nodeH/2},420 ${eventY+64},475 ${eventY+64}`:`M 785 ${eventY+64} C 845 ${eventY+64},845 ${y+nodeH/2},895 ${y+nodeH/2}`}" class="ex-bow-causal" marker-end="url(#exArrowCausal)"/>`);
    const concepts=EX_CONCEPTS_BY_OCCURRENCE.get(o.id)||[];
    return `<foreignObject x="${x}" y="${y}" width="${w}" height="${nodeH}"><div xmlns="http://www.w3.org/1999/xhtml" class="ex-bow-node ${kind} ${targetIds.has(o.id)?'targeted':''}" data-occurrence-id="${esc(o.id)}"><button class="ex-bow-occurrence" data-ex-occurrence="${esc(o.id)}">${esc(o.text)}</button><span class="ex-bow-evidence">${o.basis==='source'?'Källförankrad':'Analys'}${concepts.length?` · ${new Set(concepts.flatMap(c=>c.riskIds)).size} risker med relaterat innehåll`:''}</span></div></foreignObject>`;
  };
  const nodes=causes.map((o,i)=>occNode(o,i,'cause')).join('')+effects.map((o,i)=>occNode(o,i,'effect')).join('');
  points.set(risk.risk_id,{x:630,y:eventY+64,side:'event',edgeX:630});
  const controlY=height-102;
  const links=targets.map(t=>{
    const p=t.type==='event'?points.get(risk.risk_id):points.get(t.targetId);
    if(!p) return '';
    const targetX=p.side==='event'?630:p.side==='cause'?p.x+172:p.x-172;
    const targetY=p.side==='event'?eventY+128:p.y;
    return `<path d="M 630 ${controlY} C 630 ${controlY-40},${targetX} ${controlY-40},${targetX} ${targetY}" class="ex-bow-control-edge" marker-end="url(#exArrowControl)"/>`;
  }).join('');
  return `<div class="ex-bow-controls"><span>Utforska en motåtgärds mål</span>${controls.map(c=>`<button class="btn ${selected?.id===c.id?'ex-control-active':''}" data-ex-bow-control="${esc(c.id)}">${c.kind==='source'?'Ursprunglig åtgärdsbeskrivning':esc(c.title)}</button>`).join('')||'<span class="ex-note">Ingen preciserad placering finns ännu. Se den ursprungliga åtgärden under Motåtgärder.</span>'}</div>
    <div class="ex-bow-scroll"><svg class="ex-bow-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="Bow tie för ${esc(risk.title)}"><defs><marker id="exArrowCausal" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="#8d969e"/></marker><marker id="exArrowControl" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="#3568a7"/></marker></defs><text x="20" y="25" class="ex-bow-label">ORSAKER</text><text x="475" y="25" class="ex-bow-label">RISKHÄNDELSE</text><text x="895" y="25" class="ex-bow-label">KONSEKVENSER</text>${causal.join('')}${links}${nodes}<foreignObject x="475" y="${eventY}" width="310" height="128"><div xmlns="http://www.w3.org/1999/xhtml" class="ex-bow-event ${targets.some(t=>t.type==='event')?'targeted':''}"><small>${esc(risk.risk_id)}</small><strong>${esc(risk.title)}</strong></div></foreignObject>${selected?`<foreignObject x="440" y="${controlY}" width="380" height="84"><button xmlns="http://www.w3.org/1999/xhtml" class="ex-bow-control-node" data-ex-control="${esc(selected.id)}"><small>MOTÅTGÄRD · ${esc(exRole(selected.role))}</small><strong>${esc(selected.title)}</strong></button></foreignObject>`:''}</svg></div>
    <div class="ex-bow-legend"><span><i class="ex-line causal"></i>Kan leda till</span><span><i class="ex-line control"></i>Åtgärdens avsedda mål</span><span>Välj en orsak eller konsekvens för att undersöka sambanden.</span></div>
    ${selected?`<div class="ex-bow-selection"><div><strong>${esc(selected.title)}</strong><p>${targets.length} mål i denna risk · ${selected.riskIds.length} kopplade risker totalt · ${exTopCount(selected)} i topp 50</p>${exAuthorityBadge(selected)}<small>${exAuthority(selected)?'Föreslagen myndighetskontroll. Kopplingarna är effekthypoteser; effekt är ej uppmätt.':selected.kind==='source'?'Övergripande koppling från riskregistret. Exakt mål i förloppet är inte preciserat.':'Analytisk placering, baserad på åtgärdstexten.'}</small></div>${exGraphLink('control',selected.id,'Se alla kopplade risker')}</div>`:''}
    <div id="exOccurrencePanel" class="ex-occurrence-panel" hidden></div>`;
}
function exRiskContent(r, tab='bow', controlId) {
  const controls=[...(EX_BY_RISK.get(r.risk_id)||[])].sort((a,b)=>exControlPriority(b)-exControlPriority(a)||exControlOrder(a,b));
  return `<div class="ex-detail-heading"><div class="ex-risk-meta">${rankBadge(r.risk_id)}<span class="ex-mono">${esc(r.risk_id)}</span><span>${esc(r.chart_key)}</span></div><h2 id="exDialogTitle">${esc(r.title)}</h2><p>${esc(r.description)}</p></div><div class="ex-tabs" role="tablist" aria-label="Riskperspektiv">${[['bow','Bow tie'],['controls',`Motåtgärder (${controls.length})`],['details','Underlag & källor']].map(([id,label])=>`<button role="tab" id="exTab-${id}" aria-controls="exRiskPanel" tabindex="${tab===id?0:-1}" aria-selected="${tab===id}" class="${tab===id?'active':''}" data-ex-risk-tab-select="${id}">${label}</button>`).join('')}<span></span>${exGraphLink('risk',r.risk_id,'Visa samband')}<button class="btn" data-open-node="${esc(r.node_id)}">${esc(r.node_id)} · Processkarta</button></div><div id="exRiskPanel" class="ex-risk-panel" role="tabpanel" aria-labelledby="exTab-${tab}">
    ${tab==='bow'?exBowTie(r,controlId):tab==='controls'?`<h3>Motåtgärder kopplade till risken</h3>${controls.map(c=>`<section class="ex-control-summary"><div><button class="ex-text-link" data-ex-control="${esc(c.id)}">${esc(c.title)}</button><small>${esc(exControlLabel(c))} · ${esc(exRole(c.role))}</small>${exAuthorityBadge(c)}</div><p>${esc(c.description)}</p><div class="ex-actions"><span>${c.riskIds.length} kopplade risker · ${exTopCount(c)} i topp 50</span>${exGraphLink('control',c.id)}</div></section>`).join('')}${exScopeNote()}`:`${rankDetail(r)}<div class="ex-detail-columns"><section><h3>Motivering</h3><p>${esc(r.motivation)}</p><h3>Berörda delar av processen</h3><p>${esc(r.affects)}</p><h3>Ursprunglig motåtgärd</h3><p>${esc(r.mitigation)}</p></section><section><h3>Riskens sammanhang</h3><dl class="ex-facts"><dt>Process</dt><dd>${esc(CHART_NAME[r.chart_key])}</dd><dt>Nod</dt><dd>${esc(r.node_id)} · ${esc(r.node_label)}</dd><dt>Kategori</dt><dd>${esc(r.category)}</dd><dt>Ursprung</dt><dd>${esc(r.origin)}</dd></dl><h3>Källor</h3><div class="refs">${r.source_refs.map(refLink).join('')}</div></section></div><details class="ex-method"><summary>Orsaker och konsekvenser som text</summary>${EX_DATA.occurrences.filter(o=>o.riskId===r.risk_id).map(o=>`<div class="ex-source-quote"><span class="ex-target-label ${o.kind}">${o.kind==='cause'?'Orsak':'Konsekvens'}</span><p>${esc(o.text)}</p><small>${o.basis==='source'?'Källförankrad premiss':'Analytisk bedömning'}</small><div class="refs">${o.source_refs.map(refLink).join('')}</div></div>`).join('')}</details>`}</div>`;
}

function exShowOccurrence(id) {
  const o=EX_OCCURRENCES.get(id); if(!o)return;
  const concepts=EX_CONCEPTS_BY_OCCURRENCE.get(id)||[];
  const controls=EX_DATA.controls.filter(c=>c.targets.some(t=>t.targetId===id));
  const panel=$('#exOccurrencePanel');
  if(!panel)return;
  panel.hidden=false;
  panel.innerHTML=`<div class="ex-inspector-head"><strong>${o.kind==='cause'?'Orsak':'Konsekvens'}</strong><button class="ex-text-link" id="exCloseOccurrence">Stäng detalj</button></div><p>${esc(o.text)}</p><div class="refs">${o.source_refs.map(refLink).join('')}<span class="ex-note">${o.basis==='source'?'Källförankrad premiss':'Analytisk bedömning'}</span></div><h4>Återkommer i andra risker</h4>${concepts.map(c=>`<button class="btn" data-ex-concept="${esc(c.id)}">${esc(exShort(c.label,100))} · ${c.riskIds.length} risker · ${c.matchType==='exact'?'samma formulering':'liknande innehåll'}</button>`).join('')||'<p class="ex-note">Ingen gemensam formulering eller liknande grupp har kopplats till detta mål.</p>'}<h4>Motåtgärder vid detta mål</h4>${controls.map(exControlChip).join('')||'<p class="ex-note">Ingen åtgärd har en preciserad koppling till detta mål.</p>'}`;
  $('#exCloseOccurrence').onclick=()=>{panel.hidden=true;};
  panel.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function exEnsureDialog() {
  let dialog=$('#exDialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='exDialog';dialog.className='ex-dialog';dialog.setAttribute('aria-labelledby','exDialogTitle');document.body.append(dialog);
    dialog.addEventListener('close',()=>{if(!dialog.open){exState.dialog=null;exState.stack=[];exSyncRoute();}});
    dialog.addEventListener('click',e=>{if(e.target===dialog) exCloseDialog();});
  }
  return dialog;
}
function exOpenDialog(next,{stack=true,route=true}={}) {
  if(stack&&exState.dialog)exState.stack.push({...exState.dialog});
  else if(!exState.dialog)exState.stack=[];
  exState.dialog=next;
  const dialog=exEnsureDialog();
  let body='';
  if(next.type==='risk')body=exRiskContent(EX_RISKS.get(next.id),next.tab,next.controlId);
  else if(next.type==='control')body=exControlContent(EX_CONTROLS.get(next.id));
  else if(next.type==='concept')body=exConceptContent(EX_CONCEPTS.get(next.id));
  else body=exComparisonContent();
  dialog.innerHTML=`<div class="ex-dialog-toolbar">${exState.stack.length?'<button class="btn" id="exDialogBack">Tillbaka</button>':'<span>Utforska sambanden</span>'}<span class="ex-toolbar-spacer"></span><button class="btn" id="exPermalink">Kopiera länk</button><button class="btn" id="exDialogClose" aria-label="Stäng detalj">Stäng</button></div><div class="ex-dialog-content">${body}</div>`;
  if(!dialog.open)dialog.showModal();
  $('#exDialogClose').onclick=exCloseDialog;
  if($('#exDialogBack'))$('#exDialogBack').onclick=()=>{const previous=exState.stack.pop();exOpenDialog(previous,{stack:false});};
  $('#exPermalink').onclick=async()=>{try {await navigator.clipboard.writeText(location.href);$('#exPermalink').textContent='Länken kopierad';}catch{$('#exPermalink').textContent='Kopiera adressen i webbläsaren';}};
  bindRankingLinks(dialog);
  dialog.querySelectorAll('[data-open-node]').forEach(b=>b.onclick=()=>{const id=b.dataset.openNode;exCloseDialog();openProcessNode(id);exSyncRoute();});
  dialog.scrollTop=0;
  dialog.querySelectorAll('[role=tab]').forEach(el=>el.onkeydown=e=>{const ids=['bow','controls','details'];let index=ids.indexOf(el.dataset.exRiskTabSelect);if(e.key==='ArrowRight')index=(index+1)%3;else if(e.key==='ArrowLeft')index=(index+2)%3;else if(e.key==='Home')index=0;else if(e.key==='End')index=2;else return;e.preventDefault();exOpenDialog({...exState.dialog,tab:ids[index]},{stack:false});document.querySelector('#exTab-'+ids[index]).focus();});
  if(route)exSyncRoute();
}
function openExplorerRisk(id,tab='bow') {if(EX_RISKS.has(id))exOpenDialog({type:'risk',id,tab});}
function exOpenControl(id) {if(EX_CONTROLS.has(id))exOpenDialog({type:'control',id});}
function exOpenConcept(id) {if(EX_CONCEPTS.has(id))exOpenDialog({type:'concept',id});}
function exCloseDialog() {const d=$('#exDialog');exState.dialog=null;exState.stack=[];if(d?.open)d.close();exSyncRoute();}
function exSyncRoute() {
  const u=new URL(location.href);
  for(const key of ['view','risk','control','concept','focus','top','q','compare','tab','action','charts','cats','origins','node','sort','driver','scenario','controlq','controlkind','controlchart','controlsort'])u.searchParams.delete(key);
  if(state.view!=='risks')u.searchParams.set('view',state.view);
  if(state.view==='risks'){if(state.topOnly)u.searchParams.set('top','1');if(state.q)u.searchParams.set('q',state.q);}
  if(state.view==='graph'&&exState.graphSelection?.id)u.searchParams.set('focus',`${exState.graphSelection.type}:${exState.graphSelection.id}`);
  if(exState.dialog?.id)u.searchParams.set(exState.dialog.type,exState.dialog.id);
  if(exState.dialog?.type==='risk'){if(exState.dialog.tab!=='bow')u.searchParams.set('tab',exState.dialog.tab);if(exState.dialog.controlId)u.searchParams.set('action',exState.dialog.controlId);}
  if(state.charts.size!==CHARTS.length)u.searchParams.set('charts',[...state.charts].join(','));
  if(state.cats.size!==CATEGORIES.length)u.searchParams.set('cats',[...state.cats].join(','));
  if(state.origins.size!==ORIGINS.length)u.searchParams.set('origins',[...state.origins].join(','));
  if(state.node)u.searchParams.set('node',state.node);
  if(state.sort!=='rank')u.searchParams.set('sort',state.sort);
  if(state.view==='controls'){if(exState.controlDriver!=='all')u.searchParams.set('driver',exState.controlDriver);if(exState.controlDriver==='authority')u.searchParams.set('scenario',exState.controlScenario);if(exState.controlQ)u.searchParams.set('controlq',exState.controlQ);if(exState.controlKind!=='all')u.searchParams.set('controlkind',exState.controlKind);if(exState.controlChart)u.searchParams.set('controlchart',exState.controlChart);if(exState.controlSort!=='top')u.searchParams.set('controlsort',exState.controlSort);}
  if(exState.dialog?.type==='compare')u.searchParams.set('compare',[...exState.compare].join(','));
  history.replaceState(null,'',u);
}
function exInit() {
  document.addEventListener('click',event=>{
    const el=event.target.closest('button');if(!el)return;
    if(el.dataset.exRisk)openExplorerRisk(el.dataset.exRisk,el.dataset.exRiskTab||'bow');
    else if(el.dataset.exControl)exOpenControl(el.dataset.exControl);
    else if(el.dataset.exConcept)exOpenConcept(el.dataset.exConcept);
    else if(el.dataset.exGraphType)exShowGraph(el.dataset.exGraphType,el.dataset.exGraphId);
    else if(el.dataset.exView){exCloseDialog();setView(el.dataset.exView);exSyncRoute();}
    else if(el.dataset.exOccurrence)exShowOccurrence(el.dataset.exOccurrence);
    else if(el.dataset.exRiskTabSelect){const current={...exState.dialog,tab:el.dataset.exRiskTabSelect};exOpenDialog(current,{stack:false});$('#exTab-'+current.tab)?.focus();}
    else if(el.dataset.exBowControl){const current={...exState.dialog,controlId:el.dataset.exBowControl};exOpenDialog(current,{stack:false});}
    else if(el.dataset.exAddCompare){if(exState.compare.size<3||exState.compare.has(el.dataset.exAddCompare)){exState.compare.add(el.dataset.exAddCompare);exOpenDialog({...exState.dialog},{stack:false});if(state.view==='controls')renderControls();}}
    else if(el.hasAttribute('data-ex-open-compare'))exOpenDialog({type:'compare'});
  });
  document.addEventListener('change',event=>{const el=event.target;if(el.dataset.exCompare){el.checked?exState.compare.add(el.dataset.exCompare):exState.compare.delete(el.dataset.exCompare);renderControls();const cb=document.querySelector(`[data-ex-compare="${CSS.escape(el.dataset.exCompare)}"]`);cb?.focus();}});
  const params=new URLSearchParams(location.search);
  if(['all','authority','other'].includes(params.get('driver')))exState.controlDriver=params.get('driver');
  if(params.get('scenario')==='all'||EX_AUTHORITY_SCENARIOS[params.get('scenario')])exState.controlScenario=params.get('scenario');
  if(['all','shared','source'].includes(params.get('controlkind'))&&exState.controlDriver!=='authority')exState.controlKind=params.get('controlkind');
  if(CHARTS.includes(params.get('controlchart')))exState.controlChart=params.get('controlchart');
  if(['top','reach','name'].includes(params.get('controlsort')))exState.controlSort=params.get('controlsort');
  exState.controlQ=params.get('controlq')||'';
  const initialView=params.get('view');
  if(['risks','ranking','controls','graph','process','nodes','stats'].includes(initialView))state.view=initialView;
  state.topOnly=params.get('top')==='1';state.q=params.get('q')||'';$('#search').value=state.q;
  const focus=params.get('focus');if(focus){const split=focus.indexOf(':');exState.graphSelection={type:focus.slice(0,split),id:focus.slice(split+1)};}
  if(params.get('compare')) for(const id of params.get('compare').split(','))if(EX_CONTROLS.has(id)&&exState.compare.size<3)exState.compare.add(id);
  for(const [key,values] of [['charts',CHARTS],['cats',CATEGORIES],['origins',ORIGINS]])if(params.has(key))state[key]=new Set(params.get(key).split(',').filter(v=>values.includes(v)));
  if(NODE_BY_ID[params.get('node')])state.node=params.get('node');
  if([...$('#sort').options].some(o=>o.value===params.get('sort')))state.sort=params.get('sort');
  $('#sort').value=state.sort;
  renderSidebar();setView(state.view);
  if(params.get('risk')&&EX_RISKS.has(params.get('risk')))exOpenDialog({type:'risk',id:params.get('risk'),tab:['bow','controls','details'].includes(params.get('tab'))?params.get('tab'):'bow',controlId:params.get('action')});
  else if(params.get('control')&&EX_CONTROLS.has(params.get('control')))exOpenControl(params.get('control'));
  else if(params.get('concept')&&EX_CONCEPTS.has(params.get('concept')))exOpenConcept(params.get('concept'));
  else if(exState.compare.size>=2&&params.get('compare'))exOpenDialog({type:'compare'});
}

/** A stable, read-only overview. Shared concepts never expand a control's scope. */
export function createKnowledgeGraph(options) {
  const {container, risks = [], data = {}, ranking = {}, chartNames = {}, onRisk, onControl, onConcept, onSelection} = options;
  if (!container) throw new Error('Sambandskartan behöver en behållare.');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sv');
  const unique = values => [...new Set(values)];
  const byRisk = new Map(risks.map(risk => [risk.risk_id, risk]));
  const controls = data.controls || [];
  const concepts = data.concepts || [];
  const byControl = new Map(controls.map(control => [control.id, control]));
  const byConcept = new Map(concepts.map(concept => [concept.id, concept]));
  const byOccurrence = new Map((data.occurrences || []).map(occurrence => [occurrence.id, occurrence]));
  const topRiskIds = ranking.topRiskIds || new Set();
  const rankFor = id => ranking.byRiskId?.get(id)?.rank;
  const riskOrder = (a, b) => (rankFor(a) ?? Infinity) - (rankFor(b) ?? Infinity) || a.localeCompare(b, 'sv');
  const validRiskIds = item => unique(item?.riskIds || []).filter(id => byRisk.has(id));
  const chartLabel = key => {
    const label = typeof chartNames[key] === 'string' ? chartNames[key] : chartNames[key]?.label || chartNames[key]?.name || key;
    return label === key ? 'Process' : label.replace(new RegExp(`^${key}(?:\\s*[–—:·-]\\s*|\\s+)`, 'i'), '');
  };
  const charts = unique(risks.map(risk => risk.chart_key)).sort();
  const conceptOrder = (a, b) => validRiskIds(b).length - validRiskIds(a).length || a.label.localeCompare(b.label, 'sv');
  const causeConcepts = concepts.filter(item => item.kind === 'cause').sort(conceptOrder);
  const effectConcepts = concepts.filter(item => item.kind === 'effect').sort(conceptOrder);
  const sharedControls = controls.filter(item => validRiskIds(item).length > 1).sort((a,b) => validRiskIds(b).filter(id => topRiskIds.has(id)).length - validRiskIds(a).filter(id => topRiskIds.has(id)).length || validRiskIds(b).length - validRiskIds(a).length || a.id.localeCompare(b.id));
  const state = {selection:null, query:'', process:'', top:false, zoom:1, matches:null};
  const abort = new AbortController();
  const listenerOptions = {signal:abort.signal};
  const NS = 'http://www.w3.org/2000/svg';
  const width = 1560;
  const bandHeight = 110;
  const height = 255 + charts.length * bandHeight;
  let graphNodes = [], graphEdges = [], svg, status, inspector, searchResults, selectionSummary;
  const catalog = [
    ...risks.map(item => ({id:item.risk_id,type:'risk',label:item.title,kind:'Risk',riskIds:[item.risk_id],search:[item.risk_id,item.title,item.trigger,item.impact,item.chart_key,chartLabel(item.chart_key),item.node_label,...(data.occurrences || []).filter(occurrence => occurrence.riskId === item.risk_id).map(occurrence => occurrence.text)].join(' ')})),
    ...concepts.map(item => ({id:item.id,type:'concept',label:item.label,kind:item.kind === 'cause' ? 'Orsak' : 'Konsekvens',riskIds:validRiskIds(item),search:[item.id,item.label,...(item.occurrenceIds || []).map(id => byOccurrence.get(id)?.text || '')].join(' ')})),
    ...controls.map(item => ({id:item.id,type:'control',label:item.title,kind:'Motåtgärd',riskIds:validRiskIds(item),search:[item.id,item.title,item.description].join(' ')})),
  ].map(item => ({...item,search:normalize(item.search)}));

  container.classList.add('knowledge-graph');
  container.innerHTML = `
    <div class="kg-overview-counts" aria-label="Kartans innehåll"><span><b>${risks.length}</b> enskilda risker</span><span><b>${concepts.length}</b> orsaks- och konsekvensgrupper</span><span><b>${sharedControls.length}</b> sammanförda motåtgärder</span><span><b>${controls.filter(c=>c.kind==='source').length}</b> originalbeskrivningar</span><span><b>${charts.length}</b> processer</span></div>
    <div class="kg-toolbar">
      <label class="kg-search-label">Sök i hela kartan<input class="kg-search" type="search" placeholder="Risk, motåtgärd, orsak eller konsekvens…" autocomplete="off"></label>
      <label>Markera process<select class="kg-process"><option value="">Alla processer</option>${charts.map(key => `<option value="${escape(key)}">${escape(key)} · ${escape(chartLabel(key))}</option>`).join('')}</select></label>
      <button class="btn kg-top" type="button" aria-pressed="false">Markera topp 50</button>
      <button class="btn" type="button" data-kg-action="reset">Återställ vy</button>
    </div>
    <div class="kg-search-results" aria-label="Sökresultat" hidden></div>
    <div class="kg-legend" aria-label="Teckenförklaring"><span><i class="kg-key kg-key-risk"></i>Risk</span><span><i class="kg-key kg-key-top"></i>Topp 50</span><span><i class="kg-key kg-key-cause"></i>Delad orsak</span><span><i class="kg-key kg-key-effect"></i>Delad konsekvens</span><span><i class="kg-key kg-key-control"></i>Motåtgärd</span><span class="kg-legend-line">Samma ordalydelse</span><span class="kg-legend-line kg-legend-dashed">Tematisk likhet / åtgärdskoppling</span></div>
    <div class="kg-selection-summary" aria-label="Valt samband och genväg till detaljer" hidden></div>
    <div class="kg-layout"><div class="kg-map-shell"><div class="kg-map-top"><span class="kg-status" role="status" aria-live="polite"></span><div class="kg-zoom" aria-label="Kartans zoom"><button type="button" data-kg-action="zoom-out" aria-label="Zooma ut">−</button><span class="kg-zoom-level">100 %</span><button type="button" data-kg-action="zoom-in" aria-label="Zooma in">+</button><button type="button" data-kg-action="fit">Anpassa</button></div></div><div class="kg-viewport" tabindex="0" aria-label="Sambandskarta, bläddra för att flytta den förstorade kartan"></div><p class="kg-map-caption"></p></div><aside class="kg-inspector" aria-label="Valt samband"></aside></div>
    <details class="kg-accessible"><summary>Utforska som lista – alla risker och deras samband</summary><div class="kg-accessible-body"><label>Välj en risk<select class="kg-risk-picker"><option value="">Välj bland alla ${risks.length} risker</option>${[...risks].sort((a,b) => riskOrder(a.risk_id,b.risk_id)).map(risk => `<option value="${escape(risk.risk_id)}">${rankFor(risk.risk_id) ? '#'+rankFor(risk.risk_id)+' · ' : ''}${escape(risk.risk_id)} · ${escape(risk.title)}</option>`).join('')}</select></label><p>Valet markerar riskens samband i kartan och visar dem som en läsbar lista. Sökfältet ovan hittar även samtliga motåtgärder, orsaker och konsekvenser.</p></div></details>
    <p class="kg-method">Cirklarna representerar enskilda risker. Topp 50 följer BTL-rankningen; en koppling eller ett antal anger varken sannolikhet eller åtgärdens effekt. Tematiska grupper är analytiska sammanställningar med bevarad originaltext.</p>`;
  status = container.querySelector('.kg-status');
  inspector = container.querySelector('.kg-inspector');
  searchResults = container.querySelector('.kg-search-results');
  selectionSummary = container.querySelector('.kg-selection-summary');

  function element(tag, attributes = {}, text) {
    const el = document.createElementNS(NS, tag);
    for (const [key,value] of Object.entries(attributes)) el.setAttribute(key,String(value));
    if (text != null) el.textContent = text;
    return el;
  }
  function wrappedLabel(group, text, x, y, maxWidth = 27, maxLines = 3) {
    const words = String(text).split(/\s+/), lines = []; let line = '';
    for (const word of words) {
      if (line && (line+' '+word).length > maxWidth) { lines.push(line); line = word; } else line += (line ? ' ' : '')+word;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0,maxLines);
    if (lines.length > maxLines) shown[maxLines-1] = shown[maxLines-1].replace(/[.,;:]$/,'')+'…';
    const node = element('text', {x,y,class:'kg-hub-label'});
    shown.forEach((line,index) => node.append(element('tspan',{x,dy:index ? 15 : 0},line)));
    group.append(node);
    return shown.length;
  }
  function entityRiskIds(selection) {
    if (!selection) return [];
    if (selection.type === 'risk') return byRisk.has(selection.id) ? [selection.id] : [];
    return validRiskIds(selection.type === 'control' ? byControl.get(selection.id) : byConcept.get(selection.id));
  }
  function selectedEntity(selection = state.selection) {
    return selection?.type === 'risk' ? byRisk.get(selection.id) : selection?.type === 'control' ? byControl.get(selection.id) : byConcept.get(selection?.id);
  }
  function visibleConcepts(items) {
    const visible = items.slice(0,8);
    const chosen = state.selection?.type === 'concept' ? byConcept.get(state.selection.id) : null;
    if (chosen && items.includes(chosen) && !visible.includes(chosen)) visible.push(chosen);
    return visible;
  }
  function renderGraph() {
    graphNodes = []; graphEdges = [];
    const viewport = container.querySelector('.kg-viewport');
    svg = element('svg',{viewBox:`0 0 ${width} ${height}`,class:'kg-svg',role:'img','aria-label':`Sambandskarta med alla ${risks.length} risker. Välj en risk via listan under kartan för tangentbordsnavigering.`});
    svg.append(element('title',{},`Alla ${risks.length} risker med delade orsaker, konsekvenser och motåtgärder`));
    svg.append(element('desc',{},'Risker visas som cirklar i processband. Orsaker ligger till vänster, konsekvenser till höger och motåtgärder överst. En markering behåller samtliga risker. En likhet mellan formuleringar är inte ett bevis på statistiskt beroende.'));
    const bands = element('g',{class:'kg-bands'}), edges = element('g',{class:'kg-edges'}), nodes = element('g',{class:'kg-nodes'});
    svg.append(bands,edges,nodes);
    bands.append(element('text',{x:34,y:44,class:'kg-column-label'},'ÅTERKOMMANDE ORSAKER'));
    bands.append(element('text',{x:452,y:44,class:'kg-column-label'},'MOTÅTGÄRDER MED FLERA RISKKOPPLINGAR'));
    bands.append(element('text',{x:1260,y:44,class:'kg-column-label'},'DELade KONSEKVENSER'.toLocaleUpperCase('sv')));
    bands.append(element('text',{x:452,y:180,class:'kg-column-label'},`ALLA ${risks.length} RISKER · GRUPPERADE EFTER PROCESS`));
    const positions = new Map();
    charts.forEach((chart,index) => {
      const items = risks.filter(risk => risk.chart_key === chart).sort((a,b) => a.risk_id.localeCompare(b.risk_id));
      const y = 198 + index * bandHeight;
      bands.append(element('rect',{x:426,y,width:706,height:101,rx:7,class:'kg-process-band'}));
      const name = chartLabel(chart);
      bands.append(element('text',{x:446,y:y+19,class:'kg-band-label'},`${chart} · ${name.length > 73 ? name.slice(0,70)+'…' : name} · ${items.length} risker`));
      items.forEach((risk,itemIndex) => {
        const x = 453 + (itemIndex % 24) * 28.2, cy = y + 37 + Math.floor(itemIndex / 24) * 17;
        positions.set(risk.risk_id,{x,y:cy});
        const group = element('g',{class:`kg-risk-node${topRiskIds.has(risk.risk_id) ? ' kg-is-top' : ''}`,'data-risk-id':risk.risk_id,'data-kg-type':'risk','data-kg-id':risk.risk_id,role:'button','aria-label':`${risk.risk_id}: ${risk.title}`,tabindex:'-1'});
        group.append(element('circle',{cx:x,cy,r:5.5}));
        group.append(element('circle',{cx:x,cy,r:9,class:'kg-node-hit'}));
        group.append(element('title',{},`${risk.risk_id}${rankFor(risk.risk_id) ? ' · BTL-rang '+rankFor(risk.risk_id) : ' · Ej rankad'}\n${risk.title}\n${chart} · ${name}`));
        nodes.append(group); graphNodes.push({el:group,type:'risk',id:risk.risk_id,riskIds:[risk.risk_id]});
      });
    });
    function addEdge(from, riskId, type, id, kind, semantic) {
      const to = positions.get(riskId); if (!to) return;
      const isControl = type === 'control';
      let d;
      if (isControl) d = `M ${from.x} ${from.y} C ${from.x} ${from.y+70}, ${to.x} ${to.y-35}, ${to.x} ${to.y}`;
      else if (kind === 'cause') d = `M ${from.x} ${from.y} C 365 ${from.y}, 390 ${to.y}, ${to.x} ${to.y}`;
      else d = `M ${to.x} ${to.y} C 1164 ${to.y}, 1198 ${from.y}, ${from.x} ${from.y}`;
      const path = element('path',{d,class:`kg-edge${isControl ? ' kg-edge-control' : ''}${semantic ? ' kg-edge-semantic' : ''}`,'data-edge-kind':isControl ? 'explicit-control-risk' : semantic ? 'semantic-membership' : 'exact-membership','data-edge-risk-id':riskId});
      edges.append(path); graphEdges.push({el:path,type,id,riskId});
    }
    const visibleCauses = visibleConcepts(causeConcepts), visibleEffects = visibleConcepts(effectConcepts);
    function addConcepts(items, kind) {
      items.forEach((concept,index) => {
        const x = kind === 'cause' ? 24 : 1250;
        const centerY = 233 + index * Math.min(87,(height-315)/Math.max(1,items.length-1));
        const group = element('g',{class:`kg-hub kg-hub-${kind}${concept.matchType === 'semantic' ? ' kg-hub-semantic' : ''}`,'data-kg-type':'concept','data-kg-id':concept.id,role:'button',tabindex:'-1','aria-label':concept.label});
        group.append(element('rect',{x,y:centerY-34,width:286,height:76,rx:kind === 'cause' ? 6 : 18}));
        group.append(element('text',{x:x+13,y:centerY-16,class:'kg-hub-count'},`${validRiskIds(concept).length} risker · ${concept.matchType === 'exact' ? 'Samma ordalydelse' : 'Tematisk likhet'}`));
        wrappedLabel(group,concept.label,x+13,centerY+2,37,2);
        group.append(element('title',{},`${concept.label}\n${validRiskIds(concept).length} distinkta risker\n${concept.matchType === 'exact' ? 'Identisk originalformulering; separata förekomster är bevarade.' : 'Analytisk gruppering av liknande formuleringar; inte identiska händelser.'}`));
        nodes.append(group); graphNodes.push({el:group,type:'concept',id:concept.id,riskIds:validRiskIds(concept)});
        validRiskIds(concept).forEach(riskId => addEdge({x:kind === 'cause' ? x+286 : x,y:centerY},riskId,'concept',concept.id,kind,concept.matchType !== 'exact'));
      });
    }
    addConcepts(visibleCauses,'cause'); addConcepts(visibleEffects,'effect');
    const visibleControls = sharedControls.slice(0,4);
    if (state.selection?.type === 'control') {
      const chosen = byControl.get(state.selection.id);
      if (chosen && !visibleControls.includes(chosen)) visibleControls.push(chosen);
    }
    visibleControls.forEach((control,index) => {
      const cardWidth = visibleControls.length > 4 ? 137 : 174;
      const x = 428 + index * (cardWidth+5), y = 64;
      const group = element('g',{class:'kg-hub kg-hub-control','data-kg-type':'control','data-kg-id':control.id,role:'button',tabindex:'-1','aria-label':control.title});
      group.append(element('rect',{x,y,width:cardWidth,height:88,rx:5}));
      wrappedLabel(group,control.title,x+11,y+19,visibleControls.length > 4 ? 17 : 21,3);
      group.append(element('text',{x:x+11,y:y+76,class:'kg-control-count'},`${validRiskIds(control).length} risker · ${validRiskIds(control).filter(id => topRiskIds.has(id)).length} i topp 50`));
      group.append(element('title',{},`${control.title}\n${control.description || ''}\nKopplingarna avser uttryckligen dokumenterade mål inom ${validRiskIds(control).length} risker.`));
      nodes.append(group); graphNodes.push({el:group,type:'control',id:control.id,riskIds:validRiskIds(control)});
      validRiskIds(control).forEach(riskId => addEdge({x:x+cardWidth/2,y:y+88},riskId,'control',control.id,null,true));
    });
    if (!visibleControls.length) bands.append(element('text',{x:450,y:102,class:'kg-empty-label'},'Sök en motåtgärd för att visa dess kopplingar.'));
    viewport.replaceChildren(svg);
    container.querySelector('.kg-map-caption').textContent = `${risks.length} av ${risks.length} risker visas alltid. ${visibleCauses.length+visibleEffects.length} av ${concepts.length} orsaks- och konsekvensgrupper samt ${visibleControls.length} av ${controls.length} motåtgärder visas som noder. Sök fram valfri grupp eller åtgärd för att lägga den i kartan. Linjer visar gruppmedlemskap eller en åtgärds uttryckliga riskkopplingar; exakta mål visas vid val.`;
    applyZoom(); updateHighlights();
  }

  function updateHighlights() {
    let active = null;
    if (state.selection) active = new Set(entityRiskIds(state.selection));
    else if (state.query) active = new Set((state.matches || []).flatMap(item => item.riskIds));
    if (state.process || state.top) {
      active ||= new Set(risks.map(risk => risk.risk_id));
      for (const id of active) if ((state.process && byRisk.get(id)?.chart_key !== state.process) || (state.top && !topRiskIds.has(id))) active.delete(id);
    }
    for (const node of graphNodes) {
      const selected = state.selection?.id === node.id && state.selection?.type === node.type;
      const connected = !active || node.riskIds.some(id => active.has(id));
      node.el.classList.toggle('kg-muted',!connected);
      node.el.classList.toggle('kg-highlighted',!!active && connected);
      node.el.classList.toggle('kg-selected',selected);
      node.el.setAttribute('aria-pressed',String(selected));
    }
    for (const edge of graphEdges) {
      const selectedEntityEdge = state.selection && state.selection.type !== 'risk' ? edge.type === state.selection.type && edge.id === state.selection.id : true;
      const highlighted = !!active && active.has(edge.riskId) && selectedEntityEdge;
      edge.el.classList.toggle('kg-edge-highlighted',highlighted);
      edge.el.classList.toggle('kg-edge-muted',!!active && !highlighted);
    }
    status.textContent = active ? `${active.size} markerade · alla ${risks.length} risker synliga` : `Alla ${risks.length} risker synliga · ${topRiskIds.size} i topp 50`;
    container.querySelector('.kg-top').setAttribute('aria-pressed',String(state.top));
  }
  function riskButtons(ids) {
    return [...ids].sort(riskOrder).map(id => { const risk = byRisk.get(id); if (!risk) return ''; return `<li><button type="button" data-kg-select="risk" data-id="${escape(id)}"><span class="kg-list-rank${topRiskIds.has(id) ? ' kg-list-top' : ''}">${rankFor(id) ? '#'+rankFor(id) : '–'}</span><span><small>${escape(id)}</small>${escape(risk.title)}</span></button></li>`; }).join('');
  }
  function entityButton(item,type) { return `<button class="kg-entity-link" type="button" data-kg-select="${type}" data-id="${escape(item.id)}">${escape(item.title || item.label)}<small>${validRiskIds(item).length} kopplade risker</small></button>`; }
  function basisLabel(basis) { return basis === 'source' ? 'Källstöd' : basis === 'register' ? 'Riskregistret' : 'Analys'; }
  function renderInspector() {
    const selection = state.selection, item = selectedEntity();
    selectionSummary.hidden = !selection || !item;
    if (!selection || !item) {
      selectionSummary.replaceChildren();
      inspector.innerHTML = `<p class="kg-eyebrow">UTFORSKA SAMBANDEN</p><h3>Vad återkommer?</h3><p>Välj en orsak, konsekvens eller blå motåtgärd. De berörda riskerna markeras i hela registret.</p><div class="kg-inspector-tip"><strong>Hela bilden ligger kvar</strong><p>En markering dämpar övriga risker utan att ta bort dem. Riskernas positioner är fasta.</p></div><h4>Motåtgärder med bred koppling</h4>${sharedControls.slice(0,4).map(item => entityButton(item,'control')).join('') || '<p>Sök efter en motåtgärd för att undersöka dess mål.</p>'}<p class="kg-muted-copy">Antalet kopplingar visar dokumenterad räckvidd. Det är inte ett mått på genomförande eller effektivitet.</p>`;
      return;
    }
    const ids = entityRiskIds(selection), isControl = selection.type === 'control', isConcept = selection.type === 'concept';
    const title = item.title || item.label;
    const typeLabel = isControl ? 'MOTÅTGÄRD' : isConcept ? item.kind === 'cause' ? 'DELAD ORSAK' : 'DELAD KONSEKVENS' : 'RISK';
    selectionSummary.innerHTML = `<div><span class="kg-selection-type">${typeLabel}</span><strong>${escape(title)}</strong><span class="kg-selection-reach">${ids.length} ${isControl || isConcept ? 'kopplade risker' : 'vald risk'} · ${ids.filter(id => topRiskIds.has(id)).length} i topp 50${!isControl && !isConcept && rankFor(item.risk_id) ? ' · BTL-rang '+rankFor(item.risk_id) : ''}</span></div><button class="btn" type="button" data-kg-action="${isControl ? 'open-control' : isConcept ? 'open-concept' : 'open-risk'}">Öppna detaljer</button>`;
    let body = `<div class="kg-inspector-heading"><p class="kg-eyebrow">${typeLabel}</p><button type="button" data-kg-action="clear" aria-label="Rensa markering">×</button></div><h3>${escape(title)}</h3>`;
    if (isControl || isConcept) body += `<div class="kg-inspector-counts"><span><b>${ids.length}</b>kopplade risker</span><span><b>${ids.filter(id => topRiskIds.has(id)).length}</b>i topp 50</span><span><b>${unique(ids.map(id => byRisk.get(id).chart_key)).length}</b>processer</span></div>`;
    if (isControl) {
      body += `<p>${escape(item.description)}</p><p class="kg-inspector-note">${item.kind === 'shared' ? 'Analytiskt sammanställd motåtgärd med uttryckligen angivna mål.' : 'Motåtgärd importerad från riskens originaltext.'} Koppling innebär inte att åtgärden är genomförd eller bevisat effektiv.</p><button class="btn kg-primary" type="button" data-kg-action="open-control">Öppna motåtgärd</button><h4>Exakta mål</h4><p class="kg-muted-copy">Endast målen nedan ingår. En gemensam orsak utökar inte åtgärdens räckvidd.</p>`;
      const targets = item.targets || [];
      body += targets.length ? `<ul class="kg-targets">${targets.map(target => { const occurrence = byOccurrence.get(target.targetId); return `<li><span class="kg-target-kind">${target.type === 'cause' ? 'Orsak' : target.type === 'effect' ? 'Konsekvens' : 'Riskhändelse'} · ${escape(target.riskId)}</span><p>${escape(occurrence?.text || byRisk.get(target.riskId)?.title || target.targetId)}</p><small>${escape(basisLabel(target.basis))}${target.role ? ' · '+escape(roleLabel(target.role)) : ''}</small>${target.rationale ? `<p class="kg-target-rationale">${escape(target.rationale)}</p>` : ''}</li>`; }).join('')}</ul>` : '<p>Ingen precisering av enskilda mål finns i underlaget.</p>';
      if (item.sourceTexts?.length) body += `<details><summary>Originaltexter (${item.sourceTexts.length})</summary>${item.sourceTexts.map(source => `<blockquote><small>${escape(source.riskId)}</small><p>${escape(source.text || source.excerpt)}</p></blockquote>`).join('')}</details>`;
    } else if (isConcept) {
      body += `<p class="kg-inspector-note">${item.matchType === 'exact' ? 'Samma ordalydelse förekommer i flera risker. Varje risk behåller sin egen förekomst och sitt källstöd.' : 'Tematisk likhet: en analytisk gruppering av närliggande formuleringar. Riskerna och deras originalformuleringar är separata.'}</p>${item.rationale ? `<p>${escape(item.rationale)}</p>` : ''}<button class="btn kg-primary" type="button" data-kg-action="open-concept">Undersök gruppen</button><h4>Riskernas originalformuleringar</h4><ul class="kg-targets">${(item.occurrenceIds || []).map(id => byOccurrence.get(id)).filter(Boolean).map(occurrence => `<li><button class="kg-text-button" type="button" data-kg-select="risk" data-id="${escape(occurrence.riskId)}">${escape(occurrence.riskId)}</button><p>${escape(occurrence.text)}</p><small>${escape(basisLabel(occurrence.basis))}${occurrence.source_refs?.length ? ' · '+escape(occurrence.source_refs.join(', ')) : ''}</small></li>`).join('')}</ul>`;
      const occurrenceIds = new Set(item.occurrenceIds || []);
      const linkedControls = controls.filter(control => (control.targets || []).some(target => occurrenceIds.has(target.targetId)));
      if (linkedControls.length) body += `<h4>Motåtgärder mot förekomster här</h4><p class="kg-muted-copy">Varje åtgärd har sin egen avgränsade målgrupp.</p>${linkedControls.map(control => entityButton(control,'control')).join('')}`;
    } else {
      body += `<p class="kg-inspector-note">${escape(item.risk_id)} · ${rankFor(item.risk_id) ? 'BTL-rang '+rankFor(item.risk_id) : 'Ej rankad'}${topRiskIds.has(item.risk_id) ? ' · Topp 50' : ''}</p><p>${escape(item.chart_key)} · ${escape(chartLabel(item.chart_key))}</p><p>${escape(item.description || '')}</p><button class="btn kg-primary" type="button" data-kg-action="open-risk">Öppna risk och bow tie</button>`;
      const linkedControls = controls.filter(control => validRiskIds(control).includes(item.risk_id));
      body += `<h4>Kopplade motåtgärder (${linkedControls.length})</h4>${linkedControls.map(control => entityButton(control,'control')).join('')}`;
      const linkedConcepts = concepts.filter(concept => validRiskIds(concept).includes(item.risk_id));
      body += `<h4>Återkommande orsaker och konsekvenser (${linkedConcepts.length})</h4>${linkedConcepts.map(concept => entityButton(concept,'concept')).join('') || '<p>Ingen gemensam grupp har identifierats för denna risk.</p>'}`;
      const occurrences = (data.occurrences || []).filter(occurrence => occurrence.riskId === item.risk_id);
      body += `<details><summary>Alla orsaker och konsekvenser (${occurrences.length})</summary><ul class="kg-targets">${occurrences.map(occurrence => `<li><span class="kg-target-kind">${occurrence.kind === 'cause' ? 'Orsak' : 'Konsekvens'} · ${escape(basisLabel(occurrence.basis))}</span><p>${escape(occurrence.text)}</p></li>`).join('')}</ul></details>`;
    }
    if (isControl || isConcept) body += `<h4>Alla kopplade risker (${ids.length})</h4><ul class="kg-risk-list">${riskButtons(ids)}</ul>`;
    inspector.innerHTML = body;
  }
  function roleLabel(role) {
    return ({prevention:'Förebyggande',preventive:'Förebyggande',detection:'Upptäckt',monitoring:'Uppföljning',consequence_reduction:'Konsekvensbegränsning','consequence-reduction':'Konsekvensbegränsning',mitigation:'Konsekvensbegränsning',combined:'Kombinerad',unclassified:'Ej preciserad',unspecified:'Ej preciserad'})[role] || role;
  }
  function select(value) {
    let next = typeof value === 'string' ? {id:value,type:byRisk.has(value) ? 'risk' : byControl.has(value) ? 'control' : 'concept'} : value;
    if (!next || !['risk','control','concept'].includes(next.type)) return false;
    if (!(next.type === 'risk' ? byRisk : next.type === 'control' ? byControl : byConcept).has(next.id)) return false;
    state.selection = {type:next.type,id:next.id}; state.process = ''; state.top = false; state.query = ''; state.matches = null;
    container.querySelector('.kg-process').value = '';
    container.querySelector('.kg-search').value = '';
    container.querySelector('.kg-risk-picker').value = next.type === 'risk' ? next.id : '';
    searchResults.hidden = true;
    renderGraph(); renderInspector();
    onSelection?.({...state.selection,riskIds:entityRiskIds(state.selection)});
    return true;
  }
  function clearSelection() {
    state.selection = null; container.querySelector('.kg-risk-picker').value = '';
    renderGraph(); renderInspector(); onSelection?.(null);
  }
  function applyZoom() {
    if (!svg) return;
    svg.style.width = `${state.zoom * 100}%`;
    container.querySelector('.kg-zoom-level').textContent = `${Math.round(state.zoom * 100)} %`;
  }
  function reset() {
    state.selection = null; state.query = ''; state.process = ''; state.top = false; state.zoom = 1; state.matches = null;
    container.querySelector('.kg-search').value = ''; container.querySelector('.kg-process').value = ''; container.querySelector('.kg-risk-picker').value = '';
    searchResults.hidden = true; renderGraph(); renderInspector();
    const viewport = container.querySelector('.kg-viewport'); viewport.scrollTop = 0; viewport.scrollLeft = 0;
    onSelection?.(null);
  }
  container.addEventListener('click',event => {
    const target = event.target.closest?.('[data-kg-type], [data-kg-select], [data-kg-action]');
    if (!target || !container.contains(target)) return;
    if (target.dataset.kgType) { select({type:target.dataset.kgType,id:target.dataset.kgId}); return; }
    if (target.dataset.kgSelect) { select({type:target.dataset.kgSelect,id:target.dataset.id}); return; }
    switch (target.dataset.kgAction) {
      case 'reset': reset(); break;
      case 'clear': clearSelection(); break;
      case 'zoom-in': state.zoom = Math.min(2.5,state.zoom+.25); applyZoom(); break;
      case 'zoom-out': state.zoom = Math.max(1,state.zoom-.25); applyZoom(); break;
      case 'fit': state.zoom = 1; applyZoom(); container.querySelector('.kg-viewport').scrollLeft = 0; break;
      case 'open-risk': onRisk?.(state.selection.id); break;
      case 'open-control': onControl?.(state.selection.id); break;
      case 'open-concept': onConcept?.(state.selection.id); break;
    }
  },listenerOptions);
  container.querySelector('.kg-search').addEventListener('input',event => {
    state.query = normalize(event.target.value).trim(); state.selection = null;
    state.matches = state.query ? catalog.filter(item => item.search.includes(state.query)) : null;
    searchResults.hidden = !state.query;
    if (state.query) searchResults.innerHTML = `<p>${state.matches.length} träffar. Alla risker ligger kvar i kartan.</p>${state.matches.slice(0,30).map(item => `<button type="button" data-kg-select="${item.type}" data-id="${escape(item.id)}"><small>${item.kind}</small>${escape(item.label)}<span>${item.riskIds.length} ${item.riskIds.length === 1 ? 'risk' : 'risker'}</span></button>`).join('')}${state.matches.length > 30 ? '<p>De första 30 visas. Förfina sökningen för att hitta en bestämd post.</p>' : ''}`;
    clearSelection();
  },listenerOptions);
  container.querySelector('.kg-process').addEventListener('change',event => { state.process = event.target.value; clearSelection(); },listenerOptions);
  container.querySelector('.kg-top').addEventListener('click',() => { state.top = !state.top; clearSelection(); },listenerOptions);
  container.querySelector('.kg-risk-picker').addEventListener('change',event => { if (event.target.value) select({type:'risk',id:event.target.value}); },listenerOptions);
  renderGraph(); renderInspector();
  return {select,reset,destroy() { abort.abort(); container.replaceChildren(); container.classList.remove('knowledge-graph'); }};
}

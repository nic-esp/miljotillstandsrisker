// One navigation contract for the application and its standalone reading/data pages.
export const SITE_SECTIONS = [
  {id:'risks',label:'Risker',view:'risks',items:[['risks','Register'],['analysis','Analys'],['ranking','Rangordning'],['stats','Statistik']]},
  {id:'controls',label:'Motåtgärder',view:'controls',items:[['controls','Register'],['control-analysis','Analys']]},
  {id:'process',label:'Processer',view:'process',items:[['process','Processkarta'],['nodes','Nodbläddrare']]},
  {id:'graph',label:'Sambandskarta',view:'graph',items:[['graph','Översikt']]},
  {id:'report',label:'Rapport',view:'report',items:[['report','Översikt'],['report-reader','Läsrapport'],['report-print','Utskriftsvy']]},
  {id:'data',label:'Data & källor',view:'data',items:[['data','Datafiler'],['ai','AI-åtkomst']]},
];
export function sitePage(view,controlTab='register',chapter=null) {
  return view==='controls'&&controlTab==='analysis'?'control-analysis':view==='report'&&chapter?'report-reader':view;
}
export function siteSection(page) {
  return SITE_SECTIONS.find(s=>s.items.some(([id])=>id===page))||SITE_SECTIONS[0];
}
export function siteHref(page,base='',firstChapter='sammanfattning') {
  if(page==='data')return `${base}data/`;
  if(page==='ai')return `${base}ai-access.html`;
  if(page==='report-print')return `${base}report/`;
  if(page==='control-analysis')return `${base}?view=controls&tab=analysis`;
  if(page==='report-reader')return `${base}?view=report&chapter=${encodeURIComponent(firstChapter)}`;
  return `${base}?view=${page}`;
}
const navEscape=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
export function renderSectionNavigation(page,{base='',firstChapter}={}) {
  const section=siteSection(page);
  return section.items.map(([id,label])=>`<a href="${navEscape(siteHref(id,base,firstChapter))}" data-site-page="${id}"${id===page?' aria-current="page"':''}>${label}</a>`).join('');
}
export function renderSiteHeader({page='risks',base='',logo='',firstChapter}={}) {
  const section=siteSection(page);
  return `<a class="site-skip" href="#main">Hoppa till innehållet</a><header class="site-header">
    <div class="site-brand"><a class="site-logo" href="https://www.svensktnaringsliv.se/" aria-label="Svenskt Näringsliv" target="_blank" rel="noopener">${logo}</a><div><a class="site-title" href="${base}?view=risks" data-site-page="risks">Miljötillståndsrisker</a><p>Risker, motåtgärder och samband · Baslinje S0 per 2026-08-20</p></div></div>
    <nav class="site-primary-nav" aria-label="Huvudnavigation">${SITE_SECTIONS.map(s=>`<a href="${navEscape(siteHref(s.view,base,firstChapter))}" data-site-section="${s.id}" data-site-page="${s.view}"${section.id===s.id?' aria-current="true"':''}>${s.label}</a>`).join('')}</nav>
    <nav class="site-section-nav" aria-label="${section.label} – vyer">${renderSectionNavigation(page,{base,firstChapter})}</nav>
  </header>`;
}

// Changes of view, detail and chapter create history; typing/filtering updates that entry.
export function siteRouteKey(url) {
  const p=new URL(url,'https://example.invalid').searchParams;
  return ['view','risk','control','concept','tab','controltab','chapter','compare','chart','processnode','selectednode'].map(k=>`${k}=${p.get(k)||(k==='view'?'risks':'')}`).join('&');
}

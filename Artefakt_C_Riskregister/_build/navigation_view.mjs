let siteRouteReady=false;
let siteRestoringRoute=false;
let siteToolFocus=null;
function syncSiteNavigation() {
  const page=sitePage(state.view,publicationState.controlTab,publicationState.chapter);
  const section=siteSection(page);
  document.querySelectorAll('[data-site-section]').forEach(a=>{
    if(a.dataset.siteSection===section.id)a.setAttribute('aria-current','true');
    else a.removeAttribute('aria-current');
  });
  const nav=document.querySelector('.site-section-nav');
  nav.setAttribute('aria-label',`${section.label} – vyer`);
  nav.innerHTML=renderSectionNavigation(page,{firstChapter:REPORT.chapters[0].id});
  document.title=`${section.label} · Miljötillståndsrisker`;
}
function parkRiskTools() {
  const active=document.activeElement;
  if(active?.closest('#riskTools'))siteToolFocus={id:active.id,start:active.selectionStart,end:active.selectionEnd};
  $('#siteToolParking').append($('#riskTools'));
  $('#siteToolParking').append($('#sidebar'));
}
function placeRiskTools() {
  if(!['risks','nodes'].includes(state.view))return;
  const head=$('#main').querySelector('.ex-page-head');
  if(head)head.after($('#riskTools'));else $('#main').prepend($('#riskTools'));
  $('#riskTools').after($('#sidebar'));
  if(siteToolFocus){const el=document.getElementById(siteToolFocus.id);el?.focus({preventScroll:true});if(el?.type==='search'&&siteToolFocus.start!=null)el.setSelectionRange(siteToolFocus.start,siteToolFocus.end);siteToolFocus=null;}
}
// Some filters redraw a view directly rather than through renderMain.
const siteCompactRiskRenderer=renderCompactRisks;
renderCompactRisks=function(){parkRiskTools();siteCompactRiskRenderer();placeRiskTools();};
const siteNodeRenderer=renderNodes;
renderNodes=function(){parkRiskTools();siteNodeRenderer();placeRiskTools();};
function writeSiteRoute(url) {
  const next=url.href;
  const current=new URL(location.href);
  const changed=siteRouteKey(current)!==siteRouteKey(next);
  if(next!==location.href){
    if(siteRouteReady&&changed)history.pushState(null,'',next);
    else history.replaceState(null,'',next);
  }
  if(siteRouteReady&&changed&&!exState.dialog&&(current.searchParams.get('view')!==url.searchParams.get('view')||current.searchParams.get('chapter')!==url.searchParams.get('chapter')||current.searchParams.get('tab')!==url.searchParams.get('tab'))){
    window.scrollTo({top:0,left:0,behavior:'instant'});$('#main').focus({preventScroll:true});
  }
}
function initSiteNavigation() {
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[data-site-page]');
    if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const page=link.dataset.sitePage;
    if(['data','ai','report-print'].includes(page))return;
    event.preventDefault();
    if(page==='controls'||page==='control-analysis')publicationState.controlTab=page==='controls'?'register':'analysis';
    if(page==='report'||page==='report-reader')publicationState.chapter=page==='report'?null:publicationState.chapter||REPORT.chapters[0].id;
    const view=page==='control-analysis'?'controls':page==='report-reader'?'report':page;
    setView(view);exSyncRoute();
    window.scrollTo({top:0,left:0,behavior:'instant'});
  });
  window.addEventListener('popstate',()=>{
    siteRestoringRoute=true;
    try {
      const dialog=$('#exDialog');if(dialog?.open)dialog.close();
      exReadRoute();
    } finally {siteRestoringRoute=false;}
  });
}

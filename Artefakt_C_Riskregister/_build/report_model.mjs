import {priorityCost} from './measurement_model.mjs';
import {costProvenance,aggregateProvenance,controlEffectProvenance} from './measurement_provenance.mjs';
import {evaluateInvestment,rankInvestments} from './investment_model.mjs';
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
      if(!['p','h3','note','highlight','quote','figure','table','integration','equation'].includes(b.type))fail('okänd manusblocktyp');
      if((b.sourceIds||[]).some(id=>!sources.has(id)))fail('hänvisning till okänd källa');
      if(b.type==='equation'&&(!b.formula||b.latex&&!/^equation-[0-9]+$/.test(b.id)))fail('ogiltig ekvation');
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
  return ({published:'',draft:'Arbetsmanus',awaiting_measurement:'Inväntar mätresultat',awaiting_interviews:'Inväntar intervjumaterial',awaiting_integration:'Inväntar samlad analys',reviewed:'Sakgranskad'})[status]??'Arbetsmanus';
}
// Each numerical figure carries its own readable source and statistic, shared by web and PDF.
export function reportFigureProvenance(id,report,measurement,risks=[],controls=[]) {
  const date=report.date||measurement.sourceReview?.reviewedAt||'Datum saknas';
  const modelDate=measurement.provenance?.completedAt?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm'}).format(new Date(measurement.provenance.completedAt)):date;
  const reviewDate=measurement.sourceReview?.reviewedAt||date;
  const register=`Registerutdrag för rapportutgåva ${date}; risk- och processregister samt kontrollkopplingar (REG, MYN).`;
  const cost=`Riskbedömning ${modelDate} (RES) och källgranskning ${reviewDate} (SRC).`;
  const product='Årlig kostnadsindikator = använd händelsefrekvens × använd kostnad per händelse. Jämförbara beskrivningsintervall representeras av aritmetisk mittpunkt; övriga användbara komponenter är modellmedianer. Ingen observerad årsförlust eller statistisk årsmedian.';
  const effect='Modellerad fristående förändring från läget utan åtgärder: riskens kostnadsindikator × [1 − exp(−frekvensskift − kostnadsskift)]. Effektskiftena kommer från risk- och kontrollbedömningen; angivna källnivåer får samma proportionella effekt.';
  const entries={
    'source-audit-coverage':{source:`Individuell källgranskning och oberoende aritmetisk kontroll ${date} (SRC, NUM).`,statistic:'Antal registerrisker med respektive utan fördjupad individuell källgranskning. Detta är granskningsomfattning, inte en bedömning av faktisk risk eller av hur många modellvärden som är korrekta. Den aritmetiska kontrollen omfattar samtliga 342 risker.'},
    'current-value-origins':{source:cost+' Registerurval: REG.',statistic:'Antal registerrisker efter kostnadsindikatorns ursprung: produkt av två modellmedianer, blandad produkt av modellmedian och beskrivningsmittpunkt, eller odefinierad indikator. Ingen riskindikator bygger direkt på observerad eller anpassad historisk förluststatistik.'},
    'risk-cost-components':{source:cost,statistic:'De två använda komponenterna visas separat: händelser per år och miljoner kronor per händelse. Varje kolumn har egen linjär skala. Komponentens typ anges vid värdet; deras produkt ger kostnadsindikatorn, inte medianen av verklig årsförlust.'},
    'authority-priority-amounts':{source:cost+' Huvudscenariots 17 åtgärder: MYN.',statistic:effect+' Staplarna visar de åtta största positiva fristående bidragen, i miljoner kronor per år. Varje åtgärd har sitt eget riskunderlag. Kostnader för införande och drift saknas; bidragen får inte adderas till ett åtgärdspaket.'},
    'authority-priority-contributions':{source:cost+' Åtgärder och riskkopplingar: MYN.',statistic:effect+' De två största positiva riskbidragen visas för var och en av huvudscenariots fyra högst rangordnade åtgärder. Övriga riskbidrag ingår i respektive åtgärds total men visas inte här. Samma risk eller förlust kan beröras av flera åtgärder.'},
    'review-decisions':{source:`Källgranskning ${reviewDate} (SRC).`,statistic:'Antal individuella granskningsbeslut bland den tidigare huvudlistans 50 högsta risker; registerräkning, inte en frekvens av verkliga händelser.'},
    'review-top50-movement':{source:`Rangordningar före och efter källgranskning ${reviewDate} (RES, SRC).`,statistic:'Antal risk-ID som återkommer respektive tillkommer i topp 50 efter omräkningen; jämförelse av två listor.'},
    'review-cost-comparison':{source:cost,statistic:'Grå stapel: ursprunglig frekvensmedian × kostnadsmedian. Orange: korrigerad kostnadsindikator med källbaserade mittpunkter där komponenter ersatts. Samma risker visas i båda lägena.'},
    'risk-contributions':{source:cost,statistic:product},
    'process-reviewed-cost':{source:cost+' Processkopplingar: REG.',statistic:product+' Staplarna summerar separata riskposter per direkt delprocess; ekonomiskt överlapp är inte avräknat.'},
    'authority-review-comparison':{source:cost+' Kontrollkopplingar och scenarioklassning: MYN.',statistic:effect+' Grå använder ursprungliga modellmedianer, orange den korrigerade kostnadsgrunden, på samma prissatta risker för varje åtgärd. Ingen genomförandekostnad har dragits av.'},
    'authority-investment':{source:cost+' Huvudscenariots 17 åtgärder: MYN.',statistic:effect+' Procent = summerad indikatorminskning / samma åtgärds summerade kostnadsunderlag. Andra åtgärder är inte införda; negativa effekter behålls.'},
    'authority-investment-combination':{source:cost+' Huvudscenariots 17 åtgärder: MYN.',statistic:'Index 100 är summan av 75 jämförbara riskindikatorer utan åtgärder. Kontrollernas logaritmiska effektskift summeras per risk; kvarvarande kostnadsindikatorer jämförs på samma riskurval. Tre kopplade risker saknar jämförbart underlag. Modellerad potential före genomförandekostnad, inte empiriskt uppmätt nytta.'},
    'description-cost-ranges':{source:`Riskbeskrivningar i det frysta bedömningsunderlaget; återvunna och granskade ${date} (REG, RES).`,statistic:'Uttryckliga uppskattade typiska intervall för kostnad per händelse. Intervallgränserna återges direkt; de är inte observerade min/max, medianer eller konfidensintervall.'},
    'description-recovery':{source:`Tidigare beskrivningsgranskning ${measurement.quality?.descriptionReview?.reviewedAt||date} (REG, RES).`,statistic:'Antal av de 198 genomgångna riskbeskrivningarna med respektive utan jämförbar numerisk ram. Registerräkning av granskningens utfall; ett annat urval än den senare toppgranskningen.'},
    'cost-top-process':{source:register+' Rangordning: '+cost,statistic:'Antal unika risker i den källgranskade topp 50, grupperade efter direkt delprocess. Måttet är en registerräkning, inte sannolikheten att en process störs.'},
    'authority-process-coverage':{source:register,statistic:'Antal unika risker i varje delprocess och antal med minst en dokumenterad koppling till huvudscenariots 17 myndighetsåtgärder. Ingen modellerad effekt ingår i antalen.'},
    'authority-origin-coverage':{source:register,statistic:'Antal unika risker per ursprungskategori; åtgärdstäckning räknas för alla 20 myndighetsåtgärder inklusive övergång och framtida mandat. Kopplingarna anger räckvidd, inte uppmätt riskreduktion.'},
    'authority-packages':{source:register+' Rangordning: '+cost,statistic:'Antal unika risker per arbetsområde bland huvudscenariots 17 åtgärder samt antal av dessa i topp 50. En risk kan ingå i flera arbetsområden; summan av grupperna är inte antal unika risker i hela urvalet.'},
    'authority-matrix':{source:register,statistic:'Antal unika risker inom varje kombination av arbetsområde och direkt delprocess för huvudscenariots 17 åtgärder. Kopplingsräkning, inte effektstorlek eller sannolikhet.'}
  };
  const basis={date,...(entries[id]||{source:register+' '+cost,statistic:'Mått och enhet enligt den aktuella figuren; källunderlaget är låst till rapportutgåvan.'})};
  let selectedIds=null;
  if(id==='risk-contributions')selectedIds=(measurement.ranking?.entries||[]).slice(0,10).map(r=>r.riskId);
  if(id==='process-reviewed-cost')selectedIds=(measurement.ranking?.entries||[]).map(r=>r.riskId);
  if(selectedIds) {
    basis.origins=aggregateProvenance(measurement,selectedIds);
    const c=basis.origins.counts;
    basis.statistic+=` I det visade urvalet bygger ${c.measurement} riskposter enbart på modellmedianer och ${c.mixed} på modellvärden tillsammans med beskrivningsskattningar. ${c.adapted_history} bygger på anpassade historiska belopp.`;
  }
  if(['authority-review-comparison','authority-investment','authority-investment-combination'].includes(id))basis.effect=controlEffectProvenance();
  return basis;
}
export function reportFigureData(id,report,measurement,risks,controls=[]) {
  const data=calculateReportFigureData(id,report,measurement,risks,controls);
  if(data.kind==='pending')return data;
  return {...data,provenance:reportFigureProvenance(id,report,measurement,risks,controls)};
}
export function renderReportFigure(id,report,measurement,risks,controls=[]) {
  const chart=renderReportFigureChart(id,report,measurement,risks,controls);
  if(!report.measurementEditionId||report.measurementEditionId!==measurement.editionId)return chart;
  const basis=reportFigureProvenance(id,report,measurement,risks,controls),e=reportEscape;
  return chart+`<div class="rp-number-basis"><p class="rp-graph-note"><strong>Ursprung och datum:</strong> ${e(basis.source)}</p><p class="rp-graph-note"><strong>Statistik och beräkning:</strong> ${e(basis.statistic)}</p></div>`;
}
function calculateReportFigureData(id,report,measurement,risks,controls=[]) {
  if(!report.measurementEditionId||report.measurementEditionId!==measurement.editionId)return {kind:'pending'};
  const rows=new Map((measurement.risks||[]).map(r=>[r.riskId,r]));
  const top=new Set(measurement.ranking?.entries.slice(0,50).map(r=>r.riskId)||[]);
  const names={B10:'B10 · Klassificering',B20:'B20 · Miljöbedömning',B30:'B30 · Miljöfarlig verksamhet',B40:'B40 · Vattenverksamhet',B50:'B50 · Sektorsspår',B60:'B60 · Prövning',B70:'B70 · Inför start'};
  const authority=controls.filter(c=>c.driver==='authority'),main=authority.filter(c=>c.scenario==='S1_beslutat_uppdrag');
  const covered=new Set(authority.flatMap(c=>c.riskIds)),mainCovered=new Set(main.flatMap(c=>c.riskIds));
  const packages=[['Vägledning och mottagning',['MPM-01','MPM-02']],['Underlag och ärendeakt',['MPM-05','MPM-06','MPM-10']],['Planering och samordning',['MPM-03','MPM-04','MPM-07','MPM-08','MPM-09']],['Beslut och delgivning',['MPM-11','MPM-12','MPM-13']],['Överlämnande och fortsatt prövning',['MPM-14','MPM-15','MPM-16','MPM-17']]].map(([label,ids])=>({label,ids,risks:new Set(main.filter(c=>ids.includes(c.id)).flatMap(c=>c.riskIds))}));
  const origins=['Sökande & ansökan','Myndighet & prövning','Extern & omvärld'];
  const originalTop=new Set(measurement.sourceReview?.originalTop50||[]);
  const reviewedOriginal=[...originalTop].map(id=>rows.get(id)).filter(Boolean);
  const comparisonSeries=[{label:'Ursprungliga modellmedianer',color:'#6d7c87'},{label:'Efter källgranskning',color:'#d88b22'}];
  if(id==='source-audit-coverage')return {kind:'bars',unit:'risker',rows:[{label:'Individuell källgranskning',value:measurement.quality?.sourceReview?.reviewed||80},{label:'Utan fördjupad individuell källgranskning',value:risks.length-(measurement.quality?.sourceReview?.reviewed||80)}]};
  if(id==='current-value-origins') {
    const c=aggregateProvenance(measurement,risks.map(r=>r.risk_id)).counts;
    return {kind:'bars',unit:'risker',rows:[{label:'Två modellmedianer',value:c.measurement},{label:'Modellmedian och beskrivningsmittpunkt',value:c.mixed},{label:'Utan jämförbar kostnadsindikator',value:c.undefined}]};
  }
  if(id==='risk-cost-components')return {kind:'components',rows:(measurement.ranking?.entries||[]).slice(0,10).map(e=>{const r=rows.get(e.riskId),basis=costProvenance(r,measurement.priorityMetric);return {riskId:e.riskId,label:e.riskId+' · '+risks.find(x=>x.risk_id===e.riskId)?.title,frequency:basis.frequency.value,severity:basis.severity.value/1e6,frequencyType:basis.frequency.statisticLabel,severityType:basis.severity.statisticLabel};})};
  if(id==='authority-priority-amounts')return {kind:'bars',unit:'mnkr per år',rows:rankInvestments(measurement,controls,main).filter(x=>x.reduction>0).slice(0,8).map(x=>({label:x.control.id+' · '+x.control.title+' ('+x.pricedCount+'/'+x.affectedCount+' risker)',value:x.reduction/1e6}))};
  if(id==='authority-priority-contributions')return {kind:'bars',unit:'mnkr per år',rows:rankInvestments(measurement,controls,main).filter(x=>x.reduction>0).slice(0,4).flatMap(x=>x.rows.filter(r=>r.reduction>0).sort((a,b)=>b.reduction-a.reduction).slice(0,2).map(r=>({label:x.control.id+' · '+r.riskId+' · '+risks.find(y=>y.risk_id===r.riskId)?.title,value:r.reduction/1e6,share:r.reduction/x.reduction}))) };
  if(id==='review-decisions')return {kind:'bars',unit:'risker',rows:[{label:'Värden ersatta av källuppgifter',value:reviewedOriginal.filter(r=>r.sourceReview?.decision==='replace_source').length},{label:'Modellvärden behållna',value:reviewedOriginal.filter(r=>r.sourceReview?.decision==='retain_model').length},{label:'Kostnadsrang odefinierad',value:reviewedOriginal.filter(r=>r.sourceReview?.decision==='withhold').length}]};
  if(id==='review-top50-movement')return {kind:'bars',unit:'risker',rows:[{label:'Kvar i topp 50 efter granskning',value:[...top].filter(id=>originalTop.has(id)).length},{label:'Nytillkomna i topp 50',value:[...top].filter(id=>!originalTop.has(id)).length}]};
  if(id==='review-cost-comparison')return {kind:'grouped',unit:'mnkr per år',series:comparisonSeries,rows:(measurement.modelMedianRanking?.entries||[]).filter(e=>rows.get(e.riskId)?.reviewedCost).slice(0,6).map(e=>({label:e.riskId+' · '+(risks.find(r=>r.risk_id===e.riskId)?.title||''),values:[e.score/1e6,rows.get(e.riskId).reviewedCost.value/1e6]}))};
  if(id==='authority-review-comparison')return {kind:'grouped',unit:'mnkr per år',series:comparisonSeries,rows:rankInvestments(measurement,controls,main).filter(r=>r.reduction!=null).slice(0,5).map(r=>{
    const old=evaluateInvestment({...measurement,priorityMetric:'median_product_annual_cost'},controls,[r.control.id]),eligible=new Set(r.rows.filter(x=>x.reduction!=null).map(x=>x.riskId));
    return {label:r.control.id+' · '+r.control.title+' ('+eligible.size+' risker)',values:[old.rows.filter(x=>eligible.has(x.riskId)).reduce((a,x)=>a+x.reduction,0)/1e6,r.reduction/1e6]};
  })};
  if(id==='process-reviewed-cost')return {kind:'bars',unit:'mnkr per år',rows:Object.keys(names).map(key=>({label:names[key],value:risks.filter(r=>r.chart_key===key).reduce((sum,r)=>sum+(rows.get(r.risk_id)?.reviewedCost?.value||0),0)/1e6}))};
  if(id==='authority-investment') {
    const ranked=rankInvestments(measurement,controls,main);
    return {kind:'signed-bars',unit:'%',rows:[...ranked.filter(r=>r.reduction>0).slice(0,6),...ranked.filter(r=>r.reduction<0)].map(r=>({label:r.control.id+' · '+r.control.title,value:r.reductionFraction*100}))};
  }
  if(id==='authority-investment-combination') {
    const s=evaluateInvestment(measurement,controls,main.map(c=>c.id));
    return {kind:'bars',unit:'index',rows:[{label:'Utan införda åtgärder',value:100},{label:'Med 17 åtgärder',value:s.residualExpectedLoss/s.referenceExpectedLoss*100}]};
  }
  if(id==='risk-origins')return {kind:'bars',unit:'risker',rows:origins.map(label=>({label,value:risks.filter(r=>r.origin===label).length}))};
  if(id==='authority-origin-coverage')return {kind:'grouped',unit:'risker',series:[{label:'Alla risker',color:'#d5d9da'},{label:'Med myndighetsåtgärd',color:'#d88b22'}],rows:origins.map(label=>({label,values:[risks.filter(r=>r.origin===label).length,risks.filter(r=>r.origin===label&&covered.has(r.risk_id)).length]}))};
  if(id==='authority-process-coverage')return {kind:'grouped',unit:'risker',series:[{label:'Alla risker i delprocessen',color:'#d5d9da'},{label:'Åtgärd inom underlagets huvudscenario',color:'#d88b22'}],rows:Object.entries(names).map(([key,label])=>({label,values:[risks.filter(r=>r.chart_key===key).length,risks.filter(r=>r.chart_key===key&&mainCovered.has(r.risk_id)).length]}))};
  if(id==='authority-packages')return {kind:'grouped',unit:'risker',series:[{label:'Kopplade risker',color:'#d5d9da'},{label:'Därav i kostnadstopp 50',color:'#d88b22'}],rows:packages.map(p=>({label:p.label,values:[p.risks.size,[...p.risks].filter(id=>top.has(id)).length]}))};
  if(id==='authority-matrix')return {kind:'matrix',unit:'risker',columns:Object.keys(names),rows:packages.map(p=>({label:p.label,values:Object.keys(names).map(key=>risks.filter(r=>r.chart_key===key&&p.risks.has(r.risk_id)).length)}))};
  if(id==='authority-top-coverage')return {kind:'bars',unit:'risker',rows:[{label:'Topp 50 med myndighetsåtgärd',value:[...top].filter(id=>covered.has(id)).length},{label:'Topp 50 utan sådan koppling',value:[...top].filter(id=>!covered.has(id)).length}]};
  if(id==='authority-mandates')return {kind:'bars',unit:'åtgärder',rows:[{label:'Huvudscenario enligt underlaget',value:main.length},{label:'Organisationsövergång',value:authority.filter(c=>c.scenario==='Inforande_ej_S1').length},{label:'Förutsätter framtida mandat',value:authority.filter(c=>c.scenario==='Framtida_mandat_ej_beslutat').length}]};
  if(id==='authority-targets')return {kind:'bars',unit:'kopplingar',rows:[{label:'Mot bakomliggande orsaker',value:main.flatMap(c=>c.targets).filter(t=>t.type==='cause').length},{label:'Mot konsekvenser',value:main.flatMap(c=>c.targets).filter(t=>t.type==='effect').length}]};
  if(id==='description-recovery')return {kind:'bars',unit:'risker',rows:[{label:'Numeriska beskrivningsintervall',value:measurement.quality.descriptionReview.risksWithRanges},{label:'Ingen jämförbar numerisk ram',value:measurement.quality.descriptionReview.risksWithoutComparableRange}]};
  if(id==='description-cost-ranges') {
    const ids=['R-B40-N110-01','R-B40-GE120-02','R-B50-X040-02','R-B60-260-01','R-B50-P040-01','R-B50-G900-01'];
    const labels=['Underdimensionerad vattenanmälan','Försenat 12:6-samråd','Olika dispensbedömningar','Väntan på prövningstillstånd','Lov med överklagad plan','Sista spåret försenar byggstart'];
    return {kind:'ranges',unit:'mnkr per händelse',rows:ids.map((id,i)=>{const r=rows.get(id).descriptionReview.estimates.find(e=>e.dimension==='impact');return {label:labels[i],lower:r.lower/1e6,upper:r.upper/1e6};})};
  }
  if(['cost-top-process','process-coverage'].includes(id))return {kind:'bars',unit:'risker',rows:[...new Set(risks.map(r=>r.chart_key))].sort().map(key=>({label:names[key]||key,value:risks.filter(r=>r.chart_key===key&&(id==='cost-top-process'?top.has(r.risk_id):priorityCost(rows.get(r.risk_id),measurement.priorityMetric))).length}))};
  if(id==='authority-reach')return {kind:'bars',unit:'risker',rows:controls.filter(c=>c.driver==='authority').sort((a,b)=>b.riskIds.length-a.riskIds.length||a.id.localeCompare(b.id)).slice(0,10).map(c=>({label:c.id+' · '+c.title,value:c.riskIds.length}))};
  if(id==='portfolio-distribution')return measurement.portfolio?.lossDistribution?{kind:'histogram',...measurement.portfolio.lossDistribution}: {kind:'pending'};
  if(id==='risk-contributions')return {kind:'bars',rows:risks.map(r=>({id:r.risk_id,label:r.risk_id+' · '+(r.risk_id==='R-B70-130-01'?'Felbedömd byggberedskap':r.title),value:priorityCost(rows.get(r.risk_id),measurement.priorityMetric)?.value,basis:costProvenance(rows.get(r.risk_id),measurement.priorityMetric)})).filter(r=>r.value!=null).sort((a,b)=>b.value-a.value).slice(0,10)};
  if(id==='process-contributions') {
    const charts=[...new Set(risks.map(r=>r.chart_key))];
    return {kind:'bars',rows:charts.map(key=>({id:key,label:key,value:risks.filter(r=>r.chart_key===key).reduce((a,r)=>a+(priorityCost(rows.get(r.risk_id),measurement.priorityMetric)?.value||0),0)})).filter(x=>risks.some(r=>r.chart_key===x.id&&priorityCost(rows.get(r.risk_id),measurement.priorityMetric)))};
  }
  if(id==='control-scenario') {
    const s=measurement.scenarios?.find(s=>s.id===report.scenarioId);
    return s?{kind:'bars',rows:[{label:'Referensscenario',value:s.referenceExpectedLoss},{label:'Med valda åtgärder',value:s.residualExpectedLoss}],runId:s.runId}: {kind:'pending'};
  }
  return {kind:'pending'};
}
function renderReportFigureChart(id,report,measurement,risks,controls=[]) {
  const data=reportFigureData(id,report,measurement,risks,controls),e=reportEscape;
  const money=v=>data.unit?`${new Intl.NumberFormat('sv-SE',{maximumFractionDigits:2}).format(v)} ${e(data.unit)}`:`${new Intl.NumberFormat('sv-SE',{maximumFractionDigits:2}).format(v/1e6)} mnkr`;
  if(data.kind==='pending'||data.kind==='bars'&&!data.rows.length)return '<div class="ms-empty"><span class="ms-status">Inväntar rapportens mätutgåva</span><p>Figuren färdigställs med rapportens fastställda mätunderlag. En ny mätning ändrar inte den granskade rapporttexten automatiskt.</p></div>';
  if(data.kind==='components') {
    const fm=Math.max(...data.rows.map(r=>r.frequency),1),sm=Math.max(...data.rows.map(r=>r.severity),1),nf=v=>new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(v);
    return `<div class="rp-chart-legend"><span>Händelser per år</span><span>Kostnad per händelse, mnkr</span></div><div class="ex-table-wrap"><table class="ex-table"><thead><tr><th>Risk</th><th>Händelser/år</th><th>Mnkr/händelse</th></tr></thead><tbody>${data.rows.map(r=>`<tr><td>${e(r.label)}</td><td><div class="ms-bar-track"><span style="width:${r.frequency/fm*100}%;background:#6d7c87"></span></div><strong>${nf(r.frequency)}</strong><br><small>${e(r.frequencyType)}</small></td><td><div class="ms-bar-track"><span style="width:${r.severity/sm*100}%;background:#d88b22"></span></div><strong>${nf(r.severity)}</strong><br><small>${e(r.severityType)}</small></td></tr>`).join('')}</tbody></table></div><p class="rp-graph-note">Separata linjära skalor: 0–${nf(fm)} händelser/år respektive 0–${nf(sm)} mnkr/händelse. Stapellängder mellan kolumnerna är inte jämförbara.</p>`;
  }
  if(data.kind==='signed-bars') {
    const max=Math.max(...data.rows.map(r=>Math.abs(r.value)),1);
    return `<div class="rp-signed-bars">${data.rows.map(r=>`<div class="rp-signed-row"><span>${e(r.label)}</span><div class="rp-signed-track"><i></i><b style="left:${r.value<0?50+r.value/max*50:50}%;width:${Math.abs(r.value)/max*50}%;background:${r.value<0?'#93574f':'#d88b22'}"></b></div><strong>${new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(r.value)} %</strong></div>`).join('')}</div><p class="rp-graph-note">Noll i mitten. Höger: minskning. Vänster: ökning i modellen. Samma linjära skala på båda sidor.</p>`;
  }
  if(data.kind==='grouped') {
    const max=Math.max(...data.rows.flatMap(r=>r.values),1);
    return `<div class="rp-chart-legend">${data.series.map(s=>`<span style="--series-color:${s.color}">${e(s.label)}</span>`).join('')}</div>${data.rows.map(r=>`<div class="rp-grouped-row"><span>${e(r.label)}</span><div class="rp-series-tracks">${r.values.map((v,i)=>`<div class="rp-series-track"><span style="width:${v/max*100}%;background:${data.series[i].color}"></span></div>`).join('')}</div><div class="rp-grouped-values">${r.values.map(v=>`<div>${new Intl.NumberFormat('sv-SE',{maximumFractionDigits:data.unit==='mnkr per år'?1:0}).format(v)}</div>`).join('')}</div></div>`).join('')}<p class="rp-graph-note">${e(data.unit||'Antal risker')}. Gemensam linjär skala för samtliga staplar.</p>`;
  }
  if(data.kind==='matrix') {
    const max=Math.max(...data.rows.flatMap(r=>r.values),1);
    return `<div class="ex-table-wrap"><table class="rp-matrix"><thead><tr><th>Åtgärdsområde</th>${data.columns.map(c=>`<th>${e(c)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(r=>`<tr><th>${e(r.label)}</th>${r.values.map(v=>`<td style="background:rgba(216,139,34,${v/max*.65})">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="rp-graph-note">Antal kopplade risker per åtgärdsområde och delprocess. Samma risk kan förekomma i flera områden.</p>`;
  }
  if(data.kind==='ranges') {
    const max=Math.max(...data.rows.map(r=>r.upper),1);
    return `<div class="ms-bars">${data.rows.map(r=>`<div class="ms-bar-row"><span>${e(r.label)}</span><div class="ms-bar-track" style="position:relative"><span style="position:absolute;left:${r.lower/max*100}%;width:${(r.upper-r.lower)/max*100}%;background:#d88b22"></span></div><strong>${r.lower}–${r.upper}</strong></div>`).join('')}</div><p class="rp-graph-note">${e(data.unit)}. Linjär skala från 0 till ${max}. Intervallen är källtextens bedömningar och har ingen statistisk konfidensnivå.</p>`;
  }
  if(data.kind==='histogram') {
    const max=Math.max(...data.bins.map(b=>b.count/data.sampleCount),.01);
    const lo=data.bins[0].lower,hi=data.bins.at(-1).upper,span=hi-lo||1;
    return `<svg class="ms-report-hist" viewBox="0 0 660 245" role="img" aria-label="Förlustfördelning. P50 ${money(data.p50)}, P95 ${money(data.p95)}">${[0,.5,1].map(f=>`<line x1="55" x2="640" y1="${200-f*180}" y2="${200-f*180}" stroke="#dfe4e7"/><text x="45" y="${204-f*180}" text-anchor="end">${Math.round(f*max*100)} %</text>`).join('')}${data.bins.map(b=>`<rect x="${55+(b.lower-lo)/span*585}" y="${200-b.count/data.sampleCount/max*180}" width="${Math.max(2,(b.upper-b.lower)/span*585-2)}" height="${b.count/data.sampleCount/max*180}" fill="#1d6362"><title>${money(b.lower)}–${money(b.upper)}: ${b.count} utfall</title></rect>`).join('')}<text x="55" y="225">${money(lo)}</text><text x="640" y="225" text-anchor="end">${money(hi)}</text></svg><div class="ms-quantiles"><span>P50<strong>${money(data.p50)}</strong></span><span>P95<strong>${money(data.p95)}</strong></span></div><p class="ex-note">${data.sampleCount} simulerade utfall · Run ${e(data.runId)}</p><details><summary>Visa figurdata</summary><table class="ex-table"><thead><tr><th>Från</th><th>Till</th><th>Antal</th></tr></thead><tbody>${data.bins.map(b=>`<tr><td>${money(b.lower)}</td><td>${money(b.upper)}</td><td>${b.count}</td></tr>`).join('')}</tbody></table></details>`;
  }
  const max=Math.max(...data.rows.map(r=>r.value),1);
  return `<div class="ms-bars">${data.rows.map((r,i)=>`<div class="ms-bar-row"><span>${e(r.label)}${r.basis?`<small class="rp-graph-note" style="display:block">${e(r.basis.statisticLabel)}</small>`:''}</span><div class="ms-bar-track"><span class="${i===0?'ms-bar-first':''}" style="width:${r.value/max*100}%"></span></div><strong>${money(r.value)}</strong></div>`).join('')}</div><p class="ex-note">Risk- och åtgärdsunderlag · ${e(report.date)}</p>`;
}
export function renderReportChapter(chapter, report, interviews, {figure=()=>'',linkBase='?'}={}) {
  const e=reportEscape, quotes=new Map((interviews?.interviews||[]).flatMap(i=>(i.excerpts||[]).map(q=>[q.id,{...q,interview:i}])));
  const cite=b=>(b.sourceIds||[]).length?`<span class="rp-citations">${b.sourceIds.map(id=>`<a href="${e(linkBase)}view=report&amp;chapter=referenser#source-${e(id)}">[${e(id)}]</a>`).join(' ')}</span>`:'';
  const blocks=chapter.blocks.map(b=> {
    if(b.type==='equation')return `<figure class="rp-equation">${b.latex?`<img src="${e(linkBase.replace(/\?$/,''))}report/equations/${e(b.id)}.svg" alt="${e(b.formula)}" style="max-width:100%;height:auto">`:`<pre>${e(b.formula)}</pre>`}<figcaption>${e(b.caption)}</figcaption></figure>`;
    if(b.type==='h3')return `<h3>${e(b.text)}</h3>`;
    if(b.type==='p')return `<p>${e(b.text)} ${cite(b)}</p>`;
    if(b.type==='note')return `<aside class="rp-note"><strong>${e(b.title||'Avgränsning')}</strong><p>${e(b.text)}</p>${cite(b)}</aside>`;
    if(b.type==='highlight')return `<aside class="rp-highlight"><p>${e(b.text)}</p>${cite(b)}</aside>`;
    if(b.type==='quote') {
      const q=quotes.get(b.excerptId); if(!q)return '';
      return `<figure class="rp-quote"><blockquote>${e(q.text)}</blockquote><figcaption>${e(q.interview.publicLabel)} · ${e(q.interview.role)}<br>${e(q.locator)} · ${e(q.id)}</figcaption></figure>`;
    }
    if(b.type==='figure')return `<figure class="rp-figure"><h3>${e(b.title)}</h3>${figure(b.figureId)}<figcaption>${e(b.caption)}${b.sourceIds?.length?' · Källa: '+b.sourceIds.map(e).join(', '):''}</figcaption></figure>`;
    if(b.type==='table')return `<div class="ex-table-wrap"><table class="ex-table"><caption>${e(b.title)}</caption><thead><tr>${b.columns.map(c=>`<th>${e(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(row=>`<tr>${row.map(cell=>`<td>${e(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${b.numericBasis?`<p class="rp-graph-note"><strong>Ursprung och beräkning:</strong> ${e(b.numericBasis)} ${cite(b)}</p>`:cite(b)}`;
    if(b.type==='integration') {
      const findings=(report.findings||[]).filter(f=>(f.chapterIds||[]).includes(chapter.id));
      return findings.length?`<section class="rp-findings"><h3>Sammanvägd evidens</h3>${findings.map(f=>`<article><h4>${e(f.title)}</h4><p>${e(f.interpretation)}</p><p class="ex-note">${e(f.relationship||'Tematiskt stöd')} · ${f.excerptIds.map(id=>{const q=quotes.get(id);return `${e(q.interview.publicLabel)}, ${e(q.locator)} [${e(id)}]`;}).join(' · ')}</p><p class="ex-note">${e(f.counterEvidence||'Motstridigt underlag har inte redovisats för detta fynd.')} ${e(f.limitations||'')}</p>${(f.riskIds||[]).map(id=>`<a class="ref" href="${e(linkBase)}risk=${e(id)}&amp;tab=analysis">${e(id)}</a>`).join('')}${(f.controlIds||[]).map(id=>`<a class="ref" href="${e(linkBase)}view=controls&amp;control=${e(id)}">${e(id)}</a>`).join('')}</article>`).join('')}</section>`:`<aside class="rp-pending"><span class="rp-section-label">Planerad syntes</span><h3>Här möts mätning och intervjuer</h3><p>När underlagen är klara binds varje tolkning till en mätversion och till källbelagda intervjuutdrag. Även skillnader, motexempel och kunskapsluckor redovisas.</p></aside>`;
    }
    return '';
  }).join('');
  const thematicQuotes=[...quotes.values()].filter(q=>(q.topicIds||[]).includes(chapter.id));
  return `<div class="rp-chapter-meta"><span>${/^[A-Z]$/.test(chapter.number)?'Bilaga':'Kapitel'} ${e(chapter.number)}</span><span>${e(reportStatus(chapter.status))}</span></div><h2>${e(chapter.title)}</h2>${chapter.lead?`<p class="rp-lead">${e(chapter.lead)}</p>`:''}${blocks}${thematicQuotes.length?`<section class="rp-interview-evidence"><h3>Röster ur intervjumaterialet</h3>${thematicQuotes.map(q=>`<figure class="rp-quote"><blockquote>${e(q.text)}</blockquote><figcaption>${e(q.interview.publicLabel)} · ${e(q.interview.role)} · ${e(q.locator)} [${e(q.id)}]</figcaption></figure>`).join('')}</section>`:''}${chapter.id==='referenser'?`<ol class="rp-sources">${(report.sources||[]).map(s=>`<li id="source-${e(s.id)}"><strong>[${e(s.id)}] ${e(s.title)}</strong><p>${e(s.description||'')}${s.url?` <a href="${e(s.url)}">Öppna källa</a>`:''}</p></li>`).join('')}${(interviews?.interviews||[]).map(i=>`<li id="source-${e(i.id)}"><strong>[${e(i.id)}] ${e(i.publicLabel)}</strong><p>${e(i.role)} · ${e(i.date||'Datum ej publicerat')} · Utdrag ur intervjuanteckningar: ${i.excerpts.length}</p></li>`).join('')}</ol>`:''}`;
}

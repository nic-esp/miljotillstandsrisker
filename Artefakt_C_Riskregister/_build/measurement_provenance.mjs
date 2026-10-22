// Source origin and statistical measure are separate: a source midpoint is not a median.
export function inputProvenance(row,dimension,{statistic='median',effective=true}={}) {
  const selected=effective?row?.reviewedInputs?.[dimension]:null;
  if(effective&&row?.reviewedInputs&&!selected)return {origin:'undefined',sourceLabel:'Underlag saknas',statisticLabel:'Odefinierat',label:'Odefinierat',method:null,value:null};
  if(selected&&selected.method!=='model_median') {
    const kind=selected.evidenceKind;
    const observed=['observed_loss','observed_frequency','historical_observation','adapted_historical_data','observed_data'].includes(kind);
    const origin=kind==='description_estimate'?'description_estimate':observed?'adapted_history':'source_estimate';
    const sourceLabel=origin==='description_estimate'?'Riskbeskrivningens bedömning':origin==='adapted_history'?'Anpassad historisk uppgift':'Källuppgift med begränsat stöd';
    const statisticLabel=selected.method==='source_range_midpoint'?'Aritmetisk mittpunkt':'Punktuppgift';
    return {origin,sourceLabel,statisticLabel,label:sourceLabel+' · '+statisticLabel.toLowerCase(),method:selected.method,value:selected.value,lower:selected.lower,upper:selected.upper,sourceUrl:selected.sourceUrl||null,detail:origin==='description_estimate'?'En bedömning i riskbeskrivningen; inte observerad statistik.':observed?'Kontrollera population, period och eventuell omräkning i källuppgiften.':'Uppgiftens ursprung har inte klassificerats som observerad historik.'};
  }
  const summary=row?.summaries?.[dimension],value=selected?.value??summary?.[statistic];
  if(value==null)return {origin:'undefined',sourceLabel:'Underlag saknas',statisticLabel:'Odefinierat',label:'Odefinierat',method:null,value:null};
  const chosen=selected?'median':statistic;
  const statisticLabel=chosen==='median'?'Median (P50)':'Medelvärde';
  return {origin:'measurement',sourceLabel:'Mätresultat · modell',statisticLabel,label:'Mätresultat · '+statisticLabel.toLowerCase(),method:chosen==='median'?'model_median':'model_mean',value,runId:selected?.runId||summary?.runId||null,detail:'Modellens skattning; en genomförd mätning bekräftar inte i sig nivån mot observerade händelser.'};
}

export function costProvenance(row,metric='reviewed_cost_indicator') {
  if(metric==='loss_median'||metric==='expected_annual_cost'&&row?.expectedLoss?.method!=='product_of_means') {
    const statistic=metric==='loss_median'?'median':'mean';
    const value=row?.summaries?.expectedLoss?.[statistic]??(statistic==='mean'?row?.expectedLoss?.value:row?.lossDistribution?.p50);
    if(value==null)return {origin:'undefined',sourceLabel:'Underlag saknas',statisticLabel:'Odefinierat förlustmått',label:'Odefinierat förlustmått',value:null};
    const statisticLabel=statistic==='median'?'Median (P50) av modellförlust':'Medelvärde av modellförlust';
    return {origin:'measurement',sourceLabel:'Mätresultat · förlustmodell',statisticLabel,label:'Mätresultat · '+statisticLabel.toLowerCase(),value,detail:'Exporterad statistik från den monetära förlustberäkningen för angiven period.'};
  }
  const cost=metric==='reviewed_cost_indicator'?row?.reviewedCost:metric==='median_product_annual_cost'?row?.centralCost:row?.expectedLoss;
  const inputOptions={effective:metric==='reviewed_cost_indicator',statistic:metric==='expected_annual_cost'?'mean':'median'};
  const frequency=inputProvenance(row,'likelihood',inputOptions),severity=inputProvenance(row,'impact',inputOptions);
  if(!cost)return {origin:'undefined',sourceLabel:'Underlag saknas',statisticLabel:'Odefinierad produkt',label:'Odefinierad kostnadsindikator',value:null,frequency,severity};
  const origins=[frequency.origin,severity.origin],origin=origins.every(x=>x===origins[0])?origins[0]:'mixed';
  const short=x=>x.method==='model_median'?'modellmedian':x.method==='model_mean'?'modellmedelvärde':x.method==='source_range_midpoint'?'källintervallens mittpunkt':'källuppgift';
  const statisticLabel=short(frequency)+' × '+short(severity);
  const sourceLabel=origin==='measurement'?'Beräknat från mätresultat':origin==='description_estimate'?'Beräknat från beskrivningsskattningar':origin==='adapted_history'?'Beräknat från historiska uppgifter':'Beräknat från blandade underlag';
  return {origin,sourceLabel,statisticLabel,label:sourceLabel+' · '+statisticLabel,value:cost.value,frequency,severity,detail:metric==='expected_annual_cost'?'Produkt av modellmedelvärden enligt mätningens antaganden.':'Prioriteringsindikator; varken medianen för faktisk årsförlust eller observerad årskostnad.'};
}

export function aggregateProvenance(snapshot,riskIds) {
  const selected=new Set(riskIds),rows=snapshot.risks.filter(r=>selected.has(r.riskId));
  const counts={measurement:0,description_estimate:0,adapted_history:0,source_estimate:0,mixed:0,undefined:0};
  for(const row of rows)counts[costProvenance(row,snapshot.priorityMetric).origin]++;
  const quantified=rows.length-counts.undefined,reviewed=rows.filter(r=>r.sourceReview).length;
  return {counts,total:rows.length,quantified,reviewed,label:`${quantified} riskposter: ${counts.measurement} från modellvärden, ${counts.mixed} med blandade underlag, ${counts.description_estimate} från beskrivningsskattningar och ${counts.adapted_history} från historiska uppgifter samt ${counts.source_estimate} från övriga källskattningar. ${counts.undefined} saknar kostnadsindikator.`,detail:'Varje post beräknas från de angivna källvärdena. Summan innehåller ekonomiska överlapp och är ingen nationell nettokostnad. Källornas intervall är inga statistiska konfidensintervall.'};
}

export function controlEffectProvenance() {
  return {sourceLabel:'Mätresultat · modellskattad kontrolleffekt',statisticLabel:'Relativ effekt och beräknad indikatorminskning',label:'Modellskattad effekt på granskad kostnadsgrund',detail:'Modellens relativa effekter tillämpas på samma riskers granskade kostnadsindikatorer. Beloppet är ingen uppmätt besparing eller besparingsmedian. Genomförandekostnader och ekonomiska överlapp återstår.'};
}

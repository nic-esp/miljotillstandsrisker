// Explicitly synthetic, local browser verification. Never runs in build/prepare-site.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMeasurement } from '../../Artefakt_C_Riskregister/_build/measurement_model.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const html=readFileSync(join(root,'_site/index.html'),'utf8');
const start=html.indexOf('const DATA = ')+13,end=html.indexOf(';\nconst RISKS',start);
const data=JSON.parse(html.slice(start,end));
const controls=['MPM-05','MPM-09'],riskIds=[...new Set(controls.flatMap(id=>data.exploration.controls.find(c=>c.id===id).riskIds))];
const base={runId:'test-run',eligible:true,calibrationStatus:'anchor_scaled',horizonYears:1};
const measurement={schemaVersion:1,status:'ready',editionId:'TESTDATA-ENDAST-LOKAL-QA',provenance:{orgId:'test-org',experimentId:'test-experiment',executionId:'test-exec',label:'TESTDATA – endast lokal funktionstest',currency:'SEK',horizonYears:1,scope:{description:'Syntetiskt testurval',exposureBasis:'Två testmätta registerposter'},runs:[{runId:'test-run',functionId:'test-function',status:'completed',completedAt:'2026-10-21T10:00:00Z',executionId:'test-exec',inputRunIds:[],sha256:'a'.repeat(64)}]},risks:riskIds.slice(0,2).map((id,i)=>({riskId:id,likelihood:{...base,value:i?.2:.3,unit:'probability'},impact:{...base,value:i?4e6:6e6,unit:'SEK_per_event',statistic:'conditional_mean'},expectedLoss:{value:i?.8e6:1.8e6,horizonYears:1,method:'product_of_means',assumption:'independent_frequency_and_severity',runId:'test-run'},lossDistribution:{runId:'test-run',sampleCount:10000,p50:0,p95:10e6,bins:[{lower:0,upper:0,count:7000},{lower:0,upper:2e6,count:1000},{lower:2e6,upper:6e6,count:1000},{lower:6e6,upper:10e6,count:1000}]},sensitivity:{runId:'test-run',method:'Syntetisk variansandel för gränssnittstest',items:[{label:'Händelsemått',value:.65},{label:'Kostnad vid händelse',value:.35}]}})),controls:[],scenarios:[{id:'test-A',controlIds:[controls[0]],residualExpectedLoss:2.2e6},{id:'test-B',controlIds:[controls[1]],residualExpectedLoss:2.3e6},{id:'test-AB',controlIds:controls,residualExpectedLoss:2e6}].map(s=>({...s,title:`TESTDATA ${s.id}`,riskIds,referenceExpectedLoss:2.6e6,controlCost:null,method:'Testexporterat gemensamt scenario',overlapTreatment:'Testmodell med icke additiva kombinationer',runId:'test-run',riskEffects:[{riskId:riskIds[0],referenceExpectedLoss:1.8e6,residualExpectedLoss:s.residualExpectedLoss-.8e6}]})),portfolio:null};
validateMeasurement(measurement,data.risks.map(r=>r.risk_id),data.exploration.controls.map(c=>c.id));
data.measurement=measurement;data.reportMeasurement=measurement;data.report={...data.report,measurementEditionId:measurement.editionId,scenarioId:'test-AB'};
const out=join(root,'work/qa-2026-10-21/fixture-site');mkdirSync(out,{recursive:true});
const rendered=html.slice(0,start)+JSON.stringify(data).replace(/</g,'\\u003c')+html.slice(end);
writeFileSync(join(out,'index.html'),rendered.replace('<body>','<body><div style="background:#fff0d9;padding:10px;text-align:center;font:bold 13px Arial;color:#784500">TESTDATA · Endast lokal funktionstest · Ingår inte i publiceringsbygget</div>'));
console.log(out);

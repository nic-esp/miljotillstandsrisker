#!/usr/bin/env node
// Private transcripts stay in work/. Only explicitly approved excerpts are projected.
import { readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync } from 'node:fs';
import { resolve,join,dirname,relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalContext,sha256 } from './import-runs.mjs';
import { validateReport } from '../Artefakt_C_Riskregister/_build/report_model.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
export function projectInterviews(source) {
  if(source.schemaVersion!==1||!Array.isArray(source.interviews))throw new Error('Intervjuimport: ogiltigt format');
  const ids=new Set();
  return {schemaVersion:1,status:source.interviews.length?'available':'awaiting_material',interviews:source.interviews.map(i=>{
    if(ids.has(i.id))throw new Error('Intervjuimport: dubblerat intervju-ID');ids.add(i.id);
    // Never infer consent, names or findings from a transcript.
    if(i.publicationAllowed!==true||i.reviewStatus!=='approved')throw new Error(`Intervjuimport: ${i.id} är inte godkänd för publicering`);
    return {id:i.id,publicLabel:i.publicLabel,role:i.role||'Roll ej publicerad',sector:i.sector||null,date:i.publishDate===true||i.dateIsPublic===true?i.date:null,dateIsPublic:i.publishDate===true||i.dateIsPublic===true,publicationAllowed:true,reviewStatus:'approved',excerpts:(i.excerpts||[]).map(e=>{
      if(e.publicationAllowed!==true||e.reviewStatus!=='approved')throw new Error(`Intervjuimport: ${e.id} är inte godkänt`);
      if(typeof e.text!=='string'||!e.text.trim())throw new Error('Intervjuimport: tomt citat');
      return {id:e.id,text:e.text,locator:e.locator,publicationAllowed:true,reviewStatus:'approved',topicIds:e.topicIds||[],riskIds:e.riskIds||[],controlIds:e.controlIds||[],processIds:e.processIds||[]};
    })};
  })};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [command,input,output]=process.argv.slice(2),canonical=canonicalContext(),report=read(join(root,'report/manuscript.json'));
    if(command==='inspect') {
      const source=read(resolve(input)),projection=projectInterviews(source);
      validateReport(report,projection,canonical.risks.map(r=>r.risk_id),canonical.controls.map(c=>c.id));
      const out=resolve(output||join(root,'work/interview-candidate'));
      if(relative(join(root,'work'),out).startsWith('..')||out===join(root,'work'))throw new Error('Kandidaten ska ligga i work/');
      mkdirSync(out,{recursive:true});copyFileSync(resolve(input),join(out,'private-source.json'));
      writeFileSync(join(out,'interviews.json'),JSON.stringify(projection,null,2)+'\n');
      writeFileSync(join(out,'validation.json'),JSON.stringify({sha256:sha256(JSON.stringify(projection)),interviews:projection.interviews.length,excerpts:projection.interviews.reduce((n,i)=>n+i.excerpts.length,0)},null,2)+'\n');
      console.log(`Godkända utdrag för granskning: ${join(out,'interviews.json')}`);
    } else if(command==='activate') {
      const directory=resolve(input),projection=read(join(directory,'interviews.json')),audit=read(join(directory,'validation.json'));
      if(sha256(JSON.stringify(projection))!==audit.sha256)throw new Error('Kandidaten har ändrats efter granskning');
      const safe=projectInterviews(projection);
      validateReport(report,safe,canonical.risks.map(r=>r.risk_id),canonical.controls.map(c=>c.id));
      mkdirSync(join(root,'work/interview-history'),{recursive:true});
      const target=join(root,'publication/interviews.json');
      if(existsSync(target))copyFileSync(target,join(root,'work/interview-history',`${Date.now()}.json`));
      writeFileSync(target,JSON.stringify(safe,null,2)+'\n');
      console.log('Godkända utdrag aktiverade lokalt. Rapportens tolkningar och slutsatser ändras inte automatiskt.');
    } else {console.log('Usage: node scripts/import-interviews.mjs inspect <private-source.json> [work/candidate]\n       node scripts/import-interviews.mjs activate <work/candidate>');process.exitCode=1;}
  }catch(error){console.error(error.message);process.exitCode=1;}
}

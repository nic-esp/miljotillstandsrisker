#!/usr/bin/env node
import { readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync } from 'node:fs';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { reportEscape as esc,renderReportChapter,renderReportFigure,validateReport } from '../Artefakt_C_Riskregister/_build/report_model.mjs';
import { canonicalContext } from './import-runs.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function buildReport(output=join(root,'_site/report')) {
  const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
  const report=read('report/manuscript.json'),interviews=read('report/interviews.json'),canonical=canonicalContext();
  validateReport(report,interviews,canonical.risks.map(r=>r.risk_id),canonical.controls.map(c=>c.id));
  const style=readFileSync(join(root,'Artefakt_C_Riskregister/_build/measurement.css'),'utf8');
  const theme=readFileSync(join(root,'Artefakt_C_Riskregister/_build/svenskt-naringsliv.css'),'utf8');
  const logo=readFileSync(join(root,'site/assets/svenskt-naringsliv-logo.svg'),'utf8');
  const measurement=read('report/measurement.json');
  if(report.measurementEditionId!==measurement.editionId)throw new Error('Rapportens låsta mätutgåva avviker från manuset');
  const pending=id=>renderReportFigure(id,report,measurement,canonical.risks,canonical.controls);
  const html=`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(report.title)} · Rapportmall</title><style>*{box-sizing:border-box}body{margin:0}h1,h2,h3,p{margin-top:0}button,a{font-family:inherit}${theme}\n${style}\n.rp-print-document{max-width:1080px;margin:auto;padding:50px 32px}.rp-print-chapter{padding:50px 0}.rp-article{margin:auto}.rp-print-logo{background:#1f272f;padding:20px 30px;margin-bottom:40px}.rp-print-logo svg{width:190px}.rp-print-cover h1{font-size:52px;line-height:1.05;letter-spacing:-1.4px;max-width:850px}.rp-print-cover{min-height:650px}.rp-print-cover>p{max-width:700px;font:22px/1.5 Georgia,serif}.rp-print-index{padding:30px 0;border-block:1px solid var(--border)}.rp-print-index a{display:block;font-size:14px;padding:8px 0}.rp-print-index span{display:inline-block;width:35px}.rp-print-actions{position:sticky;top:0;background:#fff;padding:12px 25px;border-bottom:1px solid var(--border);display:flex;gap:25px;font-size:13px}.rp-print-chapter h2{scroll-margin-top:80px}@media print{.rp-print-actions{display:none}.rp-print-document{padding:0}.rp-print-cover{break-after:page}.rp-print-index{break-after:page}.rp-print-logo{print-color-adjust:exact}.rp-print-cover h1{font-size:42px}}</style></head><body><nav class="rp-print-actions"><a href="../?view=report">Tillbaka till sajten</a><a href="rapportmall.pdf">Hämta PDF-mallen</a><button id="printReport">Skriv ut läsversionen</button></nav><main class="rp-print-document"><section class="rp-print-cover"><div class="rp-print-logo">${logo}</div><div class="rp-section-label">Rapportmall · arbetsutgåva · ${esc(report.date)}</div><h1>${esc(report.title)}</h1><p>${esc(report.subtitle)}</p><p>${esc(report.description)}</p><aside class="rp-note">Mätresultat och intervjumaterial inväntas. Detta är en rapportmall med metodram och disposition, inte den färdigställda resultatrapporten.</aside><small>${esc(report.editionId)}</small></section><nav class="rp-print-index" aria-label="Innehåll"><h2>Innehåll</h2>${report.chapters.map(c=>`<a href="#${esc(c.id)}"><span>${esc(c.number)}</span>${esc(c.title)}</a>`).join('')}</nav>${report.chapters.map(c=>`<section id="${esc(c.id)}" class="rp-print-chapter"><article class="rp-article">${renderReportChapter(c,report,interviews,{figure:pending,linkBase:'../?'})}</article></section>`).join('')}</main><script>document.querySelector('#printReport').onclick=()=>window.print();</script></body></html>`;
  mkdirSync(output,{recursive:true});writeFileSync(join(output,'index.html'),html);
  const pdf=join(root,'report/output/rapportmall.pdf');
  if(!existsSync(pdf))throw new Error('PDF-mallen saknas. Kör npm run report:pdf.');
  const pdfManifest=read('report/output/manifest.json');
  for(const [key,file] of [['manuscriptSha256','report/manuscript.json'],['interviewsSha256','report/interviews.json'],['measurementSha256','report/measurement.json']]) {
    const actual=createHash('sha256').update(readFileSync(join(root,file))).digest('hex');
    if(pdfManifest[key]!==actual)throw new Error('PDF-mallen och manusunderlaget skiljer sig. Kör npm run report:pdf.');
  }
  copyFileSync(pdf,join(output,'rapportmall.pdf'));
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Rapportmall: ${buildReport()}`);

#!/usr/bin/env node
import { readFileSync, copyFileSync, cpSync, mkdirSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport } from './build-report.mjs';
import { renderSiteHeader } from '../Artefakt_C_Riskregister/_build/site_navigation.mjs';
import { addSiteAccess } from './site-access.mjs';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const STATIC_DATA_FILES = Object.freeze({
  'riskregister.json': 'Artefakt_C_Riskregister/Artefakt_C_riskregister.json',
  'riskregister.csv': 'Artefakt_C_Riskregister/mcp-server/data/riskregister.csv',
  'riskregister-items.csv': 'Artefakt_C_Riskregister/mcp-server/data/riskregister-items.csv',
  'exploration.json': 'Artefakt_C_Riskregister/mcp-server/data/exploration.json',
  'authority-controls-source.csv':'Artefakt_C_Riskregister/_build/authority-inputs/myndighetskontroller_riskkopplingar.csv',
  'authority-assessments-source.csv':'Artefakt_C_Riskregister/_build/authority-inputs/atgardsforslag_bedomning.csv',
  'authority-reading-guide.txt':'Artefakt_C_Riskregister/_build/authority-inputs/lasanvisning_och_kallor.txt',
  'authority-source-manifest.json':'Artefakt_C_Riskregister/_build/authority-inputs/manifest.json',
  'controls.csv': 'Artefakt_C_Riskregister/mcp-server/data/controls.csv',
  'nodes.json': 'Artefakt_C_Riskregister/_build/mappable_nodes.json',
  'sources.json': 'Artefakt_C_Riskregister/mcp-server/data/sources.json',
  'process-charts.json': 'Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json',
  'measurement.json':'publication/measurement.json',
  'presentation.json':'publication/presentation.json',
  'value-policy.json':'publication/value-policy.json',
  'source-review.json':'publication/source-review.json',
  'numeric-audit.json':'publication/numeric-audit.json',
  'risk-values.csv':'publication/risk-values.csv',
  'control-priorities.csv':'publication/control-priorities.csv',
  'control-risk-effects.csv':'publication/control-risk-effects.csv',
  'description-review.json':'publication/description-review.json',
  'interviews.json':'publication/interviews.json',
  'report-manuscript.json':'report/manuscript.json',
  'report-measurement.json':'report/measurement.json',
  'report-interviews.json':'report/interviews.json',
});

export function prepareSite(root = rootDirectory) {
  const output = join(resolve(root), '_site');
  const required = [
    'Artefakt_C_Riskregister/Artefakt_C_riskregister.html',
    ...Object.values(STATIC_DATA_FILES),
    'site/data/index.html',
    'site/ai-access.html',
    'site/llms.txt',
    'site/sitemap.xml',
    'site/assets/svenskt-naringsliv-logo.svg',
    'site/assets/svenskt-naringsliv-logo-stacked.svg',
    'site/assets/site-navigation.css',
    'site/assets/site-access.css',
    'site/assets/site-access.js',
    'site/assets/cardinal-wordmark.svg',
    'site/assets/SuisseIntl-Regular.woff2',
    'site/assets/SuisseIntl-Medium.woff',
    'publication/site-access.json',
  ];
  // Verify all build inputs before replacing the previous preview.
  for (const relativePath of required) {
    const file = statSync(join(root, relativePath));
    if (!file.isFile() || file.size === 0) throw new Error(`Byggfil saknas eller är tom: ${relativePath}`);
  }
  rmSync(output, { recursive: true, force: true });
  cpSync(join(root, 'site'), output, { recursive: true });
  const logo=readFileSync(join(root,'site/assets/svenskt-naringsliv-logo.svg'),'utf8');
  const firstChapter=JSON.parse(readFileSync(join(root,'report/manuscript.json'),'utf8')).chapters[0].id;
  for(const [file,page,base] of [['data/index.html','data','../'],['ai-access.html','ai','./']]) {
    const path=join(output,file);
    writeFileSync(path,readFileSync(path,'utf8').replace('<!--__SITE_HEADER__-->',()=>renderSiteHeader({page,base,logo,firstChapter})));
  }
  mkdirSync(join(output, 'data'), { recursive: true });
  copyFileSync(join(root, required[0]), join(output, 'index.html'));
  for (const [filename, source] of Object.entries(STATIC_DATA_FILES)) {
    copyFileSync(join(root, source), join(output, 'data', filename));
  }
  writeFileSync(join(output, '.nojekyll'), '');
  buildReport(join(output,'report'));
  const access=JSON.parse(readFileSync(join(root,'publication/site-access.json'),'utf8'));
  const protectHtml=directory=>{
    for(const entry of readdirSync(directory,{withFileTypes:true})) {
      const file=join(directory,entry.name);
      if(entry.isDirectory())protectHtml(file);
      else if(entry.isFile()&&entry.name.endsWith('.html')) {
        const path=relative(directory,output).replaceAll('\\','/');
        const base=path?path+'/':'';
        writeFileSync(file,addSiteAccess(readFileSync(file,'utf8'),access,base));
      }
    }
  };
  protectHtml(output);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Statisk webbplats förberedd i ${prepareSite()}`);
}

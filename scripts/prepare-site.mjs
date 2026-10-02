#!/usr/bin/env node
import { copyFileSync, cpSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  ];
  // Verify all build inputs before replacing the previous preview.
  for (const relativePath of required) {
    const file = statSync(join(root, relativePath));
    if (!file.isFile() || file.size === 0) throw new Error(`Byggfil saknas eller är tom: ${relativePath}`);
  }
  rmSync(output, { recursive: true, force: true });
  cpSync(join(root, 'site'), output, { recursive: true });
  mkdirSync(join(output, 'data'), { recursive: true });
  copyFileSync(join(root, required[0]), join(output, 'index.html'));
  for (const [filename, source] of Object.entries(STATIC_DATA_FILES)) {
    copyFileSync(join(root, source), join(output, 'data', filename));
  }
  writeFileSync(join(output, '.nojekyll'), '');
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Statisk webbplats förberedd i ${prepareSite()}`);
}

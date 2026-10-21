#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const candidates=[process.env.REPORT_PYTHON,join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'),'python3'].filter(Boolean);
const python=candidates.find(exe=>spawnSync(exe,['-c','import reportlab, PIL'],{stdio:'ignore'}).status===0);
if(!python){console.error('Python med ReportLab och Pillow saknas. Installera report/requirements.txt eller ange REPORT_PYTHON.');process.exitCode=1;}
else {
  const result=spawnSync(python,[join(root,'scripts/build-report-pdf.py')],{cwd:root,stdio:'inherit',env:{...process.env,REPORT_NODE:process.execPath}});
  process.exitCode=result.status??1;
}

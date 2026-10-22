#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectCardinalBundle,downloadCardinalBundle,validateBridgeConfig} from './cardinal-bridge.mjs';
import {collectStoredLossCache,downloadStoredLossCache} from './cardinal-loss-cache.mjs';
import {canonicalContext} from './import-runs.mjs';

export function prepareBridge(config,output,{mode='browser'}={}) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const rel=relative(resolve(root,'work'),resolve(output));
  if(!rel||rel.startsWith('..')||rel.startsWith('/'))throw Error('Save the private script under work/');
  if(!['browser','loss-cache'].includes(mode))throw Error('Unknown export mode');
  validateBridgeConfig(config);
  const input={...config,mappingVersion:canonicalContext().mappingVersion};
  mkdirSync(dirname(output),{recursive:true});
  const script=mode==='browser'
    ? `(()=>{const validateBridgeConfig=${validateBridgeConfig.toString()};return (${downloadCardinalBundle.toString()})(${JSON.stringify(input)}, ${collectCardinalBundle.toString()});})().catch(error=>console.error('Cardinal export stopped:',error.message));\n`
    : `(${downloadStoredLossCache.toString()})(${JSON.stringify(input)}, ${collectStoredLossCache.toString()}).catch(()=>{console.error('Stored loss export failed. Check runtime access, execution and schema; no results exported.');process.exitCode=1;});\n`;
  writeFileSync(output,script,{mode:0o600,flag:'wx'});
  return {script:resolve(output),mode,measurementCalls:0,simulationCalls:0,networkRequestsDuringPreparation:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [command,config,output]=process.argv.slice(2);
    if(!['prepare','prepare-loss-cache'].includes(command)||!config||!output)throw Error('Usage: export-cardinal.mjs prepare|prepare-loss-cache config.json work/new-export-script');
    console.log(JSON.stringify(prepareBridge(JSON.parse(readFileSync(config,'utf8')),output,{mode:command==='prepare'?'browser':'loss-cache'}),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}

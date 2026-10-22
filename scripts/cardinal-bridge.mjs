export function validateBridgeConfig(config) {
  const allowed = ['orgId','orgSlug','experimentId','executionId','mappingVersion','includeControlAnalysis','includeAnalytics'];
  if (!config || Object.keys(config).some(k=>!allowed.includes(k))) throw Error('Unknown export configuration field');
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  for (const key of ['orgId','experimentId','executionId']) if (!uuid.test(config[key] || '')) throw Error(`Explicit ${key} required`);
  if (!/^[a-z0-9-]+$/.test(config.orgSlug || '')) throw Error('Organization slug required');
  if (config.includeAnalytics !== undefined && config.includeAnalytics !== false) throw Error('includeAnalytics is unsafe: use the stored loss cache export; risk analytics GETs can queue simulations');
  if (config.includeControlAnalysis !== undefined && typeof config.includeControlAnalysis !== 'boolean') throw Error('includeControlAnalysis must be boolean');
  return config;
}

/** Runs in Node tests and in the authenticated Cardinal browser. No mutations,
 * measurements, simulation queues, credentials or automatic publication. */
export async function collectCardinalBundle(config, io) {
  validateBridgeConfig(config);
  const allowed = new Set(['organizations.getCurrent','execution.list','execution.getScope',
    'experiments.getGraph','runs.exportList','runs.list','runs.getById',
    'analytics.controlAnalysis','analytics.scenarioSelections']);
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  for (const key of ['orgId','experimentId','executionId']) if (!uuid.test(config[key] || '')) throw Error(`Explicit ${key} required`);
  if (!config.mappingVersion || !config.orgSlug) throw Error('Site mapping version and organization slug required');
  const bundle = {schemaVersion:1,kind:'cardinal_site_bridge',sourceOrigin:'https://nr.getcardinal.io',
    config,startedAt:io.now(),documents:[],warnings:[],policy:{measurementCalls:0,methods:['GET'],
      analyticsMayFillDerivedLossCache:false,simulationCalls:0}};
  const record = async (procedure,input,encoding,body) => {
    bundle.documents.push({procedure,input,encoding,capturedAt:io.now(),sha256:await io.hash(body),body});
  };
  const query = async (procedure,input=null) => {
    if (!allowed.has(procedure)) throw Error(`Procedure forbidden: ${procedure}`);
    const body = await io.request(procedure,input);
    const response = JSON.parse(body);
    if (response.error || !response.result?.data || !Object.hasOwn(response.result.data,'json')) {
      const error=Error(`Invalid response: ${procedure}`);
      if(response.error?.json?.data?.code==='NOT_FOUND')error.code='NOT_FOUND';
      throw error;
    }
    await record(procedure,input,'trpc-superjson',body);
    return response.result.data.json; // Keep original SuperJSON envelope, including type metadata, in the archive.
  };
  const org = await query('organizations.getCurrent');
  if (org.id !== config.orgId || org.slug !== config.orgSlug) throw Error('Wrong active organization; export stopped');
  const executions = await query('execution.list',{executionId:config.executionId});
  const execution = executions.find(e=>e.id === config.executionId);
  if (!execution || execution.experimentId !== config.experimentId || execution.status !== 'completed') throw Error('Select a completed execution; running, failed and cancelled executions are refused');
  const scope = await query('execution.getScope',{executionId:config.executionId});
  if (!scope?.scopeSnapshotId || !scope.scopeHash || !scope.currency || !(scope.horizonYears > 0)) throw Error('A frozen assessment scope is required');
  await query('experiments.getGraph',{experimentId:config.experimentId,executionId:config.executionId});
  const filter = {experimentId:config.experimentId,executionId:config.executionId};
  const listRuns = async () => {
    try { return await query('runs.exportList',filter); }
    catch (error) {
      // Only a missing procedure permits fallback. Auth/network/schema errors must stop the export.
      if (error.code !== 'NOT_FOUND') throw error;
      const rows=[],ids=new Set();let total;
      for(let page=1;page<=10000;page++) {
        const result=await query('runs.list',{...filter,page,pageSize:100});
        if(!Array.isArray(result.items)||result.pagination?.page!==page||!Number.isInteger(result.pagination.total))throw Error('Unknown Runs pagination');
        total??=result.pagination.total;
        if(total!==result.pagination.total||result.items.some(r=>ids.has(r.id)))throw Error('Changing or repeated Runs pagination');
        for(const r of result.items) {if(ids.has(r.id))throw Error('Duplicate Run');ids.add(r.id);}
        rows.push(...result.items);
        if(!result.pagination.hasMore) {if(rows.length!==total)throw Error('Incomplete Runs pagination');return rows;}
      }
      throw Error('Runs pagination exceeded limit');
    }
  };
  const listed=await listRuns();
  if (!Array.isArray(listed) || !listed.length || new Set(listed.map(r=>r.id)).size!==listed.length || listed.some(r=>r.status!=='completed'||r.executionId!==config.executionId||r.experimentId!==config.experimentId)) throw Error('Incomplete or mixed execution output');
  const queue=listed.map(r=>r.id), seen=new Set();
  while(queue.length) {
    const id=queue.shift();if(seen.has(id))continue;
    if(!uuid.test(id)||seen.size>=10000)throw Error('Invalid Run dependency');
    const run=await query('runs.getById',{id});
    if(run.id!==id||run.organizationId!==config.orgId||run.status!=='completed')throw Error('Run identity, organization or completion mismatch');
    seen.add(id);
    // The relational inputs and recorded provenance are both needed: older Runs
    // may have only one, and a Monte Carlo node can have multiple output Runs.
    const refs=[...(run.inputRunIds||[]),...(run.provenanceJson?.inputRunIds||[]),run.basisSiblingRunId,run.provenanceJson?.siblingRunId,
      run.provenanceJson?.controlScenario?.controlEffectsRunId,run.dataJsonb?.stats?.controlScenario?.controlEffectsRunId];
    for(const ref of refs.filter(Boolean))if(!seen.has(ref))queue.push(ref);
  }
  // Full relational backup. The dashboard's matrix is intentionally truncated.
  const zip=await io.relationships();
  await record('export/risk-management',null,'base64-zip',zip);
  if(config.includeControlAnalysis !== false) {
    // Audited separately: controlAnalysis qualifies saved Runs and aggregates
    // their effects; it does not resolve/enqueue the portfolio simulation cache.
    for(const controlBasis of ['residual_implemented_controls','inherent_no_controls']) {
      const input={...filter,controlBasis};
      await query('analytics.controlAnalysis',input);
    }
    await query('analytics.scenarioSelections',filter);
  }
  const endOrg=await query('organizations.getCurrent');
  if(endOrg.id!==org.id)throw Error('Organization changed during capture');
  const finalRuns=await listRuns();
  const inventory=rows=>JSON.stringify(rows.map(r=>[r.id,r.status,r.version,r.completedAt]).sort((a,b)=>a[0].localeCompare(b[0])));
  if(inventory(finalRuns)!==inventory(listed))throw Error('Run inventory changed during capture');
  const endExecution=(await query('execution.list',{executionId:config.executionId})).find(e=>e.id===config.executionId);
  const endScope=await query('execution.getScope',{executionId:config.executionId});
  if(endExecution?.status!=='completed'||endExecution.experimentId!==config.experimentId||endScope.scopeHash!==scope.scopeHash||endScope.scopeSnapshotId!==scope.scopeSnapshotId)throw Error('Execution or scope changed during capture');
  bundle.completedAt=io.now();
  return bundle;
}

/** Browser transport: session cookies never leave nr, and are never exported. */
export async function downloadCardinalBundle(config, collect) {
  if(location.origin!=='https://nr.getcardinal.io')throw Error('Run this in the authenticated nr.getcardinal.io tab');
  const get=async path=>{
    const response=await fetch(new URL(path,location.origin),{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store'});
    if(!response.ok) {
      const error=Error(`Export request failed (${response.status})`);
      if(response.status===404)error.code='NOT_FOUND';
      throw error;
    }
    return response;
  };
  const bundle=await collect(config,{
    now:()=>new Date().toISOString(),
    hash:async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join(''),
    request:async(procedure,input)=>(await get('/api/trpc/'+procedure+'?input='+encodeURIComponent(JSON.stringify({json:input})))).text(),
    relationships:async()=>{
      const response=await get('/api/export/risk-management');
      if(!response.headers.get('content-type')?.includes('zip'))throw Error('Expected relationship ZIP');
      const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
      for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      return btoa(binary);
    },
  });
  const url=URL.createObjectURL(new Blob([JSON.stringify(bundle)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`cardinal-${config.executionId}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  console.info('Cardinal export complete', {executionId:config.executionId,documents:bundle.documents.length,measurementCalls:0});
  return {executionId:config.executionId,documents:bundle.documents.length,measurementCalls:0};
}

/** Standalone administrative reader. No Cardinal services, Redis or job queues.
 * The caller must supply a PostgreSQL read-only transaction. */
export async function collectStoredLossCache(config, query) {
  const args=[config.orgId,config.experimentId,config.executionId];
  const context=await query(`select e.id as "executionId", e.experiment_id as "experimentId",
    e.organization_id as "orgId", e.status, e.completed_at as "completedAt",
    s.id as "scopeSnapshotId", s.scope_hash as "scopeHash", s.currency,
    s.horizon_years::float8 as "horizonYears"
    from experiment_executions e join assessment_scope_snapshots s on s.id=e.scope_snapshot_id
    and s.organization_id=e.organization_id
    where e.organization_id=$1 and e.experiment_id=$2 and e.id=$3`,args);
  if(context.length!==1||context[0].status!=='completed')throw Error('Completed execution and frozen scope required');
  const runs=await query(`select id, type, dimension, status, version,
    control_basis as "controlBasis", completed_at as "completedAt"
    from runs where organization_id=$1 and experiment_id=$2 and execution_id=$3 order by id`,args);
  if(!runs.length||runs.some(r=>r.status!=='completed'))throw Error('All output Runs must be completed');
  const models=await query(`select m.id, m.likelihood_run_id as "likelihoodRunId",
    m.impact_run_id as "impactRunId", l.control_basis as "controlBasis",
    m.created_at as "createdAt", m.result_jsonb as result
    from loss_model_results m
    join runs l on l.id=m.likelihood_run_id
    join runs i on i.id=m.impact_run_id
    where l.organization_id=$1 and i.organization_id=$1
    and l.experiment_id=$2 and i.experiment_id=$2
    and l.execution_id=$3 and i.execution_id=$3
    and l.status='completed' and i.status='completed'
    and l.type='risk_exposure' and i.type='risk_exposure'
    and l.dimension='likelihood' and i.dimension='impact'
    and l.control_basis=i.control_basis order by m.id`,args);
  return {schemaVersion:1,kind:'cardinal_stored_loss_cache',sourceOrigin:'https://nr.getcardinal.io',
    config,context:context[0],runs,models,capturedAt:new Date().toISOString(),
    policy:{transaction:'repeatable read read only',measurementCalls:0,simulationCalls:0},
    note:'Only stored results. An absent model is unavailable; no simulation was requested.'};
}

/** Run only inside an authorized runtime with its existing POSTGRES_URL.
 * No connection is opened when preparing this script or importing the module. */
export async function downloadStoredLossCache(config,collect) {
  const {default:postgres}=await import('postgres');
  if(!process.env.POSTGRES_URL)throw Error('An authorized Cardinal runtime with POSTGRES_URL is required');
  const sql=postgres(process.env.POSTGRES_URL,{max:1,connect_timeout:10,idle_timeout:5});
  try {
    const result=await sql.begin('isolation level repeatable read read only',async tx=>{
      await tx.unsafe("set local statement_timeout = '60s'");
      return collect(config,(query,args)=>tx.unsafe(query,args));
    });
    process.stdout.write(JSON.stringify(result)+'\n');
  } finally {await sql.end({timeout:5});}
}

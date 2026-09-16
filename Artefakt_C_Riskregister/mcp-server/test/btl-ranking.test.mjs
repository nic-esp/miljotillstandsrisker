import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRankingModel } from '../../_build/btl_ranking.mjs';

const run = { id: 'run-latest', completedAt: '2026-09-16T08:00:00Z' };
const proc = {
  B10: { name: 'Förstudie', nodes: [{ id: 'B10-010' }, { id: 'B10-G020' }] },
  B20: { name: 'Miljöbedömning', nodes: [{ id: 'B20-START' }, { id: 'B20-010' }] },
  B30: { name: 'Ansökan', nodes: [{ id: 'B30-010' }] },
};
const risks = [
  { risk_id: 'R-1', node_id: 'B10-010', affects: 'B10-010, B10-G020 / B10-G020; B20-START, B20-010 och hela B30. B99-999 saknas.' },
  { risk_id: 'R-2', node_id: 'B10-G020', affects: 'B20-START och B20-010.' },
  { risk_id: 'R-3', node_id: 'B30-010', affects: '' },
];
const row = (riskId, rank, score, extra = {}) => ({ riskId, sourceRiskId: `source-${riskId}`, rank, score, ...extra });
const snapshot = entries => ({ run, entries });

test('a missing snapshot leaves every risk unranked without fabricated ranking data', () => {
  for (const value of [null, undefined]) {
    const model = createRankingModel(risks, value, proc);
    assert.equal(model.run, null);
    assert.equal(model.rankedCount, 0);
    assert.deepEqual(model.entries, []);
    assert.equal(model.byRiskId.size, 0);
    assert.equal(model.topRiskIds.size, 0);
    assert.equal(model.nodeExposure.size, 0);
    assert.deepEqual(model.unranked, risks);
    assert.equal(model.chartExposure.get('B10').topRiskCount, 0);
  }
});

test('source rank is retained, equal scores follow source rank, and input is not mutated', () => {
  const input = snapshot([row('R-2', 4, 0.4), row('R-1', 2, 0.4)]);
  const before = JSON.stringify(input);
  const model = createRankingModel(risks, input, proc);
  assert.equal(model.run, run);
  assert.deepEqual(model.entries.map(entry => [entry.riskId, entry.rank, entry.position]), [
    ['R-1', 2, 1], ['R-2', 4, 2],
  ]);
  assert.equal(model.byRiskId.get('R-1').risk, risks[0]);
  assert.equal(model.rankedCount, 2);
  assert.deepEqual(model.unranked, [risks[2]]);
  assert.equal(JSON.stringify(input), before);
});

test('top 50 is exactly the first 50 rows, including deterministic ties at the cutoff', () => {
  const manyRisks = Array.from({ length: 55 }, (_, index) => ({
    risk_id: `R-${index + 1}`, node_id: 'B10-010', affects: 'B20-START',
  }));
  const input = manyRisks.map((risk, index) => row(risk.risk_id, index + 1, index < 48 ? 100 - index : 50)).reverse();
  const model = createRankingModel(manyRisks, snapshot(input), proc);
  assert.equal(model.rankedCount, 55);
  assert.equal(model.topEntries.length, 50);
  assert.equal(model.topRiskIds.size, 50);
  assert.equal(model.topEntries.at(-1).riskId, 'R-50');
  assert.equal(model.byRiskId.get('R-51').isTop, false);
  assert.equal(model.nodeExposure.get('B10-010').count, 55);
  assert.equal(model.nodeExposure.get('B10-010').topRiskCount, 50);
  assert.equal(model.chartExposure.get('B20').topRiskCount, 50);
});

test('node mapping deduplicates mentions, separates direct from affected, and excludes inferred nodes', () => {
  const model = createRankingModel(risks, snapshot([row('R-1', 1, 2), row('R-2', 2, 1)]), proc);
  const first = model.byRiskId.get('R-1');
  assert.deepEqual(first.directNodeIds, ['B10-010']);
  assert.deepEqual(first.affectedNodeIds, ['B10-G020', 'B20-START', 'B20-010']);
  assert.equal(new Set(first.nodeIds).size, first.nodeIds.length);
  const start = model.nodeExposure.get('B10-010');
  assert.equal(start.directCount, 1);
  assert.equal(start.affectedCount, 0, 'the primary node is not double-counted when repeated in affects');
  const gateway = model.nodeExposure.get('B10-G020');
  assert.equal(gateway.topDirectCount, 1);
  assert.equal(gateway.topAffectedCount, 1);
  assert.equal(gateway.topRiskCount, 2);
  assert.equal(gateway.bestRank, 1);
  assert.equal(gateway.bestDirectRank, 2, 'a higher ranked affected risk cannot become the direct risk rank');
  assert.equal(gateway.bestAffectedRank, 1);
  assert.equal(start.bestDirectRank, 1);
  assert.equal(start.bestAffectedRank, null, 'missing relations have no fabricated best rank');
  assert.equal(model.nodeExposure.has('B99-999'), false);
  assert.equal(model.nodeExposure.has('B30-010'), false, 'a chart mention does not imply all nodes are affected');
});

test('chart counts are unique risks and nodes, with explicit direct and affected counts', () => {
  const model = createRankingModel(risks, snapshot([row('R-1', 1, 2), row('R-2', 2, 1)]), proc);
  const first = model.chartExposure.get('B10');
  assert.equal(first.topRiskCount, 2, 'one risk touching several nodes is counted once per chart');
  assert.equal(first.topDirectCount, 2);
  assert.equal(first.topAffectedCount, 1, 'direct and affected chart sets may overlap');
  assert.equal(first.topNodeCount, 2);
  assert.equal(first.topDirectNodeCount, 2);
  assert.equal(first.topAffectedNodeCount, 1);
  const downstream = model.chartExposure.get('B20');
  assert.equal(downstream.topRiskCount, 2);
  assert.equal(downstream.topNodeCount, 2);
  assert.equal(downstream.topDirectCount, 0);
  assert.equal(downstream.topAffectedCount, 2);
  assert.equal(downstream.bestDirectRank, null);
  assert.equal(downstream.bestAffectedRank, 1);
  assert.equal(model.chartExposure.get('B30').topNodeCount, 0);
  assert.equal(model.chartExposure.get('B30').bestDirectRank, null);
  assert.equal(model.chartExposure.get('B30').bestAffectedRank, null);
  for (const exposure of [...model.nodeExposure.values(), ...model.chartExposure.values()]) {
    assert.equal('probability' in exposure, false);
    assert.equal('score' in exposure, false, 'BTL scores are not aggregated into a node or chart probability');
  }
});

test('malformed snapshots, unmapped risks and duplicate IDs or ranks are rejected', () => {
  const invalid = [
    [[], /snapshot must be an object/],
    [{ entries: [] }, /run.id/],
    [{ run }, /entries must be an array/],
    [snapshot([null]), /entry must be an object/],
    [snapshot([row('', 1, 0.5)]), /valid riskId/],
    [snapshot([row('not-in-register', 1, 0.5)]), /missing from the local register/],
    [snapshot([row('R-1', 1, 0.5, { sourceRiskId: '' })]), /valid sourceRiskId/],
    [snapshot([row('R-1', 1, 0.5), row('R-1', 2, 0.4)]), /duplicate riskId/],
    [snapshot([row('R-1', 1, 0.5), row('R-2', 2, 0.4, { sourceRiskId: 'source-R-1' })]), /duplicate sourceRiskId/],
    [snapshot([row('R-1', 1, 0.5), row('R-2', 1, 0.4)]), /duplicate source rank/],
    [snapshot([row('R-1', 0, 0.5)]), /invalid rank/],
    [snapshot([row('R-1', 1.5, 0.5)]), /invalid rank/],
    [snapshot([row('R-1', 1, NaN)]), /invalid score/],
    [snapshot([row('R-1', 1, Infinity)]), /invalid score/],
    [snapshot([row('R-1', 1, '0.5')]), /invalid score/],
    [snapshot([row('R-1', 1, 0.1), row('R-2', 2, 0.2)]), /score order disagrees with source ranks/],
  ];
  for (const [input, message] of invalid) assert.throws(() => createRankingModel(risks, input, proc), message);
  assert.throws(() => createRankingModel([...risks, risks[0]], null, proc), /duplicate local risk_id/);
  assert.throws(() => createRankingModel(risks, null, { B10: { nodes: [{ id: 'x' }, { id: 'x' }] } }), /duplicate process node/);
});

test('an existing run with no ranked entries is represented explicitly', () => {
  const model = createRankingModel(risks, snapshot([]), proc);
  assert.equal(model.run, run);
  assert.equal(model.rankedCount, 0);
  assert.deepEqual(model.unranked, risks);
});

test('real register and process charts map only existing nodes with unique per-risk exposure', () => {
  const register = JSON.parse(readFileSync(new URL('../../Artefakt_C_riskregister.json', import.meta.url), 'utf8'));
  const processSource = JSON.parse(readFileSync(new URL('../../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json', import.meta.url), 'utf8'));
  const charts = Object.fromEntries(processSource.charts.map(chart => [chart.metadata.chartKey, {
    name: chart.name,
    nodes: chart.chartData.nodes,
  }]));
  const model = createRankingModel(register, snapshot(register.map((risk, index) => row(risk.risk_id, index + 1, register.length - index))), charts);
  const known = new Set(Object.values(charts).flatMap(chart => chart.nodes.map(node => node.id)));
  assert.equal(model.rankedCount, register.length);
  assert.equal(model.topEntries.length, 50);
  assert.deepEqual(model.unranked, []);
  for (const [nodeId, exposure] of model.nodeExposure) {
    assert.ok(known.has(nodeId));
    assert.equal(exposure.entries.length, exposure.riskIds.size);
    assert.equal(exposure.topEntries.length, exposure.topRiskIds.size);
  }
});

test('imported likelihood snapshot preserves exact scores and source order with verified top-50 mappings', () => {
  const register = JSON.parse(readFileSync(new URL('../../Artefakt_C_riskregister.json', import.meta.url), 'utf8'));
  const processSource = JSON.parse(readFileSync(new URL('../../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json', import.meta.url), 'utf8'));
  const imported = JSON.parse(readFileSync(new URL('../../_build/btl_snapshot.json', import.meta.url), 'utf8'));
  const charts = Object.fromEntries(processSource.charts.map(chart => [chart.metadata.chartKey, {
    name: chart.name,
    nodes: chart.chartData.nodes,
  }]));
  const model = createRankingModel(register, imported, charts);
  assert.equal(imported.run.type, 'risk_probability_rank');
  assert.equal(imported.run.dimension, 'likelihood');
  assert.equal(imported.run.method, 'btl');
  assert.equal(imported.run.status, 'completed');
  assert.equal(model.rankedCount, imported.coverage.rankedRiskCount);
  assert.equal(register.length, imported.coverage.localRiskCount);
  assert.equal(model.topEntries.length, 50);
  assert.equal(model.topRiskIds.size, 50);
  assert.deepEqual(model.unranked.map(risk => risk.risk_id).sort(), imported.coverage.unrankedLocalRisks.map(risk => risk.riskId).sort());
  const originalOrder = [...imported.entries].sort((a, b) => a.rank - b.rank);
  assert.deepEqual(model.entries.map(entry => [entry.riskId, entry.rank, entry.score]), originalOrder.map(entry => [entry.riskId, entry.rank, entry.score]));
  assert.ok(Math.abs(model.entries.reduce((sum, entry) => sum + entry.score, 0) - 1) < 1e-12, 'normalized BTL scores sum to one across the source run, not within nodes');
  const directNodes = [...model.nodeExposure.values()].filter(exposure => exposure.topDirectCount);
  const directCharts = [...model.chartExposure.values()].filter(exposure => exposure.topDirectCount);
  assert.equal(directNodes.length, imported.coverage.topNodeCount);
  assert.equal(directCharts.length, imported.coverage.topChartCount);
  assert.equal(directNodes.reduce((count, exposure) => count + exposure.topDirectCount, 0), 50);
  assert.equal(directCharts.reduce((count, exposure) => count + exposure.topDirectCount, 0), 50);
  assert.equal(new Set(directCharts.flatMap(exposure => [...exposure.topDirectRiskIds])).size, 50);
  for (const entry of model.entries) {
    assert.equal(entry.risk.node_id, entry.nodeId);
    assert.equal(entry.risk.chart_key, entry.chartKey);
    assert.ok(entry.score >= 0, 'this normalized-score snapshot can be plotted from zero');
  }
  for (const exposure of model.nodeExposure.values()) {
    assert.equal(exposure.topEntries.length, exposure.topRiskIds.size);
    assert.equal(exposure.bestDirectRank, exposure.directEntries[0]?.rank ?? null);
    assert.equal(exposure.bestAffectedRank, exposure.affectedEntries[0]?.rank ?? null);
  }
});

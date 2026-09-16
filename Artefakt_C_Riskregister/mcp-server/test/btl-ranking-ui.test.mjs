import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRankingModel } from '../../_build/btl_ranking.mjs';
import { consequences, riskItemText, triggerFactors } from '../../_build/risk_fields.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const template = read('../../_build/app_template.html');
const rankingView = read('../../_build/ranking_view.mjs');
const risks = JSON.parse(read('../../Artefakt_C_riskregister.json'));
const snapshot = JSON.parse(read('../../_build/btl_snapshot.json'));
const processSource = JSON.parse(read('../../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json'));
const proc = Object.fromEntries(processSource.charts.map(chart => [chart.metadata.chartKey, {
  name: chart.name,
  nodes: chart.chartData.nodes.map(node => ({ ...node, label: node.data.label })),
}]));
const ranking = createRankingModel(risks, snapshot, proc);

function section(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `missing ${start} section`);
  return source.slice(first + start.length, last);
}

function application() {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      innerHTML: '', value: '', textContent: '',
      querySelectorAll: () => [],
      scrollIntoView() {},
    });
    return elements.get(selector);
  };
  const charts = [...new Set(risks.map(risk => risk.chart_key))];
  const categories = [...new Set(risks.map(risk => risk.category))];
  const origins = [...new Set(risks.map(risk => risk.origin))];
  const state = {
    q: '', charts: new Set(charts), cats: new Set(categories), origins: new Set(origins),
    node: '', sort: 'rank', topOnly: false, rankScope: 'top', showDownstream: false,
  };
  const context = vm.createContext({
    RISKS: risks, RANKING: ranking, CHARTS: charts, CATEGORIES: categories, ORIGINS: origins,
    CHART_NAME: Object.fromEntries(Object.entries(proc).map(([id, chart]) => [id, chart.name])),
    CHART_RISKS: Object.fromEntries(charts.map(id => [id, risks.filter(risk => risk.chart_key === id).length])),
    PROC_NODE: Object.fromEntries(Object.entries(proc).flatMap(([chart, data]) => data.nodes.map(node => [node.id, { ...node, chart }]))),
    state, consequences, riskItemText, triggerFactors,
    document: { querySelector: element },
    renderSidebar() {},
    setView: view => { state.view = view; },
    csvDownload: (...args) => { context.csvExport = args; },
  });
  vm.runInContext([
    section(template, '// ---- helpers ----', '// ---- CSV export ----'),
    section(template, '// ---- filtering ----', '// ---- shared rendering ----'),
    rankingView,
  ].join('\n'), context);
  return { context, state, element };
}

test('top-50 action clears stale filters and exposes exactly the source top 50 in the register', () => {
  const { context, state, element } = application();
  state.q = 'a previous search';
  state.node = 'B10-010';
  state.charts.clear();
  state.cats.clear();
  state.origins.clear();
  state.sort = 'id';
  context.showTopRisks();
  assert.equal(state.view, 'risks');
  assert.equal(state.topOnly, true);
  assert.equal(state.q, '');
  assert.equal(state.node, '');
  assert.equal(element('#sort').value, 'rank');
  const displayed = context.sorted(context.filtered());
  assert.deepEqual(Array.from(displayed, risk => risk.risk_id), ranking.topEntries.map(entry => entry.riskId));
  assert.equal(displayed.length, 50);
  state.charts = new Set([ranking.topEntries[0].risk.chart_key]);
  assert.ok(context.filtered().every(risk => ranking.topRiskIds.has(risk.risk_id) && state.charts.has(risk.chart_key)), 'additional filters narrow the global top 50 rather than recalculate it');
});

test('master list retains all risks, ranks in source order, and marks the cutoff and missing row correctly', () => {
  const { context } = application();
  const displayed = context.sorted(context.filtered());
  assert.equal(displayed.length, risks.length);
  assert.deepEqual(Array.from(displayed.slice(0, ranking.rankedCount), risk => risk.risk_id), ranking.entries.map(entry => entry.riskId));
  assert.deepEqual(Array.from(displayed.slice(ranking.rankedCount), risk => risk.risk_id).sort(), ranking.unranked.map(risk => risk.risk_id).sort());
  assert.match(context.rankBadge(ranking.topEntries.at(-1).riskId), /Topp 50 · #50/);
  assert.doesNotMatch(context.rankBadge(ranking.entries[50].riskId), /Topp 50/);
  for (const risk of ranking.unranked) assert.match(context.rankBadge(risk.risk_id), /Ej rankad/);
});

test('ranking page renders the complete distribution, dated provenance and a switchable exact ranking table', () => {
  const { context, element } = application();
  context.renderRanking();
  let html = element('#main').innerHTML;
  assert.equal((html.match(/class="rank-mark /g) || []).length, ranking.rankedCount);
  assert.equal((html.match(/class="rank-mark top50"/g) || []).length, 50);
  const lastRisk = ranking.entries.at(-1);
  const lastBar = [...html.matchAll(/<button class="rank-mark [^"]*" style="height:([^"]+)%" data-open-risk="([^"]+)"/g)].find(match => match[2] === lastRisk.riskId);
  assert.equal(Number(lastBar?.[1]), 100 * lastRisk.score / ranking.entries[0].score, 'the lowest-ranked bar retains its actual relative score without a visual minimum');
  assert.equal((html.match(/<tr class=/g) || []).length, 50);
  assert.doesNotMatch(html, /datum saknas/);
  assert.match(html, /16 september 2026 12:28 \(Stockholm\)/);
  assert.match(html, /inte sannolikheter i procent/);
  element('#toggleRankScope').onclick();
  html = element('#main').innerHTML;
  assert.equal((html.match(/<tr class=/g) || []).length, ranking.rankedCount);
  assert.equal((html.match(/<tr class="top-ranked"/g) || []).length, 50);
  element('#exportRanking').onclick();
  const [, header, rows] = context.csvExport;
  assert.equal(rows.length, ranking.rankedCount);
  assert.deepEqual(Array.from(rows[0]).slice(0, 4), [ranking.entries[0].rank, ranking.entries[0].riskId, ranking.entries[0].risk.title, ranking.entries[0].score]);
  assert.equal(header.includes('btl_relativ_poang'), true);
});

test('default process node ranks reflect direct risks and downstream mode includes explicit affected nodes', () => {
  const { context, state } = application();
  const differing = [...ranking.nodeExposure.values()].filter(exposure => exposure.topDirectCount && exposure.bestRank !== exposure.bestDirectRank);
  assert.ok(differing.length, 'the real snapshot exercises direct versus affected ranking differences');
  for (const exposure of differing) {
    assert.equal(context.nodeDisplayRank(exposure), exposure.bestDirectRank);
    const panel = context.processRankingPanel(exposure.chartKey);
    const marker = `data-open-node="${exposure.nodeId}"><span class="rank-badge">#${exposure.bestDirectRank}</span>`;
    assert.ok(panel.includes(marker), `${exposure.nodeId} uses its direct rank`);
  }
  const affectedOnly = [...ranking.nodeExposure.values()].find(exposure => !exposure.topDirectCount && exposure.topAffectedCount);
  assert.ok(affectedOnly);
  assert.equal(context.processRankingPanel(affectedOnly.chartKey).includes(`data-open-node="${affectedOnly.nodeId}"`), false);
  state.showDownstream = true;
  assert.equal(context.nodeDisplayRank(differing[0]), differing[0].bestRank);
  assert.equal(context.processRankingPanel(affectedOnly.chartKey).includes(`data-open-node="${affectedOnly.nodeId}"`), true);
});

test('B00 subprocess summaries report their child process top risks rather than an empty navigation-node mapping', () => {
  const { context } = application();
  const subprocesses = proc.B00.nodes.filter(node => node.type === 'subprocess');
  assert.equal(subprocesses.length, 7);
  for (const node of subprocesses) {
    const target = node.data.handoffTo[0].split('-')[0];
    const childTopRisks = ranking.topEntries.filter(entry => entry.risk.chart_key === target);
    assert.ok(childTopRisks.length > 0, `${target} has top-50 risks in the verified run`);
    assert.equal(ranking.nodeExposure.has(node.id), false, 'the B00 navigation node itself has no direct risk mapping');
    assert.equal(context.processExposure(node), ranking.chartExposure.get(target), 'overview highlighting uses the same child process');
    const html = context.nodeRankingSummary(node.id);
    assert.ok(html.includes(`${childTopRisks.length} direkt mappade risker i topp 50 i ${target}`), `${node.id} reports the child process count`);
    assert.ok(html.includes(`Högsta placering: #${Math.min(...childTopRisks.map(entry => entry.rank))}.`), `${node.id} reports the highest direct rank in its child process`);
    assert.doesNotMatch(html, /Ingen topp 50-risk/);
  }
});

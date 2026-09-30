import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createExplorationData, occurrenceId } from '../../_build/exploration_model.mjs';
import { triggerFactors, consequences } from '../../_build/risk_fields.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const viewSource = readFileSync(join(here, '../../_build/exploration_view.mjs'), 'utf8');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const item = text => ({ text, basis:'analysis', source_refs:[] });
const risks = Array.from({ length:7 }, (_, index) => ({
  risk_id:`R${index}`, title:`Risk ${index}`, chart_key:'B10', node_id:`N${index}`, node_label:`Nod ${index}`,
  mitigation:`Åtgärd för risk ${index}.`, source_refs:[],
  trigger_factors:[item(`Första orsaken i risk ${index}.`), item(`Andra orsaken i risk ${index}.`)],
  consequences:[item(`Första konsekvensen i risk ${index}.`), item(`Andra konsekvensen i risk ${index}.`)],
}));
const fixture = createExplorationData(risks);
const control = (id, riskIds, targets=[]) => ({
  id, title:`Åtgärd ${id}`, description:`Beskrivning för ${id}`, kind:'shared', basis:'analysis',
  role:'combined', riskIds, sourceRiskIds:riskIds, chartKeys:['B10'], sourceTexts:[], targets,
});
const target = (riskId, type, text) => ({
  riskId, type, targetId:type==='event'?riskId:occurrenceId(riskId,type,text), role:'prevention', basis:'analysis',
});
const sharedControls = [
  control('A', ['R1','R2','R3','R4'], [
    target('R1','cause',risks[1].trigger_factors[0].text),
    target('R1','effect',risks[1].consequences[1].text),
    target('R1','event'),
    target('R2','cause',risks[2].trigger_factors[0].text),
  ]),
  control('B', ['R2','R3','R5']),
  control('C', ['R3','R4','R6']),
];
// Publication order is stable by ID, which is deliberately different from the
// source's narrative branch order. The view must reconstruct that source order.
const exploration = { ...fixture, controls:[...fixture.controls,...sharedControls], occurrences:[...fixture.occurrences].reverse() };

function loadView(overrides = {}) {
  const context = vm.createContext({
    DATA:{ exploration }, RISKS:risks,
    RANKING:{ topRiskIds:new Set(['R1','R3','R5']), byRiskId:new Map() },
    CHART_NAME:{ B10:'Process B10' }, esc, triggerFactors, consequences,
    rankBadge:() => '', refLink:() => '',
    $:() => { throw new Error('Pure render helper unexpectedly accessed the DOM'); },
    ...overrides,
  });
  vm.runInContext(viewSource, context, { filename:'exploration_view.mjs' });
  vm.runInContext(`globalThis.viewTest = {
    bow:(risk,controlId) => exBowTie(risk,controlId),
    compare:ids => { exState.compare = new Set(ids); return exComparisonContent(); }
  };`, context);
  return context;
}

function comparison(ids) {
  const context = loadView();
  const metrics = [], riskLists = [];
  context.exMetric = value => { metrics.push(value); return ''; };
  context.exRiskConnections = ids => { riskLists.push(Array.from(ids)); return ''; };
  const html = context.viewTest.compare(ids);
  return { html, metrics, riskLists };
}
const key = ids => [...ids].sort().join(',');

test('two-control comparison counts unique reach, top-50 reach, overlap and each additional risk', () => {
  const result = comparison(['A','B']);
  assert.deepEqual(result.metrics.slice(0,3), [5,3,2]);
  const lists = result.riskLists.map(key);
  assert.ok(lists.includes('R1,R4'), 'A must expose its two additional risks');
  assert.ok(lists.includes('R5'), 'B must expose its additional risk');
  assert.ok(lists.includes('R2,R3'), 'The common risks must be investigable');
});

test('three-control comparison retains risks shared by only two controls alongside the all-control intersection', () => {
  const result = comparison(['A','B','C']);
  assert.deepEqual(result.metrics.slice(0,3), [6,3,1]);
  const lists = result.riskLists.map(key);
  for (const extra of ['R1','R5','R6']) assert.ok(lists.includes(extra), `Missing additional risk ${extra}`);
  assert.ok(lists.includes('R2'), 'The A/B-only overlap must not disappear when C is added');
  assert.ok(lists.includes('R4'), 'The A/C-only overlap must be shown');
  assert.ok(lists.includes('R3'), 'The risk common to all three must be shown');
  assert.deepEqual([...new Set(result.riskLists.flat())].sort(), ['R1','R2','R3','R4','R5','R6'], 'Every risk contributing to the union must be investigable');
});

test('a risk with only its original mitigation still displays a selectable control in the bow tie', () => {
  const html = loadView().viewTest.bow(risks[0]);
  const sourceId = `C-SRC-${risks[0].risk_id}`;
  assert.ok(html.includes(`data-ex-bow-control="${sourceId}"`));
  assert.ok(html.includes(`data-ex-control="${sourceId}"`));
  assert.match(html, /class="ex-bow-event [^"]*targeted/);
  assert.equal((html.match(/class="ex-bow-control-edge"/g)||[]).length, 1);
});

test('bow-tie causes and effects follow canonical narrative order, independent of occurrence-ID order', () => {
  const risk = risks[1];
  const html = loadView().viewTest.bow(risk, 'A');
  const shown = [...html.matchAll(/data-occurrence-id="([^"]+)"/g)].map(match=>match[1]);
  const expected = [
    ...risk.trigger_factors.map(item=>occurrenceId(risk.risk_id,'cause',item.text)),
    ...risk.consequences.map(item=>occurrenceId(risk.risk_id,'effect',item.text)),
  ];
  assert.deepEqual(shown, expected);
});

test('bow-tie highlights exactly the selected control targets for this risk and retains all branches', () => {
  const html = loadView().viewTest.bow(risks[1], 'A');
  const targeted = [...html.matchAll(/class="ex-bow-node (?:cause|effect) ([^"]*)" data-occurrence-id="([^"]+)"/g)]
    .filter(match=>match[1].split(/\s+/).includes('targeted')).map(match=>match[2]).sort();
  assert.deepEqual(targeted, sharedControls[0].targets.filter(t=>t.riskId==='R1'&&t.type!=='event').map(t=>t.targetId).sort());
  assert.equal((html.match(/data-occurrence-id=/g)||[]).length, 4);
  assert.equal((html.match(/class="ex-bow-control-edge"/g)||[]).length, 3);
  assert.match(html, /class="ex-bow-event [^"]*targeted/);
  assert.ok(!html.includes(sharedControls[0].targets.find(t=>t.riskId==='R2').targetId));
});

test('a control belonging only to other risks cannot become the selected bow-tie control', () => {
  const html = loadView().viewTest.bow(risks[0], 'A');
  assert.ok(!html.includes('data-ex-control="A"'));
  assert.ok(html.includes('data-ex-control="C-SRC-R0"'));
});

test('bow-tie content escapes titles and occurrence text before embedding them in HTML or SVG', () => {
  const attack = '<img src=x onerror="alert(1)">';
  const risk = { ...risks[0], title:attack, trigger_factors:[item(attack)] };
  const data = createExplorationData([risk]);
  const html = loadView({ RISKS:[risk], DATA:{ exploration:data } }).viewTest.bow(risk);
  assert.ok(!html.includes(attack));
  assert.ok(html.includes(esc(attack)));
  assert.ok(!html.includes('<img'));
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadAuthorityPackage } from '../../_build/authority_controls.mjs';
import { createExplorationData } from '../../_build/exploration_model.mjs';
import { triggerFactors, consequences } from '../../_build/risk_fields.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const readJson = path => JSON.parse(readFileSync(join(here, path), 'utf8'));
const risks = readJson('../../Artefakt_C_riskregister.json');
const curations = readJson('../../_build/exploration_curations.json');
const exploration = createExplorationData(risks, curations, loadAuthorityPackage());
const viewSource = readFileSync(join(here, '../../_build/exploration_view.mjs'), 'utf8');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const main = 'S1_beslutat_uppdrag';

function loadView() {
  const context = vm.createContext({
    DATA:{ exploration }, RISKS:risks,
    RANKING:{ topRiskIds:new Set(), byRiskId:new Map() },
    CHART_NAME:Object.fromEntries([...new Set(risks.map(risk => risk.chart_key))].map(id => [id, id])),
    esc, triggerFactors, consequences, rankBadge:() => '', refLink:() => '',
    $:() => { throw new Error('Pure authority view helper unexpectedly accessed the DOM'); },
  });
  vm.runInContext(viewSource, context, { filename:'exploration_view.mjs' });
  vm.runInContext(`globalThis.authorityTest = {
    filter: changes => { Object.assign(exState, changes); return exFilteredControls(); },
    content: control => exControlContent(control),
    riskControls: riskId => EX_BY_RISK.get(riskId)
  };`, context);
  return context.authorityTest;
}

test('all-control default retains the 358 existing posts and adds 20 authority proposals', () => {
  const shown = Array.from(loadView().filter({}));
  assert.equal(shown.length, 378);
  assert.equal(shown.filter(control => control.kind === 'source').length, 342);
  assert.equal(shown.filter(control => control.kind === 'shared').length, 16);
  assert.equal(shown.filter(control => control.driver === 'authority').length, 20);
});

test('authority driver defaults to the 17 main-scenario controls with explicit alternate scenario filters', () => {
  const view = loadView();
  const first = Array.from(view.filter({ controlDriver:'authority' }));
  assert.equal(first.length, 17);
  assert.ok(first.every(control => control.scenario === main));
  assert.equal(view.filter({ controlScenario:'all' }).length, 20);
  assert.deepEqual(Array.from(view.filter({ controlScenario:'Inforande_ej_S1' }), control => control.id), ['MPM-T01']);
  assert.deepEqual(Array.from(view.filter({ controlScenario:'Framtida_mandat_ej_beslutat' }), control => control.id).sort(), ['MPM-F01', 'MPM-F02']);
  assert.equal(view.filter({ controlDriver:'other' }).length, 358, 'A prior authority scenario must not hide original or shared controls');
});

test('original-action responsibility assessment does not reclassify that control or hide independent authority links', () => {
  const rid = 'R-B10-060-02';
  const view = loadView();
  const controls = Array.from(view.riskControls(rid));
  const original = controls.find(control => control.id === `C-SRC-${rid}`);
  assert.equal(original.driver, 'unspecified');
  assert.equal(original.kind, 'source');
  assert.match(original.authorityAssessment.status, /Utanför/);
  assert.ok(controls.some(control => control.id === 'MPM-01' && control.driver === 'authority'));
  const shownAuthority = Array.from(view.filter({ controlDriver:'authority' }));
  assert.ok(shownAuthority.some(control => control.id === 'MPM-01' && control.riskIds.includes(rid)));
  assert.ok(!shownAuthority.some(control => control.id === original.id));
  const originalHtml = view.content(original);
  assert.ok(originalHtml.includes(esc(original.authorityAssessment.status)));
  assert.ok(originalHtml.includes(esc(risks.find(risk => risk.risk_id === rid).mitigation)));
  assert.ok(!originalHtml.includes('class="ex-authority-badge'), 'Assessment alone must not produce an authority-driver badge');
});

test('authority search and process filters intersect rather than overriding scenario or ownership', () => {
  const view = loadView();
  const result = Array.from(view.filter({ controlDriver:'authority', controlQ:'  MPM-06 Säsongsberoende ', controlChart:'B60' }));
  assert.deepEqual(result.map(control => control.id), ['MPM-06']);
  assert.ok(result.every(control => control.scenario === main && control.chartKeys.includes('B60')));
  assert.equal(view.filter({ controlChart:'B10' }).length, 0);
  assert.equal(view.filter({ controlChart:'B60', controlScenario:'Framtida_mandat_ej_beslutat' }).length, 0);
  assert.equal(view.filter({ controlScenario:main, controlQ:'MPM-06 nonexistent-term' }).length, 0, 'All search terms must match');
});

test('authority detail preserves unmeasured status, scope, baseline and each canonical target/relation ID', () => {
  const control = exploration.controls.find(item => item.id === 'MPM-05');
  const html = loadView().content(control);
  assert.ok(html.includes('Ej uppmätt'));
  for (const field of ['scope', 'owner', 'triggerFrequency', 'indicators', 'verificationEvidence', 'baselineDifference', 'exposure', 'overlap']) {
    assert.ok(html.includes(esc(control[field])), `Missing authority detail field ${field}`);
  }
  for (const target of control.targets) {
    assert.ok(html.includes(esc(target.sourceItemId)), `Missing target ID ${target.sourceItemId}`);
    assert.ok(html.includes(esc(target.id)), `Missing relation ID ${target.id}`);
    assert.ok(html.includes(esc(target.applicationConditions)), `Missing scope for ${target.id}`);
    assert.ok(html.includes(esc(target.effectHypothesis)), `Missing effect hypothesis for ${target.id}`);
  }
  assert.ok(!/\b0\s*%/.test(html), 'An absent measurement must not be rendered as zero effect');
});

test('authority detail escapes supplied fields and rejects non-HTTPS mandate-source hrefs', () => {
  const attack = '<img src=x onerror="alert(1)">';
  const control = structuredClone(exploration.controls.find(item => item.id === 'MPM-01'));
  for (const field of ['title', 'description', 'scope', 'owner', 'indicators', 'verificationEvidence', 'baselineDifference', 'exposure', 'overlap', 'legalBasis', 'mandateStatus', 'sourceReviewStatus']) control[field] = attack;
  control.mandateSources = ['javascript:alert(1)', 'https://example.test/" onmouseover="alert(1)'];
  control.sourceTexts[0].text = attack;
  const target = control.targets[0];
  for (const field of ['rationale', 'applicationConditions', 'relationship', 'effectHypothesis', 'quantifiedEffectSource']) target[field] = attack;
  target.sourceRecord.beaktad_myndighetsdel = attack;
  target.sourceRecord.avgransning_av_originalforslaget = attack;
  const html = loadView().content(control);
  assert.ok(html.includes(esc(attack)));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes(attack));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('" onmouseover="'));
});

test('rendering and filtering remain read-only over imported records', () => {
  const before = JSON.stringify(exploration);
  const view = loadView();
  for (const control of view.filter({ controlDriver:'authority', controlScenario:'all' })) view.content(control);
  assert.equal(JSON.stringify(exploration), before);
});

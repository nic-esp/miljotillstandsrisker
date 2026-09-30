import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createExplorationData, occurrenceId } from '../../_build/exploration_model.mjs';

const risks = JSON.parse(fs.readFileSync(new URL('../../Artefakt_C_riskregister.json', import.meta.url), 'utf8'));
const curations = JSON.parse(fs.readFileSync(new URL('../../_build/exploration_curations.json', import.meta.url), 'utf8'));
const data = createExplorationData(risks, curations);
const clone = value => structuredClone(value);

test('every original mitigation is preserved losslessly with its source risk', () => {
  assert.equal(risks.length, 342);
  const sources = data.controls.filter(control => control.kind === 'source');
  assert.equal(sources.length, risks.length);
  for (const risk of risks) {
    const control = sources.find(control => control.sourceRiskIds[0] === risk.risk_id);
    assert.equal(control.description, risk.mitigation);
    assert.equal(control.sourceTexts[0].text, risk.mitigation);
    assert.deepEqual(control.riskIds, [risk.risk_id]);
    assert.deepEqual(control.sourceTexts[0].source_refs, risk.source_refs);
    assert.equal(control.targets[0].role, 'unspecified');
    assert.equal(control.targets[0].basis, 'register');
  }
});

test('original control titles describe the source action without changing its text or stable ID', () => {
  const pbl = data.controls.find(control => control.id === 'C-SRC-R-B50-P040-02');
  assert.equal(pbl.title, 'Stäm av ansökningshandlingarna mot 9 kap. 86–91 §§ PBL före inlämning');
  for (const control of data.controls.filter(control => control.kind === 'source')) {
    assert.ok(control.title.length <= 110);
    assert.equal(control.title.startsWith('Motåtgärd:'), false);
    assert.ok(control.description.startsWith(control.title.replace(/…$/u, '')));
  }
  const synthetic = { ...risks[0], mitigation: 'Kontrollera underlagen (t.ex. GIS och kartor) mot 9 kap. PBL. Dokumentera kontrollen.' };
  assert.equal(createExplorationData([synthetic]).controls[0].title, 'Kontrollera underlagen (t.ex. GIS och kartor) mot 9 kap. PBL');
  const compound = { ...risks[0], mitigation: 'Kontrollera alla bilagor; följ sedan upp myndighetens besked.' };
  assert.equal(createExplorationData([compound]).controls[0].title, 'Kontrollera alla bilagor');
});

test('metadata distinguishes partial shared grouping from broad source links', () => {
  assert.equal(data.metadata.sharedCurationComplete, false);
  assert.match(data.metadata.sharedCurationScope, /urval/);
  assert.match(data.metadata.sourceControlScope, /övergripande nivå/);
});

test('occurrence IDs and complete output survive source risk and branch reordering', () => {
  const reordered = clone(risks).reverse();
  for (const risk of reordered) {
    risk.trigger_factors.reverse();
    risk.consequences.reverse();
  }
  assert.deepEqual(createExplorationData(reordered, curations), data);
  assert.equal(data.occurrences.length, 2532);
  for (const item of data.occurrences) {
    assert.equal(item.id, occurrenceId(item.riskId, item.kind, item.text));
    assert.ok(['source', 'analysis'].includes(item.basis));
  }
});

test('shared controls preserve explicit source scope and deduplicate risks across targets', () => {
  const shared = data.controls.filter(control => control.kind === 'shared');
  assert.equal(shared.length, 16);
  assert.equal(data.metadata.sharedControlRiskCount, 56);
  assert.ok(shared.every(control => control.riskIds.length >= 2));
  for (const control of shared) {
    assert.equal(control.basis, 'analysis');
    assert.equal(control.reviewStatus, 'analytical-grouping');
    assert.deepEqual(control.riskIds, [...new Set(control.targets.map(target => target.riskId))].sort());
    assert.deepEqual(control.riskIds, [...control.sourceRiskIds].sort());
    assert.equal(control.targets.length, new Set(control.targets.map(target => `${target.type}|${target.targetId}`)).size);
    for (const source of control.sourceTexts) {
      assert.ok(risks.find(risk => risk.risk_id === source.riskId).mitigation.includes(source.text));
    }
  }
  const completeness = shared.find(control => control.id === 'C-SHARED-underlagskontroll');
  assert.equal(completeness.riskIds.length, 6);
  assert.ok(completeness.targets.length > completeness.riskIds.length);
});

test('PBL checking and deadline monitoring are separate actions with specific roles', () => {
  const riskId = 'R-B50-P040-02';
  const check = data.controls.find(control => control.id === 'C-SHARED-underlagskontroll');
  const monitoring = data.controls.find(control => control.id === 'C-SHARED-fristbevakning');
  const targets = check.targets.filter(target => target.riskId === riskId);
  assert.equal(targets.length, 2);
  assert.ok(targets.every(target => target.type === 'cause' && target.role === 'prevention'));
  const monitorTargets = monitoring.targets.filter(target => target.riskId === riskId);
  assert.equal(monitorTargets.length, 1);
  assert.equal(monitorTargets[0].type, 'event');
  assert.equal(monitorTargets[0].targetId, riskId);
  assert.equal(monitorTargets[0].role, 'monitoring');
  assert.equal(check.sourceTexts.find(source => source.riskId === riskId).text.includes('Dokumentera'), false);
  assert.equal(monitoring.sourceTexts.find(source => source.riskId === riskId).text.startsWith('Dokumentera'), true);
});

test('shared concepts preserve original occurrences and never imply added control coverage', () => {
  const added = clone(curations);
  const concept = added.concepts.find(concept => concept.id === 'K-SIMILAR-projektversion');
  const addedRisk = risks.find(risk => risk.risk_id === 'R-B40-060-01');
  concept.members.push({ riskId: addedRisk.risk_id, text: addedRisk.trigger_factors[3].text });
  const expanded = createExplorationData(risks, added);
  assert.deepEqual(expanded.controls, data.controls);
  const newConcept = expanded.concepts.find(item => item.id === concept.id);
  assert.ok(newConcept.riskIds.includes(addedRisk.risk_id));
  const versionControl = expanded.controls.find(control => control.id === 'C-SHARED-gemensam-version');
  assert.equal(versionControl.riskIds.includes(addedRisk.risk_id), false);
  assert.equal(data.concepts.filter(item => item.matchType === 'exact').length, 51);
  assert.equal(data.concepts.filter(item => item.matchType === 'semantic').length, 12);
  for (const item of data.concepts) {
    const members = item.occurrenceIds.map(id => data.occurrences.find(occurrence => occurrence.id === id));
    assert.ok(members.every(Boolean));
    assert.deepEqual(item.riskIds, [...new Set(members.map(member => member.riskId))].sort());
    if (item.matchType === 'exact') assert.ok(members.every(member => member.text === item.label));
    else assert.equal(item.reviewStatus, 'analytical-grouping');
  }
});

test('rejects unknown risks, missing source excerpts and invalid occurrence targets', () => {
  let modified = clone(curations);
  modified.controls[0].sources[0].riskId = 'R-MISSING';
  assert.throws(() => createExplorationData(risks, modified), /Unknown risk/);
  modified = clone(curations);
  modified.controls[0].sources[0].excerpt = 'Fabricated source action';
  assert.throws(() => createExplorationData(risks, modified), /Source excerpt is not present/);
  modified = clone(curations);
  modified.controls[0].targets[0].text = 'Nonexistent cause';
  assert.throws(() => createExplorationData(risks, modified), /Unknown occurrence/);
  modified = clone(curations);
  modified.controls[0].targets[0].type = 'process';
  assert.throws(() => createExplorationData(risks, modified), /Invalid target type/);
});

test('rejects mismatched occurrence or event ownership and duplicate identifiers', () => {
  let modified = clone(curations);
  const firstTarget = modified.controls[0].targets[0];
  firstTarget.targetId = data.occurrences.find(occurrence => occurrence.kind === 'cause' && occurrence.riskId !== firstTarget.riskId).id;
  assert.throws(() => createExplorationData(risks, modified), /Mismatched occurrence ownership/);
  modified = clone(curations);
  modified.controls.find(control => control.id === 'C-SHARED-fristbevakning').targets[0].targetId = 'R-B10-010-01';
  assert.throws(() => createExplorationData(risks, modified), /Mismatched event ownership/);
  modified = clone(curations);
  modified.controls.push(clone(modified.controls[0]));
  assert.throws(() => createExplorationData(risks, modified), /Duplicate ID/);
  modified = clone(curations);
  modified.controls[0].targets.push(clone(modified.controls[0].targets[0]));
  assert.throws(() => createExplorationData(risks, modified), /Duplicate target/);
  assert.throws(() => createExplorationData([...risks, risks[0]], curations), /Duplicate risk ID/);
  modified = clone(curations);
  modified.concepts[0].members.push(clone(modified.concepts[0].members[0]));
  assert.throws(() => createExplorationData(risks, modified), /Duplicate concept member/);
});

test('rejects target scope with no corresponding mitigation source', () => {
  const modified = clone(curations);
  modified.controls[0].targets.push({ riskId: 'R-B10-010-01', type: 'event', role: 'prevention', rationale: 'No source supports this scope.' });
  assert.throws(() => createExplorationData(risks, modified), /Target has no source mitigation/);
});

test('empty curations still expose every source occurrence and lossless control', () => {
  const imported = createExplorationData(risks);
  assert.equal(imported.controls.length, 342);
  assert.equal(imported.occurrences.length, 2532);
  assert.equal(imported.metadata.sharedControlCount, 0);
  assert.equal(imported.metadata.semanticConceptCount, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
});

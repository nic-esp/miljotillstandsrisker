import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExplorationData, occurrenceId } from '../../_build/exploration_model.mjs';
import { AUTHORITY_ASSESSMENT_FIELDS, AUTHORITY_LINK_FIELDS, AUTHORITY_MAIN_SCENARIO, loadAuthorityPackage, parseAuthorityCsv } from '../../_build/authority_controls.mjs';

const risks = JSON.parse(readFileSync(new URL('../../Artefakt_C_riskregister.json', import.meta.url), 'utf8'));
const curations = JSON.parse(readFileSync(new URL('../../_build/exploration_curations.json', import.meta.url), 'utf8'));
const source = loadAuthorityPackage();
const data = createExplorationData(risks, curations, source);
const authority = data.controls.filter(control => control.kind === 'authority');
const build = input => createExplorationData(risks, curations, input);

test('authority import preserves all source columns, 20 controls and 173 separately keyed relations', () => {
  assert.equal(AUTHORITY_LINK_FIELDS.length, 46);
  assert.equal(AUTHORITY_ASSESSMENT_FIELDS.length, 23);
  assert.equal(authority.length, 20);
  assert.equal(authority.flatMap(control => control.targets).length, 173);
  assert.equal(new Set(authority.flatMap(control => control.riskIds)).size, 90);
  assert.equal(new Set(authority.flatMap(control => control.targets.map(target => target.id))).size, 173);
  assert.equal(new Set(authority.flatMap(control => control.targets.map(target => target.sourceItemId))).size, 172);
  const rowsById = new Map(source.links.map(row => [row.koppling_id, row]));
  for (const control of authority) {
    assert.deepEqual(control.sourceRows, source.links.filter(row => row.kontroll_id === control.id));
    for (const target of control.targets) {
      const row = rowsById.get(target.id);
      assert.deepEqual(target.sourceRecord, row);
      assert.equal(Object.keys(target.sourceRecord).length, 46);
      assert.equal(target.targetId, occurrenceId(row.risk_id, target.type, row.malpost_text));
      assert.equal(target.sourceItemId, row.malpost_id);
      assert.equal(target.applicationConditions, row.tillampningsvillkor);
      assert.equal(target.effectHypothesis, row.effekthypotes);
      assert.equal(target.role, target.type === 'cause' ? 'prevention' : 'consequence_reduction');
      assert.equal(target.roleBasis, 'hypothesis');
      assert.equal(target.measurement.status, 'not_measured');
      assert.deepEqual(target.measurement.results, []);
      assert.equal(target.measurement.key, row.koppling_id);
      assert.equal(target.measurement.context.controlId, control.id);
      assert.equal(target.measurement.context.riskId, target.riskId);
      assert.equal(target.measurement.context.sourceItemId, row.malpost_id);
      assert.equal(target.measurement.context.scenario, control.scenario);
      assert.equal(Object.hasOwn(target.measurement, 'effect'), false);
    }
  }
});

test('the main scenario contains only the 17 specified controls, excluding transition and future mandates', () => {
  assert.equal(data.metadata.authority.mainScenario, AUTHORITY_MAIN_SCENARIO);
  assert.deepEqual(data.metadata.authority.scenarios, [
    { id: 'S1_beslutat_uppdrag', priorityScope: 'main', controlCount: 17, linkCount: 141, riskCount: 78 },
    { id: 'Inforande_ej_S1', priorityScope: 'transition', controlCount: 1, linkCount: 18, riskCount: 9 },
    { id: 'Framtida_mandat_ej_beslutat', priorityScope: 'future', controlCount: 2, linkCount: 14, riskCount: 6 },
  ]);
  const main = authority.filter(control => control.priorityScope === 'main');
  assert.equal(main.length, 17);
  assert.ok(main.every(control => control.scenario === AUTHORITY_MAIN_SCENARIO && /^MPM-\d{2}$/u.test(control.id)));
  assert.equal(main.some(control => control.id === 'MPM-T01' || control.id.startsWith('MPM-F')), false);
  assert.ok(authority.every(control => control.driver === 'authority' && control.implementationStatus === 'proposed_unverified'));
  assert.ok(authority.every(control => control.measurement.status === 'not_measured' && control.measurement.results.length === 0));
});

test('all 342 original mitigations retain their actors and complete assessment, including unlinked possible families', () => {
  const existing = createExplorationData(risks, curations);
  for (const control of data.controls.filter(control => control.kind !== 'authority')) {
    assert.equal(control.driver, 'unspecified');
    const old = existing.controls.find(candidate => candidate.id === control.id);
    assert.equal(control.description, old.description);
    assert.deepEqual(control.targets, old.targets);
    if (control.kind !== 'source') { assert.equal(control.authorityAssessment, undefined); continue; }
    const riskId = control.riskIds[0];
    const row = source.assessments.find(candidate => candidate.risk_id === riskId);
    assert.deepEqual(control.authorityAssessment.sourceRecord, row);
    assert.equal(Object.keys(control.authorityAssessment.sourceRecord).length, 23);
    assert.equal(control.sourceTexts[0].text, row.befintligt_atgardsforslag);
  }
  assert.equal(data.controls.filter(control => control.authorityAssessment).length, 342);
  const possible = source.assessments.filter(row => row.mojlig_kontrollfamilj_utan_ny_koppling);
  assert.equal(possible.length, 32);
  for (const row of possible) for (const controlId of row.mojlig_kontrollfamilj_utan_ny_koppling.split(' | ')) {
    assert.equal(authority.find(control => control.id === controlId).riskIds.includes(row.risk_id), false, `${controlId}/${row.risk_id} must not infer a relation`);
  }
});

test('canonical text, ownership, evidence, node and mitigation drift abort import instead of guessing', () => {
  for (const [field, value] of [
    ['malpost_text', 'Similar but changed wording'], ['malpost_evidens', 'source'], ['malpost_kallor', 'UNKNOWN'],
    ['malpost_ordning', '1'], ['malpost_id', 'R-B10-050-01:trigger:99'], ['risk_id', 'R-UNKNOWN'],
    ['nod_id', 'B10-060'], ['process_id', 'B20'], ['befintligt_atgardsforslag', 'Changed original mitigation'],
    ['scenario', 'OTHER'], ['verifieringsdatum', '2026-10-02'], ['riskregister_version', 'stale'],
  ]) {
    const changed = structuredClone(source);
    changed.links[0][field] = value;
    assert.throws(() => build(changed), undefined, field);
  }
  const alteredAssessment = structuredClone(source);
  alteredAssessment.assessments[0].befintligt_atgardsforslag += ' altered';
  assert.throws(() => build(alteredAssessment), /canonical source/);
  const incomplete = structuredClone(source); incomplete.assessments.pop();
  assert.throws(() => build(incomplete), /full canonical register/);
});

test('duplicated relations, conflicting control metadata and inconsistent assessment references abort import', () => {
  const duplicate = structuredClone(source); duplicate.links.push(duplicate.links[0]);
  assert.throws(() => build(duplicate), /Duplicate authority relation/);
  const conflicting = structuredClone(source); conflicting.links[1].kontrollbeskrivning += ' new';
  assert.throws(() => build(conflicting), /Conflicting authority control metadata/);
  const invalidAssessment = structuredClone(source); invalidAssessment.assessments[0].mojlig_kontrollfamilj_utan_ny_koppling = 'MPM-99';
  assert.throws(() => build(invalidAssessment), /Unknown assessment control/);
  const omittedLink = structuredClone(source);
  omittedLink.links = omittedLink.links.filter(row => row.risk_id !== 'R-B10-050-01');
  assert.throws(() => build(omittedLink), /missing control\/risk link/);
});

test('CSV handles BOM, quoted semicolons, escaped quotes and embedded newlines without changing source text', () => {
  assert.deepEqual(parseAuthorityCsv('\uFEFFid;text\r\n001;"Åtgärd; \"\"citat\"\"\r\nNästa rad"\r\n', ['id', 'text']), [
    { id: '001', text: 'Åtgärd; "citat"\r\nNästa rad' },
  ]);
  for (const invalid of ['id;text\n001;"unterminated', 'id;text\n001;"closed"extra', 'id;text\n001;missing;extra', 'id;other\n001;value']) {
    assert.throws(() => parseAuthorityCsv(invalid, ['id', 'text']));
  }
});

test('source files are pinned byte-for-byte and cannot silently change under the same manifest', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'authority-source-integrity-'));
  try {
    cpSync(new URL('../../_build/authority-inputs/', import.meta.url), temporary, { recursive: true });
    const file = join(temporary, 'myndighetskontroller_riskkopplingar.csv');
    writeFileSync(file, readFileSync(file, 'utf8') + '\r\n');
    assert.throws(() => loadAuthorityPackage(temporary), /integrity mismatch/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  assert.equal(source.provenance.version, '0.10');
  assert.equal(source.provenance.date, '2026-09-30');
  assert.ok(source.provenance.files.every(file => /^[a-f0-9]{64}$/u.test(file.sha256)));
});

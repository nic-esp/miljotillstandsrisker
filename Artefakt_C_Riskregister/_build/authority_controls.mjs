import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { triggerFactors, consequences } from './risk_fields.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const AUTHORITY_MAIN_SCENARIO = 'S1_beslutat_uppdrag';
export const AUTHORITY_SCENARIOS = Object.freeze({
  S1_beslutat_uppdrag: 'main', Inforande_ej_S1: 'transition', Framtida_mandat_ej_beslutat: 'future',
});
export const AUTHORITY_LINK_FIELDS = Object.freeze('koppling_id kontroll_id kontroll scenario risk_id risk process_id process nod_id nod malpost_id malpost_typ malpost_ordning malpost_text mitigeringsrelation kopplingsmotivering kontrollbeskrivning ansvarsgrans rattsligt_stod matetal verifikationsunderlag s0_s1_skillnad utlosare_frekvens kontrollagare nodaktor_s0 malpost_evidens malpost_kallor tillampningsvillkor effekthypotes kvantifierad_effekt exponering dubbelrakning mandatstatus kontrollstatus granskningsstatus kallor_mandat riskregister_version riskregister_url verifieringsdatum atgardsreferens befintligt_atgardsforslag atgardsbedomning kontrollens_relation_till_atgardsforslaget beaktad_myndighetsdel avgransning_av_originalforslaget sarskild_avgransning_original'.split(' '));
export const AUTHORITY_ASSESSMENT_FIELDS = Object.freeze('atgardsreferens referenstyp risk_id risk process_id nod_id nod befintligt_atgardsforslag bedomning ursprunglig_aktor_bedomning myndighetsdel_som_kan_anpassas del_som_inte_overtas bedomningsmotivering sarskild_avgransning anpassade_kontroller_med_riskkoppling sjalvstandiga_kontroller_for_samma_risk mojlig_kontrollfamilj_utan_ny_koppling kopplingsbeslut rattslig_avgransning riskregister_version kallfalt kall_url verifieringsdatum'.split(' '));
const unique = values => [...new Set(values)].sort();
const splitRefs = value => value ? value.split(' | ') : [];
const equal = (actual, expected, label) => { if (actual !== expected) throw new Error(`${label}: does not match canonical source`); };
const measurement = (key, context) => ({ key, status: 'not_measured', context, results: [] });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Strict, lossless UTF-8/BOM CSV parser. Never executes formulas or normalizes source wording. */
export function parseAuthorityCsv(text, expectedFields) {
  const input = text.replace(/^\uFEFF/u, '');
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  const field = () => { row.push(cell); cell = ''; closed = false; };
  const record = () => { field(); rows.push(row); row = []; };
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"' && !cell && !closed) quoted = true;
    else if (char === ';') field();
    else if (char === '\r' || char === '\n') {
      record();
      if (char === '\r' && input[index + 1] === '\n') index++;
    } else {
      if (closed || char === '"') throw new Error('Malformed authority CSV quote');
      cell += char;
    }
  }
  if (quoted) throw new Error('Unterminated authority CSV quote');
  if (row.length || cell || closed) record();
  const header = rows.shift();
  if (JSON.stringify(header) !== JSON.stringify(expectedFields)) throw new Error('Authority CSV header differs from its declared schema');
  return rows.map((cells, index) => {
    if (cells.length !== header.length) throw new Error(`Authority CSV row ${index + 2} has ${cells.length} columns; expected ${header.length}`);
    return Object.fromEntries(header.map((name, fieldIndex) => [name, cells[fieldIndex]]));
  });
}

/** The manifest pins the supplied bytes; replacement requires an explicit new source version. */
export function loadAuthorityPackage(directory = join(here, 'authority-inputs')) {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const contents = new Map();
  for (const file of manifest.files) {
    if (!/^[\w.-]+$/u.test(file.file)) throw new Error('Invalid authority input filename');
    const bytes = readFileSync(join(directory, file.file));
    if (digest(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error(`Authority source integrity mismatch: ${file.file}`);
    contents.set(file.file, bytes.toString('utf8'));
  }
  const links = parseAuthorityCsv(contents.get('myndighetskontroller_riskkopplingar.csv'), AUTHORITY_LINK_FIELDS);
  const assessments = parseAuthorityCsv(contents.get('atgardsforslag_bedomning.csv'), AUTHORITY_ASSESSMENT_FIELDS);
  equal(links.length, manifest.expected.links, 'Authority link count');
  equal(assessments.length, manifest.expected.assessments, 'Authority assessment count');
  equal(unique(links.map(row => row.kontroll_id)).length, manifest.expected.controls, 'Authority control count');
  const processCatalog = JSON.parse(readFileSync(join(here, '../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json'), 'utf8'));
  return { links, assessments, provenance: manifest, readingGuide: contents.get('lasanvisning_och_kallor.txt'), processCatalog };
}

/** Validate every source identity before resolving positional source item IDs to stable occurrences. */
export function createAuthorityControls(risks, sourcePackage, { occurrenceId, occurrenceById }) {
  if (!sourcePackage) return { controls: [], assessments: new Map(), metadata: null };
  const { links, assessments, provenance, processCatalog } = sourcePackage;
  const riskById = new Map(risks.map(risk => [risk.risk_id, risk]));
  const chartById = new Map(processCatalog.charts.map(chart => [chart.metadata.chartKey, chart]));
  const itemById = new Map();
  for (const risk of risks) for (const [kind, sourceKind, items] of [
    ['cause', 'trigger', triggerFactors(risk)], ['effect', 'consequence', consequences(risk)],
  ]) for (const [index, item] of items.entries()) {
    itemById.set(`${risk.risk_id}:${sourceKind}:${String(index + 1).padStart(2, '0')}`, { ...item, kind, index: index + 1, riskId: risk.risk_id });
  }
  const validateRisk = row => {
    const risk = riskById.get(row.risk_id);
    if (!risk) throw new Error(`Unknown authority risk: ${row.risk_id}`);
    for (const [column, key] of [['risk', 'title'], ['process_id', 'chart_key'], ['nod_id', 'node_id'], ['nod', 'node_label'], ['befintligt_atgardsforslag', 'mitigation']]) equal(row[column], risk[key], `${row.risk_id} ${column}`);
    equal(row.atgardsreferens, `${risk.risk_id}:mitigation`, `${risk.risk_id} mitigation reference`);
    const chart = chartById.get(row.process_id);
    if (!chart) throw new Error(`Unknown authority process: ${row.process_id}`);
    const node = chart.chartData.nodes.find(candidate => candidate.id === row.nod_id);
    if (!node) throw new Error(`Unknown authority node: ${row.nod_id}`);
    equal(node.data.label, row.nod, `${row.risk_id} process node label`);
    if ('process' in row) equal(row.process, chart.name, `${row.risk_id} process name`);
    equal(row.verifieringsdatum, provenance.date, `${row.risk_id} source date`);
    equal(row.riskregister_version, provenance.registerVersion, `${row.risk_id} source register version`);
    return risk;
  };
  const assessmentByRisk = new Map();
  for (const row of assessments) {
    validateRisk(row);
    equal(row.kallfalt, 'mitigation', `${row.risk_id} source field`);
    if (assessmentByRisk.has(row.risk_id)) throw new Error(`Duplicate authority assessment: ${row.risk_id}`);
    assessmentByRisk.set(row.risk_id, { sourceReference: row.atgardsreferens, status: row.bedomning,
      adaptedControlIds: splitRefs(row.anpassade_kontroller_med_riskkoppling), independentControlIds: splitRefs(row.sjalvstandiga_kontroller_for_samma_risk),
      possibleUnlinkedControlIds: splitRefs(row.mojlig_kontrollfamilj_utan_ny_koppling),
      acceptedAuthorityPart: row.myndighetsdel_som_kan_anpassas, excludedPart: row.del_som_inte_overtas,
      rationale: row.bedomningsmotivering, sourceRecord: { ...row }, sourceVersion: provenance.version, sourceDate: provenance.date });
  }
  if (risks.some(risk => !assessmentByRisk.has(risk.risk_id)) || assessmentByRisk.size !== risks.length) throw new Error('Authority assessments must cover the full canonical register');
  const grouped = new Map(), targetIds = new Set();
  for (const row of links) {
    validateRisk(row);
    if (!Object.hasOwn(AUTHORITY_SCENARIOS, row.scenario)) throw new Error(`Unknown authority scenario: ${row.scenario}`);
    if (!/^MPM-(?:\d{2}|[TF]\d{2})$/u.test(row.kontroll_id)) throw new Error(`Invalid authority control ID: ${row.kontroll_id}`);
    equal(row.koppling_id, `${row.kontroll_id}__${row.malpost_id}`, `${row.koppling_id} relation ID`);
    if (targetIds.has(row.koppling_id)) throw new Error(`Duplicate authority relation: ${row.koppling_id}`);
    targetIds.add(row.koppling_id);
    const item = itemById.get(row.malpost_id);
    if (!item) throw new Error(`Unknown authority source item: ${row.malpost_id}`);
    equal(row.risk_id, item.riskId, `${row.koppling_id} item owner`);
    equal(row.malpost_typ, item.kind === 'cause' ? 'utlösande faktor' : 'konsekvens', `${row.koppling_id} item kind`);
    equal(row.malpost_ordning, String(item.index), `${row.koppling_id} item order`);
    equal(row.malpost_text, item.text, `${row.koppling_id} item text`);
    equal(row.malpost_evidens, item.basis, `${row.koppling_id} item evidence`);
    equal(row.malpost_kallor, item.source_refs.join(' | '), `${row.koppling_id} item sources`);
    const targetId = occurrenceId(row.risk_id, item.kind, item.text);
    if (!occurrenceById.has(targetId)) throw new Error(`Unresolved authority occurrence: ${targetId}`);
    const assessment = assessmentByRisk.get(row.risk_id);
    equal(row.atgardsbedomning, assessment.status, `${row.koppling_id} mitigation assessment`);
    const adapted = row.kontrollens_relation_till_atgardsforslaget === 'Anpassning av befintligt förslag, avgränsad till myndighetens del';
    const independent = row.kontrollens_relation_till_atgardsforslaget === 'Självständigt kontrollförslag efter jämförelse med befintlig åtgärd';
    if ((!adapted && !independent) || !(adapted ? assessment.adaptedControlIds : assessment.independentControlIds).includes(row.kontroll_id)) throw new Error(`Authority link/assessment relationship mismatch: ${row.koppling_id}`);
    if (!grouped.has(row.kontroll_id)) grouped.set(row.kontroll_id, []);
    grouped.get(row.kontroll_id).push({ row, target: { id: row.koppling_id, riskId: row.risk_id, type: item.kind, targetId,
      sourceItemId: row.malpost_id, role: item.kind === 'effect' ? 'consequence_reduction' : 'prevention', roleBasis: 'hypothesis', basis: 'analysis',
      rationale: row.kopplingsmotivering, relationship: row.mitigeringsrelation, applicationConditions: row.tillampningsvillkor,
      effectHypothesis: row.effekthypotes, quantifiedEffectSource: row.kvantifierad_effekt,
      sourceBasis: item.basis, sourceRefs: [...item.source_refs], sourceRecord: { ...row },
      measurement: measurement(row.koppling_id, { controlId: row.kontroll_id, riskId: row.risk_id, sourceItemId: row.malpost_id, scenario: row.scenario, sourceVersion: provenance.version }) } });
  }
  const constantFields = {
    title: 'kontroll', description: 'kontrollbeskrivning', scenario: 'scenario', owner: 'kontrollagare', scope: 'ansvarsgrans',
    legalBasis: 'rattsligt_stod', indicators: 'matetal', verificationEvidence: 'verifikationsunderlag', baselineDifference: 's0_s1_skillnad',
    triggerFrequency: 'utlosare_frekvens', exposure: 'exponering', overlap: 'dubbelrakning', mandateStatus: 'mandatstatus',
    sourceStatus: 'kontrollstatus', sourceReviewStatus: 'granskningsstatus',
  };
  const controls = [...grouped].map(([id, records]) => {
    const first = records[0].row, normalized = {};
    for (const [field, column] of Object.entries(constantFields)) {
      if (records.some(({ row }) => row[column] !== first[column])) throw new Error(`Conflicting authority control metadata: ${id} ${column}`);
      normalized[field] = first[column];
    }
    const riskIds = unique(records.map(({ row }) => row.risk_id));
    const targets = records.map(record => record.target).sort((a, b) => a.id.localeCompare(b.id));
    const roles = unique(targets.map(target => target.role));
    return { id, ...normalized, kind: 'authority', driver: 'authority', priorityScope: AUTHORITY_SCENARIOS[first.scenario],
      basis: 'analysis', reviewStatus: 'source-analysis-unverified', implementationStatus: 'proposed_unverified',
      role: roles.length === 1 ? roles[0] : 'combined', roleBasis: 'hypothesis', riskIds, sourceRiskIds: riskIds,
      chartKeys: unique(records.map(({ row }) => row.process_id)),
      sourceTexts: riskIds.map(riskId => ({ riskId, text: riskById.get(riskId).mitigation, source_refs: [...riskById.get(riskId).source_refs] })),
      targets, sourceRows: records.map(({ row }) => ({ ...row })),
      mandateSources: unique(records.flatMap(({ row }) => splitRefs(row.kallor_mandat))),
      rationale: 'Föreslagen myndighetskontroll med uttryckliga kopplingar till befintliga orsaker eller konsekvenser. Kopplingarna är hypoteser; genomförande och effekt är inte verifierade.',
      measurement: measurement(id, { controlId: id, scenario: first.scenario, sourceVersion: provenance.version }),
      provenance: { version: provenance.version, date: provenance.date, registerVersion: provenance.registerVersion, files: provenance.files },
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const controlIds = new Set(controls.map(control => control.id));
  for (const assessment of assessmentByRisk.values()) {
    for (const id of [...assessment.adaptedControlIds, ...assessment.independentControlIds, ...assessment.possibleUnlinkedControlIds]) if (!controlIds.has(id)) throw new Error(`Unknown assessment control: ${id}`);
    for (const id of [...assessment.adaptedControlIds, ...assessment.independentControlIds]) if (!controls.find(control => control.id === id).riskIds.includes(assessment.sourceRecord.risk_id)) throw new Error(`Assessment refers to missing control/risk link: ${id}`);
  }
  const scenarios = Object.entries(AUTHORITY_SCENARIOS).map(([id, priorityScope]) => {
    const members = controls.filter(control => control.scenario === id);
    return { id, priorityScope, controlCount: members.length, linkCount: members.reduce((sum, control) => sum + control.targets.length, 0), riskCount: unique(members.flatMap(control => control.riskIds)).length };
  });
  return { controls, assessments: assessmentByRisk, metadata: {
    version: provenance.version, date: provenance.date, mainScenario: AUTHORITY_MAIN_SCENARIO,
    controlCount: controls.length, linkCount: links.length, riskCount: unique(links.map(row => row.risk_id)).length,
    assessmentCount: assessmentByRisk.size, scenarios, provenance,
    implementationStatus: 'proposed_unverified', measurementStatus: 'not_measured',
    scope: 'Användarens granskningsunderlag, version 0.10. Myndighetskontrollerna är förslag med avgränsade hypoteser om möjlig riskreduktion. Originalåtgärderna har inte övertagits i sin helhet.',
    measurementScope: 'Ingen effekt har skattats. Införande och framtida mandat hålls utanför huvudscenariot. Kopplingar och täckning är inte effektstorlekar och får inte summeras som riskreduktion.',
  } };
}

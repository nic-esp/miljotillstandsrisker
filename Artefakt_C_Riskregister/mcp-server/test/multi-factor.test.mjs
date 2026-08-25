import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRiskRegistry } from '../risk-service.mjs';
import {
  RISK_CSV_HEADER,
  RISK_ITEM_CSV_HEADER,
  bowTie,
  serializeRiskCsv,
  serializeRiskItemCsv,
} from '../../_build/risk_fields.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const readJson = path => JSON.parse(readFileSync(join(here, path), 'utf8'));
const risks = readJson('../../Artefakt_C_riskregister.json');
const nodesByChart = readJson('../../_build/mappable_nodes.json');
const processCharts = readJson('../../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json');
const sources = readJson('../data/sources.json');
const chartNames = Object.fromEntries(processCharts.charts.map(chart => [chart.metadata.chartKey, chart.name]));

function parseCsv(value, delimiter = ';') {
  const text = value.startsWith('\uFEFF') ? value.slice(1) : value;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell === '') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (character === '\r' && text[index + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index += 1;
    } else if (character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  assert.equal(quoted, false, 'CSV innehåller ett oavslutat citattecken');
  return rows;
}

test('every risk exposes several distinct causes and consequences with traceable evidence status', () => {
  const globalTexts = new Map();
  for (const risk of risks) {
    for (const field of ['trigger_factors', 'consequences']) {
      const items = risk[field];
      assert.ok(items.length >= 3 && items.length <= 5, `${risk.risk_id}: ${field}`);
      assert.equal(new Set(items.map(item => item.text.toLocaleLowerCase('sv-SE'))).size, items.length);
      assert.ok(items.some(item => item.basis === 'source'), `${risk.risk_id}: ${field} saknar kallstodd post`);
      for (const item of items) {
        assert.ok(item.text.length >= 20, `${risk.risk_id}: for kort ${field}-text`);
        assert.match(item.text, /[.!?)]$/, `${risk.risk_id}: ${field} ska vara en fullstandig mening`);
        assert.doesNotMatch(item.text, /^[=+@\-\t\r]/, `${risk.risk_id}: CSV-formelinjektion i ${field}`);
        assert.ok(['source', 'analysis'].includes(item.basis));
        if (item.basis === 'source') assert.ok(item.source_refs.length > 0);
        if (item.basis === 'analysis') {
          assert.deepEqual(item.source_refs, [], `${risk.risk_id}: analys ska inte utge sig for direkt kallpremiss`);
          assert.doesNotMatch(
            item.text,
            /\b(?:19\d{2}|20(?:0[1-9]|[1-9]\d))\b|§|\b\d+\s*kap\.|\b(?:MÖD|HFD|NJA)\b|\bmål\s+[A-ZÅÄÖ]?\s*\d/i,
            `${risk.risk_id}: precist faktapastaende maste vara kallforankrat i ${field}`,
          );
        }
        assert.ok(item.source_refs.every(ref => risk.source_refs.includes(ref)));
        const normalized = item.text.trim().toLocaleLowerCase('sv-SE').replace(/\s+/g, ' ');
        globalTexts.set(normalized, [...(globalTexts.get(normalized) ?? []), `${risk.risk_id}:${field}`]);
      }
    }
    for (const [field, value] of Object.entries(risk)) {
      if (typeof value === 'string') {
        assert.doesNotMatch(value, /^[=+@\t\r]/, `${risk.risk_id}: CSV-formelinjektion i ${field}`);
      }
    }
  }
  for (const [text, owners] of globalTexts) {
    assert.ok(owners.length <= 3, `for generisk ateranvandning (${owners.length}): ${text} — ${owners.join(', ')}`);
  }
});

test('new factor and consequence text participates in full-text search', () => {
  const registry = createRiskRegistry({ risks, nodesByChart, sources, processCharts });
  const risk = risks[0];
  const query = risk.trigger_factors[1].text.split(/\s+/).slice(0, 5).join(' ');
  assert.ok(registry.queryRisks({ query }).some(hit => hit.risk_id === risk.risk_id));
  const effectQuery = risk.consequences[1].text.split(/\s+/).slice(0, 5).join(' ');
  assert.ok(registry.queryRisks({ query: effectQuery }).some(hit => hit.risk_id === risk.risk_id));
});

test('wide CSV keeps the complete bow tie in one JSON cell and repeats rubrik as its event', () => {
  const serialized = serializeRiskCsv(risks, chartNames);
  const committed = readFileSync(join(here, '../data/riskregister.csv'), 'utf8');
  assert.equal(committed, serialized, 'genererad CSV ar inaktuell');
  assert.ok(serialized.startsWith('\uFEFF'));
  const rows = parseCsv(serialized);
  assert.equal(rows.length, risks.length + 1);
  assert.deepEqual(rows[0], RISK_CSV_HEADER);
  assert.deepEqual(rows[0], [
    'risk_id', 'node_id', 'delprocess', 'nod', 'rubrik', 'kategori', 'ursprung',
    'beskrivning', 'motivering', 'drabbar', 'atgarder', 'kallor', 'scenario',
    'bow_tie_json',
  ]);
  assert.ok(rows.every(row => row.length === RISK_CSV_HEADER.length));

  const index = Object.fromEntries(RISK_CSV_HEADER.map((name, position) => [name, position]));
  for (const removed of [
    'utlosande_faktor', 'konsekvens',
    'utlosande_faktorer', 'utlosande_faktorer_json', 'konsekvenser', 'konsekvenser_json',
  ]) {
    assert.equal(index[removed], undefined, `${removed} ska ingå i bow_tie_json i stället`);
  }
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const risk = risks[rowIndex - 1];
    const row = rows[rowIndex];
    assert.equal(row[index.risk_id], risk.risk_id);
    assert.equal(row[index.rubrik], risk.title);
    const parsedBowTie = JSON.parse(row[index.bow_tie_json]);
    assert.deepEqual(Object.keys(parsedBowTie), ['causes', 'event', 'effects']);
    assert.deepEqual(Object.keys(parsedBowTie.event), ['rubrik']);
    assert.equal(parsedBowTie.event.rubrik, row[index.rubrik]);
    assert.deepEqual(parsedBowTie, bowTie(risk));
  }
});

test('bow tie falls back to legacy summaries when item arrays are absent', () => {
  assert.deepEqual(bowTie({ title: 'Händelse', trigger: 'Orsak', impact: 'Effekt' }), {
    causes: [{ text: 'Orsak', basis: 'analysis', source_refs: [] }],
    event: { rubrik: 'Händelse' },
    effects: [{ text: 'Effekt', basis: 'analysis', source_refs: [] }],
  });
});

test('normalized CSV exposes one row per trigger factor or consequence', () => {
  const serialized = serializeRiskItemCsv(risks, chartNames);
  const committed = readFileSync(join(here, '../data/riskregister-items.csv'), 'utf8');
  assert.equal(committed, serialized, 'genererad normaliserad CSV ar inaktuell');
  const rows = parseCsv(serialized);
  assert.deepEqual(rows[0], RISK_ITEM_CSV_HEADER);
  const expectedItems = risks.reduce((sum, risk) => sum + risk.trigger_factors.length + risk.consequences.length, 0);
  assert.equal(rows.length, expectedItems + 1);
  assert.ok(rows.every(row => row.length === RISK_ITEM_CSV_HEADER.length));

  const index = Object.fromEntries(RISK_ITEM_CSV_HEADER.map((name, position) => [name, position]));
  assert.ok(Number.isInteger(index.item_id));
  assert.ok(Number.isInteger(index.chart_key));
  const firstRiskRows = rows.slice(1).filter(row => row[index.risk_id] === risks[0].risk_id);
  assert.equal(firstRiskRows.length, risks[0].trigger_factors.length + risks[0].consequences.length);
  assert.deepEqual(
    firstRiskRows.filter(row => row[index.posttyp] === 'utlösande faktor').map(row => row[index.text]),
    risks[0].trigger_factors.map(item => item.text),
  );
  assert.deepEqual(
    firstRiskRows.filter(row => row[index.posttyp] === 'konsekvens').map(row => row[index.text]),
    risks[0].consequences.map(item => item.text),
  );
  const riskById = new Map(risks.map(risk => [risk.risk_id, risk]));
  const itemIds = new Set();
  for (const row of rows.slice(1)) {
    const risk = riskById.get(row[index.risk_id]);
    const items = row[index.posttyp] === 'utlösande faktor' ? risk.trigger_factors : risk.consequences;
    const item = items[Number(row[index.ordning]) - 1];
    assert.equal(row[index.text], item.text);
    assert.equal(row[index.evidens], item.basis);
    assert.equal(row[index.chart_key], risk.chart_key);
    assert.match(row[index.item_id], new RegExp(`^${risk.risk_id}:(?:trigger|consequence):\\d{2}$`));
    assert.equal(itemIds.has(row[index.item_id]), false, `duplicerat item_id: ${row[index.item_id]}`);
    itemIds.add(row[index.item_id]);
    assert.deepEqual(JSON.parse(row[index.kallor_json]), item.source_refs);
  }
});

test('web app exposes both CSV exports and the qualified evidence labels', () => {
  const template = readFileSync(join(here, '../../_build/app_template.html'), 'utf8');
  const built = readFileSync(join(here, '../../Artefakt_C_riskregister.html'), 'utf8');
  for (const [label, html] of [['template', template], ['built app', built]]) {
    assert.match(html, /id="csvRiskItems"/, `${label}: normaliserad CSV-knapp saknas`);
    assert.match(html, /id="csvRisks"/, `${label}: bred CSV-knapp saknas`);
    assert.match(html, /En rad per risk \(Bow tie-JSON\)/, `${label}: bow-tie-exporten ar otydlig`);
    assert.match(html, /Källförankrad premiss/, `${label}: evidensetiketten ar for kategorisk`);
    assert.match(html, /Utlösande faktorer \(\$\{factors\.length\}\)/, `${label}: faktorlistan renderas inte`);
    assert.match(html, /Möjliga konsekvenser \(\$\{effects\.length\}\)/, `${label}: konsekvenslistan renderas inte`);
  }
});

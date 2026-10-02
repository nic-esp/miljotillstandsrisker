import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createExplorationData } from '../../_build/exploration_model.mjs';
import { loadAuthorityPackage } from '../../_build/authority_controls.mjs';
import { CONTROL_CSV_HEADER, serializeControlCsv } from '../build-data.mjs';
import { prepareSite, STATIC_DATA_FILES } from '../../../scripts/prepare-site.mjs';
import { resolvePreviewFile } from '../../../scripts/preview-site.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const risks = json('Artefakt_C_Riskregister/Artefakt_C_riskregister.json');
const curations = json('Artefakt_C_Riskregister/_build/exploration_curations.json');
const exploration = createExplorationData(risks, curations, loadAuthorityPackage());

function parseCsv(value) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell === '') quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\r' && value[index + 1] === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''; index += 1;
    } else cell += character;
  }
  assert.equal(quoted, false, 'CSV has an unterminated quoted cell');
  assert.equal(cell, '', 'CSV must end in CRLF');
  assert.equal(row.length, 0);
  return rows;
}

test('exploration JSON is a complete synchronized publication snapshot', () => {
  const committed = json('Artefakt_C_Riskregister/mcp-server/data/exploration.json');
  assert.deepEqual(committed, exploration);
  assert.equal(committed.version, 1);
  assert.equal(committed.metadata.riskCount, risks.length);
  assert.ok(committed.controls.length > 0);
  assert.ok(committed.occurrences.length > 0);
  assert.ok(committed.concepts.length > 0);
});

test('control CSV round-trips every control and its explicit provenance and target relationships', () => {
  const serialized = serializeControlCsv(exploration.controls);
  assert.equal(readFileSync(join(here, '../data/controls.csv'), 'utf8'), serialized);
  assert.equal(serialized.startsWith('\uFEFF'), false);
  const [header, ...rows] = parseCsv(serialized);
  assert.deepEqual(header, CONTROL_CSV_HEADER);
  assert.equal(rows.length, exploration.controls.length);
  assert.ok(rows.every(row => row.length === header.length));
  for (let index = 0; index < rows.length; index += 1) {
    const row = Object.fromEntries(header.map((name, field) => [name, rows[index][field]]));
    const control = exploration.controls[index];
    assert.equal(row.control_id, control.id);
    assert.equal(row.title, control.title);
    assert.equal(row.description, control.description);
    assert.equal(row.kind, control.kind);
    assert.equal(row.basis, control.basis);
    assert.equal(row.review_status, control.reviewStatus);
    assert.equal(row.role, control.role);
    assert.deepEqual(JSON.parse(row.risk_ids_json), control.riskIds);
    assert.deepEqual(JSON.parse(row.source_risk_ids_json), control.sourceRiskIds);
    assert.deepEqual(JSON.parse(row.chart_keys_json), control.chartKeys);
    assert.deepEqual(JSON.parse(row.source_refs_json), [...new Set(control.sourceTexts.flatMap(source => source.source_refs))].sort());
    assert.deepEqual(JSON.parse(row.source_texts_json), control.sourceTexts);
    assert.deepEqual(JSON.parse(row.targets_json), control.targets);
    assert.equal(row.rationale, control.rationale ?? '');
    assert.equal(row.driver, control.driver);
    assert.equal(row.scenario, control.scenario ?? '');
    assert.equal(row.priority_scope, control.priorityScope ?? '');
    assert.equal(row.implementation_status, control.implementationStatus ?? '');
    assert.deepEqual(JSON.parse(row.measurement_json), control.measurement ?? null);
    assert.deepEqual(JSON.parse(row.authority_assessment_json), control.authorityAssessment ?? null);
    assert.deepEqual(JSON.parse(row.source_rows_json), control.sourceRows ?? null);
    assert.deepEqual(JSON.parse(row.provenance_json), control.provenance ?? null);
    const context = JSON.parse(row.authority_context_json);
    if (control.kind === 'authority') {
      for (const [key, value] of Object.entries(context)) assert.deepEqual(value, control[key]);
    } else assert.equal(context, null);
  }
});

test('control CSV preserves Swedish text, quotes and line breaks and neutralizes spreadsheet formulas', () => {
  const control = { ...exploration.controls[0], title: '=1+1', description: 'Åtgärd, "kontrollera"\nNästa rad' };
  const [header, row] = parseCsv(serializeControlCsv([control]));
  assert.equal(row[header.indexOf('title')], "'=1+1");
  assert.equal(row[header.indexOf('description')], control.description);
  assert.equal(control.title, '=1+1', 'The canonical control must not be changed');
});

function withSiteFixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'miljotillstand-site-test-'));
  const files = [
    'Artefakt_C_Riskregister/Artefakt_C_riskregister.html',
    ...Object.values(STATIC_DATA_FILES),
    'site/data/index.html', 'site/ai-access.html', 'site/llms.txt', 'site/sitemap.xml',
    'site/assets/svenskt-naringsliv-logo.svg', 'site/assets/svenskt-naringsliv-logo-stacked.svg',
    'site/favicon.ico',
  ];
  for (const path of files) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), `fixture: ${path}`);
  }
  writeFileSync(join(directory, 'private-source.txt'), 'Do not publish');
  try { return callback(directory); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

test('Pages preparation publishes all documented downloads and brand assets and removes stale files', () => {
  withSiteFixture(directory => {
    mkdirSync(join(directory, '_site'), { recursive: true });
    writeFileSync(join(directory, '_site/stale.txt'), 'old');
    const output = prepareSite(directory);
    for (const [filename, source] of Object.entries(STATIC_DATA_FILES)) {
      assert.equal(readFileSync(join(output, 'data', filename), 'utf8'), readFileSync(join(directory, source), 'utf8'));
    }
    for (const asset of ['favicon.ico', 'assets/svenskt-naringsliv-logo.svg', 'assets/svenskt-naringsliv-logo-stacked.svg']) {
      assert.equal(readFileSync(join(output, asset), 'utf8'), readFileSync(join(directory, 'site', asset), 'utf8'));
    }
    assert.ok(existsSync(join(output, '.nojekyll')));
    assert.equal(existsSync(join(output, 'stale.txt')), false);
    assert.equal(existsSync(join(output, 'private-source.txt')), false);
    assert.equal(existsSync(join(output, 'Artefakt_C_Riskregister')), false);

    rmSync(join(directory, STATIC_DATA_FILES['exploration.json']));
    assert.throws(() => prepareSite(directory), /ENOENT/);
    assert.ok(existsSync(join(output, 'index.html')), 'A failed input check must preserve the previous preview');
  });
});

test('local preview resolves both Pages and root paths with correct download and asset MIME types', () => {
  withSiteFixture(directory => {
    const output = prepareSite(directory);
    assert.equal(resolvePreviewFile('/', output).path, resolvePreviewFile('/miljotillstandsrisker/', output).path);
    assert.deepEqual(resolvePreviewFile('/miljotillstandsrisker', output), { status: 308, location: '/miljotillstandsrisker/' });
    for (const [path, contentType] of [
      ['/data/exploration.json', 'application/json; charset=utf-8'],
      ['/data/controls.csv', 'text/csv; charset=utf-8'],
      ['/assets/svenskt-naringsliv-logo.svg', 'image/svg+xml'],
      ['/favicon.ico', 'image/x-icon'],
      ['/llms.txt', 'text/plain; charset=utf-8'],
      ['/data/', 'text/html; charset=utf-8'],
    ]) {
      for (const prefix of ['', '/miljotillstandsrisker']) {
        const result = resolvePreviewFile(`${prefix}${path}?download=1`, output);
        assert.equal(result.status, 200, `${prefix}${path}`);
        assert.equal(result.contentType, contentType);
      }
    }
    assert.equal(resolvePreviewFile('/missing.json', output).status, 404);
  });
});

test('local preview denies traversal, malformed paths and symlinks outside the built site', () => {
  withSiteFixture(directory => {
    const output = prepareSite(directory);
    for (const path of ['../private-source.txt', '/%00', '/bad%escape', '/..\\private-source.txt']) {
      assert.equal(resolvePreviewFile(path, output).status, 400, path);
    }
    for (const path of ['/../private-source.txt', '/%2e%2e/private-source.txt', '/miljotillstandsrisker/%2E%2E%2Fprivate-source.txt']) {
      assert.equal(resolvePreviewFile(path, output).status, 403, path);
    }
    symlinkSync(join(directory, 'private-source.txt'), join(output, 'outside.txt'));
    assert.equal(resolvePreviewFile('/outside.txt', output).status, 403);
  });
});

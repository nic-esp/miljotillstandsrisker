import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  processChartExport,
  serializeProcessChartExport,
} from '../../_build/process_chart_export.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const processExport = JSON.parse(readFileSync(
  join(here, '../../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json'),
  'utf8',
));
const exportedAt = '2026-08-25T12:34:56.000Z';

test('every B00-B70 chart exports as one template-compatible JSON document', () => {
  assert.deepEqual(processExport.charts.map(chart => chart.metadata.chartKey), [
    'B00', 'B10', 'B20', 'B30', 'B40', 'B50', 'B60', 'B70',
  ]);

  for (const sourceChart of processExport.charts) {
    const chartKey = sourceChart.metadata.chartKey;
    const result = processChartExport(processExport, chartKey, exportedAt);
    assert.deepEqual(Object.keys(result), ['version', 'exportedAt', 'charts']);
    assert.equal(result.version, '1.0');
    assert.equal(result.exportedAt, exportedAt);
    assert.equal(Number.isNaN(Date.parse(result.exportedAt)), false);
    assert.equal(result.charts.length, 1);

    const chart = result.charts[0];
    assert.deepEqual(Object.keys(chart), ['name', 'type', 'description', 'chartData', 'metadata']);
    assert.equal(chart.metadata.chartKey, chartKey);
    assert.equal(chart.name, sourceChart.name);
    assert.equal(chart.type, sourceChart.type);
    assert.equal(chart.description, sourceChart.description);
    assert.deepEqual(chart.metadata, sourceChart.metadata);
    assert.deepEqual(chart.chartData.nodes, sourceChart.chartData.nodes);
    assert.equal(chart.chartData.edges.length, sourceChart.chartData.edges.length);

    for (let index = 0; index < chart.chartData.edges.length; index += 1) {
      const edge = chart.chartData.edges[index];
      const sourceEdge = sourceChart.chartData.edges[index];
      assert.equal(edge.id, sourceEdge.id);
      assert.equal(edge.source, sourceEdge.source);
      assert.equal(edge.target, sourceEdge.target);
      assert.equal(edge.sourceHandle, 'source-right');
      assert.equal(edge.targetHandle, 'target-left');
      assert.equal(edge.type, 'step');
      assert.deepEqual(edge.data, sourceEdge.data);
    }

    const serialized = serializeProcessChartExport(processExport, chartKey, exportedAt);
    assert.ok(serialized.endsWith('\n'));
    assert.equal(serialized.startsWith('\uFEFF'), false);
    assert.deepEqual(JSON.parse(serialized), result);
  }
});

test('an unknown process chart key is rejected', () => {
  assert.throws(() => processChartExport(processExport, 'B99', exportedAt), /Okänt processdiagram: B99/);
});

test('the app exposes one JSON download and no process CSV buttons', () => {
  const template = readFileSync(join(here, '../../_build/app_template.html'), 'utf8');
  const built = readFileSync(join(here, '../../Artefakt_C_riskregister.html'), 'utf8');
  for (const [label, html] of [['template', template], ['built app', built]]) {
    assert.match(html, /id="jsonProcessChart"/, `${label}: JSON-knappen saknas`);
    assert.match(html, /processkarta_\$\{ck\}\.json/, `${label}: filnamnet ar fel`);
    assert.match(html, /application\/json;charset=utf-8/, `${label}: MIME-typen ar fel`);
    assert.doesNotMatch(html, /id="csvPNodes"/, `${label}: gamla nod-CSV-knappen finns kvar`);
    assert.doesNotMatch(html, /id="csvPEdges"/, `${label}: gamla kant-CSV-knappen finns kvar`);
  }
});

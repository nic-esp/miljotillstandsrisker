import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProcessGeometry } from '../../_build/process_geometry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(readFileSync(join(
  here,
  '../../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json',
), 'utf8'));

const EPSILON = 1e-6;
const MIN_FINAL_SEGMENT = 18;

function mapChart(chart) {
  return {
    key: chart.metadata.chartKey,
    name: chart.name,
    nodes: chart.chartData.nodes.map(node => ({
      id: node.id,
      type: node.type,
      x: node.position.x,
      y: node.position.y,
      label: node.data.label,
      desc: node.data.description || '',
      phase: node.data.phase || '',
      actor: node.data.actor || node.data.s0Actor || '',
      legal: (node.data.legalBasis || []).join('; '),
      refs: node.data.sourceRefs || [],
      rma: !!node.data.riskMappingAllowed,
      hf: node.data.handoffFrom || [],
      ht: node.data.handoffTo || [],
    })),
    edges: chart.chartData.edges.map(edge => ({
      id: edge.id,
      s: edge.source,
      t: edge.target,
      label: edge.data?.label || '',
    })),
  };
}

const charts = source.charts.map(mapChart);
const geometry = createProcessGeometry();

test('real process source covers every B00-B70 chart', () => {
  assert.deepEqual(charts.map(chart => chart.key).sort(), [
    'B00', 'B10', 'B20', 'B30', 'B40', 'B50', 'B60', 'B70',
  ]);
});

function prepare(chart) {
  const nodes = geometry.layoutNodes(chart.nodes);
  const routes = geometry.routeEdges(nodes, chart.edges);
  return { nodes, routes };
}

function samePoint(actual, expected, context) {
  assert.ok(Math.abs(actual.x - expected.x) <= EPSILON,
    `${context}: x ${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) <= EPSILON,
    `${context}: y ${actual.y} != ${expected.y}`);
}

function pointBoundaryError(node, point) {
  const { w, h } = geometry.nodeGeometry(node);
  const cx = node.x + w / 2;
  const cy = node.y + h / 2;
  const dx = point.x - cx;
  const dy = point.y - cy;

  if (node.type === 'decision') {
    const normalized = Math.abs(dx) / (w / 2) + Math.abs(dy) / (h / 2);
    return Math.abs(normalized - 1);
  }

  if (node.type === 'start' || node.type === 'end') {
    const radius = h / 2;
    const straightHalf = w / 2 - radius;
    const distanceToSpine = Math.hypot(Math.max(Math.abs(dx) - straightHalf, 0), dy);
    return Math.abs(distanceToSpine - radius);
  }

  const insideHorizontalSpan = point.x >= node.x - EPSILON
    && point.x <= node.x + w + EPSILON;
  const insideVerticalSpan = point.y >= node.y - EPSILON
    && point.y <= node.y + h + EPSILON;
  if (!insideHorizontalSpan || !insideVerticalSpan) return Infinity;
  return Math.min(
    Math.abs(point.x - node.x),
    Math.abs(point.x - (node.x + w)),
    Math.abs(point.y - node.y),
    Math.abs(point.y - (node.y + h)),
  );
}

function boxesOverlap(a, b) {
  return a.x0 < b.x1 - EPSILON
    && a.x1 > b.x0 + EPSILON
    && a.y0 < b.y1 - EPSILON
    && a.y1 > b.y0 + EPSILON;
}

function labelOverlapsNode(label, nodeBox) {
  return label.x < nodeBox.x1 - EPSILON
    && label.x + label.w > nodeBox.x0 + EPSILON
    && label.y < nodeBox.y1 - EPSILON
    && label.y + label.h > nodeBox.y0 + EPSILON;
}

for (const chart of charts) {
  test(`${chart.key}: every source edge produces one finite orthogonal route`, () => {
    const { nodes, routes } = prepare(chart);
    assert.equal(nodes.length, chart.nodes.length);
    assert.equal(routes.length, chart.edges.length);
    assert.deepEqual(
      new Set(routes.map(route => route.edge.id)),
      new Set(chart.edges.map(edge => edge.id)),
    );

    for (const route of routes) {
      assert.equal(route.source.id, route.edge.s, route.edge.id);
      assert.equal(route.target.id, route.edge.t, route.edge.id);
      assert.ok(route.points.length >= 2, `${route.edge.id}: route has fewer than two points`);
      for (const point of route.points) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y),
          `${route.edge.id}: non-finite route point`);
      }
      for (let index = 1; index < route.points.length; index++) {
        const a = route.points[index - 1];
        const b = route.points[index];
        assert.ok(Math.abs(a.x - b.x) <= EPSILON || Math.abs(a.y - b.y) <= EPSILON,
          `${route.edge.id}: segment ${index} is not orthogonal`);
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > EPSILON,
          `${route.edge.id}: segment ${index} has zero length`);
      }
    }
  });

  test(`${chart.key}: route centerlines do not intersect foreign node boxes`, () => {
    const { nodes, routes } = prepare(chart);
    const failures = routes.flatMap(route => geometry.foreignNodeHits(route, nodes)
      .map(nodeId => `${route.edge.id}->${nodeId}`));
    assert.deepEqual(failures, []);
  });

  test(`${chart.key}: route endpoints equal shape-aware boundary ports`, () => {
    const { routes } = prepare(chart);
    for (const route of routes) {
      const expectedSource = geometry.portPoint(
        route.source,
        route.sourceSide,
        route.sourceOffset,
      );
      const expectedTarget = geometry.portPoint(
        route.target,
        route.targetSide,
        route.targetOffset,
      );
      const sourcePoint = route.points[0];
      const targetPoint = route.points.at(-1);
      samePoint(sourcePoint, expectedSource, `${route.edge.id} source port`);
      samePoint(targetPoint, expectedTarget, `${route.edge.id} target port`);
      assert.ok(pointBoundaryError(route.source, sourcePoint) <= EPSILON,
        `${route.edge.id}: source port is not on ${route.source.type} boundary`);
      assert.ok(pointBoundaryError(route.target, targetPoint) <= EPSILON,
        `${route.edge.id}: target port is not on ${route.target.type} boundary`);
    }
  });

  test(`${chart.key}: edge label boxes exist and do not overlap foreign node boxes`, () => {
    const { nodes, routes } = prepare(chart);
    const failures = [];
    for (const route of routes) {
      if (!route.edge.label) {
        if (route.labelBox) failures.push(`${route.edge.id}:unexpected-label-box`);
        continue;
      }
      if (!route.labelBox) {
        failures.push(`${route.edge.id}:missing-label-box`);
        continue;
      }
      if (!(route.labelBox.w > 0 && route.labelBox.h > 0)) {
        failures.push(`${route.edge.id}:invalid-label-box`);
        continue;
      }
      for (const node of nodes) {
        if (node.id === route.source.id || node.id === route.target.id) continue;
        if (labelOverlapsNode(route.labelBox, geometry.nodeBox(node))) {
          failures.push(`${route.edge.id}->${node.id}`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });

  test(`${chart.key}: every arrow has at least ${MIN_FINAL_SEGMENT}px of final approach`, () => {
    const { routes } = prepare(chart);
    const failures = [];
    for (const route of routes) {
      const target = route.points.at(-1);
      const beforeTarget = route.points.at(-2);
      const length = Math.hypot(target.x - beforeTarget.x, target.y - beforeTarget.y);
      if (length + EPSILON < MIN_FINAL_SEGMENT) {
        failures.push(`${route.edge.id}:${length.toFixed(3)}`);
      }
    }
    assert.deepEqual(failures, []);
  });

  test(`${chart.key}: routed edges do not share overlapping line segments`, () => {
    const { routes } = prepare(chart);
    assert.equal(geometry.crossingSummary(routes).overlaps, 0);
  });

  test(`${chart.key}: display node bounding boxes do not overlap`, () => {
    const { nodes } = prepare(chart);
    const failures = [];
    for (let first = 0; first < nodes.length; first++) {
      for (let second = first + 1; second < nodes.length; second++) {
        if (boxesOverlap(geometry.nodeBox(nodes[first]), geometry.nodeBox(nodes[second]))) {
          failures.push(`${nodes[first].id}<->${nodes[second].id}`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });
}

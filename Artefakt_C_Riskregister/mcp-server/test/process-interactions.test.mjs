import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, '../../_build/app_template.html'), 'utf8');
const generated = readFileSync(join(here, '../../Artefakt_C_riskregister.html'), 'utf8');
const processSource = JSON.parse(readFileSync(
  join(here, '../../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json'),
  'utf8',
));

const applications = [
  ['template', template],
  ['generated app', generated],
];

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const bodyStart = start + startMarker.length;
  const end = source.indexOf(endMarker, bodyStart);
  assert.notEqual(end, -1, `missing end marker after: ${startMarker}`);
  return source.slice(bodyStart, end);
}

function callback(source, startMarker, endMarker, context) {
  const body = between(source, startMarker, endMarker);
  return vm.runInContext(`(e) => {${body}\n}`, vm.createContext(context));
}

function nodeClickCallback(source, context) {
  const body = between(
    source,
    "g.querySelectorAll('.pnode').forEach(el => el.addEventListener('click', () => {",
    '\n  }));',
  );
  return vm.runInContext(`(el) => {${body}\n}`, vm.createContext(context));
}

function namedFunction(source, name, nextName, context) {
  const declaration = `function ${name}` + between(
    source,
    `function ${name}`,
    `\nfunction ${nextName}`,
  );
  const sandbox = vm.createContext({ ...context, result: null });
  vm.runInContext(`${declaration}\nresult = ${name};`, sandbox);
  return sandbox.result;
}

function fakeClassList() {
  const values = new Set();
  return {
    contains: value => values.has(value),
    add: value => values.add(value),
    remove: value => values.delete(value),
    toggle(value, force) {
      if (force === undefined ? !values.has(value) : force) values.add(value);
      else values.delete(value);
    },
  };
}

test('every B00 subprocess node targets the matching subprocess start node', () => {
  const chartKeys = new Set(processSource.charts.map(chart => chart.metadata.chartKey));
  const master = processSource.charts.find(chart => chart.name.startsWith('B00 '));
  assert.ok(master, 'B00 master chart is present');
  const subprocessNodes = master.chartData.nodes.filter(node => node.type === 'subprocess');
  assert.equal(subprocessNodes.length, 7);

  for (const node of subprocessNodes) {
    const targetChart = node.data.label.match(/^B\d{2}/)?.[0];
    assert.ok(targetChart, `${node.id} label identifies its target chart`);
    assert.ok(chartKeys.has(targetChart), `${node.id} points to an existing ${targetChart} chart`);
    assert.deepEqual(
      node.data.handoffTo,
      [`${targetChart}-START`],
      `${node.id} jumps to ${targetChart}-START`,
    );
  }
});

for (const [label, source] of applications) {
  test(`${label}: a process node click selects it and renders its detail`, () => {
    const first = { dataset: { nid: 'B10-010' }, classList: fakeClassList() };
    const second = { dataset: { nid: 'B10-020' }, classList: fakeClassList() };
    const detail = {
      innerHTML: '',
      scrollIntoViewCalls: 0,
      scrollIntoView() { this.scrollIntoViewCalls += 1; },
    };
    const state = { selProcNode: null };
    let boundDetail = null;
    const context = {
      procCtx: { moved: false },
      state,
      g: { querySelectorAll: () => [first, second] },
      $: selector => {
        assert.equal(selector, '#procDetail');
        return detail;
      },
      nodeDetailHTML: id => `<article>${id}</article>`,
      bindDetail: root => { boundDetail = root; },
    };

    nodeClickCallback(source, context)(first);

    assert.equal(state.selProcNode, 'B10-010');
    assert.equal(first.classList.contains('sel'), true);
    assert.equal(second.classList.contains('sel'), false);
    assert.equal(detail.innerHTML, '<article>B10-010</article>');
    assert.equal(boundDetail, detail);
    assert.equal(detail.scrollIntoViewCalls, 1);
  });

  test(`${label}: a drag is not treated as a node click`, () => {
    const node = { dataset: { nid: 'B10-010' }, classList: fakeClassList() };
    const state = { selProcNode: null };
    let detailCalls = 0;
    const context = {
      procCtx: { moved: true },
      state,
      g: { querySelectorAll: () => [node] },
      $: () => { throw new Error('drag must not look up the detail element'); },
      nodeDetailHTML: () => { detailCalls += 1; },
      bindDetail: () => {},
    };

    nodeClickCallback(source, context)(node);

    assert.equal(state.selProcNode, null);
    assert.equal(detailCalls, 0);
    assert.equal(node.classList.contains('sel'), false);
  });

  test(`${label}: pointer capture starts only after cumulative drag movement`, () => {
    const captureCalls = [];
    const attributes = [];
    const svg = {
      clientWidth: 1000,
      clientHeight: 600,
      classList: fakeClassList(),
      setPointerCapture: pointerId => captureCalls.push(pointerId),
      setAttribute: (...args) => attributes.push(args),
    };
    const procCtx = {
      svg,
      vb: { x: 0, y: 0, w: 1000, h: 600 },
      drag: null,
      moved: false,
      setModeButtons: () => {},
    };
    const context = { procCtx, svg };
    const pointerDown = callback(
      source,
      "svg.addEventListener('pointerdown', e => {",
      '\n  });',
      context,
    );
    const pointerMove = callback(
      source,
      "window.addEventListener('pointermove', e => {",
      '\n});',
      context,
    );

    pointerDown({ button: 0, clientX: 10, clientY: 10, pointerId: 7 });
    assert.deepEqual(captureCalls, [], 'a tap must retain its original node click target');
    assert.equal(procCtx.moved, false);

    pointerMove({ clientX: 12, clientY: 11, pointerId: 7 });
    assert.equal(procCtx.moved, false, 'sub-threshold pointer jitter is still a click');
    assert.deepEqual(captureCalls, []);

    pointerMove({ clientX: 15, clientY: 11, pointerId: 7 });
    assert.equal(procCtx.moved, true, 'movement is measured from pointerdown, not the last event');
    assert.deepEqual(captureCalls, [7], 'capture begins exactly when panning begins');
    assert.ok(attributes.length > 0, 'panning updates the SVG viewBox');
  });

  test(`${label}: a B00 subprocess node exposes a working chart jump`, () => {
    const nodeDetailHTML = namedFunction(source, 'nodeDetailHTML', 'bindDetail', {
      NODE_BY_ID: {},
      PROC_NODE: {
        'B00-SP10': {
          id: 'B00-SP10',
          label: 'B10 Förstudie och prövningsväg',
          desc: '',
          phase: '',
          actor: '',
          legal: '',
          refs: [],
          chart: 'B00',
          hf: [],
          ht: ['B10-START'],
        },
      },
      RISKS: [],
      CHART_NAME: { B00: 'B00 Masterprocess' },
      esc: value => String(value),
      refLink: value => String(value),
      riskCard: () => '',
      nodeRankingSummary: () => '',
      downstreamDetail: () => '',
      sorted: risks => risks,
    });
    const html = nodeDetailHTML('B00-SP10');
    assert.match(html, /data-goto-chart="B10"/);

    const button = { dataset: { gotoChart: 'B10' }, onclick: null };
    const state = { selChart: 'B00', selProcNode: 'B00-SP10' };
    let selectedView = null;
    const bindDetail = namedFunction(source, 'bindDetail', 'setView', {
      state,
      bindCards: () => {},
      setView: view => { selectedView = view; },
    });
    bindDetail({ querySelectorAll: selector => {
      assert.equal(selector, '[data-goto-chart]');
      return [button];
    } });

    assert.equal(typeof button.onclick, 'function');
    button.onclick();
    assert.equal(state.selChart, 'B10');
    assert.equal(state.selProcNode, null);
    assert.equal(selectedView, 'process');
  });
}

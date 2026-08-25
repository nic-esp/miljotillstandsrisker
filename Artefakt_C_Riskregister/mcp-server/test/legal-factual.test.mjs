import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseSourceRegister } from '../../_build/source_register.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const readText = path => readFileSync(join(here, path), 'utf8');
const readJson = path => JSON.parse(readText(path));

const risks = readJson('../../Artefakt_C_riskregister.json');
const processExport = readJson('../../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json');
const sourceCsv = readText('../../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_kallregister.csv');
const generatedSources = readJson('../data/sources.json');
const generatedNodes = readJson('../../_build/mappable_nodes.json');
const generatedHtml = readText('../../Artefakt_C_riskregister.html');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }

  assert.equal(quoted, false, 'kallregistret har ett oavslutat citattecken');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift();
  assert.deepEqual(headers, ['source_ref', 'title', 'authority', 'url']);
  return rows.map((values, rowIndex) => {
    assert.equal(values.length, headers.length, `fel antal CSV-falt pa datarad ${rowIndex + 2}`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

const csvSources = parseCsv(sourceCsv);
const sourceByCode = new Map(csvSources.map(source => [source.source_ref, source]));
const riskById = new Map(risks.map(risk => [risk.risk_id, risk]));
const chartByKey = new Map(processExport.charts.map(chart => [chart.metadata.chartKey, chart]));
const allNodes = processExport.charts.flatMap(chart => chart.chartData.nodes);
const nodeById = new Map(allNodes.map(node => [node.id, node]));
const allEdges = processExport.charts.flatMap(chart => chart.chartData.edges);
const edgeById = new Map(allEdges.map(edge => [edge.id, edge]));

function requiredRisk(id) {
  const risk = riskById.get(id);
  assert.ok(risk, `saknad riskfixture: ${id}`);
  return risk;
}

function requiredNode(id) {
  const node = nodeById.get(id);
  assert.ok(node, `saknad processnod: ${id}`);
  return node;
}

function requiredEdge(id) {
  const edge = edgeById.get(id);
  assert.ok(edge, `saknad processkant: ${id}`);
  return edge;
}

function projectMappableNodes() {
  const joinValues = value => Array.isArray(value) ? value.join(' | ') : (value ?? '');
  const result = {};

  for (const chart of processExport.charts) {
    const chartKey = chart.metadata.chartKey;
    if (chartKey === 'B00') continue;
    const edges = chart.chartData.edges;
    result[chartKey] = chart.chartData.nodes
      .filter(node => node.data.riskMappingAllowed)
      .map(node => {
        const data = node.data;
        return {
          node_id: node.id,
          chart_key: chartKey,
          chart_name: chart.name,
          phase: data.phase ?? '',
          label: data.label ?? '',
          node_type: node.type,
          description: data.description ?? '',
          actor: data.actor || data.s0Actor || '',
          inputs: joinValues(data.inputs),
          outputs: joinValues(data.outputs),
          applies_when: data.appliesWhen ?? '',
          variant: joinValues(data.variant),
          legal_basis: joinValues(data.legalBasis),
          source_refs: joinValues(data.sourceRefs),
          parallel_process_refs: joinValues(data.parallelProcessRefs),
          upstream_node_ids: edges.filter(edge => edge.target === node.id).map(edge => edge.source).join(' | '),
          downstream_node_ids: edges.filter(edge => edge.source === node.id).map(edge => edge.target).join(' | '),
          handoff_from: joinValues(data.handoffFrom),
          handoff_to: joinValues(data.handoffTo),
          s0_actor: data.s0Actor ?? '',
          s1_delta: data.s1Delta ?? '',
          scenario_tags: joinValues(data.scenarioTags),
        };
      });
  }
  return result;
}

function projectHtmlProcess() {
  return Object.fromEntries(processExport.charts.map(chart => {
    const key = chart.metadata.chartKey;
    return [key, {
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
        rma: Boolean(node.data.riskMappingAllowed),
        hf: node.data.handoffFrom || [],
        ht: node.data.handoffTo || [],
      })),
      edges: chart.chartData.edges.map(edge => ({
        id: edge.id,
        s: edge.source,
        t: edge.target,
        label: edge.data?.label || '',
      })),
    }];
  }));
}

function embeddedHtmlData() {
  const startMarker = 'const DATA = ';
  const endMarker = ';\nconst RISKS = DATA.risks;';
  const start = generatedHtml.indexOf(startMarker);
  assert.notEqual(start, -1, 'den byggda appen saknar DATA-payload');
  const end = generatedHtml.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, 'den byggda appens DATA-payload saknar slutmarkor');
  return JSON.parse(generatedHtml.slice(start + startMarker.length, end));
}

test('the canonical risk register has 342 unique, fully mapped records', () => {
  assert.equal(risks.length, 342);
  assert.equal(riskById.size, 342, 'risk_id ska vara unika');

  const requiredFields = [
    'risk_id', 'node_id', 'chart_key', 'node_label', 'title', 'category',
    'trigger', 'trigger_factors', 'description', 'motivation', 'affects', 'impact', 'consequences', 'mitigation',
    'source_refs', 'scenario_tags', 'origin',
  ];
  for (const risk of risks) {
    for (const field of requiredFields) {
      assert.ok(Object.hasOwn(risk, field), `${risk.risk_id}: saknar ${field}`);
      if (!['source_refs', 'trigger_factors', 'consequences'].includes(field)) {
        assert.equal(typeof risk[field], 'string', `${risk.risk_id}: ${field} ska vara en strang`);
        assert.ok(risk[field].trim(), `${risk.risk_id}: ${field} far inte vara tomt`);
      }
    }
    assert.match(risk.risk_id, /^R-B(?:10|20|30|40|50|60|70)-.+-\d{2}$/);
    const node = nodeById.get(risk.node_id);
    assert.ok(node, `${risk.risk_id}: okand processnod ${risk.node_id}`);
    assert.equal(node.data.riskMappingAllowed, true, `${risk.risk_id}: noden far inte riskmappas`);
    assert.equal(risk.chart_key, risk.node_id.slice(0, 3), `${risk.risk_id}: chart_key och node_id skiljer sig`);
    assert.equal(risk.node_label, node.data.label, `${risk.risk_id}: node_label ar inaktuell`);
    assert.ok(Array.isArray(risk.source_refs), `${risk.risk_id}: source_refs ska vara en lista`);
    assert.ok(risk.source_refs.length > 0, `${risk.risk_id}: source_refs far inte vara tom`);
    for (const field of ['trigger_factors', 'consequences']) {
      assert.ok(Array.isArray(risk[field]), `${risk.risk_id}: ${field} ska vara en lista`);
      assert.ok(risk[field].length >= 3 && risk[field].length <= 5, `${risk.risk_id}: ${field} ska ha 3-5 poster`);
      const texts = new Set();
      for (const [index, item] of risk[field].entries()) {
        assert.equal(typeof item.text, 'string', `${risk.risk_id}: ${field}[${index}].text`);
        assert.ok(item.text.trim(), `${risk.risk_id}: ${field}[${index}].text far inte vara tom`);
        assert.ok(['source', 'analysis'].includes(item.basis), `${risk.risk_id}: ${field}[${index}].basis`);
        assert.ok(Array.isArray(item.source_refs), `${risk.risk_id}: ${field}[${index}].source_refs`);
        assert.ok(item.source_refs.every(ref => risk.source_refs.includes(ref)), `${risk.risk_id}: ${field}[${index}] har extern ref`);
        if (item.basis === 'source') assert.ok(item.source_refs.length > 0, `${risk.risk_id}: kallstodd post saknar ref`);
        const normalized = item.text.trim().toLocaleLowerCase('sv-SE').replace(/\s+/g, ' ');
        assert.ok(!texts.has(normalized), `${risk.risk_id}: duplicerad post i ${field}`);
        texts.add(normalized);
      }
    }
    assert.equal(
      risk.scenario_tags,
      (node.data.scenarioTags ?? []).join(' | '),
      `${risk.risk_id}: scenario_tags ar inaktuella`,
    );
  }

  const mappedRiskNodes = new Set(risks.map(risk => risk.node_id));
  const mappableProcessNodes = new Set(allNodes.filter(node => node.data.riskMappingAllowed).map(node => node.id));
  assert.equal(mappedRiskNodes.size, 160);
  assert.deepEqual(mappedRiskNodes, mappableProcessNodes);
});

test('the process graph has valid node, edge, and handoff references', () => {
  assert.equal(chartByKey.size, processExport.charts.length, 'diagramnycklar ska vara unika');
  assert.equal(nodeById.size, allNodes.length, 'nod-ID ska vara unika globalt');
  assert.equal(edgeById.size, allEdges.length, 'kant-ID ska vara unika globalt');

  for (const chart of processExport.charts) {
    assert.match(chart.metadata.chartKey, /^B(?:00|10|20|30|40|50|60|70)$/);
    const localIds = new Set(chart.chartData.nodes.map(node => node.id));
    for (const node of chart.chartData.nodes) {
      assert.ok(node.id.startsWith(`${chart.metadata.chartKey}-`), `${node.id}: fel metadata.chartKey`);
    }
    for (const edge of chart.chartData.edges) {
      assert.ok(localIds.has(edge.source), `${edge.id}: okand kallnod ${edge.source}`);
      assert.ok(localIds.has(edge.target), `${edge.id}: okand malnod ${edge.target}`);
      assert.notEqual(edge.source, edge.target, `${edge.id}: sjalvloop saknar uttrycklig processbetydelse`);
    }
  }

  for (const node of allNodes) {
    for (const handoff of [...(node.data.handoffFrom || []), ...(node.data.handoffTo || [])]) {
      assert.ok(nodeById.has(handoff), `${node.id}: okand handoff-nod ${handoff}`);
    }
  }

  assert.equal(processExport.artifactMetadata.validation.chartCount, processExport.charts.length);
  assert.equal(processExport.artifactMetadata.validation.nodeCount, allNodes.length);
  assert.equal(processExport.artifactMetadata.validation.edgeCount, allEdges.length);
});

test('CSV and generated source registries are identical and all source codes resolve', () => {
  assert.deepEqual(parseSourceRegister(sourceCsv), csvSources, 'byggkedjans CSV-parser och testoraklet skiljer sig');
  assert.equal(sourceByCode.size, csvSources.length, 'source_ref ska vara unika');
  assert.ok(
    JSON.stringify(generatedSources) === JSON.stringify(csvSources),
    'kor build:data efter en andring i kallregistret',
  );

  for (const source of csvSources) {
    const parsed = new URL(source.url);
    assert.equal(parsed.protocol, 'https:', `${source.source_ref}: kallan ska anvanda HTTPS`);
    assert.doesNotMatch(source.url, /\s/, `${source.source_ref}: URL innehaller blanktecken`);
  }

  for (const risk of risks) {
    for (const ref of risk.source_refs.filter(ref => !ref.startsWith('EXT:'))) {
      assert.ok(sourceByCode.has(ref), `${risk.risk_id}: okand source_ref ${ref}`);
    }
  }

  for (const node of allNodes) {
    const refs = node.data.sourceRefs || [];
    for (const ref of refs) assert.ok(sourceByCode.has(ref), `${node.id}: okand sourceRef ${ref}`);
    assert.deepEqual(
      node.data.sourceUrls || [],
      refs.map(ref => sourceByCode.get(ref).url),
      `${node.id}: sourceUrls ska harledas fran kallregistret`,
    );
  }
});

test('the shared source-register loader rejects malformed or ambiguous inputs', () => {
  assert.throws(
    () => parseSourceRegister('source_ref,title,authority,url\nDUP,Titel,Myndighet,https://example.com\nDUP,Annan,Myndighet,https://example.org\n'),
    /Duplicerad source_ref/,
  );
  assert.throws(
    () => parseSourceRegister('source_ref,title,authority,url\nBAD,Titel,Myndighet,http://example.com\n'),
    /HTTPS/,
  );
  assert.throws(
    () => parseSourceRegister('source_ref,title,authority,url\nBAD,"Titel,Myndighet,https://example.com\n'),
    /oavslutat citattecken/,
  );
});

test('every external risk reference ends in one absolute HTTPS URL without whitespace', () => {
  let externalCount = 0;
  for (const risk of risks) {
    for (const ref of risk.source_refs.filter(ref => ref.startsWith('EXT:'))) {
      externalCount += 1;
      const match = /^EXT:\s+.+\s+(https:\/\/\S+)$/.exec(ref);
      assert.ok(match, `${risk.risk_id}: ogiltig EXT-referens: ${ref}`);
      const url = match[1];
      assert.equal(new URL(url).protocol, 'https:', `${risk.risk_id}: EXT-kallan ska anvanda HTTPS`);
      assert.doesNotMatch(url, /\s/, `${risk.risk_id}: EXT-URL innehaller blanktecken`);
    }
  }
  assert.ok(externalCount > 0, 'registret ska innehalla externa primarkallor');
});

test('named judicial decisions in published risk text have a matching official primary source', () => {
  const decisionPatterns = [
    /\b(?:M|P|ÖM|T|ÖP)\s*\d{3,}-\d{2}\b/gi,
    /\bHFD\s+20\d{2}\s+(?:ref\.|not\.)\s*\d+\b/gi,
    /\bNJA\s+\d{4}\s+s\.\s*\d+\b/gi,
    /\bMÖD\s+20\d{2}:\d+\b/gi,
  ];
  const officialCourtSource = /https:\/\/(?:www\.)?(?:domstol\.se|rattspraxis\.etjanst\.domstol\.se)\//i;
  const normalizeDecision = value => value.toLocaleLowerCase('sv').replace(/[^a-zåäö0-9]/g, '');

  for (const risk of risks) {
    const segments = [{
      label: 'publicerad risktext',
      text: [risk.title, risk.trigger, risk.description, risk.motivation, risk.impact].join(' '),
      sourceRefs: risk.source_refs,
    }];
    for (const field of ['trigger_factors', 'consequences']) {
      for (const [index, item] of risk[field].entries()) {
        segments.push({ label: `${field}[${index}]`, text: item.text, sourceRefs: item.source_refs });
      }
    }
    for (const segment of segments) {
      const names = new Set(decisionPatterns.flatMap(pattern => (
        [...segment.text.matchAll(pattern)].map(match => match[0])
      )));
      const expandedReferences = segment.sourceRefs.map((ref) => {
        const source = sourceByCode.get(ref);
        return source ? `${ref} ${source.title} ${source.url}` : ref;
      });
      const officialReferences = expandedReferences.filter(ref => officialCourtSource.test(ref));
      for (const name of names) {
        assert.ok(
          officialReferences.some(ref => normalizeDecision(ref).includes(normalizeDecision(name))),
          `${risk.risk_id} ${segment.label}: ${name} saknar matchande direkt officiell domstolskalla`,
        );
      }
    }
  }
});

test('published motivations contain legal analysis rather than correction-log prose', () => {
  const editorialPatterns = [
    /\b(?:den|det|de) tidigare (?:texten|påståendet|hänvisningen|exemplet|exemplen)\b/i,
    /\b(?:tas|har tagits) bort\b/i,
    /\b(?:felaktig|missvisande) (?:hänvisning|uppgift|beskrivning|text|påstående)\b/i,
    /\b(?:korrigeras|har korrigerats)\b/i,
    /\bvälgrund\w*/i,
    /\bverifiera(?:d|t|de|bara)\b/i,
    /\berfarenheten visar\b/i,
    /\bregistret\b/i,
  ];
  const itemEditorialPatterns = [
    /\b(?:den|det|de) tidigare (?:texten|påståendet|hänvisningen|exemplet|exemplen)\b/i,
    /\b(?:ersätt|ersätts|ska ersättas) (?:texten|påståendet|hänvisningen|exemplet)\b/i,
    /\b(?:har korrigerats|korrigerad version|rättelselogg)\b/i,
  ];

  for (const risk of risks) {
    for (const pattern of editorialPatterns) {
      assert.doesNotMatch(risk.motivation, pattern, `${risk.risk_id}: redaktionell eller sjalvintygande text`);
    }
    for (const pattern of itemEditorialPatterns) {
      for (const field of ['trigger_factors', 'consequences']) {
        for (const [index, item] of risk[field].entries()) {
          assert.doesNotMatch(item.text, pattern, `${risk.risk_id}: ${field}[${index}] innehaller redaktionell eller sjalvintygande text`);
        }
      }
    }
  }
});

test('high-risk residual legal corrections do not regress', () => {
  const allRiskText = JSON.stringify(risks);
  assert.doesNotMatch(allRiskText, /koncessionsjury/i, 'historisk myndighet heter Koncessionsnamnden for miljoskydd');
  assert.doesNotMatch(allRiskText, /tjugoförsta dagen/i, 'overklagandetid ska inte beskrivas med en uppfunnen fast startdag');

  const ied = requiredRisk('R-B60-180-02');
  assert.deepEqual(ied.source_refs, ['MB', 'IUF', 'NV_IED']);
  assert.doesNotMatch(JSON.stringify(ied), /SEVESO/i, 'BAT och IED ska inte harledas till Sevesoreglerna');
  assert.match(ied.description, /industriutsläppsförordningen/);

  for (const id of ['R-B50-M030-01', 'R-B50-M030-03', 'R-B50-M040-02']) {
    const risk = requiredRisk(id);
    assert.match(risk.motivation, /25 juni 2026/);
    assert.match(risk.source_refs.join(' '), /regeringsbeslut\.pdf/);
    assert.doesNotMatch(risk.motivation, /beslut(?:ade|et)? den 27 juni 2026/i);
  }
});

test('enacted SFS sources have their exact official titles in every registry copy', () => {
  const exactTitles = {
    SFS2024_325: 'SFS 2024:325 – Lag om ändring i minerallagen (1991:45)',
    SFS2026_400: 'SFS 2026:400 – Lag om ändring i miljöbalken',
    SFS2026_1442: 'SFS 2026:1442 – Lag om ändring i miljöbalken',
    SFS2026_1443: 'SFS 2026:1443 – Lag om ändring i lagen (2010:921) om mark- och miljödomstolar',
    SFS2026_1444: 'SFS 2026:1444 – Lag om ändring i lagen (2026:1443) om ändring i lagen (2010:921) om mark- och miljödomstolar',
  };
  for (const [code, title] of Object.entries(exactTitles)) {
    assert.equal(sourceByCode.get(code)?.title, title, code);
  }

  const expectedEmbeddedRegistry = Object.fromEntries(csvSources.map(source => [source.source_ref, {
    title: source.title,
    url: source.url,
    authority: source.authority,
  }]));
  const staleCharts = processExport.charts
    .filter(chart => JSON.stringify(chart.metadata.sourceRegister) !== JSON.stringify(expectedEmbeddedRegistry))
    .map(chart => chart.metadata.chartKey);
  assert.deepEqual(staleCharts, [], 'diagram med inaktuellt inbaddat kallregister');
});

test('audited case fixtures retain the corrected dockets, courts, projects, and outcomes', () => {
  const allRiskText = JSON.stringify(risks);
  assert.doesNotMatch(allRiskText, /M\s*4706-16/i, 'Preem/ROCC har malnummer M 4708-16');
  assert.doesNotMatch(allRiskText, /1535-23/, 'HFD 2024 not. 60 har malnummer 4941-23');

  const kallak = requiredRisk('R-B10-020-01');
  assert.match(kallak.motivation, /HFD 2024 not\. 36, mål 3893-22/);
  assert.match(kallak.motivation, /rättsprövning/);
  assert.doesNotMatch(kallak.motivation, /MÖD|801-23/);

  const hfd60 = requiredRisk('R-B20-060-01');
  assert.match(hfd60.motivation, /HFD 2024 not\. 60, mål 4941-23/);
  assert.match(hfd60.motivation, /HFD fann att regeringens beslut skulle stå fast/);

  const preem = requiredRisk('R-B70-010-01');
  assert.match(preem.motivation, /9 november 2018.*M 4708-16/);
  assert.match(preem.motivation, /15 juni 2020 lämnade MÖD ett yttrande till regeringen/);
  assert.match(preem.motivation, /inte en slutlig MÖD-dom/);

  const gotland = requiredRisk('R-B50-G010-01');
  assert.match(gotland.motivation, /M 5375-14 gällde SMA Minerals ansökan om täkt vid Stucks/);
  assert.match(gotland.motivation, /M 5431-14 gällde Nordkalks ansökan vid Bunge/);
  assert.match(gotland.motivation, /två skilda mål/);

  const plans = requiredRisk('R-B50-P030-02');
  assert.match(plans.motivation, /P 1151-23 upphävde MÖD mark- och miljödomstolens dom och fastställde en detaljplan för en friskvårdsanläggning/);
  assert.match(plans.motivation, /P 5808-23 upphävde MÖD också underinstansens dom och fastställde bostadsplanen/);
  assert.match(plans.motivation, /Båda avgörandena meddelades 2024/);

  const rights = requiredRisk('R-B10-030-02');
  assert.match(rights.motivation, /Rådighet är en processförutsättning/);
  assert.doesNotMatch(rights.motivation, /M 13782-22|Nordkalk/);

  const consultation = requiredRisk('R-B20-040-02');
  assert.match(consultation.motivation, /samrådets funktion enligt 6 kap\. miljöbalken/);
  assert.doesNotMatch(consultation.motivation, /M 6227-17|Markbygden/);

  const consistency = requiredRisk('R-B20-090-01');
  assert.match(consistency.motivation, /NJA 2009 s\. 321, mål T 3126-07/);
  assert.doesNotMatch(consistency.motivation, /M 14424-22|Sävar/);
});

test('mining, Natura 2000, and species-protection paths use the post-July-2024 rules', () => {
  const mineralRight = requiredRisk('R-B50-M010-01');
  assert.match(mineralRight.description, /Ett giltigt undersökningstillstånd är inte ett generellt behörighetskrav/);
  assert.match(mineralRight.description, /företräde mellan flera sökande enligt 4 kap\. 3 §/);

  const concessionEia = requiredRisk('R-B50-M010-02');
  assert.match(concessionEia.description, /Sedan den 1 juli 2024/);
  assert.match(concessionEia.description, /Natura 2000-tillstånd.*prövas självständigt i den senare miljöprövningen/);
  assert.ok(concessionEia.source_refs.includes('SFS2024_325'));

  const naturaRoute = requiredRisk('R-B50-N030-01');
  assert.match(naturaRoute.description, /7 kap\. 29 b § miljöbalken/);
  assert.match(naturaRoute.description, /kan alltså inte fritt välja/);
  assert.doesNotMatch(naturaRoute.description, /antingen samordnas med huvudprövningen eller handläggas separat av behörig myndighet/i);

  const speciesRoute = requiredRisk('R-B50-GX020-01');
  assert.match(speciesRoute.description, /4–9 §§ artskyddsförordningen/);
  assert.match(speciesRoute.description, /14 och 15 §§ av länsstyrelsen/);
  assert.match(speciesRoute.description, /inte någon allmän dispensgrund benämnd särskilda skäl/);
  assert.doesNotMatch(speciesRoute.description, /artskyddsdispens av länsstyrelse eller Naturvårdsverket beroende på art/i);

  const processMining = requiredNode('B50-M010');
  assert.match(processMining.data.description, /4 kap\. 3–4 §§/);
  assert.doesNotMatch(processMining.data.description, /Giltig mineralrätt/);
  const processNatura = requiredNode('B50-N030');
  assert.match(processNatura.data.description, /7 kap\. 29 b §/);
});

test('current FMH and FVV decision gates use the enacted scope and thresholds', () => {
  const fmh = requiredRisk('R-B30-GC130-01');
  assert.match(fmh.description, /inte begränsad till ändringar av tillståndspliktig verksamhet/);
  assert.match(fmh.motivation, /26 a § FMH/);
  assert.match(fmh.motivation, /sex veckor enligt 26 c §/);

  const fmhClassification = requiredRisk('R-B30-GC130-02');
  assert.match(fmhClassification.description, /inte varje anmälan/);
  assert.match(fmhClassification.description, /inte heller begränsad till ändringsanmälningar/);

  const fvv = requiredRisk('R-B40-GN150-01');
  assert.match(fvv.trigger, /22 a–22 c §§ FVV/);
  assert.match(fvv.trigger, /22 d §/);
  assert.match(fvv.description, /kan antas medföra, inte att påverkan måste kunna uteslutas/);
});

test('strandskydd screening applies the enacted permit and line-concession exceptions', () => {
  const water = requiredRisk('R-B40-060-01');
  assert.match(water.description, /7 kap\. 16 § 2 MB/);
  assert.match(water.description, /omfattas av ett tillstånd enligt miljöbalken/);
  assert.match(water.description, /utanför tillståndets omfattning/);
  assert.doesNotMatch(water.description, /vattentillstånd ersätter inte strandskyddsdispens/i);

  const grid = requiredRisk('R-B50-E050-02');
  assert.match(grid.description, /7 kap\. 16 § 4 MB/);
  assert.match(grid.description, /starkströmsledning enligt en nätkoncession för linje/);
  assert.match(grid.description, /andra komponenter/);
  assert.ok(grid.source_refs.includes('MB'));
});

test('MB 22:28 is represented as an express, case-specific enforcement order', () => {
  const processGate = requiredNode('B70-G020');
  assert.match(processGate.data.description, /får tas i anspråk före laga kraft endast om domstolen uttryckligen har förordnat om det enligt MB 22 kap\. 28 §/);
  assert.match(processGate.data.description, /kontrollera alltid inhibition/);
  assert.ok(processGate.data.legalBasis.includes('MB 22 kap. 28 §'));

  const risk = requiredRisk('R-B70-G020-02');
  assert.match(risk.description, /Det krävs alltså ett uttryckligt verkställighetsförordnande/);
  assert.match(risk.description, /bestämmelsen gör inte alla ansökningsdomar verkställbara som utgångspunkt/);
  assert.match(risk.motivation, /fakultativ regel/);
});

test('the appeal-chain gate distinguishes municipal, state, plan, and government decisions', () => {
  const gate = requiredNode('B60-G230');
  assert.match(gate.data.description, /Kommunala miljöbalksbeslut och vanliga kommunala PBL-beslut går normalt till länsstyrelsen/);
  assert.match(gate.data.description, /detaljplan överklagas direkt till MMD/);
  assert.match(gate.data.description, /Statliga myndighetsbeslut enligt miljöbalken går normalt till MMD/);
  assert.match(gate.data.description, /regeringsbeslut kan i förekommande fall rättsprövas av HFD/);

  const expectedEdges = {
    'B60-E030': ['B60-G230', 'B60-240', 'Kommunalt beslut som enligt sektorslagen överklagas till länsstyrelsen'],
    'B60-E031': ['B60-G230', 'B60-250', 'Statligt myndighetsbeslut eller kommunalt planbeslut direkt till MMD'],
    'B60-E033': ['B60-G230', 'B60-END', 'Regeringsbeslut: pröva rättsprövning och inhibition'],
    'B60-E034': ['B60-240', 'B60-250', 'Länsstyrelsens beslut överklagas vidare'],
  };
  for (const [id, [source, target, label]] of Object.entries(expectedEdges)) {
    const edge = requiredEdge(id);
    assert.equal(edge.source, source, id);
    assert.equal(edge.target, target, id);
    assert.equal(edge.data?.label, label, id);
  }

  const processText = JSON.stringify(processExport);
  assert.doesNotMatch(processText, /länsrätt/i, 'processkartan ska anvanda dagens domstolsnamn');
  assert.doesNotMatch(processText, /traktatförrättning/i, 'rattighetsprocessen heter ledningsrattsforrattning');
  const heritageAppeal = requiredNode('B50-K040');
  assert.equal(heritageAppeal.data.actor, 'Projektägare, länsstyrelse och förvaltningsrätt');
  assert.equal(heritageAppeal.data.s0Actor, 'Projektägare, länsstyrelse och förvaltningsrätt');
});

test('every process node has an explicit legal basis or operational classification', () => {
  const invalidTypes = allNodes.filter(node => !Array.isArray(node.data.legalBasis)).map(node => node.id);
  assert.deepEqual(invalidTypes, [], 'legalBasis ska vara en lista');
  const empty = allNodes.filter(node => node.data.legalBasis.length === 0).map(node => node.id);
  assert.deepEqual(empty, [], 'legalBasis far inte vara tom');
});

test('process snapshot metadata is current at export, chart, and node level', () => {
  assert.equal(processExport.exportedAt, '2026-08-20T08:00:00+02:00');
  assert.equal(processExport.artifactMetadata.artifactVersion, '0.9');
  assert.equal(processExport.artifactMetadata.effectiveDate, '2026-08-20');
  assert.equal(processExport.artifactMetadata.legalSnapshot, 'S0_current_2026');

  const staleCharts = processExport.charts
    .filter(chart => chart.metadata.artifactVersion !== '0.9' || chart.metadata.effectiveDate !== '2026-08-20')
    .map(chart => chart.metadata.chartKey);
  assert.deepEqual(staleCharts, [], 'diagram med inaktuell version eller effectiveDate');
  const staleNodes = allNodes.filter(node => node.data.effectiveDate !== '2026-08-20').map(node => node.id);
  assert.deepEqual(staleNodes, [], 'noder med inaktuell effectiveDate');
});

test('derived node dictionary and built HTML exactly mirror the canonical data', () => {
  const expectedNodes = projectMappableNodes();
  const staleNodeCharts = Object.keys(expectedNodes)
    .filter(chartKey => JSON.stringify(generatedNodes[chartKey]) !== JSON.stringify(expectedNodes[chartKey]));
  assert.deepEqual(staleNodeCharts, [], 'kor extract_nodes.mjs efter processandringar');

  const htmlData = embeddedHtmlData();
  assert.ok(JSON.stringify(htmlData.risks) === JSON.stringify(risks), 'den byggda appens riskdata ar inaktuell');
  assert.ok(
    JSON.stringify(htmlData.nodesByChart) === JSON.stringify(generatedNodes),
    'den byggda appens noddata ar inaktuell',
  );
  const expectedHtmlSources = Object.fromEntries(csvSources.map(source => [source.source_ref, {
    title: source.title,
    authority: source.authority,
    url: source.url,
  }]));
  assert.ok(
    JSON.stringify(htmlData.sources) === JSON.stringify(expectedHtmlSources),
    'den byggda appens kallregister ar inaktuellt',
  );
  assert.ok(
    JSON.stringify(htmlData.proc) === JSON.stringify(projectHtmlProcess()),
    'den byggda appens processdata ar inaktuell',
  );
  assert.deepEqual(
    htmlData.processExport,
    processExport,
    'den byggda appens kanoniska process-export ar inaktuell',
  );
  const expectedChartNames = Object.fromEntries(processExport.charts.map(chart => {
    const key = chart.metadata.chartKey;
    return [key, chart.name];
  }));
  assert.deepEqual(htmlData.chartNames, expectedChartNames, 'den byggda appens diagramnamn ar inaktuella');
  assert.match(generatedHtml, /Baslinje S0 per 2026-08-20/);
  assert.doesNotMatch(generatedHtml, /Baslinje S0 per 2026-08-14/);
});

#!/usr/bin/env node
// Rebuilds the risk-mappable node dictionary from the canonical process export.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const processFile = join(here, '../../Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json');
const outputFile = join(here, 'mappable_nodes.json');
const processExport = JSON.parse(readFileSync(processFile, 'utf8'));

const joinValues = value => Array.isArray(value) ? value.join(' | ') : (value ?? '');
const result = {};

for (const chart of processExport.charts) {
  const chartKey = chart.metadata.chartKey;
  if (!chartKey) throw new Error(`Diagrammet ${chart.name} saknar metadata.chartKey`);
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

writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`);
const count = Object.values(result).reduce((sum, nodes) => sum + nodes.length, 0);
console.log(`Skrev ${count} riskmappbara noder till ${outputFile}`);

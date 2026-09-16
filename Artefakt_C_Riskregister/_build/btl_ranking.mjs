/**
 * Join one BTL run to the public register without changing its source ranking.
 * A BTL score orders relative likelihood; it is not an event probability.
 * Node and chart exposure counts describe mappings, never combined probability.
 * Only explicit node IDs in `affects` are mapped. Chart mentions and abbreviated
 * ranges are not expanded into inferred downstream nodes.
 */
function createRankingModel(risks, snapshot, proc = {}) {
  const fail = message => { throw new Error(`Invalid BTL ranking: ${message}`); };
  const isId = value => typeof value === 'string' && value.trim() === value && value.length > 0;
  if (!Array.isArray(risks)) fail('risks must be an array');

  const risksById = new Map();
  for (const risk of risks) {
    if (!risk || !isId(risk.risk_id)) fail('local risk is missing a valid risk_id');
    if (risksById.has(risk.risk_id)) fail(`duplicate local risk_id ${risk.risk_id}`);
    risksById.set(risk.risk_id, risk);
  }

  if (!proc || typeof proc !== 'object' || Array.isArray(proc)) fail('proc must be a chart object');
  const processNodes = new Map();
  for (const [chartKey, chart] of Object.entries(proc)) {
    if (!chart || !Array.isArray(chart.nodes)) fail(`chart ${chartKey} is missing nodes`);
    for (const node of chart.nodes) {
      if (!node || !isId(node.id)) fail(`chart ${chartKey} has an invalid node ID`);
      if (processNodes.has(node.id)) fail(`duplicate process node ${node.id}`);
      processNodes.set(node.id, { node, chartKey });
    }
  }

  let run = null;
  let entries = [];
  if (snapshot != null) {
    if (typeof snapshot !== 'object' || Array.isArray(snapshot)) fail('snapshot must be an object');
    if (!snapshot.run || !isId(snapshot.run.id)) fail('run.id is required');
    if (!Array.isArray(snapshot.entries)) fail('entries must be an array');
    run = snapshot.run;
    const seenRiskIds = new Set();
    const seenSourceIds = new Set();
    const seenRanks = new Set();
    entries = snapshot.entries.map(source => {
      if (!source || typeof source !== 'object') fail('entry must be an object');
      if (!isId(source.riskId)) fail('entry is missing a valid riskId');
      if (!risksById.has(source.riskId)) fail(`riskId ${source.riskId} is missing from the local register`);
      if (seenRiskIds.has(source.riskId)) fail(`duplicate riskId ${source.riskId}`);
      if (!isId(source.sourceRiskId)) fail(`entry ${source.riskId} is missing a valid sourceRiskId`);
      if (seenSourceIds.has(source.sourceRiskId)) fail(`duplicate sourceRiskId ${source.sourceRiskId}`);
      if (!Number.isSafeInteger(source.rank) || source.rank < 1) fail(`entry ${source.riskId} has an invalid rank`);
      if (seenRanks.has(source.rank)) fail(`duplicate source rank ${source.rank}`);
      if (typeof source.score !== 'number' || !Number.isFinite(source.score)) fail(`entry ${source.riskId} has an invalid score`);
      seenRiskIds.add(source.riskId);
      seenSourceIds.add(source.sourceRiskId);
      seenRanks.add(source.rank);
      return { ...source, risk: risksById.get(source.riskId) };
    });
    // The source rank is authoritative. Reject incompatible scores instead of
    // silently publishing a different order from the run being cited.
    entries.sort((a, b) => a.rank - b.rank || a.riskId.localeCompare(b.riskId));
    for (let index = 1; index < entries.length; index += 1) {
      if (entries[index].score > entries[index - 1].score) {
        fail(`score order disagrees with source ranks ${entries[index - 1].rank} and ${entries[index].rank}`);
      }
    }
  }

  entries = entries.map((entry, index) => {
    const directNodeIds = processNodes.has(entry.risk.node_id) ? [entry.risk.node_id] : [];
    const mentioned = String(entry.risk.affects || '').match(/\bB\d{2}-[A-Z0-9]+\b/g) || [];
    const affectedNodeIds = [...new Set(mentioned)]
      .filter(id => processNodes.has(id) && !directNodeIds.includes(id));
    return {
      ...entry,
      position: index + 1,
      isTop: index < 50,
      directNodeIds,
      affectedNodeIds,
      nodeIds: [...directNodeIds, ...affectedNodeIds],
    };
  });
  const byRiskId = new Map(entries.map(entry => [entry.riskId, entry]));
  const topEntries = entries.slice(0, 50);
  const topRiskIds = new Set(topEntries.map(entry => entry.riskId));

  function emptyExposure(fields) {
    return {
      ...fields,
      entries: [], directEntries: [], affectedEntries: [],
      riskIds: new Set(), directRiskIds: new Set(), affectedRiskIds: new Set(),
    };
  }

  function addExposure(exposure, entry, relation) {
    if (!exposure.riskIds.has(entry.riskId)) {
      exposure.riskIds.add(entry.riskId);
      exposure.entries.push(entry);
    }
    const ids = relation === 'direct' ? exposure.directRiskIds : exposure.affectedRiskIds;
    const rows = relation === 'direct' ? exposure.directEntries : exposure.affectedEntries;
    if (!ids.has(entry.riskId)) {
      ids.add(entry.riskId);
      rows.push(entry);
    }
  }

  function finishExposure(exposure) {
    exposure.topEntries = exposure.entries.filter(entry => entry.isTop);
    exposure.topDirectEntries = exposure.directEntries.filter(entry => entry.isTop);
    exposure.topAffectedEntries = exposure.affectedEntries.filter(entry => entry.isTop);
    exposure.topRiskIds = new Set(exposure.topEntries.map(entry => entry.riskId));
    exposure.topDirectRiskIds = new Set(exposure.topDirectEntries.map(entry => entry.riskId));
    exposure.topAffectedRiskIds = new Set(exposure.topAffectedEntries.map(entry => entry.riskId));
    exposure.count = exposure.entries.length;
    exposure.topRiskCount = exposure.topEntries.length;
    exposure.directCount = exposure.directEntries.length;
    exposure.affectedCount = exposure.affectedEntries.length;
    exposure.topDirectCount = exposure.topDirectEntries.length;
    exposure.topAffectedCount = exposure.topAffectedEntries.length;
    exposure.bestRank = exposure.entries[0]?.rank ?? null;
    exposure.bestPosition = exposure.entries[0]?.position ?? null;
    exposure.bestDirectRank = exposure.directEntries[0]?.rank ?? null;
    exposure.bestAffectedRank = exposure.affectedEntries[0]?.rank ?? null;
    exposure.bestDirectPosition = exposure.directEntries[0]?.position ?? null;
    exposure.bestAffectedPosition = exposure.affectedEntries[0]?.position ?? null;
    return exposure;
  }

  const nodeExposure = new Map();
  const chartExposure = new Map(Object.entries(proc).map(([chartKey, chart]) => [chartKey,
    emptyExposure({
      chartKey, chart,
      nodeIds: new Set(), topNodeIds: new Set(),
      directNodeIds: new Set(), affectedNodeIds: new Set(),
      topDirectNodeIds: new Set(), topAffectedNodeIds: new Set(),
    }),
  ]));
  for (const entry of entries) {
    for (const relation of ['direct', 'affected']) {
      const ids = relation === 'direct' ? entry.directNodeIds : entry.affectedNodeIds;
      for (const nodeId of ids) {
        const { node, chartKey } = processNodes.get(nodeId);
        if (!nodeExposure.has(nodeId)) nodeExposure.set(nodeId, emptyExposure({ nodeId, node, chartKey }));
        addExposure(nodeExposure.get(nodeId), entry, relation);
        const chart = chartExposure.get(chartKey);
        addExposure(chart, entry, relation);
        chart.nodeIds.add(nodeId);
        chart[relation === 'direct' ? 'directNodeIds' : 'affectedNodeIds'].add(nodeId);
        if (entry.isTop) {
          chart.topNodeIds.add(nodeId);
          chart[relation === 'direct' ? 'topDirectNodeIds' : 'topAffectedNodeIds'].add(nodeId);
        }
      }
    }
  }
  for (const exposure of nodeExposure.values()) finishExposure(exposure);
  for (const exposure of chartExposure.values()) {
    finishExposure(exposure);
    exposure.nodeCount = exposure.nodeIds.size;
    exposure.topNodeCount = exposure.topNodeIds.size;
    exposure.directNodeCount = exposure.directNodeIds.size;
    exposure.affectedNodeCount = exposure.affectedNodeIds.size;
    exposure.topDirectNodeCount = exposure.topDirectNodeIds.size;
    exposure.topAffectedNodeCount = exposure.topAffectedNodeIds.size;
  }

  return {
    run, entries, byRiskId, topEntries, topRiskIds,
    rankedCount: entries.length,
    unranked: risks.filter(risk => !byRiskId.has(risk.risk_id)),
    nodeExposure, chartExposure,
  };
}

export { createRankingModel };

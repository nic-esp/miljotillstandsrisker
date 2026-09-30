import { createHash } from 'node:crypto';
import { triggerFactors, consequences } from './risk_fields.mjs';

const ROLES = new Set(['prevention', 'monitoring', 'consequence_reduction', 'combined', 'unspecified']);
const unique = values => [...new Set(values)].sort();
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const requireText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be nonempty text`);
  return value;
};
const roleOf = role => {
  if (!ROLES.has(role)) throw new Error(`Unknown control role: ${role}`);
  return role;
};

function sourceControlTitle(mitigation) {
  const text = mitigation.replace(/\s+/gu, ' ').trim();
  let depth = 0, end = text.length;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '(') depth++;
    else if (text[index] === ')') depth = Math.max(0, depth - 1);
    if (depth) continue;
    if (text[index] === ';' || (/[.!?]/u.test(text[index]) && /^\s+[A-ZÅÄÖ]/u.test(text.slice(index + 1)) &&
      !/(?:t\.ex|bl\.a|m\.m|kap|jfr|ca|nr)$/iu.test(text.slice(0, index)))) {
      end = index;
      break;
    }
  }
  const first = text.slice(0, end).replace(/[.!?;:,]+$/u, '').trim();
  if (first.length <= 110) return first;
  const cut = first.slice(0, 109);
  const wordEnd = cut.lastIndexOf(' ');
  return (wordEnd > 60 ? cut.slice(0, wordEnd) : cut).replace(/[.!?;:,]+$/u, '').trimEnd() + '…';
}

/** IDs survive risk/branch reordering. Wording changes intentionally produce a new occurrence. */
export function occurrenceId(riskId, kind, text) {
  return `O-${kind}-${hash(JSON.stringify([riskId, kind, text]))}`;
}

/**
 * Produce one immutable publication snapshot. Curations contain explicit selectors, never
 * similarity rules. A concept has no authority to extend a control's target coverage.
 */
export function createExplorationData(risks, curations = {}) {
  if (!Array.isArray(risks)) throw new Error('risks must be an array');
  const riskById = new Map();
  const occurrences = [];
  const occurrenceById = new Map();
  const allIds = new Set();
  const claimId = id => {
    requireText(id, 'id');
    if (allIds.has(id)) throw new Error(`Duplicate ID: ${id}`);
    allIds.add(id);
    return id;
  };
  for (const risk of risks) {
    const id = requireText(risk.risk_id, 'risk_id');
    if (riskById.has(id)) throw new Error(`Duplicate risk ID: ${id}`);
    claimId(id);
    riskById.set(id, risk);
    for (const [kind, items] of [['cause', triggerFactors(risk)], ['effect', consequences(risk)]]) {
      for (const item of items) {
        const text = requireText(item.text, `${id} ${kind}`);
        const occurrence = { id: claimId(occurrenceId(id, kind, text)), riskId: id, kind, text,
          basis: item.basis, source_refs: [...item.source_refs] };
        occurrences.push(occurrence);
        occurrenceById.set(occurrence.id, occurrence);
      }
    }
  }
  const riskFor = id => {
    const risk = riskById.get(id);
    if (!risk) throw new Error(`Unknown risk: ${id}`);
    return risk;
  };
  const resolveOccurrence = (selector, expectedKind) => {
    riskFor(selector.riskId);
    const kind = selector.kind || expectedKind;
    if (kind !== 'cause' && kind !== 'effect') throw new Error(`Invalid occurrence kind: ${kind}`);
    if (expectedKind && kind !== expectedKind) throw new Error(`Mismatched occurrence kind: ${kind}`);
    const id = selector.occurrenceId || selector.targetId || occurrenceId(selector.riskId, kind, requireText(selector.text, 'occurrence text'));
    const item = occurrenceById.get(id);
    if (!item) throw new Error(`Unknown occurrence: ${id}`);
    if (item.riskId !== selector.riskId || item.kind !== kind) throw new Error(`Mismatched occurrence ownership: ${id}`);
    if (selector.text && selector.text !== item.text) throw new Error(`Mismatched occurrence text: ${id}`);
    return item;
  };
  const controls = risks.filter(r => typeof r.mitigation === 'string' && r.mitigation.trim()).map(risk => {
    const id = claimId(`C-SRC-${risk.risk_id}`);
    return { id, title: sourceControlTitle(risk.mitigation), description: risk.mitigation,
      kind: 'source', basis: 'register', reviewStatus: 'source-import', role: 'unspecified',
      riskIds: [risk.risk_id], sourceRiskIds: [risk.risk_id], chartKeys: [risk.chart_key],
      sourceTexts: [{ riskId: risk.risk_id, text: risk.mitigation, source_refs: [...(risk.source_refs || [])] }],
      targets: [{ id: claimId(`T-${hash(`${id}|event|${risk.risk_id}`)}`), riskId: risk.risk_id,
        type: 'event', targetId: risk.risk_id, role: 'unspecified', basis: 'register',
        rationale: 'Riskregistrets ursprungliga motåtgärdstext. Någon särskild gren eller effektstorlek är inte angiven.' }],
    };
  });
  for (const prepared of curations.controls || []) {
    const id = claimId(prepared.id);
    const sourceTexts = (prepared.sources || []).map(source => {
      const risk = riskFor(source.riskId);
      const text = requireText(source.excerpt, `${id} source excerpt`);
      if (!risk.mitigation?.includes(text)) throw new Error(`Source excerpt is not present in ${source.riskId}: ${id}`);
      return { riskId: source.riskId, text, source_refs: [...(risk.source_refs || [])] };
    });
    if (!sourceTexts.length) throw new Error(`Control lacks source excerpts: ${id}`);
    const sourceRiskIds = unique(sourceTexts.map(source => source.riskId));
    if (sourceTexts.length !== sourceRiskIds.length) throw new Error(`Duplicate control source risk: ${id}`);
    const seenTargets = new Set();
    const targets = (prepared.targets || []).map(target => {
      riskFor(target.riskId);
      if (!sourceRiskIds.includes(target.riskId)) throw new Error(`Target has no source mitigation: ${id} / ${target.riskId}`);
      const type = target.type;
      if (!['cause', 'event', 'effect'].includes(type)) throw new Error(`Invalid target type: ${type}`);
      const targetId = type === 'event' ? (target.targetId || target.riskId) : resolveOccurrence(target, type).id;
      if (type === 'event' && targetId !== target.riskId) throw new Error(`Mismatched event ownership: ${targetId}`);
      const key = `${type}|${targetId}`;
      if (seenTargets.has(key)) throw new Error(`Duplicate target: ${id} / ${key}`);
      seenTargets.add(key);
      return { id: claimId(`T-${hash(`${id}|${key}`)}`), riskId: target.riskId, type, targetId,
        role: roleOf(target.role || prepared.role || 'unspecified'), basis: 'analysis',
        rationale: requireText(target.rationale, `${id} target rationale`) };
    });
    if (!targets.length) throw new Error(`Control lacks explicit targets: ${id}`);
    const riskIds = unique(targets.map(target => target.riskId));
    if (sourceRiskIds.some(sourceId => !riskIds.includes(sourceId))) throw new Error(`Control source without explicit target: ${id}`);
    const roles = unique(targets.map(target => target.role));
    controls.push({ id, title: requireText(prepared.title, `${id} title`),
      description: requireText(prepared.description, `${id} description`), kind: 'shared', basis: 'analysis',
      reviewStatus: 'analytical-grouping', role: roles.length === 1 ? roles[0] : 'combined',
      riskIds, sourceRiskIds, chartKeys: unique(riskIds.map(riskId => riskFor(riskId).chart_key)),
      sourceTexts, targets: targets.sort((a, b) => a.id.localeCompare(b.id)),
      rationale: requireText(prepared.rationale, `${id} rationale`) });
  }
  const exactGroups = new Map();
  for (const occurrence of occurrences) {
    const key = JSON.stringify([occurrence.kind, occurrence.text]);
    if (!exactGroups.has(key)) exactGroups.set(key, []);
    exactGroups.get(key).push(occurrence);
  }
  const concepts = [];
  for (const [key, members] of exactGroups) {
    const riskIds = unique(members.map(item => item.riskId));
    if (riskIds.length < 2) continue;
    concepts.push({ id: claimId(`K-EXACT-${hash(key)}`), kind: members[0].kind, label: members[0].text,
      matchType: 'exact', basis: 'register', reviewStatus: 'exact-text',
      occurrenceIds: members.map(item => item.id).sort(), riskIds,
      rationale: 'Samma ordalydelse i flera risker. Varje förekomst behåller sin egen källstatus; detta visar inte statistiskt beroende.' });
  }
  for (const prepared of curations.concepts || []) {
    const id = claimId(prepared.id);
    if (!['cause', 'effect'].includes(prepared.kind)) throw new Error(`Invalid concept kind: ${prepared.kind}`);
    const members = (prepared.members || []).map(selector => resolveOccurrence(selector, prepared.kind));
    if (unique(members.map(item => item.id)).length !== members.length) throw new Error(`Duplicate concept member: ${id}`);
    const riskIds = unique(members.map(item => item.riskId));
    if (riskIds.length < 2) throw new Error(`Shared concept needs at least two risks: ${id}`);
    concepts.push({ id, kind: prepared.kind, label: requireText(prepared.label, `${id} label`),
      matchType: 'semantic', basis: 'analysis', reviewStatus: 'analytical-grouping',
      occurrenceIds: members.map(item => item.id).sort(), riskIds,
      rationale: requireText(prepared.rationale, `${id} rationale`) });
  }
  const sorted = items => items.sort((a, b) => a.id.localeCompare(b.id));
  return { version: 1, controls: sorted(controls), occurrences: sorted(occurrences), concepts: sorted(concepts),
    metadata: {
      riskCount: risks.length, sourceControlCount: controls.filter(c => c.kind === 'source').length,
      sharedControlCount: controls.filter(c => c.kind === 'shared').length,
      occurrenceCount: occurrences.length, exactConceptCount: concepts.filter(c => c.matchType === 'exact').length,
      semanticConceptCount: concepts.filter(c => c.matchType === 'semantic').length,
      sharedControlRiskCount: unique(controls.filter(c => c.kind === 'shared').flatMap(c => c.riskIds)).length,
      sharedCurationComplete: false,
      sharedCurationScope: 'Sammanförda åtgärder och preciserade mål omfattar ett urval av registret. Avsaknad av en sådan koppling betyder inte att en motåtgärd saknas; varje ursprunglig åtgärdsbeskrivning finns kvar.',
      sourceControlScope: 'Ursprungliga åtgärdsbeskrivningar är kopplade till sin riskhändelse på övergripande nivå. Kopplingen anger varken en särskild orsak eller konsekvens, en förebyggande roll eller en uppmätt effekt.',
      curationVersion: curations.version || null,
      curationBasis: 'Analytisk sammanställning av uttryckliga registertexter. Ingen uppmätt effekt eller mänsklig sakgranskning är registrerad.',
      coverageDefinition: 'Antal olika risk-ID:n med uttrycklig målkoppling. Likhetsgrupper utökar aldrig åtgärdens omfattning.',
    } };
}

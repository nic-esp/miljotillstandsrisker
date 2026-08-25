const ITEM_BASES = new Set(['source', 'analysis']);

function normalizeRiskItems(risk, field, legacyField) {
  const items = risk?.[field];
  if (Array.isArray(items) && items.length) {
    return items.map(item => ({
      text: String(item?.text ?? '').trim(),
      basis: ITEM_BASES.has(item?.basis) ? item.basis : 'analysis',
      source_refs: Array.isArray(item?.source_refs) ? item.source_refs.map(String) : [],
    }));
  }
  const fallback = String(risk?.[legacyField] ?? '').trim();
  return fallback ? [{ text: fallback, basis: 'analysis', source_refs: [] }] : [];
}

function triggerFactors(risk) {
  return normalizeRiskItems(risk, 'trigger_factors', 'trigger');
}

function consequences(risk) {
  return normalizeRiskItems(risk, 'consequences', 'impact');
}

function bowTie(risk) {
  return {
    causes: triggerFactors(risk),
    event: { rubrik: String(risk?.title ?? '').trim() },
    effects: consequences(risk),
  };
}

function riskItemText(items) {
  return items.map(item => item.text).join(' ');
}

function readableRiskItems(items) {
  return items.map((item, index) => {
    const evidence = item.basis === 'source'
      ? `Källförankrad premiss: ${item.source_refs.join(', ')}`
      : 'Analytisk bedömning';
    return `${index + 1}. ${item.text} [${evidence}]`;
  }).join('\r\n');
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const RISK_CSV_HEADER = Object.freeze([
  'risk_id',
  'node_id',
  'delprocess',
  'nod',
  'rubrik',
  'kategori',
  'ursprung',
  'beskrivning',
  'motivering',
  'drabbar',
  'atgarder',
  'kallor',
  'scenario',
  'bow_tie_json',
]);

const RISK_ITEM_CSV_HEADER = Object.freeze([
  'item_id',
  'risk_id',
  'node_id',
  'chart_key',
  'delprocess',
  'rubrik',
  'posttyp',
  'ordning',
  'text',
  'evidens',
  'kallor',
  'kallor_json',
]);

function riskCsvRow(risk, chartNames = {}) {
  return [
    risk.risk_id,
    risk.node_id,
    chartNames[risk.chart_key] || risk.chart_key,
    risk.node_label,
    risk.title,
    risk.category,
    risk.origin,
    risk.description,
    risk.motivation,
    risk.affects,
    risk.mitigation,
    risk.source_refs.join(' | '),
    risk.scenario_tags,
    JSON.stringify(bowTie(risk)),
  ];
}

function serializeCsv(header, rows, { bom = true } = {}) {
  const lines = [header, ...rows].map(row => row.map(csvCell).join(';'));
  return `${bom ? '\uFEFF' : ''}${lines.join('\r\n')}`;
}

function serializeRiskCsv(risks, chartNames = {}, options = {}) {
  return serializeCsv(RISK_CSV_HEADER, risks.map(risk => riskCsvRow(risk, chartNames)), options);
}

function riskItemCsvRows(risk, chartNames = {}) {
  const common = [
    risk.risk_id,
    risk.node_id,
    risk.chart_key,
    chartNames[risk.chart_key] || risk.chart_key,
    risk.title,
  ];
  return [
    ...triggerFactors(risk).map((item, index) => [
      `${risk.risk_id}:trigger:${String(index + 1).padStart(2, '0')}`,
      ...common, 'utlösande faktor', index + 1, item.text, item.basis, item.source_refs.join(' | '), JSON.stringify(item.source_refs),
    ]),
    ...consequences(risk).map((item, index) => [
      `${risk.risk_id}:consequence:${String(index + 1).padStart(2, '0')}`,
      ...common, 'konsekvens', index + 1, item.text, item.basis, item.source_refs.join(' | '), JSON.stringify(item.source_refs),
    ]),
  ];
}

function serializeRiskItemCsv(risks, chartNames = {}, options = {}) {
  return serializeCsv(RISK_ITEM_CSV_HEADER, risks.flatMap(risk => riskItemCsvRows(risk, chartNames)), options);
}

export {
  RISK_CSV_HEADER,
  RISK_ITEM_CSV_HEADER,
  bowTie,
  consequences,
  csvCell,
  normalizeRiskItems,
  readableRiskItems,
  riskCsvRow,
  riskItemText,
  riskItemCsvRows,
  serializeCsv,
  serializeRiskCsv,
  serializeRiskItemCsv,
  triggerFactors,
};

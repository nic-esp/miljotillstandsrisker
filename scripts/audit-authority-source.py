#!/usr/bin/env python3
"""Read-only structural audit of user-supplied authority-control source files.

Usage: python3 scripts/audit-authority-source.py [--source-dir /path/to/source/directory]
Does not validate legal claims, efficacy, or implementation status.
"""
import csv
import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', nargs='?', type=Path, help='Optional source-directory override')
parser.add_argument('--source-dir', type=Path, help='Directory containing the three supplied files')
arguments = parser.parse_args()
if arguments.directory and arguments.source_dir:
    parser.error('Specify either the positional directory or --source-dir, not both')
SOURCE = arguments.source_dir or arguments.directory or ROOT / 'Artefakt_C_Riskregister' / '_build' / 'authority-inputs'


def csv_rows(path):
    with path.open(encoding='utf-8-sig', newline='') as handle:
        return list(csv.DictReader(handle, delimiter=';'))


links = csv_rows(SOURCE / 'myndighetskontroller_riskkopplingar.csv')
assessments = csv_rows(SOURCE / 'atgardsforslag_bedomning.csv')
risks = json.loads((ROOT / 'Artefakt_C_Riskregister/Artefakt_C_riskregister.json').read_text())
items = csv_rows(ROOT / 'Artefakt_C_Riskregister/mcp-server/data/riskregister-items.csv')
node_groups = json.loads((ROOT / 'Artefakt_C_Riskregister/_build/mappable_nodes.json').read_text())
nodes = {n['node_id']: n for group in node_groups.values() for n in group}
risk_by_id = {r['risk_id']: r for r in risks}
item_by_id = {r['item_id']: r for r in items}
assessment_by_id = {r['risk_id']: r for r in assessments}
errors = []
checks = Counter()


def check(condition, category, detail):
    checks[category] += 1
    if not condition:
        errors.append({'check': category, 'detail': detail})


for label, rows, field in [('links', links, 'koppling_id'), ('assessments', assessments, 'risk_id'), ('items', items, 'item_id')]:
    check(len(rows) == len({r[field] for r in rows}), 'unique_identifiers', label)
    check(all(None not in r and all(v is not None for v in r.values()) for r in rows), 'csv_row_width', label)
check({r['risk_id'] for r in assessments} == set(risk_by_id), 'complete_assessment_coverage', 'Risk ID sets')
check(len({(r['kontroll_id'], r['malpost_id']) for r in links}) == len(links), 'unique_control_target_pairs', 'Control/target pairs')

for row in items:
    risk = risk_by_id.get(row['risk_id'])
    check(risk is not None, 'canonical_item_risk', row['item_id'])
    if risk is None:
        continue
    kind = 'trigger' if row['posttyp'] == 'utlösande faktor' else 'consequence'
    source = risk['trigger_factors' if kind == 'trigger' else 'consequences'][int(row['ordning']) - 1]
    expected_id = f"{risk['risk_id']}:{kind}:{int(row['ordning']):02}"
    check(row['item_id'] == expected_id, 'canonical_item_id_order', row['item_id'])
    check(row['text'] == source['text'], 'canonical_item_text', row['item_id'])

relation_sets = defaultdict(lambda: defaultdict(set))
for row in links:
    rid = row['risk_id']
    risk = risk_by_id.get(rid)
    item = item_by_id.get(row['malpost_id'])
    node = nodes.get(row['nod_id'])
    check(risk is not None and item is not None and node is not None, 'link_references', row['koppling_id'])
    if risk is None or item is None or node is None:
        continue
    for supplied, canonical in [('risk', 'title'), ('process_id', 'chart_key'), ('nod_id', 'node_id'), ('nod', 'node_label'), ('befintligt_atgardsforslag', 'mitigation')]:
        check(row[supplied] == risk[canonical], 'link_risk_' + canonical, row['koppling_id'])
    for supplied, canonical in [('risk_id', 'risk_id'), ('process_id', 'chart_key'), ('process', 'delprocess'), ('nod_id', 'node_id'), ('malpost_typ', 'posttyp'), ('malpost_ordning', 'ordning'), ('malpost_text', 'text'), ('malpost_evidens', 'evidens'), ('malpost_kallor', 'kallor')]:
        check(row[supplied] == item[canonical], 'link_item_' + canonical, row['koppling_id'])
    check(row['process_id'] == node['chart_key'] and row['nod'] == node['label'], 'link_node_reference', row['koppling_id'])
    check(row['atgardsreferens'] == rid + ':mitigation', 'derived_mitigation_reference', row['koppling_id'])
    check(row['koppling_id'] == row['kontroll_id'] + '__' + row['malpost_id'], 'stable_relation_id', row['koppling_id'])
    check(row['atgardsbedomning'] == assessment_by_id[rid]['bedomning'], 'assessment_label_consistency', row['koppling_id'])
    relation = row['kontrollens_relation_till_atgardsforslaget']
    category = 'adapted' if relation.startswith('Anpassning av befintligt') else 'independent'
    relation_sets[rid][category].add(row['kontroll_id'])
    check((row['malpost_typ'] == 'konsekvens') == (row['mitigeringsrelation'] == 'Begränsar följd'), 'target_relation_type', row['koppling_id'])

for row in assessments:
    rid = row['risk_id']
    risk = risk_by_id.get(rid)
    if risk is None:
        continue
    for supplied, canonical in [('risk', 'title'), ('process_id', 'chart_key'), ('nod_id', 'node_id'), ('nod', 'node_label'), ('befintligt_atgardsforslag', 'mitigation')]:
        check(row[supplied] == risk[canonical], 'assessment_risk_' + canonical, rid)
    check(row['atgardsreferens'] == rid + ':mitigation', 'assessment_derived_reference', rid)
    for field, category in [('anpassade_kontroller_med_riskkoppling', 'adapted'), ('sjalvstandiga_kontroller_for_samma_risk', 'independent')]:
        supplied = {v.strip() for v in row[field].split('|') if v.strip()}
        check(supplied == relation_sets[rid][category], 'assessment_relation_ids_' + category, rid)

groups = defaultdict(list)
for row in links:
    groups[row['kontroll_id']].append(row)
control_fields = ['kontroll', 'scenario', 'kontrollbeskrivning', 'ansvarsgrans', 'rattsligt_stod', 'matetal', 'verifikationsunderlag', 's0_s1_skillnad', 'utlosare_frekvens', 'kontrollagare', 'exponering', 'dubbelrakning', 'mandatstatus', 'kontrollstatus', 'granskningsstatus', 'kallor_mandat', 'verifieringsdatum']
variability = {}
for control, rows in groups.items():
    varied = {field: len({r[field] for r in rows}) for field in control_fields if len({r[field] for r in rows}) > 1}
    if varied:
        variability[control] = varied
    check(len({r['scenario'] for r in rows}) == 1, 'control_single_scenario', control)

scenario_counts = {}
for scenario in sorted({r['scenario'] for r in links}):
    selected = [r for r in links if r['scenario'] == scenario]
    scenario_counts[scenario] = {'controls': len({r['kontroll_id'] for r in selected}), 'links': len(selected), 'risks': len({r['risk_id'] for r in selected}), 'nodes': len({r['nod_id'] for r in selected}), 'targetItems': len({r['malpost_id'] for r in selected})}

report = {
    'scope': 'Read-only exact-reference and data-structure audit; supplied legal and effect claims are not independently verified.',
    'sourceHashes': {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() for name in ['lasanvisning_och_kallor.txt', 'myndighetskontroller_riskkopplingar.csv', 'atgardsforslag_bedomning.csv']},
    'counts': {'risksInRegister': len(risks), 'canonicalItems': len(items), 'controls': len(groups), 'links': len(links), 'linkedRisks': len({r['risk_id'] for r in links}), 'linkedNodes': len({r['nod_id'] for r in links}), 'linkedTargetItems': len({r['malpost_id'] for r in links}), 'distinctControlRiskPairs': len({(r['kontroll_id'], r['risk_id']) for r in links}), 'assessments': len(assessments)},
    'scenarios': scenario_counts,
    'assessmentCategories': dict(Counter(r['bedomning'] for r in assessments)),
    'targetTypes': dict(Counter(r['malpost_typ'] for r in links)),
    'relationCategories': dict(Counter(r['kontrollens_relation_till_atgardsforslaget'] for r in links)),
    'controlFieldVariability': variability,
    'checks': dict(checks),
    'errors': errors,
}
print(json.dumps(report, ensure_ascii=False, indent=2))
sys.exit(1 if errors else 0)

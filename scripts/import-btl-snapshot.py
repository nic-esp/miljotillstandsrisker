#!/usr/bin/env python3
"""Join one explicit Cardinal BTL export to the public risk register.

Uses Python's standard library. Raw authenticated exports stay outside the repo.
Fails on ambiguous, duplicate, missing, or inconsistent risk/node mappings.
"""

import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
PRODUCT = ROOT


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def csv_rows(data):
    return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))


def metadata_source_ids(value):
    """Accept source IDs only when a metadata value exactly names a local ID."""
    if isinstance(value, dict):
        return set().union(*(metadata_source_ids(v) for v in value.values())) if value else set()
    if isinstance(value, list):
        return set().union(*(metadata_source_ids(v) for v in value)) if value else set()
    return {value} if isinstance(value, str) and re.fullmatch(r"R-B\d{2}-[A-Z]*\d+-\d+", value) else set()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ranking-csv", required=True, type=Path)
    parser.add_argument("--risk-export-zip", required=True, type=Path)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--run-name", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--verified-at", required=True)
    parser.add_argument("--created-at")
    parser.add_argument("--completed-at")
    parser.add_argument("--experiment-name")
    parser.add_argument("--execution-name")
    parser.add_argument("--calibration-mode", choices=["relative", "anchored", "unknown"], default="unknown")
    parser.add_argument("--calibration-evidence", default="Run diagnostics not supplied; no absolute probability interpretation is made.")
    parser.add_argument("--run-metadata", type=Path, help="Optional verified UI metadata JSON (or an existing snapshot containing run).")
    parser.add_argument("--output", type=Path, default=PRODUCT / "Artefakt_C_Riskregister/_build/btl_snapshot.json")
    args = parser.parse_args()
    run_metadata = json.loads(args.run_metadata.read_text()) if args.run_metadata else {}
    run_metadata = run_metadata.get("run", run_metadata)
    for key, expected in (("id", args.run_id), ("name", args.run_name), ("sourceUrl", args.source_url)):
        require(key not in run_metadata or run_metadata[key] == expected, f"Metadata {key} conflicts with explicit run")

    register_path = PRODUCT / "Artefakt_C_Riskregister/Artefakt_C_riskregister.json"
    register_bytes = register_path.read_bytes()
    local = json.loads(register_bytes)
    local_by_id = {r["risk_id"]: r for r in local}
    require(len(local_by_id) == len(local), "Local risk IDs are duplicated")
    by_title, by_description = defaultdict(list), defaultdict(list)
    for risk in local:
        by_title[risk["title"]].append(risk)
        by_description[risk["description"]].append(risk)

    ranking_bytes = args.ranking_csv.read_bytes()
    ranked = csv_rows(ranking_bytes)
    require(ranked, "Ranking export is empty")
    require(set(ranked[0]) == {"Risk ID", "Score", "Rank", "Uncertainty"}, "Unexpected ranking CSV columns")
    require(args.run_id in args.ranking_csv.name, "Ranking filename does not contain the explicit run ID")
    archive_bytes = args.risk_export_zip.read_bytes()
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        source = csv_rows(archive.read("risks.csv"))
        charts = {r["id"]: r for r in csv_rows(archive.read("org_process_charts.csv"))}
        node_mappings = csv_rows(archive.read("cause_effect_node_mappings.csv"))
        process_mappings = csv_rows(archive.read("risk_process_mappings.csv"))
        archive_readme = archive.read("README.txt").decode("utf-8")
    exported_at_match = re.search(r"^Exported at: (.+)$", archive_readme, re.MULTILINE)
    source_by_id = {r["id"]: r for r in source}
    require(len(source_by_id) == len(source), "Source UUIDs are duplicated")
    nodes_by_risk, charts_by_risk = defaultdict(set), defaultdict(set)
    for row in node_mappings:
        nodes_by_risk[row["riskId"]].add((row["chartId"], row["nodeId"]))
    for row in process_mappings:
        charts_by_risk[row["riskId"]].add(row["chartId"])

    entries, used_local, used_source, matching = [], set(), set(), Counter()
    for row in ranked:
        source_id = row["Risk ID"]
        require(source_id not in used_source, f"Ranked UUID duplicated: {source_id}")
        require(source_id in source_by_id, f"Ranked UUID absent from source export: {source_id}")
        src = source_by_id[source_id]
        metadata_ids = metadata_source_ids(json.loads(src.get("metadata") or "{}")) & set(local_by_id)
        require(len(metadata_ids) <= 1, f"Multiple source metadata IDs: {source_id}")
        if metadata_ids:
            candidates = [local_by_id[next(iter(metadata_ids))]]
            method = "metadata_source_id"
        else:
            candidates = by_title.get(src["name"], [])
            method = "exact_unique_title"
            if len(candidates) > 1:
                candidates = [r for r in candidates if r["description"] == src["description"]]
                method = "exact_title_and_description"
            elif not candidates:
                candidates = by_description.get(src["description"], [])
                method = "exact_unique_description"
        require(len(candidates) == 1, f"No unique match for {source_id}: {src['name']}")
        risk = candidates[0]
        local_id = risk["risk_id"]
        require(local_id not in used_local, f"Multiple source UUIDs map to {local_id}")
        require(src["description"] == risk["description"], f"Description mismatch: {local_id}")
        mapped_nodes = nodes_by_risk[source_id]
        require(mapped_nodes, f"No exported node mapping: {source_id}")
        require(all(node == risk["node_id"] for _, node in mapped_nodes), f"Node mapping mismatch: {local_id}")
        require(all(chart in charts_by_risk[source_id] for chart, _ in mapped_nodes), f"Process mapping mismatch: {local_id}")
        require(all(charts[chart]["name"].startswith(risk["chart_key"] + " ") for chart, _ in mapped_nodes), f"Chart mapping mismatch: {local_id}")
        rank = int(row["Rank"])
        score = float(row["Score"])
        uncertainty = float(row["Uncertainty"]) if row["Uncertainty"] else None
        require(math.isfinite(score) and score >= 0, f"Invalid score: {local_id}")
        require(uncertainty is None or (math.isfinite(uncertainty) and uncertainty >= 0), f"Invalid uncertainty: {local_id}")
        entries.append({
            "riskId": local_id, "sourceRiskId": source_id, "rank": rank,
            "score": score, "uncertainty": uncertainty,
            "nodeId": risk["node_id"], "chartKey": risk["chart_key"],
            "matchMethod": method,
        })
        used_source.add(source_id)
        used_local.add(local_id)
        matching[method] += 1

    entries.sort(key=lambda r: r["rank"])
    require([r["rank"] for r in entries] == list(range(1, len(entries) + 1)), "Ranks must be unique and contiguous from 1")
    require(all(a["score"] >= b["score"] for a, b in zip(entries, entries[1:])), "Scores are not descending with rank")
    require(len(entries) >= 50, "Fewer than 50 risks ranked")
    missing = [{"riskId": r["risk_id"], "title": r["title"], "nodeId": r["node_id"], "chartKey": r["chart_key"], "reason": "absent_from_instance_export_and_run"} for r in local if r["risk_id"] not in used_local]
    snapshot = {
        "schemaVersion": 1,
        "run": {
            "id": args.run_id, "name": args.run_name,
            "createdAt": args.created_at, "completedAt": args.completed_at,
            "experimentName": args.experiment_name, "executionName": args.execution_name,
            "sourceUrl": args.source_url, "verifiedAt": args.verified_at,
            "type": "risk_probability_rank", "dimension": "likelihood", "method": "btl",
            "status": "completed", "latestVerification": "Verified in the authenticated runs UI; the mapping ZIP does not include runs.",
            "calibrationMode": args.calibration_mode,
            "calibrationEvidence": args.calibration_evidence,
            "scoreInterpretation": "Normalized BTL score in the exported ranking; not an absolute event probability.",
            "scoreSum": math.fsum(r["score"] for r in entries),
        },
        "coverage": {
            "localRiskCount": len(local), "sourceRiskCount": len(source),
            "rankedRiskCount": len(entries), "topCount": 50,
            "topNodeCount": len({r["nodeId"] for r in entries[:50]}),
            "topChartCount": len({r["chartKey"] for r in entries[:50]}),
            "unrankedLocalRisks": missing,
            "sourceRisksNotInRun": sorted(set(source_by_id) - used_source),
            "matchMethods": dict(sorted(matching.items())),
            "allRankedDescriptionsAndNodeMappingsVerified": True,
        },
        "provenance": {
            "rankingFilename": args.ranking_csv.name, "rankingSha256": sha256(ranking_bytes),
            "mappingArchiveFilename": args.risk_export_zip.name, "mappingArchiveSha256": sha256(archive_bytes),
            "mappingExportedAt": exported_at_match.group(1) if exported_at_match else None,
            "localRegisterSha256": sha256(register_bytes),
        },
        "entries": entries,
    }
    snapshot["run"].update(run_metadata)
    snapshot["run"]["scoreSum"] = math.fsum(r["score"] for r in entries)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"output": str(args.output), "coverage": snapshot["coverage"], "scoreSum": snapshot["run"]["scoreSum"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

"""
Snapshot dbt test outcomes into Postgres so the API / quality dashboard can
read them.

dbt writes results to dbt/target/run_results.json after `dbt test` (or
`dbt build`). The API runs elsewhere and can't see that file, so this script
parses it, attributes each test to its model (via manifest.json), and appends a
run batch to `dev_marts.dq_test_results`. The dashboard reads the newest batch.

Usage:
    python dq_snapshot.py                    # uses dbt/target/*.json
    python dq_snapshot.py --target-dir dbt/target
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

_repo_root = Path(__file__).parent.parent
load_dotenv(_repo_root / ".env")

# Marts schema the API reads (dbt target `dev` + marts +schema `marts`).
SCHEMA = os.getenv("MARTS_SCHEMA", "dev_marts")

DDL = f"""
CREATE SCHEMA IF NOT EXISTS {SCHEMA};

CREATE TABLE IF NOT EXISTS {SCHEMA}.dq_test_results (
    run_started_at   TIMESTAMPTZ,
    test_name        TEXT,
    model            TEXT,
    status           TEXT,
    failures         INTEGER,
    execution_time   NUMERIC,
    executed_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_dq_run ON {SCHEMA}.dq_test_results (run_started_at);
"""


def load_manifest_index(manifest_path: Path) -> dict[str, dict]:
    """Map each test unique_id to its tested model and a readable name.

    Generic tests get an auto-generated name that dbt hashes when long, so we
    compose a friendly label from the test type + column instead.
    """
    if not manifest_path.exists():
        return {}
    manifest = json.loads(manifest_path.read_text())
    nodes = manifest.get("nodes", {})
    out: dict[str, dict] = {}
    for uid, node in nodes.items():
        if node.get("resource_type") != "test":
            continue
        model = None
        for dep in node.get("depends_on", {}).get("nodes", []):
            if dep.startswith("model."):
                model = nodes.get(dep, {}).get("name", dep.split(".")[-1])
                break
        meta = node.get("test_metadata") or {}
        if meta:
            ttype = meta.get("name", "test")
            col = node.get("column_name")
            name = f"{col} · {ttype}" if col else ttype
        else:
            # Singular test — its file name is already descriptive.
            name = node.get("name", uid.split(".")[-1])
        out[uid] = {"model": model or "—", "name": name}
    return out


def parse_results(results_path: Path, index: dict[str, dict]) -> tuple[str, list[dict]]:
    payload = json.loads(results_path.read_text())
    run_started = payload.get("metadata", {}).get("generated_at")
    rows: list[dict] = []
    for r in payload.get("results", []):
        uid = r.get("unique_id", "")
        if not uid.startswith("test."):
            continue
        info = index.get(uid, {})
        rows.append(
            {
                "test_name": info.get("name") or uid.split(".")[-1],
                "model": info.get("model", "—"),
                "status": r.get("status", "unknown"),
                "failures": int(r.get("failures") or 0),
                "execution_time": float(r.get("execution_time") or 0.0),
            }
        )
    return run_started, rows


def write(engine: Engine, run_started: str, rows: list[dict]) -> None:
    with engine.begin() as conn:
        for stmt in [s.strip() for s in DDL.split(";") if s.strip()]:
            conn.execute(text(stmt))
        # Idempotent per run batch: re-snapshotting the same dbt run replaces it.
        conn.execute(
            text(f"DELETE FROM {SCHEMA}.dq_test_results WHERE run_started_at = :r"),
            {"r": run_started},
        )
        for row in rows:
            conn.execute(
                text(
                    f"""INSERT INTO {SCHEMA}.dq_test_results
                        (run_started_at, test_name, model, status, failures, execution_time)
                        VALUES (:run_started_at, :test_name, :model, :status,
                                :failures, :execution_time)"""
                ),
                {**row, "run_started_at": run_started},
            )


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--target-dir", default=str(_repo_root / "dbt" / "target"))
    args = p.parse_args()

    target = Path(args.target_dir)
    results_path = target / "run_results.json"
    if not results_path.exists():
        print(f"ERROR: {results_path} not found — run `dbt test` first.", file=sys.stderr)
        return 2

    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        print("ERROR: DATABASE_URL is not set.", file=sys.stderr)
        return 2

    index = load_manifest_index(target / "manifest.json")
    run_started, rows = parse_results(results_path, index)
    if not rows:
        print("No test results in run_results.json (was the last command a `dbt test`?).")
        return 0

    engine = create_engine(dsn, pool_pre_ping=True)
    write(engine, run_started, rows)

    passed = sum(1 for r in rows if r["status"] == "pass")
    print(f"Snapshotted {len(rows)} test results ({passed} pass) @ {run_started} → {SCHEMA}.dq_test_results")
    return 0


if __name__ == "__main__":
    sys.exit(main())

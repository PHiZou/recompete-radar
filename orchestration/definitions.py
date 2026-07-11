"""
Dagster orchestration for the Sunlight pipeline.

Wires the whole refresh as a single asset graph so the lineage is visible in
the Dagster UI (the case-study screenshot):

    raw_award_transactions            (ingest + load, per agency)
        └── sunlight_dbt              (dbt build: staging → marts + all tests
                                       surfaced as Dagster asset checks)
                ├── dq_snapshot       (persist dbt test outcomes for /quality)
                └── expiry_alert      (email contracts expiring soon)

Run locally (UI on a non-3000 port so it doesn't clash with the Next.js app):

    cd orchestration
    pip install -r requirements.txt
    dagster dev -f definitions.py --port 3333

The ingest/load/snapshot/alert steps shell out to the pipelines virtualenv so
Dagster's own environment stays thin; dbt runs via dagster-dbt's DbtCliResource.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

from dagster import (
    AssetExecutionContext,
    AssetKey,
    Definitions,
    MaterializeResult,
    ScheduleDefinition,
    asset,
    define_asset_job,
)
from dagster_dbt import (
    DbtCliResource,
    DbtProject,
    dbt_assets,
    get_asset_key_for_model,
)

REPO = Path(__file__).parent.parent

# Prefer the pipelines venv (has polars, sqlalchemy, requests); fall back to the
# current interpreter so the project still imports without that venv present.
_venv_py = REPO / "pipelines" / ".venv" / "bin" / "python"
PIPELINE_PY = str(_venv_py) if _venv_py.exists() else sys.executable

AGENCIES = [
    ("Department of Homeland Security", "070"),
    ("Department of Veterans Affairs", "036"),
]

# Ensure the dbt installed in this interpreter's environment is discoverable even
# when dagster is invoked without activating the venv (prepare_if_dev shells `dbt`).
os.environ["PATH"] = str(Path(sys.executable).parent) + os.pathsep + os.environ.get("PATH", "")

# dbt profile lives at ~/.dbt/profiles.yml (or DBT_PROFILES_DIR); the dbt binary
# is whatever is on PATH, else the one in this venv alongside the interpreter.
DBT_PROFILES_DIR = os.getenv("DBT_PROFILES_DIR", str(Path.home() / ".dbt"))
DBT_EXECUTABLE = shutil.which("dbt") or str(Path(sys.executable).parent / "dbt")
# prepare_if_dev() builds its own DbtCliResource that reads DBT_PROFILES_DIR.
os.environ["DBT_PROFILES_DIR"] = DBT_PROFILES_DIR

dbt_project = DbtProject(project_dir=REPO / "dbt", profiles_dir=DBT_PROFILES_DIR)
dbt_project.prepare_if_dev()


def _run(script: str, *args: str) -> None:
    """Run a pipelines/ script in the pipelines venv, raising on failure."""
    subprocess.run(
        [PIPELINE_PY, str(REPO / "pipelines" / script), *args],
        check=True,
        cwd=REPO,
    )


@asset(
    key=AssetKey(["raw", "award_transactions"]),  # matches the dbt source key
    compute_kind="python",
    group_name="ingest",
    description="Ingest USASpending awards for each agency and load them into Postgres raw.",
)
def raw_award_transactions(context: AssetExecutionContext) -> MaterializeResult:
    for name, code in AGENCIES:
        context.log.info(f"ingest {name} ({code})")
        _run(
            "ingest_usaspending.py",
            "--agency-name", name,
            "--agency-code", code,
            "--naics", "541511", "541512",
            "--fy-start", "2020", "--fy-end", "2025",
        )
    context.log.info("load parquet → Postgres")
    _run("load_to_postgres.py")
    return MaterializeResult(metadata={"agencies": [c for _, c in AGENCIES]})


@dbt_assets(manifest=dbt_project.manifest_path)
def sunlight_dbt(context: AssetExecutionContext, dbt: DbtCliResource):
    # `dbt build` runs models AND tests; dagster-dbt surfaces each test as an
    # asset check attached to the model it guards.
    yield from dbt.cli(["build"], context=context).stream()


@asset(
    deps=[get_asset_key_for_model([sunlight_dbt], "mart_dq_metrics")],
    compute_kind="python",
    group_name="quality",
    description="Snapshot dbt test outcomes into Postgres for the /quality dashboard.",
)
def dq_snapshot(context: AssetExecutionContext) -> None:
    _run("dq_snapshot.py")


@asset(
    deps=[get_asset_key_for_model([sunlight_dbt], "mart_recompete_candidates")],
    compute_kind="python",
    group_name="alerting",
    description="Email a digest of contracts expiring soon (dry-run unless configured).",
)
def expiry_alert(context: AssetExecutionContext) -> None:
    # Default to dry-run so a demo materialize stays green without mail creds.
    # Set SUNLIGHT_ALERT_DRY_RUN=0 (and ALERT_EMAIL_TO) to actually send.
    args = ["--dry-run"] if os.getenv("SUNLIGHT_ALERT_DRY_RUN", "1") != "0" else []
    _run("alerts.py", *args)


sunlight_refresh = define_asset_job("sunlight_refresh", selection="*")

daily_schedule = ScheduleDefinition(
    job=sunlight_refresh,
    cron_schedule="0 6 * * *",  # 06:00 daily
    execution_timezone="America/New_York",
)

defs = Definitions(
    assets=[raw_award_transactions, sunlight_dbt, dq_snapshot, expiry_alert],
    jobs=[sunlight_refresh],
    schedules=[daily_schedule],
    resources={
        "dbt": DbtCliResource(
            project_dir=dbt_project,
            profiles_dir=DBT_PROFILES_DIR,
            dbt_executable=DBT_EXECUTABLE,
        )
    },
)

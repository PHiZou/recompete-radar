# Sunlight orchestration (Dagster)

Turns the manual `ingest → load → dbt → alert` steps into a single, observable
asset graph with a daily schedule and dbt tests surfaced as asset checks.

## Asset graph

```
raw_award_transactions   (ingest USASpending + load Postgres, per agency)
    └── sunlight_dbt      (dbt build — staging → marts; 29 tests as asset checks)
            ├── dq_snapshot   (persist test outcomes → dev_marts.dq_test_results)
            └── expiry_alert  (email contracts expiring within N months)
```

## Run it

```bash
cd orchestration
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# UI on 3333 so it doesn't clash with the Next.js app on 3000
dagster dev -f definitions.py --port 3333
# → http://localhost:3333  (Assets → View lineage for the screenshot)
```

Needs the repo `.env` (`DATABASE_URL`) and the `~/.dbt/profiles.yml` the dbt
project already uses. The ingest/load/snapshot/alert steps shell out to
`../pipelines/.venv`, so set that up first (see the root README).

## Notes

- `expiry_alert` defaults to `--dry-run`; set `SUNLIGHT_ALERT_DRY_RUN=0` (and the
  `ALERT_*` env vars) to actually send.
- The daily schedule (`daily_schedule`, 06:00 America/New_York) is off until you
  start the Dagster daemon. In production a free GitHub Actions cron runs the same
  chain (see `.github/workflows/`); Dagster provides the graph, checks, and local
  scheduling.

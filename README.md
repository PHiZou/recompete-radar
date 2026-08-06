# Sunlight

An end-to-end data product that ingests U.S. federal contracting data, resolves messy vendor entities, and surfaces explainable scores for **recompete likelihood**, **incumbent strength**, and **market concentration** across agencies and NAICS codes.

> Slice: **Department of Homeland Security + Department of Veterans Affairs** × **NAICS 541511/541512** (IT services) × **FY2020–2025**.

Surfaces intelligence that commercial tools (GovWin, Bloomberg Government) charge $20K+/seat/year for — from free public data.

---

## Stack

| Layer | Choice |
|---|---|
| Storage | Postgres (Neon free tier) |
| Transformation | dbt-core (29 tests + source freshness) |
| Ingestion | Python (requests, polars) |
| Orchestration | Dagster (asset graph + dbt asset checks) · GitHub Actions cron (prod) |
| Alerting | Contract-expiry email digest (SendGrid API / SMTP) |
| API | FastAPI |
| Frontend | Next.js 14 + TypeScript + Tailwind (radar + data-quality dashboard) |
| Hosting | Vercel (web) + Neon (DB) + Fly (API) |

---

## Repo layout

```
.
├── apps/web/              # Next.js 14 app router UI (radar + /quality)
├── api/                   # FastAPI service
├── pipelines/             # ingest, load, dq_snapshot, alerts
├── dbt/                   # dbt project (raw → staging → marts, tests, freshness)
├── orchestration/         # Dagster project (asset graph + daily schedule)
├── ci/                    # CI fixtures (tiny raw seed for dbt build)
├── data/
│   ├── raw/               # Local parquet cache, agency=<code>/fy=<yy>/ (gitignored)
│   └── vendor_manual_merges.csv
├── mocks/                 # Static HTML design references
└── .github/workflows/     # ci.yml (dbt build+tests, web typecheck) · ingest.yml (weekly)
```

---

## Quickstart

### 1. Environment

```bash
cp .env.example .env
# Fill in DATABASE_URL once you have a Neon instance
```

### 2. Python pipelines

```bash
cd pipelines
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Pull DHS + VA IT-services awards → data/raw/award_transactions/agency=<code>/fy=<yy>/
python ingest_usaspending.py --agency-name "Department of Homeland Security" \
  --agency-code 070 --naics 541511 541512 --fy-start 2020 --fy-end 2025
python ingest_usaspending.py --agency-name "Department of Veterans Affairs" \
  --agency-code 036 --naics 541511 541512 --fy-start 2020 --fy-end 2025

# Load local parquet into Postgres (dedupes on award_unique_key)
python load_to_postgres.py
```

> **Note:** USASpending's award-summaries download returns one row per award for
> the whole slice and ignores the per-FY `date_range`, so the FY loop re-fetches
> the same awards. The loader dedupes on `award_unique_key` to keep the grain
> correct; each agency is cached and delete-keyed independently.

### 3. dbt

```bash
cd dbt
cp profiles.yml.example ~/.dbt/profiles.yml  # edit as needed
dbt deps
dbt run
dbt test
```

### 4. API

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
# http://localhost:8000/docs
```

### 5. Web

```bash
cd apps/web
npm install
npm run dev
# http://localhost:3000
```

---

## Data model

`(Agency, NAICS, PSC, Time)` is the market cell. Vendors hold share in each cell. Awards are the evidence. All analytical views project from this tuple.

Core entities: `agency`, `vendor` (resolved), `vendor_alias`, `award`, `award_transaction`, `naics_code`, `psc_code`.

---

## Scoring

Every score is transparent SQL with a per-component breakdown surfaced in the UI. No black-box ML.

| Score | Scale | Components |
|---|---|---|
| Recompete likelihood | 0–100 | POP-end proximity · contract type · agency recompete rate · value vs. median · recent POP mods · set-aside changes |
| Incumbent strength | 0–100 | Cumulative $ · win rate · recency · breadth · option-exercise ratio |
| Market HHI | 0–10000 | `SUM((share%)²)` per `(agency, NAICS)` cell |
| White-space | directional | cell $ × 1/HHI × growth × (1 − barrier proxy) |

---

## Orchestration

The `ingest → load → dbt build → snapshot → alert` chain is modeled as a Dagster
asset graph (`orchestration/`), with every dbt test surfaced as a Dagster **asset
check**:

```
raw_award_transactions   (ingest + load, per agency)
    └── sunlight_dbt      (dbt build — 29 tests as asset checks)
            ├── dq_snapshot   (persist outcomes for /quality)
            └── expiry_alert  (email expiring contracts)
```

```bash
cd orchestration && python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
dagster dev -f definitions.py --port 3333   # UI + lineage graph
```

A daily schedule ships in the project; in production a free **GitHub Actions**
cron (`.github/workflows/ingest.yml`) runs the same chain against Neon, and
`ci.yml` runs `dbt build` + the full test suite on every PR against an ephemeral
Postgres.

## Data quality

`dbt` runs 29 schema tests + a singular reconciliation test + source freshness.
`pipelines/dq_snapshot.py` parses `run_results.json` into
`dev_marts.dq_test_results`, and `mart_dq_metrics` tracks row counts, freshness,
null rates, and agency coverage. Both feed the **`/quality`** dashboard
(pass/fail tiles, per-test status, freshness) in the web app.

## Alerting

`pipelines/alerts.py` emails a digest of contracts whose period of performance
ends within `ALERT_EXPIRY_MONTHS`, deduped via `dev_marts.alert_log`. Delivery
uses the SendGrid API when `SENDGRID_API_KEY` is set, else SMTP. `--dry-run`
prints the digest without sending. See `.env.example` for the `ALERT_*` keys.

---

## Phases

- **Phase 0** — Foundation (initial scaffold)
- **Phase 1** — MVP with scored radar + vendor + agency views
- **Phase 2** — SAM.gov opportunities, multi-agency, CI, demo video
- **Phase 3** — Forecast scraping, vehicles, exports

---

## License

MIT — data derived from public U.S. government sources (USASpending.gov, SAM.gov).

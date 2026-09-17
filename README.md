# Sunlight

An end-to-end data product that ingests U.S. federal contracting data, resolves messy vendor entities, and surfaces explainable scores for **recompete likelihood**, **incumbent strength**, and **market concentration** across agencies and NAICS codes.

> MVP slice: **Department of Homeland Security** × **NAICS 541511/541512** (IT services) × **FY2020–2025**.

Surfaces intelligence that commercial tools (GovWin, Bloomberg Government) charge $20K+/seat/year for — from free public data.

---

## Stack

| Layer | Choice |
|---|---|
| Storage | Postgres (Neon free tier) |
| Transformation | dbt-core |
| Ingestion | Python (requests, polars) + GitHub Actions cron |
| API | FastAPI |
| Frontend | Next.js 14 + TypeScript + Tailwind |
| Hosting | Vercel (web) + Neon (DB) + Render/Fly (API) |

---

## Repo layout

```
.
├── apps/web/              # Next.js 14 app router UI
├── api/                   # FastAPI service
├── pipelines/             # Python ingestion + load scripts
├── dbt/                   # dbt project (raw → staging → marts)
├── data/
│   ├── raw/               # Local parquet cache (gitignored)
│   ├── reference/         # NAICS/PSC/agency seed data
│   └── vendor_manual_merges.csv
├── mocks/                 # Static HTML design references
└── .github/workflows/     # Ingest + CI
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

# Pull ~5 years of DHS IT-services awards (~100–300k rows, ~5–15 min)
python ingest_usaspending.py \
  --agency-code 070 \
  --naics 541511 541512 \
  --fy-start 2020 --fy-end 2025

# Load local parquet into Postgres
python load_to_postgres.py
```

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

Both scores come from two small, backtested logistic "scorecards". Every input is a named bucket, each bucket's weight is stored in `dbt/seeds/score_weights.csv`, and the UI shows how much each factor moves the score.

| Score | Scale | Meaning | Factors |
|---|---|---|---|
| Incumbent strength | 0–100 | P(incumbent wins the follow-on) | share of the office's spend on this PSC · number of rival vendors there · incumbent's past awards there · vehicle · sole-source · duration |
| Recompete score | 0–100 | P(follow-on) × (1 − incumbent strength): the chance a **new** vendor wins it | follow-on factors: vehicle · duration · size · pricing |

Timing is not part of either score. Filter on months to POP end instead.

**How the weights are fitted.** USASpending has no predecessor→successor links, so `int_score_backtest` infers them. A follow-on is an award from the same office and PSC starting within −180/+365 days of the end date. All features are point-in-time. `pipelines/fit_scores.py` fits both models and writes the seed. Re-fit after any scope change:

```bash
dbt run -s +int_score_backtest
python pipelines/fit_scores.py        # prints validation, writes the seed
dbt seed && dbt run
```

Validation used a time split: fit on awards that ended before 2021, test on later ones. Retention AUC is **0.84**, versus 0.56 for the old points-based score. Follow-on AUC is 0.64. The same retention model reaches 0.76 on a placebo window 3–5 years out, so part of the signal comes from the matching method. Read the scores as a ranking, not exact odds. Details are in `sql/analysis.sql` §3.

---

## Phases

- **Phase 0** — Foundation (initial scaffold)
- **Phase 1** — MVP with scored radar + vendor + agency views
- **Phase 2** — SAM.gov opportunities, multi-agency, CI, demo video
- **Phase 3** — Forecast scraping, vehicles, exports

---

## License

MIT — data derived from public U.S. government sources (USASpending.gov, SAM.gov).

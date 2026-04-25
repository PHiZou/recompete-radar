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

Every score is transparent SQL with a per-component breakdown surfaced in the UI. No black-box ML.

| Score | Scale | Components |
|---|---|---|
| Recompete likelihood | 0–100 | POP-end proximity · contract type · agency recompete rate · value vs. median · recent POP mods · set-aside changes |
| Incumbent strength | 0–100 | Cumulative $ · win rate · recency · breadth · option-exercise ratio |
| Market HHI | 0–10000 | `SUM((share%)²)` per `(agency, NAICS)` cell |
| White-space | directional | cell $ × 1/HHI × growth × (1 − barrier proxy) |

---

## Phases

- **Phase 0** — Foundation (initial scaffold)
- **Phase 1** — MVP with scored radar + vendor + agency views
- **Phase 2** — SAM.gov opportunities, multi-agency, CI, demo video
- **Phase 3** — Forecast scraping, vehicles, exports

---

## License

MIT — data derived from public U.S. government sources (USASpending.gov, SAM.gov).

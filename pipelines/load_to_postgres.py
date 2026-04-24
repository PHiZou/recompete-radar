"""
Load local parquet files into Postgres raw.award_transactions.

Reads every data/raw/award_transactions/fy=*/*.parquet file and COPYs the rows
into Postgres. Creates the schema + table if missing. Idempotent per FY: each
run truncates and reloads the target table (MVP scale — can switch to merge
semantics in Phase 2).

Usage:
    python load_to_postgres.py                        # load all FYs
    python load_to_postgres.py --fy 2024              # one FY
    python load_to_postgres.py --in-dir ./data/raw/award_transactions
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import polars as pl
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

load_dotenv()

DDL = """
CREATE SCHEMA IF NOT EXISTS raw;

CREATE TABLE IF NOT EXISTS raw.award_transactions (
    award_unique_key                  TEXT,
    piid                              TEXT,
    parent_piid                       TEXT,
    modification_number               TEXT,
    federal_action_obligation         NUMERIC,
    total_dollars_obligated           NUMERIC,
    base_and_exercised_options_value  NUMERIC,
    base_and_all_options_value        NUMERIC,
    action_date                       DATE,
    action_type                       TEXT,
    action_type_description           TEXT,
    pop_start_date                    DATE,
    pop_current_end_date              DATE,
    pop_potential_end_date            DATE,
    awarding_agency_name              TEXT,
    awarding_agency_code              TEXT,
    awarding_sub_agency_name          TEXT,
    awarding_sub_agency_code          TEXT,
    awarding_office_name              TEXT,
    awarding_office_code              TEXT,
    recipient_uei                     TEXT,
    recipient_duns                    TEXT,
    recipient_name                    TEXT,
    recipient_name_raw                TEXT,
    recipient_parent_uei              TEXT,
    recipient_parent_name             TEXT,
    recipient_country_code            TEXT,
    recipient_state_code              TEXT,
    pop_state_code                    TEXT,
    naics_code                        TEXT,
    naics_description                 TEXT,
    psc_code                          TEXT,
    psc_description                   TEXT,
    type_of_contract_pricing          TEXT,
    contract_award_type               TEXT,
    type_of_set_aside                 TEXT,
    type_of_set_aside_code            TEXT,
    number_of_offers_received         INTEGER,
    extent_competed                   TEXT,
    solicitation_procedures           TEXT,
    transaction_description           TEXT,
    fiscal_year                       INTEGER,
    loaded_at                         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_award_tx_agency      ON raw.award_transactions (awarding_agency_code);
CREATE INDEX IF NOT EXISTS ix_award_tx_naics       ON raw.award_transactions (naics_code);
CREATE INDEX IF NOT EXISTS ix_award_tx_uei         ON raw.award_transactions (recipient_uei);
CREATE INDEX IF NOT EXISTS ix_award_tx_piid        ON raw.award_transactions (piid);
CREATE INDEX IF NOT EXISTS ix_award_tx_action_date ON raw.award_transactions (action_date);
"""


def ensure_schema(engine: Engine) -> None:
    with engine.begin() as conn:
        for stmt in [s.strip() for s in DDL.split(";") if s.strip()]:
            conn.execute(text(stmt))


def discover_parquet(in_dir: Path, fy_filter: int | None) -> list[tuple[int, Path]]:
    found: list[tuple[int, Path]] = []
    for fy_dir in sorted(in_dir.glob("fy=*")):
        try:
            fy = int(fy_dir.name.split("=", 1)[1])
        except ValueError:
            continue
        if fy_filter is not None and fy != fy_filter:
            continue
        for pq in sorted(fy_dir.glob("*.parquet")):
            found.append((fy, pq))
    return found


def load_file(engine: Engine, fy: int, path: Path) -> int:
    df = pl.read_parquet(path)
    df = df.with_columns(pl.lit(fy).alias("fiscal_year"))
    pdf = df.to_pandas()
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM raw.award_transactions WHERE fiscal_year = :fy"),
            {"fy": fy},
        )
    pdf.to_sql(
        "award_transactions",
        engine,
        schema="raw",
        if_exists="append",
        index=False,
        chunksize=10_000,
        method="multi",
    )
    return len(pdf)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--in-dir", default="./data/raw/award_transactions")
    p.add_argument("--fy", type=int, default=None, help="Load only this FY")
    args = p.parse_args()

    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        print("ERROR: DATABASE_URL is not set. Copy .env.example → .env and fill it in.", file=sys.stderr)
        return 2

    in_dir = Path(args.in_dir).resolve()
    if not in_dir.exists():
        print(f"ERROR: {in_dir} does not exist. Run ingest_usaspending.py first.", file=sys.stderr)
        return 2

    engine = create_engine(dsn, pool_pre_ping=True)
    ensure_schema(engine)

    files = discover_parquet(in_dir, args.fy)
    if not files:
        print(f"No parquet files found under {in_dir}" + (f" for FY{args.fy}" if args.fy else ""))
        return 0

    print(f"Loading {len(files)} file(s) into raw.award_transactions\n")
    total = 0
    for fy, path in files:
        n = load_file(engine, fy, path)
        print(f"  FY{fy}  {path.name}  {n:,} rows")
        total += n
    print(f"\nDone. {total:,} total rows loaded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

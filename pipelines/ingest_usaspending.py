"""
Ingest USASpending prime award (contract) transactions for a slice of the market.

Uses the USASpending.gov Custom Award Data API (no auth required):
  POST /api/v2/download/awards/   -> returns file_name + status URL
  GET  /api/v2/download/status/   -> poll until "finished"
  GET  <file_url>                 -> download zip of CSVs

Splits the request by fiscal year so each download stays modest and idempotent.

Usage:
    python ingest_usaspending.py \\
        --agency-name "Department of Homeland Security" \\
        --naics 541511 541512 \\
        --fy-start 2020 --fy-end 2025

Outputs: data/raw/award_transactions/fy=YYYY/part-0.parquet
"""

from __future__ import annotations

import argparse
import io
import sys
import time
import zipfile
from pathlib import Path

import polars as pl
import requests
from tqdm import tqdm

BASE = "https://api.usaspending.gov/api/v2"
DOWNLOAD_URL = f"{BASE}/download/awards/"
STATUS_URL = f"{BASE}/download/status/"

POLL_SEC = 10
TIMEOUT_SEC = 1800  # 30 min per FY


def fy_range(fy: int) -> tuple[str, str]:
    """Federal FY runs Oct 1 of (FY−1) through Sep 30 of FY."""
    return f"{fy - 1}-10-01", f"{fy}-09-30"


def request_download(agency_name: str, naics: list[str], fy: int) -> str:
    """Kick off a custom download. Returns the file_name handle for polling."""
    start, end = fy_range(fy)
    body = {
        "filters": {
            "prime_award_types": ["A", "B", "C", "D"],  # contracts only
            "date_type": "action_date",
            "date_range": {"start_date": start, "end_date": end},
            "agencies": [
                {"type": "awarding", "tier": "toptier", "name": agency_name}
            ],
            "naics_codes": naics,
        },
        "columns": [],
        "file_format": "csv",
    }
    r = requests.post(DOWNLOAD_URL, json=body, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "file_name" not in data:
        raise RuntimeError(f"Unexpected response: {data}")
    return data["file_name"]


def poll_until_ready(file_name: str) -> str:
    """Poll status endpoint until the download is finished. Returns file_url."""
    deadline = time.time() + TIMEOUT_SEC
    last_status = None
    while time.time() < deadline:
        r = requests.get(STATUS_URL, params={"file_name": file_name}, timeout=30)
        r.raise_for_status()
        data = r.json()
        status = data.get("status")
        if status != last_status:
            print(f"  status: {status}")
            last_status = status
        if status == "finished":
            return data["file_url"]
        if status == "failed":
            raise RuntimeError(f"Download failed: {data.get('message', data)}")
        time.sleep(POLL_SEC)
    raise TimeoutError(f"Timed out after {TIMEOUT_SEC}s waiting for {file_name}")


def download_and_extract_contracts(url: str, work_dir: Path) -> list[Path]:
    """Stream-download the zip, extract Contracts_*.csv files.

    USASpending's /download/awards/ endpoint names the file
    Contracts_PrimeAwardSummaries_*.csv (not PrimeTransactions), so we
    accept any CSV whose name starts with "Contracts_".
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=600) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        buf = io.BytesIO()
        with tqdm(total=total, unit="B", unit_scale=True, desc="  downloading") as bar:
            for chunk in r.iter_content(chunk_size=64 * 1024):
                buf.write(chunk)
                bar.update(len(chunk))
        buf.seek(0)
        extracted: list[Path] = []
        with zipfile.ZipFile(buf) as zf:
            all_names = zf.namelist()
            print(f"  zip contains: {', '.join(all_names)}")
            for name in all_names:
                if name.startswith("Contracts_") and name.endswith(".csv"):
                    target = work_dir / Path(name).name
                    with zf.open(name) as src, open(target, "wb") as dst:
                        dst.write(src.read())
                    extracted.append(target)
        return extracted


# Canonical column subset. USASpending exports ~250 columns; we keep ~40 that
# drive the data model. Anything not in this map is dropped at staging.
COLUMN_MAP: dict[str, str] = {
    "contract_award_unique_key": "award_unique_key",
    "award_id_piid": "piid",
    "parent_award_id_piid": "parent_piid",
    "federal_action_obligation": "federal_action_obligation",
    "total_dollars_obligated": "total_dollars_obligated",
    "base_and_exercised_options_value": "base_and_exercised_options_value",
    "base_and_all_options_value": "base_and_all_options_value",
    "action_date": "action_date",
    "action_type": "action_type",
    "action_type_description": "action_type_description",
    "period_of_performance_start_date": "pop_start_date",
    "period_of_performance_current_end_date": "pop_current_end_date",
    "period_of_performance_potential_end_date": "pop_potential_end_date",
    "awarding_agency_name": "awarding_agency_name",
    "awarding_agency_code": "awarding_agency_code",
    "awarding_sub_agency_name": "awarding_sub_agency_name",
    "awarding_sub_agency_code": "awarding_sub_agency_code",
    "awarding_office_name": "awarding_office_name",
    "awarding_office_code": "awarding_office_code",
    "recipient_uei": "recipient_uei",
    "recipient_duns": "recipient_duns",
    "recipient_name": "recipient_name",
    "recipient_name_raw": "recipient_name_raw",
    "recipient_parent_uei": "recipient_parent_uei",
    "recipient_parent_name": "recipient_parent_name",
    "recipient_country_code": "recipient_country_code",
    "recipient_state_code": "recipient_state_code",
    "primary_place_of_performance_state_code": "pop_state_code",
    "naics_code": "naics_code",
    "naics_description": "naics_description",
    "product_or_service_code": "psc_code",
    "product_or_service_code_description": "psc_description",
    "type_of_contract_pricing": "type_of_contract_pricing",
    "contract_award_type": "contract_award_type",
    "type_of_set_aside": "type_of_set_aside",
    "type_of_set_aside_code": "type_of_set_aside_code",
    "number_of_offers_received": "number_of_offers_received",
    "extent_competed": "extent_competed",
    "solicitation_procedures": "solicitation_procedures",
    "transaction_description": "transaction_description",
    "modification_number": "modification_number",
}

DATE_COLS = (
    "action_date",
    "pop_start_date",
    "pop_current_end_date",
    "pop_potential_end_date",
)


def normalize(csv_path: Path) -> pl.DataFrame:
    df = pl.read_csv(
        csv_path,
        infer_schema_length=10_000,
        ignore_errors=True,
        null_values=["", "NULL", "null"],
    )
    keep = [c for c in COLUMN_MAP if c in df.columns]
    df = df.select(keep).rename({c: COLUMN_MAP[c] for c in keep})
    for c in DATE_COLS:
        if c in df.columns:
            df = df.with_columns(
                pl.col(c)
                .cast(pl.String)
                .str.strip_chars()
                .replace("", None)
                .str.to_date(format="%Y-%m-%d", strict=False)
                .alias(c)
            )
    return df


def write_parquet(df: pl.DataFrame, out_root: Path, fy: int) -> Path:
    target = out_root / f"fy={fy}" / "part-0.parquet"
    target.parent.mkdir(parents=True, exist_ok=True)
    df.write_parquet(target, compression="zstd")
    return target


def ingest_fy(
    agency: str, naics: list[str], fy: int, out_root: Path, force: bool
) -> None:
    fy_dir = out_root / f"fy={fy}"
    if fy_dir.exists() and any(fy_dir.iterdir()) and not force:
        print(f"→ FY{fy}: exists at {fy_dir}, skip (--force to override)")
        return

    print(f"→ FY{fy}: requesting download…")
    file_name = request_download(agency, naics, fy)
    print(f"  file_name: {file_name}")

    file_url = poll_until_ready(file_name)
    print(f"  ready")

    work = out_root / "_tmp" / f"fy={fy}"
    csvs = download_and_extract_contracts(file_url, work)
    if not csvs:
        print(f"  ! no Contracts_PrimeTransactions CSV in zip for FY{fy}", file=sys.stderr)
        return

    frames = [normalize(p) for p in csvs]
    df = pl.concat(frames, how="diagonal_relaxed") if len(frames) > 1 else frames[0]
    target = write_parquet(df, out_root, fy)
    print(f"  wrote {target}  ({len(df):,} rows)")

    for p in csvs:
        p.unlink(missing_ok=True)
    try:
        work.rmdir()
    except OSError:
        pass


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--agency-name", default="Department of Homeland Security")
    p.add_argument("--naics", nargs="+", default=["541511", "541512"])
    p.add_argument("--fy-start", type=int, default=2020)
    p.add_argument("--fy-end", type=int, default=2025)
    # Default resolves to <repo-root>/data/raw/award_transactions regardless of cwd
    _repo_root = Path(__file__).parent.parent
    p.add_argument("--out-dir", default=str(_repo_root / "data" / "raw" / "award_transactions"))
    p.add_argument("--force", action="store_true")
    args = p.parse_args()

    out_root = Path(args.out_dir).resolve()
    print(f"Agency: {args.agency_name}")
    print(f"NAICS:  {', '.join(args.naics)}")
    print(f"FY:     {args.fy_start}–{args.fy_end}")
    print(f"Out:    {out_root}\n")

    failures: list[int] = []
    for fy in range(args.fy_start, args.fy_end + 1):
        try:
            ingest_fy(args.agency_name, args.naics, fy, out_root, args.force)
        except Exception as e:
            print(f"  ! FY{fy} failed: {e}", file=sys.stderr)
            failures.append(fy)

    print(f"\nDone. {len(failures)} failure(s): {failures or 'none'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

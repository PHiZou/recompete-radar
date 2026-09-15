#!/usr/bin/env bash
#
# Refresh the raw award data for the flagship-agency slice, then it's ready for
# `dbt run`. Reusable by humans and by CI (.github/workflows/refresh-data.yml).
#
# For each agency we request a USASpending custom download. That endpoint
# returns the agency's full all-time award-summary set regardless of the FY
# window, so ONE successful download per agency is complete — we just retry
# across a few FY windows because USASpending's generator times out
# intermittently on larger agencies.
#
# Usage:  PYTHON=.venv/bin/python bash pipelines/refresh.sh
#
set -uo pipefail

PY="${PYTHON:-python}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$HERE/data/raw/award_transactions"
# 541511/541512 = software dev (custom programming, systems design).
# 518210 = data processing/hosting — small but the highest-signal code for data
#   work; its dominant PSC is SUPPORT-MANAGEMENT: DATA COLLECTION.
#
# Deliberately EXCLUDED, each measured on real downloads (2026-08-07) before
# being ruled out — don't re-add without re-measuring:
#   541519 other computer related — BIGGEST trap. Looks like a natural fit, but
#     it is 50.3k of DHS's 62.6k rows (80%) and the PSC mix is IT Components,
#     software licenses, and telecom at ~$530k average: commodity hardware and
#     license resale, not services. Adding it took the 3-agency load from 47k to
#     182k rows to buy mostly hardware resellers.
#   541611 admin/mgmt consulting — 24.7k HHS rows, PSCs generic program-support
#   541618 other mgmt consulting — top PSC is Medicare claims administration
#   541720 R&D social sciences   — health R&D, not data engineering
NAICS="541511 541512 518210"
FY_ATTEMPTS=(2024 2023 2025 2022 2021 2026)

# agency slug -> toptier name. The API filters by TOPTIER only, so there is no
# way to request a single sub-agency: Census comes in as part of Commerce
# (alongside NOAA, NIST, USPTO) and has to be filtered downstream on
# awarding_sub_agency_name.
#
# Chosen for clearance-free ("public trust"/suitability) contracting work:
# HHS, VA, SSA, and Commerce/Census effectively never require a clearance.
# DHS is mixed — CBP/ICE/TSA/USSS/Coast Guard skew toward requiring one, while
# USCIS/FEMA generally do not. DoD stays out: clearance-heavy and far larger.
#
# Treasury added 2026-09-14 after measuring a real download: 7,515 rows, 56%
# IRS (public trust), 69% of rows to VA/MD/DC-registered recipients, median
# award $195k, PSC mix is IT services / programming / business applications.
#
# Deliberately EXCLUDED, measured 2026-09-14:
#   GSA — 17,787 rows, 93% Federal Acquisition Service, i.e. mostly assisted
#     acquisitions and schedule vehicles bought on behalf of OTHER agencies
#     (including DoD), so clearance status can't be read from the awarding
#     agency. Median award is $0 (vehicle/IDV rows) and 2,115 rows are
#     "RADIO TV EQ" totaling $4.2M. Its $72.9B would swamp every other agency
#     in the Radar. Revisit only with funding-agency data and vehicle filtering.
AGENCIES=(
  "dhs:Department of Homeland Security"
  "hhs:Department of Health and Human Services"
  "va:Department of Veterans Affairs"
  "ssa:Social Security Administration"
  "doc:Department of Commerce"
  "treas:Department of the Treasury"
)

for spec in "${AGENCIES[@]}"; do
  slug="${spec%%:*}"; name="${spec#*:}"
  outdir="$ROOT/$slug"
  rm -rf "$outdir"
  echo "===== $slug ($name) ====="
  for fy in "${FY_ATTEMPTS[@]}"; do
    if find "$outdir" -name '*.parquet' 2>/dev/null | grep -q .; then break; fi
    echo "  attempt FY$fy…"
    "$PY" "$HERE/pipelines/ingest_usaspending.py" \
      --agency-name "$name" --naics $NAICS \
      --fy-start "$fy" --fy-end "$fy" --out-dir "$outdir" \
      || echo "  FY$fy failed, will try next window"
  done
  if ! find "$outdir" -name '*.parquet' 2>/dev/null | grep -q .; then
    echo "  !! $slug: all attempts failed — keeping any existing DB data for it"
  fi
done

echo "===== Pruning to one partition per agency (per-FY files are identical) ====="
for spec in "${AGENCIES[@]}"; do
  slug="${spec%%:*}"
  keep="$(ls -1 "$ROOT/$slug"/fy=*/part-0.parquet 2>/dev/null | sort | head -1)"
  [ -z "$keep" ] && continue
  for f in "$ROOT/$slug"/fy=*/part-0.parquet; do
    [ "$f" != "$keep" ] && { rm -f "$f"; rmdir "$(dirname "$f")" 2>/dev/null || true; }
  done
  echo "  $slug -> $keep"
done

echo "===== Loading (per-agency-safe --replace) ====="
"$PY" "$HERE/pipelines/load_to_postgres.py" --replace

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
NAICS="541511 541512"
FY_ATTEMPTS=(2024 2023 2025 2022 2021 2026)

# agency slug -> toptier name
AGENCIES=(
  "dhs:Department of Homeland Security"
  "hhs:Department of Health and Human Services"
  "va:Department of Veterans Affairs"
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

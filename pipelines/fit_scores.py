#!/usr/bin/env python
"""Fit the recompete scoring models and write dbt/seeds/score_weights.csv.

    python pipelines/fit_scores.py                      # reads dev_intermediate
    python pipelines/fit_scores.py --schema x_intermediate --dry-run

Two binned logistic regressions ("scorecards"), trained on
int_score_backtest (ended awards with inferred follow-ons):

  retention  P(incumbent wins the follow-on | a follow-on happens)
  followon   P(a follow-on award happens at all)

Every feature is a categorical bin, so each weight is a readable statement
("sole-source adds +1.4 log-odds of retention"). The dbt model
mart_recompete_candidates joins these weights to live contracts.

Validation is a time split: fit on awards that ended before 2021, score the
ones that ended after. The retention model is also fit on the placebo window
(follow-ons 3-5 years out) — how well THAT scores is the share of the signal
that comes from how follow-ons are matched rather than from real
incumbency. Re-run after any scope change and commit the new seed.
"""

import argparse
import csv
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "dbt" / "seeds" / "score_weights.csv"
load_dotenv(ROOT / ".env")

# (feature, backtest column, reference level). The reference level gets
# weight 0; every other level's weight is relative to it.
MODELS = {
    "retention": [
        ("share", "f_share", "lt15"),
        ("rivals", "f_rivals", "16up"),
        ("tenure", "f_tenure", "0"),
        ("vehicle", "f_vehicle", "order"),
        ("sole_source", "f_sole", "no"),
        ("duration", "f_dur_ret", "1_2"),
    ],
    "followon": [
        ("vehicle", "f_vehicle", "order"),
        ("duration", "f_dur_fo", "1_2"),
        ("size", "f_size", "1_10m"),
        ("pricing", "f_pricing", "fixed"),
    ],
}
SPLIT_DATE = "2021-01-01"
L2 = 1.0  # light ridge penalty so sparse bins don't get extreme weights


def design(df, spec, levels=None):
    """One-hot encode with the reference level dropped. Returns X and column keys."""
    if levels is None:
        levels = [
            (feat, lv)
            for feat, col, ref in spec
            for lv in sorted(df[col].unique())
            if lv != ref
        ]
    colmap = {feat: col for feat, col, _ in spec}
    X = np.column_stack(
        [np.ones(len(df))]
        + [(df[colmap[feat]] == lv).to_numpy(float) for feat, lv in levels]
    )
    return X, levels


def fit(X, y):
    """Logistic regression by Newton-Raphson (IRLS), ridge on non-intercept terms."""
    w = np.zeros(X.shape[1])
    R = L2 * np.eye(X.shape[1])
    R[0, 0] = 0
    for _ in range(100):
        p = 1 / (1 + np.exp(-X @ w))
        H = X.T @ (X * (p * (1 - p))[:, None]) + R
        step = np.linalg.solve(H, X.T @ (y - p) - R @ w)
        w += step
        if np.abs(step).max() < 1e-9:
            break
    return w


def auc(y, score):
    """Probability a random positive outranks a random negative (0.5 = coin flip)."""
    r = pd.Series(score).rank().to_numpy()
    pos = y == 1
    n_pos, n_neg = pos.sum(), (~pos).sum()
    return (r[pos].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)


def validate(name, df, spec, y):
    train = (df.pop_end_date < pd.Timestamp(SPLIT_DATE)).to_numpy()
    X, levels = design(df[train], spec)
    w = fit(X, y[train])
    Xt, _ = design(df[~train], spec, levels)
    p = 1 / (1 + np.exp(-Xt @ w))
    yt = y[~train]
    print(f"\n{name}: train n={train.sum():,}  test n={(~train).sum():,}  "
          f"test AUC={auc(yt, p):.3f}")
    cal = pd.DataFrame({"predicted": p, "actual": yt})
    cal["quintile"] = pd.qcut(cal.predicted.rank(method="first"), 5, labels=range(1, 6))
    print(cal.groupby("quintile", observed=True).agg(["mean"]).round(3).to_string())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", default="dev_intermediate")
    ap.add_argument("--dry-run", action="store_true", help="validate only; don't write the seed")
    args = ap.parse_args()

    url = os.environ.get("DATABASE_URL") or sys.exit("DATABASE_URL not set — check your .env")
    with psycopg2.connect(url) as conn:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute(f'select * from "{args.schema}".int_score_backtest')
            cols = [d[0] for d in cur.description]
            df = pd.DataFrame(cur.fetchall(), columns=cols)
    df["pop_end_date"] = pd.to_datetime(df.pop_end_date)
    print(f"{len(df):,} ended awards; {df.has_followon.mean():.1%} have an inferred follow-on; "
          f"incumbent kept {df[df.has_followon].retained.mean():.1%} of those")

    ret = df[df.has_followon].reset_index(drop=True)
    pla = df[df.has_placebo].reset_index(drop=True)
    validate("retention", ret, MODELS["retention"], ret.retained.astype(float).to_numpy())
    validate("retention on PLACEBO window (matching artifact — lower is better)",
             pla, MODELS["retention"], pla.placebo_retained.astype(float).to_numpy())
    validate("followon", df, MODELS["followon"], df.has_followon.astype(float).to_numpy())

    rows = []
    for model, data, y in [
        ("retention", ret, ret.retained.astype(float).to_numpy()),
        ("followon", df, df.has_followon.astype(float).to_numpy()),
    ]:
        spec = MODELS[model]
        X, levels = design(data, spec)
        w = fit(X, y)
        rows.append((model, "intercept", "all", w[0]))
        for feat, col, ref in spec:
            rows.append((model, feat, ref, 0.0))
        rows += [(model, feat, lv, wt) for (feat, lv), wt in zip(levels, w[1:])]

    rows.sort(key=lambda r: (r[0], r[1] != "intercept", r[1], r[2]))
    print("\nweights (log-odds, relative to each feature's reference level):")
    for model, feat, lv, wt in rows:
        print(f"  {model:9s} {feat:11s} {lv:10s} {wt:+.3f}")

    if args.dry_run:
        return
    SEED.parent.mkdir(exist_ok=True)
    with SEED.open("w", newline="") as f:
        out = csv.writer(f)
        out.writerow(["model", "feature", "level", "weight"])
        out.writerows((m, ft, lv, f"{wt:.4f}") for m, ft, lv, wt in rows)
    print(f"\nwrote {SEED.relative_to(ROOT)} — run `dbt seed` then `dbt run`")


if __name__ == "__main__":
    main()

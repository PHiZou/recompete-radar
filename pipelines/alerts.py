"""
Contract-expiry alerting.

Finds recompete candidates whose current period-of-performance ends within
ALERT_EXPIRY_MONTHS, dedupes against ones already alerted recently, and emails
a digest. Delivery uses the SendGrid API when SENDGRID_API_KEY is set, else SMTP.

Idempotent: each emailed award is recorded in <schema>.alert_log; an award is
not re-sent if it was alerted within ALERT_DEDUPE_DAYS.

Usage:
    python alerts.py --dry-run          # print the digest, send nothing, log nothing
    python alerts.py                    # send + record
    python alerts.py --months 6         # widen the expiry window
"""

from __future__ import annotations

import argparse
import os
import smtplib
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

_repo_root = Path(__file__).parent.parent
load_dotenv(_repo_root / ".env")

SCHEMA = os.getenv("MARTS_SCHEMA", "dev_marts")
DEFAULT_MONTHS = int(os.getenv("ALERT_EXPIRY_MONTHS", "3"))
DEDUPE_DAYS = int(os.getenv("ALERT_DEDUPE_DAYS", "30"))

ALERT_LOG_DDL = f"""
CREATE SCHEMA IF NOT EXISTS {SCHEMA};
CREATE TABLE IF NOT EXISTS {SCHEMA}.alert_log (
    award_unique_key TEXT,
    alerted_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_alert_log_key ON {SCHEMA}.alert_log (award_unique_key);
"""


def find_expiring(engine: Engine, months: int) -> list[dict]:
    """Candidates expiring within `months`, not alerted in the last DEDUPE_DAYS."""
    sql = text(f"""
        SELECT c.award_unique_key, c.piid, c.recipient_name,
               COALESCE(c.awarding_agency_name, '') AS agency,
               COALESCE(c.awarding_sub_agency_name, '') AS sub_agency,
               c.pop_current_end_date, c.months_to_pop_end,
               COALESCE(c.base_and_all_options_value, c.total_obligated, 0)::float AS value_dollars,
               c.recompete_score
        FROM {SCHEMA}.mart_recompete_candidates c
        WHERE c.months_to_pop_end <= :months
          AND c.pop_current_end_date >= current_date
          AND NOT EXISTS (
              SELECT 1 FROM {SCHEMA}.alert_log a
              WHERE a.award_unique_key = c.award_unique_key
                AND a.alerted_at >= now() - make_interval(days => :dedupe)
          )
        ORDER BY value_dollars DESC
    """)
    with engine.begin() as conn:
        for stmt in [s.strip() for s in ALERT_LOG_DDL.split(";") if s.strip()]:
            conn.execute(text(stmt))
        return [dict(r) for r in conn.execute(
            sql, {"months": months, "dedupe": DEDUPE_DAYS}
        ).mappings().all()]


def render_html(rows: list[dict], months: int) -> tuple[str, str]:
    total_m = sum(r["value_dollars"] for r in rows) / 1e6
    n = len(rows)
    subject = f"[Sunlight] {n} contracts expire within {months} months — ${total_m:,.1f}M at stake"

    trs = "".join(
        f"""<tr>
              <td style="padding:6px 10px;font-family:monospace">{r['piid'] or r['award_unique_key']}</td>
              <td style="padding:6px 10px">{r['recipient_name'] or 'UNKNOWN'}</td>
              <td style="padding:6px 10px">{r['sub_agency'] or r['agency']}</td>
              <td style="padding:6px 10px;font-family:monospace">{r['pop_current_end_date']}</td>
              <td style="padding:6px 10px;text-align:right;font-family:monospace">${r['value_dollars']/1e6:,.1f}M</td>
              <td style="padding:6px 10px;text-align:right;font-family:monospace">{r['recompete_score']}</td>
            </tr>"""
        for r in rows
    )
    html = f"""<div style="font-family:system-ui,sans-serif;max-width:760px">
      <h2>Contract-expiry radar</h2>
      <p><strong>{n}</strong> active recompete candidates have a period of
      performance ending within <strong>{months} months</strong>, representing
      <strong>${total_m:,.1f}M</strong> in obligated value.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr style="text-align:left;border-bottom:2px solid #ddd">
            <th style="padding:6px 10px">PIID</th>
            <th style="padding:6px 10px">Incumbent</th>
            <th style="padding:6px 10px">Sub-agency</th>
            <th style="padding:6px 10px">POP end</th>
            <th style="padding:6px 10px;text-align:right">Value</th>
            <th style="padding:6px 10px;text-align:right">Recompete</th>
          </tr>
        </thead>
        <tbody>{trs}</tbody>
      </table>
      <p style="color:#888;font-size:12px">Sunlight · derived from public USASpending.gov data.</p>
    </div>"""
    return subject, html


def send_email(subject: str, html: str, to_addrs: list[str], from_addr: str) -> None:
    api_key = os.getenv("SENDGRID_API_KEY")
    if api_key:
        resp = requests.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "personalizations": [{"to": [{"email": a} for a in to_addrs]}],
                "from": {"email": from_addr},
                "subject": subject,
                "content": [{"type": "text/html", "value": html}],
            },
            timeout=30,
        )
        resp.raise_for_status()
        print(f"  sent via SendGrid → {', '.join(to_addrs)} (HTTP {resp.status_code})")
        return

    host = os.getenv("SMTP_HOST")
    if not host:
        raise RuntimeError(
            "No delivery configured: set SENDGRID_API_KEY or SMTP_HOST/PORT/USER/PASS."
        )
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_addrs)
    msg.attach(MIMEText(html, "html"))
    port = int(os.getenv("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=30) as server:
        server.starttls()
        user, pw = os.getenv("SMTP_USER"), os.getenv("SMTP_PASS")
        if user and pw:
            server.login(user, pw)
        server.sendmail(from_addr, to_addrs, msg.as_string())
    print(f"  sent via SMTP {host}:{port} → {', '.join(to_addrs)}")


def record(engine: Engine, rows: list[dict]) -> None:
    with engine.begin() as conn:
        for r in rows:
            conn.execute(
                text(f"INSERT INTO {SCHEMA}.alert_log (award_unique_key) VALUES (:k)"),
                {"k": r["award_unique_key"]},
            )


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--months", type=int, default=DEFAULT_MONTHS)
    p.add_argument("--dry-run", action="store_true", help="print digest; send/log nothing")
    args = p.parse_args()

    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        print("ERROR: DATABASE_URL is not set.", file=sys.stderr)
        return 2
    engine = create_engine(dsn, pool_pre_ping=True)

    rows = find_expiring(engine, args.months)
    if not rows:
        print(f"No new contracts expiring within {args.months} months. Nothing to send.")
        return 0

    subject, html = render_html(rows, args.months)
    print(subject)
    for r in rows[:10]:
        print(f"  {r['pop_current_end_date']}  ${r['value_dollars']/1e6:>7,.1f}M  "
              f"{(r['recipient_name'] or 'UNKNOWN')[:40]:40}  {r['piid'] or r['award_unique_key']}")
    if len(rows) > 10:
        print(f"  … and {len(rows) - 10} more")

    if args.dry_run:
        print("\n[dry-run] no email sent, no rows logged.")
        return 0

    to = [a.strip() for a in os.getenv("ALERT_EMAIL_TO", "").split(",") if a.strip()]
    if not to:
        print("ERROR: ALERT_EMAIL_TO is not set.", file=sys.stderr)
        return 2
    from_addr = os.getenv("ALERT_EMAIL_FROM", "sunlight@localhost")

    send_email(subject, html, to, from_addr)
    record(engine, rows)
    print(f"Logged {len(rows)} awards to {SCHEMA}.alert_log.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

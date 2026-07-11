"""
Seed a tiny raw.award_transactions fixture for CI so `dbt build` has data to
transform and test without hitting the network or a real warehouse.

Covers two agencies (DHS 070, VA 036) and a spread of POP-end dates (active +
expired) so every mart and every test exercises real rows. Deterministic.
"""

from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import create_engine, text

sys.path.insert(0, str(Path(__file__).parent.parent / "pipelines"))
from load_to_postgres import ensure_schema  # noqa: E402

TODAY = date.today()


def _row(i: int, agency_code: str, agency_name: str, months_out: int, uei: str, obligated: float) -> dict:
    pop_end = TODAY + timedelta(days=30 * months_out)
    return {
        "award_unique_key": f"CONT_AWD_{agency_code}_{i:04d}",
        "piid": f"{agency_code}TEST{i:04d}",
        "parent_piid": None,
        "modification_number": "0",
        "federal_action_obligation": obligated,
        "total_dollars_obligated": obligated,
        "base_and_exercised_options_value": obligated,
        "base_and_all_options_value": obligated * 1.5,
        "action_date": TODAY - timedelta(days=200),
        "action_type": "A",
        "action_type_description": "NEW",
        "pop_start_date": TODAY - timedelta(days=400),
        "pop_current_end_date": pop_end,
        "pop_potential_end_date": pop_end,
        "awarding_agency_name": agency_name,
        "awarding_agency_code": agency_code,
        "awarding_sub_agency_name": f"{agency_name} Component",
        "awarding_sub_agency_code": f"{agency_code}01",
        "awarding_office_name": "Office",
        "awarding_office_code": "OFF1",
        "recipient_uei": uei,
        "recipient_duns": None,
        "recipient_name": f"VENDOR {uei}",
        "recipient_name_raw": f"vendor {uei}",
        "recipient_parent_uei": uei,
        "recipient_parent_name": f"VENDOR {uei}",
        "recipient_country_code": "USA",
        "recipient_state_code": "VA",
        "pop_state_code": "VA",
        "naics_code": "541512" if i % 2 else "541511",
        "naics_description": "COMPUTER SYSTEMS DESIGN SERVICES",
        "psc_code": "D307",
        "psc_description": "IT SERVICES",
        "type_of_contract_pricing": "FIRM FIXED PRICE",
        "contract_award_type": "DEFINITIVE CONTRACT",
        "type_of_set_aside": "NONE",
        "type_of_set_aside_code": "NONE",
        "number_of_offers_received": 3,
        "extent_competed": "FULL AND OPEN",
        "solicitation_procedures": "NEGOTIATED",
        "transaction_description": "IT services",
        "fiscal_year": 2025,
    }


def main() -> int:
    dsn = os.environ["DATABASE_URL"]
    engine = create_engine(dsn)
    ensure_schema(engine)

    rows: list[dict] = []
    specs = [
        ("070", "Department of Homeland Security", "AAAAAAAAAAA1"),
        ("036", "Department of Veterans Affairs", "BBBBBBBBBBB2"),
    ]
    i = 0
    for code, name, uei in specs:
        for months_out in (2, 8, 20, -6):  # active window + one already expired
            i += 1
            rows.append(_row(i, code, name, months_out, uei, 1_000_000.0 * i))

    cols = list(rows[0].keys())
    placeholders = ", ".join(f":{c}" for c in cols)
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE raw.award_transactions"))
        conn.execute(
            text(f"INSERT INTO raw.award_transactions ({', '.join(cols)}) VALUES ({placeholders})"),
            rows,
        )
    print(f"Seeded {len(rows)} fixture rows across {len(specs)} agencies.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""
Contract identity checks against a running API.

A task-order PIID is only unique inside its parent IDV, so /contracts/{piid}
must not assume one PIID = one contract. Today the deployed API returns 500
for 75FCMC22F0001 (11 different task orders, 11 different incumbents).

These tests pin the behaviour, not the implementation. Any of these designs
passes:
  - ambiguous PIID -> 300/409 with a list of the matching contracts
  - ambiguous PIID -> 200 with a list of the matching contracts
and in every design `?parent_piid=` must pick exactly one contract.

Run (stdlib only, no pytest needed):
    SUNLIGHT_API=http://localhost:8000 .venv/bin/python -m unittest api/tests/test_contract_identity.py -v
SUNLIGHT_API defaults to http://localhost:8000. Never point it at a server
you are not allowed to hit repeatedly; it only issues a handful of GETs.
"""

from __future__ import annotations

import json
import os
import unittest
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import urlopen

BASE = os.getenv("SUNLIGHT_API", "http://localhost:8000").rstrip("/")

# 75FCMC22F0001 is order #0001 under 11 different CMS IDVs (as of 2026-09-27).
AMBIGUOUS_PIID = "75FCMC22F0001"
AMBIGUOUS_PARENTS = {
    "75FCMC19A0009": "FLEXION INC",
    "75FCMC19A0010": "NAVA PBC",
    "75FCMC22A0001": "ESIMPLICITY INC",
    "75FCMC22A0010": "TRILLION ERP VENTURETECH, LLC",
    "75FCMC22A0018": "INDEX ANALYTICS LLC",
    "HHSM500201600005I": "GENERAL DYNAMICS INFORMATION TECHNOLOGY, INC.",
    "HHSM500201600034I": "CUSTOMER VALUE PARTNERS, LLC",
    "HHSM500201600063I": "THE SIGNATURE CONSULTING GROUP, LLC",
    "HHSM500201600067I": "SCOPE INFOTECH INC",
    "HHSM500201700045I": "RELI GROUP INC",
    "HHSM500201700047I": "SPARKSOFT CORPORATION",
}
# A definitive contract (no parent IDV) whose PIID is unique on its own.
UNIQUE_PIID = "HHSM500201700002C"


def get(path: str, **params: str) -> tuple[int, str]:
    url = f"{BASE}{path}"
    if params:
        url += "?" + urlencode(params)
    try:
        with urlopen(url, timeout=30) as r:
            return r.status, r.read().decode()
    except HTTPError as e:
        return e.code, e.read().decode()


def contract_path(piid: str) -> str:
    return f"/contracts/{quote(piid, safe='')}"


class ContractIdentity(unittest.TestCase):
    def test_unique_piid_still_resolves(self):
        status, body = get(contract_path(UNIQUE_PIID))
        self.assertEqual(status, 200, body[:300])
        self.assertEqual(json.loads(body)["piid"], UNIQUE_PIID)

    def test_ambiguous_piid_is_not_a_server_error(self):
        status, body = get(contract_path(AMBIGUOUS_PIID))
        self.assertLess(status, 500, f"HTTP {status}: {body[:300]}")

    def test_ambiguous_piid_lists_every_match(self):
        """Without a parent, the API must not silently pick one of the 11."""
        status, body = get(contract_path(AMBIGUOUS_PIID))
        self.assertIn(status, (200, 300, 409), f"HTTP {status}: {body[:300]}")
        missing = [p for p in AMBIGUOUS_PARENTS if p not in body]
        self.assertFalse(missing, f"response hides matches under parents {missing}")

    def test_parent_piid_selects_one_contract(self):
        for parent, incumbent in AMBIGUOUS_PARENTS.items():
            with self.subTest(parent=parent):
                status, body = get(contract_path(AMBIGUOUS_PIID), parent_piid=parent)
                self.assertEqual(status, 200, f"HTTP {status}: {body[:300]}")
                c = json.loads(body)
                self.assertEqual(c["piid"], AMBIGUOUS_PIID)
                self.assertEqual(c["parent_piid"], parent)
                self.assertEqual(c["incumbent_name"], incumbent)

    def test_unknown_parent_is_404(self):
        status, _ = get(contract_path(AMBIGUOUS_PIID), parent_piid="NOT-A-REAL-IDV")
        self.assertEqual(status, 404)

    def test_recompete_rows_carry_parent_for_links(self):
        """The radar table links to /contracts/...; each row needs its parent to build a unique link."""
        status, body = get("/recompetes", limit="1000")
        self.assertEqual(status, 200, body[:300])
        rows = json.loads(body)
        self.assertTrue(rows)
        self.assertTrue(all("parent_piid" in r for r in rows), "rows have no parent_piid field")
        keys = [(r["parent_piid"], r["piid"]) for r in rows]
        self.assertEqual(len(keys), len(set(keys)), "duplicate (parent_piid, piid) in /recompetes")


if __name__ == "__main__":
    unittest.main(verbosity=2)

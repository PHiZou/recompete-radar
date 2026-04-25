"""
FastAPI service exposing marts-layer reads to the Next.js frontend.

Weekend-1 scope: health check + placeholder endpoints that return mock
shapes matching the frontend's `lib/mock-data.ts`. In Weekend 3 the
placeholder bodies are swapped for real queries against `marts.*`.

Run locally:
    uvicorn main:app --reload
    → http://localhost:8000/docs
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

load_dotenv()


# ---------------------------------------------------------------------------
# DB engine (singleton)
# ---------------------------------------------------------------------------
engine: Engine | None = None


def get_engine() -> Engine | None:
    """Return a lazily-constructed engine, or None if DATABASE_URL is unset.
    Weekend 1 endpoints work without a DB — they return mock responses.
    """
    global engine
    if engine is not None:
        return engine
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        return None
    engine = create_engine(dsn, pool_pre_ping=True)
    return engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    if engine is not None:
        engine.dispose()


app = FastAPI(
    title="Sunlight API",
    version="0.1.0",
    description="Read API for marts-layer contract intelligence.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Response schemas (minimal — mirror mock-data.ts)
# ---------------------------------------------------------------------------
class Health(BaseModel):
    status: str
    database: str
    version: str


class ScoreBreakdown(BaseModel):
    pop_window_pts: int
    definitive_pts: int
    above_median_pts: int
    lifetime_pts: int
    breadth_pts: int
    recency_pts: int


class RecompeteCandidate(BaseModel):
    piid: str
    naics: str
    title: str
    sub_agency: str
    incumbent: str
    incumbent_uei: str | None
    pop_end: str
    months_to_pop_end: int
    value_millions: float
    recompete_score: int
    incumbent_strength: int
    breakdown: ScoreBreakdown


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health", response_model=Health, tags=["meta"])
def health() -> Health:
    eng = get_engine()
    db_status = "not-configured"
    if eng is not None:
        try:
            with eng.connect() as conn:
                conn.execute(text("select 1"))
            db_status = "ok"
        except Exception as e:  # pragma: no cover
            db_status = f"error: {e.__class__.__name__}"
    return Health(status="ok", database=db_status, version="0.1.0")


class TopIncumbent(BaseModel):
    name: str
    uei: str | None
    obligated_millions: float
    award_count: int


class RadarSummary(BaseModel):
    candidates: int
    dollars_at_stake_millions: float
    top_incumbent: TopIncumbent | None
    sub_agency_filter: str | None


class SubAgency(BaseModel):
    code: str
    name: str
    candidate_count: int


@app.get("/summary", response_model=RadarSummary, tags=["radar"])
def radar_summary(
    sub_agency_code: str | None = None,
    min_score: int = 0,
    max_months: int = 36,
) -> RadarSummary:
    eng = get_engine()
    if eng is None:
        raise HTTPException(503, "DB not configured")
    where, params = _filter_clause(sub_agency_code, min_score, max_months)
    with eng.connect() as conn:
        agg = conn.execute(text(f"""
            SELECT COUNT(*) AS candidates,
                   COALESCE(SUM(total_obligated), 0)::float / 1e6 AS at_stake_m
            FROM dev_marts.mart_recompete_candidates
            WHERE {where}
        """), params).mappings().one()
        top = conn.execute(text(f"""
            SELECT recipient_name AS name,
                   recipient_uei AS uei,
                   SUM(total_obligated)::float / 1e6 AS m,
                   COUNT(*) AS n
            FROM dev_marts.mart_recompete_candidates
            WHERE {where} AND recipient_uei IS NOT NULL
            GROUP BY 1, 2
            ORDER BY 3 DESC NULLS LAST
            LIMIT 1
        """), params).mappings().one_or_none()
    return RadarSummary(
        candidates=int(agg["candidates"]),
        dollars_at_stake_millions=round(float(agg["at_stake_m"]), 2),
        top_incumbent=TopIncumbent(
            name=str(top["name"]),
            uei=str(top["uei"]) if top["uei"] else None,
            obligated_millions=round(float(top["m"]), 2),
            award_count=int(top["n"]),
        ) if top else None,
        sub_agency_filter=sub_agency_code,
    )


@app.get("/sub_agencies", response_model=list[SubAgency], tags=["radar"])
def list_sub_agencies() -> list[SubAgency]:
    """Sub-agencies that currently have at least one active recompete candidate."""
    eng = get_engine()
    if eng is None:
        return []
    with eng.connect() as conn:
        rows = conn.execute(text("""
            SELECT awarding_sub_agency_code AS code,
                   MAX(awarding_sub_agency_name) AS name,
                   COUNT(*) AS n
            FROM dev_marts.mart_recompete_candidates
            WHERE awarding_sub_agency_code IS NOT NULL
            GROUP BY 1 ORDER BY 3 DESC
        """)).mappings().all()
    return [SubAgency(code=r["code"], name=r["name"], candidate_count=int(r["n"])) for r in rows]


def _filter_clause(sub_agency_code: str | None, min_score: int, max_months: int) -> tuple[str, dict]:
    where = ["recompete_score >= :min_score", "months_to_pop_end <= :max_months"]
    params: dict[str, object] = {"min_score": min_score, "max_months": max_months}
    if sub_agency_code:
        where.append("awarding_sub_agency_code = :sub")
        params["sub"] = sub_agency_code
    return " AND ".join(where), params


@app.get("/recompetes", response_model=list[RecompeteCandidate], tags=["radar"])
def list_recompetes(
    sub_agency_code: str | None = None,
    min_score: int = 0,
    max_months: int = 36,
    limit: int = 100,
) -> list[RecompeteCandidate]:
    """List scored recompete candidates from dev_marts.mart_recompete_candidates.

    The mart already filters to the active POP-end window (-3 to +36 months);
    `max_months` narrows further on read.
    """
    eng = get_engine()
    if eng is None:
        return []

    where, params = _filter_clause(sub_agency_code, min_score, max_months)
    params["lim"] = limit
    sql = text(f"""
        SELECT
            COALESCE(piid, award_unique_key)                                  AS piid,
            COALESCE(naics_code, '')                                          AS naics,
            COALESCE(naics_description, piid, award_unique_key)               AS title,
            COALESCE(awarding_sub_agency_name, awarding_agency_name, '')      AS sub_agency,
            COALESCE(recipient_name, 'UNKNOWN')                               AS incumbent,
            recipient_uei                                                     AS incumbent_uei,
            pop_current_end_date,
            months_to_pop_end,
            COALESCE(
                base_and_all_options_value,
                base_and_exercised_options_value,
                total_obligated,
                0
            )::float                                                          AS value_dollars,
            recompete_score,
            incumbent_strength,
            rs_pop_window_pts,
            rs_definitive_pts,
            rs_above_median_pts,
            is_lifetime_pts,
            is_breadth_pts,
            is_recency_pts
        FROM dev_marts.mart_recompete_candidates
        WHERE {where}
        ORDER BY recompete_score DESC, total_obligated DESC NULLS LAST
        LIMIT :lim
    """)

    rows: list[RecompeteCandidate] = []
    with eng.connect() as conn:
        for row in conn.execute(sql, params).mappings():
            pop_end = row["pop_current_end_date"]
            value_m = round(float(row["value_dollars"] or 0) / 1_000_000, 2)
            rows.append(
                RecompeteCandidate(
                    piid=str(row["piid"] or ""),
                    naics=str(row["naics"] or ""),
                    title=str(row["title"] or ""),
                    sub_agency=str(row["sub_agency"] or ""),
                    incumbent=str(row["incumbent"] or ""),
                    incumbent_uei=row["incumbent_uei"],
                    pop_end=pop_end.isoformat() if pop_end else "N/A",
                    months_to_pop_end=int(row["months_to_pop_end"] or 0),
                    value_millions=value_m,
                    recompete_score=int(row["recompete_score"] or 0),
                    incumbent_strength=int(row["incumbent_strength"] or 0),
                    breakdown=ScoreBreakdown(
                        pop_window_pts=int(row["rs_pop_window_pts"] or 0),
                        definitive_pts=int(row["rs_definitive_pts"] or 0),
                        above_median_pts=int(row["rs_above_median_pts"] or 0),
                        lifetime_pts=int(row["is_lifetime_pts"] or 0),
                        breadth_pts=int(row["is_breadth_pts"] or 0),
                        recency_pts=int(row["is_recency_pts"] or 0),
                    ),
                )
            )
    return rows


class VendorAward(BaseModel):
    piid: str
    sub_agency: str
    pop_end: str
    value_millions: float
    recompete_score: int


class VendorProfile(BaseModel):
    uei: str
    name: str
    lifetime_obligated_millions: float
    award_count: int
    active_award_count: int
    sub_agency_count: int
    naics_count: int
    top_naics_code: str
    top_naics_description: str
    top_sub_agency_name: str
    active_awards: list[VendorAward]


@app.get("/vendors/{vendor_id}", response_model=VendorProfile, tags=["vendor"])
def get_vendor(vendor_id: str) -> VendorProfile:
    eng = get_engine()
    if eng is None:
        raise HTTPException(503, "DB not configured")

    with eng.connect() as conn:
        v = conn.execute(text("""
            SELECT * FROM dev_marts.mart_vendors WHERE vendor_uei = :uei
        """), {"uei": vendor_id}).mappings().one_or_none()
        if not v:
            raise HTTPException(404, f"vendor {vendor_id} not found")

        awards = conn.execute(text("""
            SELECT
                COALESCE(piid, award_unique_key) AS piid,
                COALESCE(awarding_sub_agency_name, '') AS sub_agency,
                pop_current_end_date,
                COALESCE(total_obligated, 0)::float AS value_dollars,
                recompete_score
            FROM dev_marts.mart_recompete_candidates
            WHERE recipient_uei = :uei
            ORDER BY recompete_score DESC, total_obligated DESC NULLS LAST
            LIMIT 25
        """), {"uei": vendor_id}).mappings().all()

    return VendorProfile(
        uei=v["vendor_uei"],
        name=v["vendor_name"] or "",
        lifetime_obligated_millions=round(float(v["lifetime_obligated"] or 0) / 1_000_000, 2),
        award_count=int(v["award_count"] or 0),
        active_award_count=int(v["active_award_count"] or 0),
        sub_agency_count=int(v["sub_agency_count"] or 0),
        naics_count=int(v["naics_count"] or 0),
        top_naics_code=str(v["top_naics_code"] or ""),
        top_naics_description=str(v["top_naics_description"] or ""),
        top_sub_agency_name=str(v["top_sub_agency_name"] or ""),
        active_awards=[
            VendorAward(
                piid=str(a["piid"] or ""),
                sub_agency=str(a["sub_agency"] or ""),
                pop_end=a["pop_current_end_date"].isoformat() if a["pop_current_end_date"] else "N/A",
                value_millions=round(float(a["value_dollars"] or 0) / 1_000_000, 2),
                recompete_score=int(a["recompete_score"] or 0),
            )
            for a in awards
        ],
    )


class AgencyTopVendor(BaseModel):
    uei: str
    name: str
    obligated_millions: float
    share_pct: float


class AgencyProfile(BaseModel):
    id: str
    name: str
    parent_name: str
    level: str
    total_obligated_millions: float
    award_count: int
    unique_vendors: int
    naics_count: int
    recompete_candidates: int
    recompete_exposure_millions: float
    top_vendors: list[AgencyTopVendor]


@app.get("/agencies/{agency_id}", response_model=AgencyProfile, tags=["agency"])
def get_agency(agency_id: str) -> AgencyProfile:
    eng = get_engine()
    if eng is None:
        raise HTTPException(503, "DB not configured")

    with eng.connect() as conn:
        a = conn.execute(text("""
            SELECT * FROM dev_marts.mart_agency_summary WHERE agency_id = :id
        """), {"id": agency_id}).mappings().one_or_none()
        if not a:
            raise HTTPException(404, f"agency {agency_id} not found")

        # Top vendors: filter by sub-agency if 'sub', else by top-tier agency
        col = "awarding_sub_agency_code" if a["agency_level"] == "sub" else "awarding_agency_code"
        vendors = conn.execute(text(f"""
            SELECT recipient_uei, MAX(recipient_name) AS name,
                   SUM(total_obligated) AS obligated
            FROM dev_marts.mart_awards
            WHERE {col} = :id AND recipient_uei IS NOT NULL
            GROUP BY 1 ORDER BY 3 DESC NULLS LAST LIMIT 8
        """), {"id": agency_id}).mappings().all()

    total = float(a["total_obligated"] or 0)
    return AgencyProfile(
        id=a["agency_id"],
        name=str(a["agency_name"] or ""),
        parent_name=str(a["parent_agency_name"] or ""),
        level=str(a["agency_level"]),
        total_obligated_millions=round(total / 1_000_000, 2),
        award_count=int(a["award_count"] or 0),
        unique_vendors=int(a["unique_vendors"] or 0),
        naics_count=int(a["naics_count"] or 0),
        recompete_candidates=int(a["recompete_candidates"] or 0),
        recompete_exposure_millions=round(float(a["recompete_exposure"] or 0) / 1_000_000, 2),
        top_vendors=[
            AgencyTopVendor(
                uei=str(v["recipient_uei"]),
                name=str(v["name"] or ""),
                obligated_millions=round(float(v["obligated"] or 0) / 1_000_000, 2),
                share_pct=round(100 * float(v["obligated"] or 0) / total, 2) if total else 0,
            )
            for v in vendors
        ],
    )

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
    title="Recompete Radar API",
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


class RecompeteCandidate(BaseModel):
    piid: str
    naics: str
    title: str
    sub_agency: str
    incumbent: str
    pop_end: str
    months_to_pop_end: int
    value_millions: float
    recompete_score: int
    incumbent_strength: int


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


@app.get("/recompetes", response_model=list[RecompeteCandidate], tags=["radar"])
def list_recompetes(
    agency_code: str = "070",
    naics: list[str] | None = None,
    max_months: int = 24,
    min_score: int = 60,
    limit: int = 100,
) -> list[RecompeteCandidate]:
    """
    List recompete candidates for a slice.
    Weekend-1: returns an empty list if DB is not connected.
    Weekend-3: backed by `SELECT ... FROM marts.mart_recompete_candidates`.
    """
    eng = get_engine()
    if eng is None:
        return []
    # Placeholder query — the mart doesn't exist yet. The shape below is the
    # target contract for Weekend 3.
    raise HTTPException(
        status_code=501,
        detail="marts.mart_recompete_candidates not yet built — see Weekend 3",
    )


@app.get("/vendors/{vendor_id}", tags=["vendor"])
def get_vendor(vendor_id: str) -> dict[str, Any]:
    eng = get_engine()
    if eng is None:
        return {"detail": "DB not configured — UI renders from mock-data.ts"}
    raise HTTPException(
        status_code=501,
        detail="marts.mart_vendors not yet built — see Weekend 3",
    )


@app.get("/agencies/{agency_id}", tags=["agency"])
def get_agency(agency_id: str) -> dict[str, Any]:
    eng = get_engine()
    if eng is None:
        return {"detail": "DB not configured — UI renders from mock-data.ts"}
    raise HTTPException(
        status_code=501,
        detail="marts.mart_agency_summary not yet built — see Weekend 3",
    )

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .. import graphstore as G, store
from . import analyses as A
from . import drivers as D
from . import engine

router = APIRouter(prefix="/api/eda", tags=["explore"])


def _f(family: str | None, region: str | None, channel: str | None, date_from: str | None, date_to: str | None, measure: str | None) -> dict:
    split = lambda s: [x for x in s.split("~") if x] if s else None
    return dict(family=split(family), region=split(region), channel=split(channel), date_from=date_from, date_to=date_to, measure=measure or "orders")


def _ready():
    st = engine.ensure_started()
    if st.get("panel") == "no_data":
        raise HTTPException(409, "Load your data first.")
    if st.get("panel") == "error":
        raise HTTPException(500, f"We could not prepare the data for exploring. {st.get('message', '')}")
    if st.get("panel") != "ready":
        raise HTTPException(202, "Preparing")


def _ver() -> str:
    ws = store.read_workspace() or {}
    return G.version("e1", ws.get("loaded_at"))


def _p(**k) -> dict:
    return {a: b for a, b in k.items()}


def _q(name):
    return Query(None, alias=name)


@router.get("/status")
def status():
    return engine.ensure_started()


@router.get("/options")
def options():
    _ready()
    return G.serve('eda', 'options', dict(locals()), _ver(), lambda: A.clean(A.options()))


@router.get("/overview")
def overview(family: str | None = None, region: str | None = None, channel: str | None = None, date_from: str | None = None, date_to: str | None = None, measure: str | None = None):
    _ready()
    return G.serve('eda', 'overview', dict(locals()), _ver(), lambda: A.overview(_f(family, region, channel, date_from, date_to, measure)))


@router.get("/profile")
def profile(family: str | None = None, region: str | None = None, channel: str | None = None, date_from: str | None = None, date_to: str | None = None, measure: str | None = None):
    _ready()
    return G.serve('eda', 'profile', dict(locals()), _ver(), lambda: A.profile(_f(family, region, channel, date_from, date_to, measure)))


@router.get("/trend")
def trend(family: str | None = None, region: str | None = None, channel: str | None = None, date_from: str | None = None, date_to: str | None = None, measure: str | None = None, by: str = "family"):
    _ready()
    return G.serve('eda', 'trend', dict(locals()), _ver(), lambda: A.trend(_f(family, region, channel, date_from, date_to, measure), by))


@router.get("/segments")
def segments(family: str | None = None, region: str | None = None, channel: str | None = None, date_from: str | None = None, date_to: str | None = None, measure: str | None = None):
    _ready()
    return G.serve('eda', 'segments', dict(locals()), _ver(), lambda: A.segments(_f(family, region, channel, date_from, date_to, measure)))


@router.get("/distribution")
def distribution(family: str | None = None, region: str | None = None, channel: str | None = None, date_from: str | None = None, date_to: str | None = None, measure: str | None = None):
    _ready()
    return G.serve('eda', 'distribution', dict(locals()), _ver(), lambda: A.distribution(_f(family, region, channel, date_from, date_to, measure)))


@router.get("/drivers")
def drivers(family: str | None = None, region: str | None = None, channel: str | None = None, date_from: str | None = None, date_to: str | None = None, measure: str | None = None, feature: str | None = None):
    _ready()
    return G.serve('eda', 'drivers', dict(locals()), _ver(), lambda: D.drivers(_f(family, region, channel, date_from, date_to, measure), feature))

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import graphstore as G, store
from . import engine, views

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


def _f(family, region, channel, product=None) -> dict:
    split = lambda s: [x for x in s.split("~") if x] if s else None
    return dict(family=split(family), region=split(region), channel=split(channel), product=split(product))


def _ver() -> str:
    from .calendar import EXTRA
    ws = store.read_workspace() or {}
    return G.version("f3", engine.VERSION, ws.get("loaded_at"), EXTRA.read_bytes() if EXTRA.exists() else "")


def _ready():
    st = engine.status()
    if st["state"] == "no_data":
        raise HTTPException(409, "Load your data first.")
    if st["state"] == "error":
        raise HTTPException(500, f"We could not build the forecasts. {st.get('error') or st.get('message', '')}")
    if st["state"] != "ready":
        raise HTTPException(202, "Preparing")


@router.get("/status")
def status():
    return engine.status()


@router.get("/options")
def options():
    _ready()
    return G.serve('forecast', 'options-with-family', {}, _ver(), lambda: views.clean(views.options()))


@router.get("/outlook")
def outlook(family: str | None = None, region: str | None = None, channel: str | None = None, product: str | None = None, by: str = "family"):
    _ready()
    return G.serve('forecast', 'outlook', dict(family=family, region=region, channel=channel, product=product, by=by), _ver(), lambda: views.outlook(_f(family, region, channel, product), by))


@router.get("/vintages")
def vintages(family: str | None = None, region: str | None = None, channel: str | None = None, product: str | None = None):
    _ready()
    return G.serve('forecast', 'vintages', dict(family=family, region=region, channel=channel, product=product), _ver(), lambda: views.vintages(_f(family, region, channel, product)))


@router.get("/calendar")
def calendar():
    _ready()
    return G.serve('forecast', 'calendar', {}, _ver(), lambda: views.calendar_facts())

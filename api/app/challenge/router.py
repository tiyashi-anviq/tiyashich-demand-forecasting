from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..forecast import engine
from ..forecast.views import clean
from . import core, detail as _detail

router = APIRouter(prefix="/api/challenge", tags=["challenge"])


def _ready():
    st = engine.status()
    if st["state"] == "no_data":
        raise HTTPException(409, "Load your data first.")
    if st["state"] == "error":
        raise HTTPException(500, "The forecasts could not be built.")
    if st["state"] != "ready":
        raise HTTPException(202, "Preparing")


def _run(fn, *a):
    _ready()
    try:
        fn(*a)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return core.cycle()


class Respond(BaseModel):
    month: str
    family: str
    bu: str
    role: str
    action: str
    lines: dict[str, float] | None = None
    reason: str = ""


class Ref(BaseModel):
    month: str
    family: str
    bu: str


@router.get("/cycle")
def cycle():
    _ready()
    return core.cycle()


@router.get("/agreed")
def agreed():
    _ready()
    return core.agreed()


@router.post("/respond")
def respond(b: Respond):
    return _run(core.respond, b.month, b.family, b.bu, b.role, b.action, b.lines, b.reason)


@router.post("/reopen")
def reopen(b: Ref):
    return _run(core.reopen, b.month, b.family, b.bu)


@router.delete("")
def reset():
    core.reset()
    return {"ok": True}


@router.get("/detail")
def detail(month: str, family: str):
    _ready()
    try:
        return clean(_detail.detail(month, family))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/activity")
def activity():
    _ready()
    return core.activity()


@router.get("/month-facts")
def month_facts(month: str):
    _ready()
    return clean(_detail.month_facts(month))


@router.get("/checks")
def checks(month: str):
    _ready()
    try:
        return clean(_detail.checks(month))
    except ValueError as e:
        raise HTTPException(400, str(e))


class RegionRespond(BaseModel):
    month: str
    family: str
    region: str
    role: str
    action: str
    lines: dict[str, float] | None = None
    reason: str = ""


class RegionKey(BaseModel):
    month: str
    family: str
    region: str


class FamilyKey(BaseModel):
    month: str
    family: str


@router.post("/consolidate")
def consolidate(b: FamilyKey):
    """The S&D Head sends a family's numbers to the business units."""
    return _run(core.consolidate, b.month, b.family)


@router.post("/region/respond")
def region_respond(b: RegionRespond):
    return _run(core.region_respond, b.month, b.family, b.region, b.role, b.action, b.lines, b.reason)


@router.post("/region/reopen")
def region_reopen(b: RegionKey):
    return _run(core.region_reopen, b.month, b.family, b.region)


@router.get("/region/lines")
def region_lines(month: str, family: str, region: str):
    _ready()
    return clean(core.region_lines(month, family, region))


@router.get("/submissions")
def submissions(month: str, region: str | None = None, bu: str | None = None, family: str | None = None,
                product: str | None = None, status: str | None = None):
    _ready()
    try:
        return clean(core.submissions(month, region, bu, family, product, status))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/bu/lines")
def bu_lines(month: str, family: str, bu: str):
    _ready()
    try:
        return clean(core.bu_lines(month, family, bu))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/allocation")
def allocation(month: str, family: str):
    _ready()
    return clean(core.allocation(month, family))


@router.get("/final")
def final(month: str):
    _ready()
    return clean(core.final_view(month))


@router.get("/final/demand")
def final_demand(month: str):
    """Get agreed forecast values ready for supply planning integration."""
    _ready()
    return clean(core.final_demand(month))

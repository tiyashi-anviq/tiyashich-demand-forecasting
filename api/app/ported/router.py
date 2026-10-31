from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..eda import engine as eda
from . import disruption, plan3, inventory, npd, qc, supply, weather

router = APIRouter(prefix="/api/weather", tags=["weather"])


def _ready():
    st = eda.ensure_started()
    if st.get("panel") == "no_data":
        raise HTTPException(409, "Load your data first.")
    if st.get("panel") == "error":
        raise HTTPException(500, f"We could not prepare the data. {st.get('message', '')}")
    if st.get("panel") != "ready":
        raise HTTPException(202, "Preparing")


@router.get("/options")
def options():
    _ready()
    return weather.options()


@router.get("/shock")
def shock(year: int = 2026, family: str | None = Query(None), region: str | None = Query(None), channel: str | None = Query(None)):
    _ready()
    return weather.shock(year, family, region, channel)


@router.get("/seasonal")
def seasonal(family: str | None = Query(None), region: str | None = Query(None), channel: str | None = Query(None)):
    _ready()
    return weather.seasonal(family, region, channel)


qc_router = APIRouter(prefix="/api/quick-commerce", tags=["quick commerce"])


@qc_router.get("/options")
def qc_options():
    _ready()
    return qc.options()


@qc_router.get("/view")
def qc_view(depot: str | None = Query(None), category: str | None = Query(None), partner: str | None = Query(None)):
    _ready()
    return qc.view(depot, category, partner)


npd_router = APIRouter(prefix="/api/new-products", tags=["new products"])


@npd_router.get("/cases")
def npd_cases():
    _ready()
    return npd.cases()


@npd_router.get("/options")
def npd_options():
    _ready()
    return npd.options()


@npd_router.get("/plan")
def npd_plan(family: str = Query(""), mode: str = Query("upgrade"), base_sku: str | None = Query(None), sub: str | None = Query(None), price: float | None = Query(None), region: str | None = Query(None),
             channel: str | None = Query(None), month: int | None = Query(None), nd: float | None = Query(None),
             scheme: float | None = Query(None), category: str | None = Query(None), sensitivity: str | None = Query(None)):
    _ready()
    return npd.plan(family, sub, price, region=region, channel=channel, month=month, nd=nd, scheme=scheme, category=category, sensitivity=sensitivity, mode=mode, base_sku=base_sku)


@npd_router.get("/products")
def npd_products():
    _ready()
    return npd.products()


@npd_router.get("/switch")
def npd_switch(old: str, new: str):
    _ready()
    return npd.switch([x for x in old.split("~") if x], new)


sup_router = APIRouter(prefix="/api/supply", tags=["supply"])



@sup_router.get("/disruption-options")
def sup_dis_options(product: str | None = Query(None)):
    _ready()
    return supply._clean(disruption.options(product))


@sup_router.get("/disruption")
def sup_disruption(vendor: str, month: str | None = Query(None), weeks: float = Query(4.0), shortfall: float = Query(1.0), fallback: str | None = Query(None),
                   b_cap: float = Query(0.6), base_util: float = Query(0.8), push_util: float = Query(0.9), maint_days: float = Query(2.0), lag: float = Query(2.0), cover: float | None = Query(None), product: str | None = Query(None), region: str | None = Query(None), plant: str | None = Query(None)):
    _ready()
    r = disruption.scenario(vendor, month, weeks, shortfall, fallback, b_cap, base_util, push_util, maint_days, lag, cover, product, region, plant)
    if r.get("preparing"):
        raise HTTPException(202, "Preparing")
    return supply._clean(r)


@sup_router.get("/plan3")
def sup_plan3():
    _ready()
    r = plan3.plan()
    if r.get("preparing"):
        raise HTTPException(202, "Preparing")
    return supply._clean(r)


@sup_router.get("/rm-moq")
def sup_rm_moq(month: str | None = Query(None), basis: str | None = Query(None)):
    _ready()
    return supply._clean(supply.rm_moq(month, basis))


@sup_router.get("/rm-procure")
def sup_rm_procure(month: str | None = Query(None)):
    _ready()
    return supply.rm_procure(month)


@sup_router.get("/rm-try")
def sup_rm_try(sku: str, month: str, qty: float):
    _ready()
    try:
        return supply.rm_try(sku, month, qty)
    except ValueError as e:
        raise HTTPException(404, str(e))

inv_router = APIRouter(prefix="/api/inventory", tags=["inventory"])

@inv_router.get("/view")
def inv_view(depot: str | None = Query(None), family: str | None = Query(None), status: str | None = Query(None), product: str | None = Query(None), region: str | None = Query(None)):
    _ready()
    return supply._clean(inventory.view(depot, family, status, product, region))

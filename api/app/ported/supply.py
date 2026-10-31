"""MOQ economics and the Procurement challenge, from the supply request, price-break, PO and norms tables."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import store
from ..eda import panel as P
from . import plan3

_c: dict = {}


def _clean(o):
    """JSON cannot carry NaN: turn it into null."""
    if isinstance(o, float) and o != o:
        return None
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    return o






def _split(s):
    return [x for x in s.split("~") if x] if s else None

# ---------------------------------------------------------------- raw-material MOQ economics
RM_BASIS = {"need": "As per system need", "buffer": "Supply chain buffer on sales ask"}


def _rm() -> dict:
    if "rm" in _c:
        return _c["rm"]
    ws = store.read_workspace() or {}
    f = lambda name, need: P._find(ws, "supply", need, name)  # noqa: E731
    req = f("RM Requests", {"System_Computed_Need", "Buy_To_Reach_Target_Cover", "MOQ_Units"})
    pp = f("RM Planning Params", {"Holding_Cost_Pct_Per_Year", "Ordering_Cost_INR_Per_PO"})
    rmm = f("RM Master", {"Base_Price_INR", "MOQ_Units"})
    sup = f("Supplier Master", {"Supplier_Name_Generic"})
    if req is None or pp is None or rmm is None:
        raise RuntimeError("The raw-material request, planning and master tables were not loaded.")
    t = dict(req=req.assign(month=pd.to_datetime(req["Required_Month"]).dt.strftime("%Y-%m")), pp=pp.drop_duplicates("sku").set_index("sku"),
             rmm=rmm.drop_duplicates("sku").set_index("sku"), names=({} if sup is None else sup.set_index("supplier")["Supplier_Name_Generic"].to_dict()))
    # the request table ends with the last month the client filled in; the coming month's requests come from the plan, once the forecast is ready
    try:
        pl = plan3.plan()
    except Exception:
        pl = None
    if pl and not pl.get("preparing"):
        m0 = pl["months"][0]
        have = set(t["req"]["month"])
        if m0 not in have:
            add = []
            for x in pl["materials"]:
                if x["month"] != m0 or not x["buy"] > 0 or x["rm"] not in rmm.drop_duplicates("sku").set_index("sku").index:
                    continue
                moq = float(rmm.drop_duplicates("sku").set_index("sku").loc[x["rm"], "MOQ_Units"])
                add.append(dict(date=pd.Timestamp(m0 + "-01") - pd.Timedelta(days=1), Required_Month=pd.Timestamp(m0 + "-01"), sku=x["rm"], System_Computed_Need=x["need"],
                                Buy_To_Reach_Target_Cover=x["to_cover"], quantity=x["buy"], MOQ_Units=moq, Basis="System plan from the forecast", month=m0))
            if add:
                t["req"] = pd.concat([t["req"], pd.DataFrame(add)], ignore_index=True)
        _c["rm"] = t  # cached only once the plan is in, so a request made while the forecast builds does not freeze the old months
    return t


def _rm_row(x, t) -> dict:
    p, m = t["pp"].loc[x.sku], t["rmm"].loc[x.sku]
    need, req, moq = float(x.Buy_To_Reach_Target_Cover), float(x.quantity), float(x.MOQ_Units)
    pack = float(p.get("Pack_Size_Multiple") or 1) or 1.0
    price, hold, daily = float(m["Base_Price_INR"]), float(p["Holding_Cost_Pct_Per_Year"]) / 100.0, max(float(p["Avg_Daily_Consumption"]), 1e-9)
    floor = max(need, moq)                       # the least that can be ordered: the need, lifted to the minimum order
    floor = float(np.ceil(floor / pack) * pack)
    above = max(0.0, req - need)
    by_moq = max(0.0, min(req, floor) - need)
    buffer = max(0.0, req - floor)
    cost = lambda q: q * price * hold * (q / daily / 365.0)   # noqa: E731  holding cost of q units while they are used up
    save = cost(buffer)
    verdict = "Cut the buffer" if buffer > 0 and save > 0 else ("MOQ sets the floor" if by_moq > 0 else "Fine")
    return dict(sku=x.sku, name=str(p["Raw_Material"]), uom=str(m["UoM"]), criticality=str(p["Criticality"]), supplier=str(m["supplier"]), supplier_name=t["names"].get(m["supplier"], str(m["supplier"])),
                basis=str(x.Basis), need=need, system_need=float(x.System_Computed_Need), requested=req, moq=moq, eoq=float(p["quantity"]), pack=pack, price=price,
                above=above, by_moq=by_moq, buffer=buffer, floor=floor, value_above=above * price, hold_above=cost(above), hold_buffer=save, hold_moq=cost(by_moq),
                trim_to=floor, order_cost=float(p["Ordering_Cost_INR_Per_PO"]), cover_days=float(daily and req / daily), verdict=verdict, hold_pct=hold)


def rm_moq(month: str | None, basis: str | None = None) -> dict:
    t = _rm()
    r = t["req"]
    months = sorted(r["month"].unique(), reverse=True)
    month = month if month in months else months[0]
    d = r[r["month"] == month]
    if basis in RM_BASIS:
        d = d[d["Basis"] == RM_BASIS[basis]]
    rows = [_rm_row(x, t) for x in d.itertuples() if float(x.quantity) > 0]
    tot = dict(requests=len(rows), above=sum(q["above"] for q in rows), value_above=sum(q["value_above"] for q in rows), hold_above=sum(q["hold_above"] for q in rows),
               hold_moq=sum(q["hold_moq"] for q in rows), hold_buffer=sum(q["hold_buffer"] for q in rows), buffered=sum(1 for q in rows if q["buffer"] > 0), moq_bound=sum(1 for q in rows if q["by_moq"] > 0))
    trend = []
    for mo in sorted(months):
        rr = [_rm_row(x, t) for x in r[r["month"] == mo].itertuples() if float(x.quantity) > 0]
        trend.append(dict(month=mo, requests=len(rr), value_moq=sum(q["by_moq"] * q["price"] for q in rr), value_buffer=sum(q["buffer"] * q["price"] for q in rr),
                          hold_moq=sum(q["hold_moq"] for q in rr), hold_buffer=sum(q["hold_buffer"] for q in rr)))
    sup: dict = {}
    for q in rows:
        g = sup.setdefault(q["supplier"], dict(supplier=q["supplier"], name=q["supplier_name"], items=0, by_moq=0.0, hold_moq=0.0, value_above=0.0))
        g["items"] += 1; g["by_moq"] += q["by_moq"] * q["price"]; g["hold_moq"] += q["hold_moq"]; g["value_above"] += q["value_above"]
    return _clean(dict(month=month, months=months, bases=[dict(id=k, label=v) for k, v in RM_BASIS.items()], rows=rows, totals=tot, trend=trend, terms=sorted(sup.values(), key=lambda g: -g["by_moq"])))


# ---------------------------------------------------------------- raw-material procurement challenge
RM_RULES = dict(need=0.15, last_year=0.40, recent=0.30, cover=1.20)   # how far a request may run over each reference before it fails the check
RM_REASONS = ["Supplier price rise expected", "Lead time longer than usual", "Minimum order quantity forces it", "Festival build-up in production",
              "Single-source supplier risk", "Customs or transit delay expected", "Agreed with the plant head"]


def _rm_stock() -> pd.DataFrame:
    if "rms" not in _c:
        ws = store.read_workspace() or {}
        s = P._find(ws, "supply", {"Opening_Stock", "Consumption"}, "RM Stock Monthly")
        if s is None:
            raise RuntimeError("The raw-material stock table was not loaded.")
        _c["rms"] = s.assign(month=pd.to_datetime(s["date"]).dt.to_period("M")).set_index(["sku", "month"]).sort_index()
    return _c["rms"]


def _rm_check(t, sku: str, month: str, need: float, qty: float, basis: str = "") -> dict:
    s, p, m = _rm_stock(), t["pp"].loc[sku], t["rmm"].loc[sku]
    per = pd.Period(month)
    cons_ly = s["Consumption"].get((sku, per - 12))
    rec = s["Consumption"].reindex([(sku, per - k) for k in (1, 2, 3)]).dropna()
    rec = float(rec.mean()) if len(rec) else None
    opening = s["Opening_Stock"].get((sku, per))
    if opening is None or opening != opening:   # a month with no stock row yet starts with last month's closing stock
        opening = s["Closing_Stock"].get((sku, per - 1), 0.0)
    opening = float(opening)
    daily = max(float(p["Avg_Daily_Consumption"]), 1e-9)
    target = float(p["Target_Cover_Days"])
    cover = (opening + qty) / daily
    vs = lambda ref: None if not ref else qty / ref - 1   # noqa: E731
    cmp = dict(need=vs(need), last_year=vs(None if cons_ly is None or cons_ly != cons_ly else float(cons_ly)), recent=vs(rec))
    flags = [k for k, v in cmp.items() if v is not None and v > RM_RULES[k]]
    if cover > target * RM_RULES["cover"]:
        flags.append("cover")
    moq = float(m["MOQ_Units"])
    return dict(vs=cmp, cover=cover, target=target, flags=flags, moq=moq, below_moq=qty < moq, passed=len(flags) < 2,
                refs=dict(need=need, last_year=None if cons_ly is None or cons_ly != cons_ly else float(cons_ly), recent=rec, stock=opening), basis=basis)


def _plan_mats() -> dict:
    """The plan's raw-material lines by (material, month): stock cover at the start, lead time, risk and purchase value."""
    if "pm" in _c:
        return _c["pm"]
    try:
        pl = plan3.plan()
    except Exception:
        return {}
    if not pl or pl.get("preparing"):
        return {}
    _c["pm"] = {(x["rm"], x["month"]): x for x in pl["materials"]}
    return _c["pm"]


def rm_procure(month: str | None) -> dict:
    t = _rm()
    pm = _plan_mats()
    r = t["req"]
    months = sorted(r["month"].unique(), reverse=True)
    month = month if month in months else months[0]
    rows = []
    for x in r[r["month"] == month].itertuples():
        q = float(x.quantity)
        if not q > 0:
            continue
        c = _rm_check(t, x.sku, month, float(x.Buy_To_Reach_Target_Cover), q, str(x.Basis))
        rows.append(dict(id=f"{x.sku}|{month}", sku=x.sku, name=str(t["pp"].loc[x.sku, "Raw_Material"]), uom=str(t["rmm"].loc[x.sku, "UoM"]), criticality=str(t["pp"].loc[x.sku, "Criticality"]),
                         requested=q, need=float(x.Buy_To_Reach_Target_Cover), **c,
                         plan=({k: pm[(x.sku, month)][k] for k in ("opening", "cover_start", "lead", "at_risk", "buy_value")} if (x.sku, month) in pm else None)))
    return _clean(dict(month=month, months=months, rows=rows, reasons=RM_REASONS, rules=RM_RULES, empty=not rows))


def rm_try(sku: str, month: str, qty: float) -> dict:
    t = _rm()
    d = t["req"][(t["req"]["month"] == month) & (t["req"]["sku"] == sku)]
    if d.empty:
        raise ValueError("No request for that material and month.")
    x = next(d.itertuples())
    return _clean(dict(sku=sku, name=str(t["pp"].loc[sku, "Raw_Material"]), qty=qty, **_rm_check(t, sku, month, float(x.Buy_To_Reach_Target_Cover), qty, str(x.Basis))))

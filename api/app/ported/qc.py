"""Quick commerce & OTIF: what dark-store partners ask for, what they sell, how well we deliver, and what to ship instead."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import store
from ..eda import panel as P

BUFFERS = (1, 2, 3)
QC_CATEGORIES = frozenset({"Batteries", "Flashlights", "Mobile Accessories", "Mosquito Care"})


def _tables():
    ws = store.read_workspace() or {}
    q = P._find(ws, "market", {"Partner_PO_Qty", "Confirmed_Order_Qty"})
    s = P._find(ws, "service", {"otif", "On_Time_Rate", "family"})
    on = P._find(ws, "market", {"Depot_Code", "Pilot_Start_Date"})
    if q is None:
        raise RuntimeError("No dark-store partner table was loaded.")
    return q.assign(date=pd.to_datetime(q["date"]).dt.normalize()), s, on


def _split(s):
    return [x for x in s.split("~") if x] if s else None


def options() -> dict:
    q, _, _ = _tables()
    q = q[q["category"].isin(QC_CATEGORIES)]
    ws = store.read_workspace() or {}
    dm = P._find(ws, "location_master", {"depot", "depot_name", "region"})
    dreg = {} if dm is None else {str(a): str(b) for a, b in zip(dm["depot"], dm["region"])}
    return dict(depots=sorted(q["Depot_Code"].unique()), categories=sorted(q["category"].unique()), partners=sorted(q["brand"].unique()),
                depot_region={str(d): dreg.get(str(d)) for d in q["Depot_Code"].unique()})


def _replay(sell: np.ndarray, buf: int, first: int) -> dict:
    """Ship only what the recent sell-out says partners need, plus `buf` weeks of cover, and see what they would have missed."""
    n = len(sell)
    rec, stock, lost = np.full(n, np.nan), np.full(n, np.nan), np.full(n, np.nan)
    st = 0.0
    for t in range(n):
        if t < first:
            continue
        fc = float(np.mean(sell[t - 4:t]))
        need = fc * (1 + buf)
        r = max(0.0, need - st)
        avail = st + r
        lost[t] = max(0.0, sell[t] - avail)
        st = max(0.0, avail - sell[t])
        rec[t], stock[t] = r, st
    return dict(rec=rec, stock=stock, lost=lost)


def view(depot, category, partner) -> dict:
    q, svc, _ = _tables()
    q = q[q["category"].isin(QC_CATEGORIES)]
    if depot := _split(depot):
        q = q[q["Depot_Code"].isin(depot)]
    if category := _split(category):
        q = q[q["category"].isin(category)]
    if partner := _split(partner):
        q = q[q["brand"].isin(partner)]
    if q.empty:
        return dict(empty=True)
    w = q.groupby("date")[["Partner_PO_Qty", "Confirmed_Order_Qty", "volume"]].sum().sort_index()
    weeks = [d.strftime("%Y-%m-%d") for d in w.index]
    po, cf, so = w["Partner_PO_Qty"].to_numpy(float), w["Confirmed_Order_Qty"].to_numpy(float), w["volume"].to_numpy(float)
    # partner stock: what we confirmed that they have not sold yet
    stock = np.cumsum(cf - so).clip(min=0)
    first = 8
    replay = {str(b): _replay(so, b, first) for b in BUFFERS}
    cl = lambda a: [None if (v is None or np.isnan(v)) else round(float(v), 1) for v in a]
    # delivery rates (all channels) for the families selected
    otif = None
    if svc is not None:
        s = svc.assign(date=pd.to_datetime(svc["date"]).dt.normalize())
        s = s[s["family"].isin(category or QC_CATEGORIES)]
        s = s[s["date"].isin(w.index)]
        if len(s):
            g = s.assign(o=s["Orders_Qty"], f=s["fill_rate"] * s["Orders_Qty"], t=s["On_Time_Rate"] * s["Orders_Qty"], x=s["otif"] * s["Orders_Qty"]).groupby("date")[["o", "f", "t", "x"]].sum()
            g = g.reindex(w.index)
            otif = dict(fill=cl(g["f"] / g["o"]), on_time=cl(g["t"] / g["o"]), otif=cl(g["x"] / g["o"]))
            for k in otif:
                otif[k] = [None if v is None else round(v / 1, 4) for v in otif[k]]
    by = lambda key: [
        dict(name=k, po=float(g["Partner_PO_Qty"].sum()), confirmed=float(g["Confirmed_Order_Qty"].sum()), sellout=float(g["volume"].sum()),
             last=dict(po=float(g.groupby("date")["Partner_PO_Qty"].sum().tail(4).mean()), so=float(g.groupby("date")["volume"].sum().tail(4).mean())),
             stock=float(max(0.0, (g["Confirmed_Order_Qty"] - g["volume"]).sum())))
        for k, g in q.groupby(key)
    ]
    return dict(
        weeks=weeks, first=first, ordered=cl(po), confirmed=cl(cf), sellout=cl(so), stock=cl(stock), otif=otif,
        replay={b: dict(rec=cl(r["rec"]), stock=cl(r["stock"]), lost=cl(r["lost"])) for b, r in replay.items()},
        by_category=by("category"), by_depot=by("Depot_Code"), by_partner=by("brand"),
        n_depots=int(q["Depot_Code"].nunique()),
    )


def onboarding() -> list[dict]:
    _, _, on = _tables()
    return [] if on is None else on.astype(str).to_dict("records")

"""Inventory and transfers: stock at each depot against how fast it sells, what is short or over, and the moves that would balance it."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import store
from ..eda import panel as P

_c: dict = {}


def _t() -> dict:
    if "t" in _c:
        return _c["t"]
    ws = store.read_workspace() or {}
    inv = P._find(ws, "inventory", {"closing_qty", "safety_stock", "Invoiced_Qty"})
    nm = P._find(ws, "supply", {"Product_Family", "Target_Stock_Cover_Days_Min"}, "Inventory Norms")
    sm = P._find(ws, "product_master", {"sku", "description", "family"}, "SKU Master")
    tr = P._find(ws, "supply", {"From_Depot", "To_Depot", "Transit_Weeks"})
    dm = P._find(ws, "location_master", {"depot", "depot_name", "region"})
    if inv is None or nm is None:
        raise RuntimeError("The inventory and norms tables were not loaded.")
    inv = inv.assign(date=pd.to_datetime(inv["date"]))
    last = inv["date"].max()
    recent = inv[inv["date"] > last - pd.Timedelta(weeks=4)].groupby(["depot", "sku"])["Invoiced_Qty"].mean().rename("rate")
    cur = inv[inv["date"] == last].set_index(["depot", "sku"]).join(recent).reset_index()
    info = sm.drop_duplicates("sku").set_index("sku")[["description", "family"]]
    cur = cur.join(info, on="sku")
    cur["region"] = cur["region"]
    transit = {} if tr is None else tr.groupby(["From_Depot", "To_Depot"])["Transit_Weeks"].median().to_dict()
    names = {} if dm is None else dm.set_index("depot")["depot_name"].to_dict()
    t = dict(cur=cur, last=last, norms=nm.set_index("Product_Family"), transit=transit, names=names)
    _c["t"] = t
    return t


def _split(s):
    return [x for x in s.split("~") if x] if s else None


def view(depot=None, family=None, status=None, product=None, region=None) -> dict:
    t = _t()
    cur = t["cur"].copy()
    nm = t["norms"]
    cur = cur[cur["rate"].fillna(0) > 0].copy()
    cur["daily"] = cur["rate"] / 7.0
    cur["cover"] = cur["closing_qty"] / cur["daily"]
    cur["tmin"] = cur["family"].map(nm["Target_Stock_Cover_Days_Min"])
    cur["tmax"] = cur["family"].map(nm["Target_Stock_Cover_Days_Max"])
    cur["short_at"] = cur["family"].map(nm["Short_Flag_Below_Cover_Days"])
    cur["over_at"] = cur["family"].map(nm["Overstock_Flag_Above_Cover_Days"])
    cur["state"] = np.where(cur["cover"] < cur["short_at"], "Short", np.where(cur["cover"] > cur["over_at"], "Over-stocked", "OK"))
    cur["need"] = np.where(cur["state"] == "Short", cur["daily"] * cur["tmin"] - cur["closing_qty"], 0.0)
    cur["spare"] = np.where(cur["state"] == "Over-stocked", cur["closing_qty"] - cur["daily"] * cur["tmax"], 0.0)

    # moves: from over-stocked depots to short ones for the same product, same region first, then nearest by usual transit time
    moves, orders = [], []
    for sku, g in cur[cur["state"] != "OK"].groupby("sku"):
        spare = {r.depot: float(r.spare) for r in g.itertuples() if r.state == "Over-stocked"}
        reg = {r.depot: r.region for r in g.itertuples()}
        for r in g[g["state"] == "Short"].sort_values("need", ascending=False).itertuples():
            need = float(r.need)
            for src in sorted(spare, key=lambda s: (reg[s] != r.region, t["transit"].get((s, r.depot), 9.0))):
                if need <= 0 or spare[src] <= 0:
                    continue
                q = min(need, spare[src])
                if q < max(r.daily * 2, 1):
                    continue
                moves.append(dict(sku=sku, name=r.description, family=r.family, source=src, target=r.depot, qty=float(q), weeks=float(t["transit"].get((src, r.depot), 1.0)), same_region=bool(reg[src] == r.region)))
                spare[src] -= q
                need -= q
            if need > max(r.daily * 2, 1):
                orders.append(dict(sku=sku, name=r.description, family=r.family, depot=r.depot, qty=float(need), cover=float(r.cover)))
    if dep := _split(depot):
        cur = cur[cur["depot"].isin(dep)]
        moves = [m for m in moves if m["source"] in dep or m["target"] in dep]
        orders = [o for o in orders if o["depot"] in dep]
    if reg_ := _split(region):
        cur = cur[cur["region"].isin(reg_)]
        keep = set(cur["depot"])
        moves = [m for m in moves if m["source"] in keep or m["target"] in keep]
        orders = [o for o in orders if o["depot"] in keep]
    if fam := _split(family):
        cur = cur[cur["family"].isin(fam)]
        moves = [m for m in moves if m["family"] in fam]
        orders = [o for o in orders if o["family"] in fam]
    if prod := _split(product):
        cur = cur[cur["sku"].isin(prod)]
        moves = [m for m in moves if m["sku"] in prod]
        orders = [o for o in orders if o["sku"] in prod]
    byd = cur.groupby("depot")["state"].value_counts().unstack(fill_value=0)
    moved_q = float(sum(m["qty"] for m in moves))
    short_q = float(sum(o["qty"] for o in orders))
    required = moved_q + short_q  # all units the short depot-products need: covered by transfers plus left for supplier orders
    transit_w = (sum(m["qty"] * m["weeks"] for m in moves) / moved_q) if moved_q else 1.0
    per: dict = {}
    for m in moves:
        per.setdefault(m["sku"], dict(sku=m["sku"], name=m["name"], family=m["family"], req=0.0, cov=0.0))
        per[m["sku"]]["req"] += m["qty"]; per[m["sku"]]["cov"] += m["qty"]
    for o in orders:
        per.setdefault(o["sku"], dict(sku=o["sku"], name=o["name"], family=o["family"], req=0.0, cov=0.0))
        per[o["sku"]]["req"] += o["qty"]
    by_product = sorted([dict(sku=v["sku"], name=v["name"], family=v["family"], required=v["req"], covered=v["cov"], share=(v["cov"] / v["req"]) if v["req"] else 0.0) for v in per.values()], key=lambda r: -r["required"])
    sim = dict(required=required, from_transfers=moved_q, share=(moved_q / required) if required else 0.0, transit_days=float(transit_w * 7), by_product=by_product)
    rows = [dict(depot=r.depot, depot_name=t["names"].get(r.depot, r.depot), sku=r.sku, name=r.description, family=r.family, stock=float(r.closing_qty), rate=float(r.rate), cover=float(r.cover),
                 state=r.state, gap=float(r.need if r.state == "Short" else r.spare), target=f"{int(r.tmin)}–{int(r.tmax)}") for r in cur.itertuples()]
    if st := _split(status):
        rows = [r for r in rows if r["state"] in st]
    flagged = [r for r in rows if r["state"] != "OK"]
    depots = [dict(depot=d, name=t["names"].get(d, d), short=int(g.get("Short", 0)), over=int(g.get("Over-stocked", 0)), ok=int(g.get("OK", 0))) for d, g in byd.iterrows()]
    all_depots = sorted(t["cur"]["depot"].unique())
    return dict(asof=t["last"].strftime("%Y-%m-%d"), checked=int(len(cur)), short=int((cur["state"] == "Short").sum()), over=int((cur["state"] == "Over-stocked").sum()),
                moves=moves, orders=sorted(orders, key=lambda o: -o["qty"]), rows=sorted(flagged if status is None else rows, key=lambda r: -r["gap"]),
                depots=depots, norms=[dict(family=k, tmin=float(v["Target_Stock_Cover_Days_Min"]), tmax=float(v["Target_Stock_Cover_Days_Max"]), short=float(v["Short_Flag_Below_Cover_Days"]), over=float(v["Overstock_Flag_Above_Cover_Days"]), safety=float(v["Safety_Stock_Pct_Of_Target_Cover"])) for k, v in nm.reset_index().iterrows() for _ in [0]] if False else
                [dict(family=f, tmin=float(v["Target_Stock_Cover_Days_Min"]), tmax=float(v["Target_Stock_Cover_Days_Max"]), short=float(v["Short_Flag_Below_Cover_Days"]), over=float(v["Overstock_Flag_Above_Cover_Days"]), safety=float(v["Safety_Stock_Pct_Of_Target_Cover"])) for f, v in nm.iterrows()],
                options=dict(products=[dict(id=k, name=v) for k, v in sorted(t["cur"].drop_duplicates("sku").set_index("sku")["description"].dropna().items())], depots=[dict(id=d, name=t["names"].get(d, d)) for d in all_depots], families=sorted(t["cur"]["family"].dropna().unique().tolist())), moved=float(sum(m["qty"] for m in moves)), sim=sim, empty=len(cur) == 0)

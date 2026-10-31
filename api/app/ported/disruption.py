"""Supplier-disruption scenario on raw materials: a vendor stops delivering, a fallback vendor steps in, and what that does to production, OTIF and the plan.

Everything is built from the tables already loaded (sourcing map, material master, supplier performance, stock, bill of materials, line capacity) and the
demand forecast for the month. Assumptions that are not in the data are inputs on the screen: the days the plant takes to switch to the fallback, how much
of the lost volume the fallback can supply, the utilisation before and after, and the length of a maintenance stop."""
from __future__ import annotations

import calendar

import numpy as np
import pandas as pd

from .. import store
from ..eda import panel as P
from ..forecast import engine as F
from . import plan3
from . import plants as PL

SWITCH_LAG_DAYS = 2      # days between the failure being known and a purchase order going to the fallback: our assumption, shown on the screen
_c: dict = {}


def _t() -> dict:
    if "t" in _c:
        return _c["t"]
    ws = store.read_workspace() or {}
    f = lambda name, need: P._find(ws, "supply", need, name)  # noqa: E731
    sm, rmm, sup = f("RM Sourcing Map", {"Share_Pct", "Role"}), f("RM Master", {"Base_Price_INR", "Lead_Time_Days"}), f("Supplier Master", {"Supplier_Name_Generic"})
    perf, stock, bom = f("Supplier Performance Monthly", {"OTIF_Pct"}), f("RM Stock Monthly", {"Opening_Stock", "Closing_Stock"}), f("BOM", {"Production_Line", "Gross_Qty_Per_Unit"})
    cap, sku = f("Capacity Monthly", {"Rated_Capacity_Qty", "Utilisation_Pct"}), P._find(ws, "product_master", {"sku", "description", "mrp"}, "SKU Master")
    if any(x is None for x in (sm, rmm, sup, perf, stock, bom, cap)):
        raise RuntimeError("The sourcing, supplier, stock, bill-of-materials or capacity tables were not loaded.")
    stock = stock.assign(date=pd.to_datetime(stock["date"]))
    cap = cap.assign(date=pd.to_datetime(cap["date"]))
    perf = perf.assign(date=pd.to_datetime(perf["date"]))
    t = dict(sm=sm, rmm=rmm.drop_duplicates("sku").set_index("sku"), names=sup.set_index("supplier")["Supplier_Name_Generic"].to_dict(), sup=sup.set_index("supplier"),
             perf=perf, stock=stock, bom=bom, cap=cap, sku=None if sku is None else sku.drop_duplicates("sku").set_index("sku"))
    _c["t"] = t
    return t


def _shares(mi: int) -> dict:
    """Each plant's share of every line type's output in month number mi, from the plan (what each plant makes after overflow is shared out). Empty until the plan is ready."""
    key = ("sh", mi)
    if key in _c:
        return _c[key]
    try:
        pl = plan3.plan()
    except Exception:
        return {}
    if not pl or pl.get("preparing"):
        return {}
    out: dict = {}
    for x in pl["plants"]:
        out.setdefault(x["line"], {})[x["plant"]] = float(x["made"][mi])
    out = {ln: {p: v / sum(d.values()) for p, v in d.items()} for ln, d in out.items() if sum(d.values()) > 0}
    _c[key] = out
    return out


def options(product: str | None = None) -> dict:
    t = _t()
    r = F.result()
    sm = t["sm"]
    desc = {} if t["sku"] is None else t["sku"]["description"].to_dict()
    bl = t["bom"].drop_duplicates("sku")
    products = sorted([dict(id=k, label=f"{desc.get(k, k)} ({k})", line=str(ln)) for k, ln in zip(bl["sku"], bl["Production_Line"])], key=lambda x: x["label"])
    if product:
        sm = sm[sm["sku"].isin(set(t["bom"][t["bom"]["sku"] == product]["RM_Code"]))]
    p12 = t["perf"][t["perf"]["date"] > t["perf"]["date"].max() - pd.DateOffset(months=12)].groupby("supplier")["OTIF_Pct"].mean()
    vend = []
    for v, g in sm.groupby("supplier"):
        vend.append(dict(id=v, name=t["names"].get(v, v), materials=[t["rmm"].loc[k, "Raw_Material"] if "Raw_Material" in t["rmm"].columns else k for k in g["sku"]], otif=None if v not in p12 else float(p12[v]) / 100.0,
                         roles=sorted(set(g["Role"]))))
    regs = [] if r is None else sorted(r["sidx"]["region"].unique())
    return dict(plants=PL.PLANTS, regions=regs, products=products, vendors=sorted(vend, key=lambda x: x["id"]), months=[] if r is None else list(r["fmonths"][:3]), names=t["names"])


def scenario(vendor: str, month: str | None, weeks: float = 4.0, shortfall: float = 1.0, fallback: str | None = None, b_cap: float = 0.6,
             base_util: float = 0.80, push_util: float = 0.90, maint_days: float = 2.0, lag: float = SWITCH_LAG_DAYS, cover: float | None = None, product: str | None = None, region: str | None = None, plant: str | None = None) -> dict:
    t, r = _t(), F.result()
    if r is None:
        return dict(preparing=True)
    fm = list(r["fmonths"][:3])
    month = month if month in fm else fm[0]
    mi = fm.index(month)
    days = calendar.monthrange(int(month[:4]), int(month[5:7]))[1]
    df = pd.DataFrame(dict(sku=r["skus"]["sku"].to_numpy(), u=r["sku_fut"][:, mi], reg=r["sidx"]["region"].to_numpy()[r["bucket"]]))
    sk = df.groupby("sku")["u"].sum()
    sk_all = sk
    if region:
        df = df[df["reg"] == region]
        if df.empty:
            return dict(error="No forecast for that region.")
        sk = df.groupby("sku")["u"].sum()
    if product:
        if product not in sk.index:
            return dict(error="That product has no forecast for the month in this region.")
        sk = sk[sk.index == product]
        sk_all = sk_all[sk_all.index == product]
    shares = _shares(mi)
    ln_of = t["bom"].drop_duplicates("sku").set_index("sku")["Production_Line"]
    if plant:
        # the failure hits one plant: only what that plant makes counts, and it draws on its share of the central raw-material stock
        if not shares:
            return dict(preparing=True)
        f_ = pd.Series({k: shares.get(ln_of.get(k), {}).get(plant, 0.0) for k in sk.index})
        sk = (sk * f_).where(f_ > 0).dropna()
        if sk.empty:
            return dict(error="That plant does not make any of the products in this selection.")
        sk_all = sk_all[sk_all.index.isin(sk.index)]
    bom = t["bom"][t["bom"]["sku"].isin(sk.index)].copy()
    bom["units"] = bom["sku"].map(sk)
    bom["rm_need"] = bom["units"] * bom["Gross_Qty_Per_Unit"]
    need = bom.groupby("RM_Code")["rm_need"].sum()
    b_all = t["bom"][t["bom"]["sku"].isin(sk_all.index)].copy()
    need_all = (b_all["sku"].map(sk_all) * b_all["Gross_Qty_Per_Unit"]).groupby(b_all["RM_Code"]).sum()
    sm = t["sm"]
    mine = sm[sm["supplier"] == vendor]
    if mine.empty:
        return dict(error="That vendor does not supply any raw material in the sourcing map.")
    W = float(np.clip(weeks, 0.5, 8)) * 7.0
    st = t["stock"]
    mats, short_frac = [], {}
    for x in mine.itertuples():
        rm = x.sku
        if rm not in need.index or need[rm] <= 0:
            continue
        m_ = t["rmm"].loc[rm]
        d_need = float(need[rm]) / days
        share = float(x.Share_Pct) / 100.0
        s_ = st[st["sku"] == rm].sort_values("date").iloc[-1]
        held = float(s_["Closing_Stock"]) * (float(need[rm]) / float(need_all[rm]) if (region or product or plant) and need_all.get(rm, 0) else 1.0)   # stock is held centrally: a region or product gets its share of it
        stock0 = held if cover is None else float(cover) * d_need   # cover: days of stock at the start, if the user sets it
        others = sm[(sm["sku"] == rm) & (sm["supplier"] != vendor)]
        fb = others[others["supplier"] == fallback].iloc[0] if (fallback and (others["supplier"] == fallback).any()) else (others.iloc[0] if len(others) else None)
        lead = float(m_["Lead_Time_Days"])
        start_b = lag + lead if fb is not None else None
        lost_per_day = d_need * share * float(shortfall)
        stock_t, short, runs_out, b_units, lost_units = stock0, 0.0, None, 0.0, 0.0
        for day in range(1, int(max(W, days)) + 1):
            out = day <= W
            lost = lost_per_day if out else 0.0
            add = lost_per_day * float(b_cap) if (out and start_b is not None and day > start_b) else 0.0
            lost_units += lost
            b_units += add
            stock_t += -lost + add
            if stock_t < 0:
                short += -stock_t
                stock_t = 0.0
                runs_out = runs_out or day
        short_pct = min(1.0, short / float(need[rm]))
        short_frac[rm] = short_pct
        price = float(m_["Base_Price_INR"])
        prem = float(fb["Price_Premium_Pct"]) / 100.0 if fb is not None else 0.0
        mats.append(dict(rm=rm, name=str(m_.get("Raw_Material", rm)), uom=str(m_.get("UoM", "")), need=float(need[rm]), share=share, stock=stock0, cover_days=stock0 / d_need if d_need else None,
                         lost=lost_units, stock_used=min(stock0, max(0.0, lost_units - b_units - short)), fallback=None if fb is None else str(fb["supplier"]),
                         fallback_name=None if fb is None else t["names"].get(fb["supplier"], str(fb["supplier"])), premium=prem, lead=lead, first_delivery=start_b,
                         b_units=b_units, shortage=short, shortage_pct=short_pct, runs_out_day=runs_out, extra_cost=b_units * price * prem, b_cost=b_units * price * (1 + prem)))
    chain = []
    if product:
        for b in bom[bom["sku"] == product].itertuples():
            rm = b.RM_Code
            n_ = float(sk[product] * b.Gross_Qty_Per_Unit)
            for x in sm[sm["sku"] == rm].itertuples():
                chain.append(dict(rm=rm, name=str(t["rmm"].loc[rm].get("Raw_Material", rm)), uom=str(t["rmm"].loc[rm].get("UoM", "")), need=n_, vendor=str(x.supplier),
                                  vendor_name=t["names"].get(x.supplier, str(x.supplier)), role=str(x.Role), share=float(x.Share_Pct) / 100.0, supplied=n_ * float(x.Share_Pct) / 100.0,
                                  lead=float(t["rmm"].loc[rm]["Lead_Time_Days"]), failing=bool(x.supplier == vendor)))
    # a product stops when its scarcest material runs out
    bm = bom[bom["RM_Code"].isin(short_frac)].copy()
    bm["f"] = bm["RM_Code"].map(short_frac)
    sku_f = bm.groupby("sku")["f"].max()
    bom1 = bom.drop_duplicates("sku")[["sku", "Production_Line"]].set_index("sku")
    mrp = {} if t["sku"] is None else t["sku"]["mrp"].to_dict()
    rows, by_plant = [], []
    for ln, g in bom1.groupby("Production_Line"):
        skus = list(g.index)
        plan = float(sk.reindex(skus).fillna(0).sum())
        lost = float(sum(sk.get(k, 0.0) * sku_f.get(k, 0.0) for k in skus))
        cp = t["cap"][t["cap"]["Production_Line"] == ln].sort_values("date").iloc[-1]
        lost_frac = lost / plan if plan else 0.0
        idle = lost_frac * days
        gain = (push_util - base_util) / base_util if base_util else 0.0
        rec_months = lost_frac / gain if gain > 0 else None
        free_maint = min(idle, maint_days)
        rows.append(dict(line=ln, products=len(skus), affected=sum(1 for k in skus if sku_f.get(k, 0) > 0), plan=plan, lost=lost, lost_pct=lost_frac, idle_days=idle,
                         revenue=float(sum(sk.get(k, 0.0) * sku_f.get(k, 0.0) * float(mrp.get(k, 0) or 0) for k in skus)), rated=float(cp["Rated_Capacity_Qty"]), util_now=float(cp["Utilisation_Pct"]) / 100.0,
                         extra_per_month=plan * gain, recover_weeks=None if rec_months is None else rec_months * 52.0 / 12.0, recover_ok=bool(lost_frac == 0 or (rec_months is not None and rec_months <= 3)),
                         maint_in_idle=free_maint, maint_from_capacity=max(0.0, maint_days - free_maint), headroom=1.0 - push_util))
        if shares.get(ln) and not plant:
            rev = rows[-1]["revenue"]
            for pn, sh in sorted(shares[ln].items()):
                by_plant.append(dict(plant=pn, line=ln, share=sh, plan=plan * sh, lost=lost * sh, lost_pct=lost_frac, idle_days=idle, revenue=rev * sh))
    p12 = t["perf"][(t["perf"]["supplier"] == vendor) & (t["perf"]["date"] > t["perf"]["date"].max() - pd.DateOffset(months=12))]["OTIF_Pct"].mean()
    otif0 = float(p12) / 100.0 if p12 == p12 else None
    otif1 = None if otif0 is None else max(0.0, otif0 * (1 - float(shortfall) * min(1.0, W / days)))
    prev = (pd.Period(month) - 1)
    d_ = lambda day: f"{prev.year}-{prev.month:02d}-{day:02d}"   # noqa: E731
    tl = [dict(when=d_(20), event="Next month's forecast is already in the tool, refreshed from the latest actuals. Sales confirm or adjust it by today, so planning does not wait for a projection on the 29th to 31st"),
          dict(when=d_(22), event="Latest date to lock demand. The raw-material need and the production plan are generated from it, not rebuilt by hand"),
          dict(when=d_(24), event="Production plan frozen for the month, with room to move it up or down. Purchase requests and orders for raw materials follow from the plan"),
          dict(when=f"{month}-01", event=f"{t['names'].get(vendor, vendor)} stops delivering ({float(shortfall) * 100:.0f}% short for {weeks:g} weeks)"),
          dict(when=f"{month}-{min(days, int(1 + lag)):02d}", event=f"Purchase order to the fallback vendor goes out ({lag:g} days to switch)")]
    firsts = [m_["first_delivery"] for m_ in mats if m_["first_delivery"] is not None]
    if firsts:
        tl.append(dict(when=f"{month}-{min(days, int(1 + min(firsts))):02d}" if min(firsts) < days else f"after {month}", event=f"First delivery from the fallback vendor, after the {min(firsts):.0f} days it takes"))
    tot = dict(lost=sum(x["lost"] for x in rows), plan=sum(x["plan"] for x in rows), revenue=sum(x["revenue"] for x in rows), extra_cost=sum(m_["extra_cost"] for m_ in mats),
               shortage_materials=sum(1 for m_ in mats if m_["shortage"] > 0), materials=len(mats), idle_days=max([x["idle_days"] for x in rows] or [0.0]),
               otif0=otif0, otif1=otif1, no_fallback=[m_["name"] for m_ in mats if m_["fallback"] is None])
    return dict(month=month, months=fm, vendor=vendor, vendor_name=t["names"].get(vendor, vendor), days=days, weeks=weeks, shortfall=shortfall, b_cap=b_cap, base_util=base_util, push_util=push_util,
                maint_days=maint_days, lag=lag, cover=cover, product=product, region=region, plant=plant, by_plant=by_plant, demand=None if not product else float(sk[product]), chain=chain, materials=mats, lines=rows, totals=tot, timeline=tl)

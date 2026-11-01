"""The three-month plan that joins demand, production, raw materials and stock.

Demand for each product comes from the forecast for the next three months. Finished-goods stock at the start of the plan is what the depots held at the last
full week before it. Each month, each product needs production (or, for bought-in products, a purchase) to cover its demand and reach the target stock cover for the
month after. Production is held to each line's rated capacity; what the line cannot make is shown as a shortfall and stock falls short by that much. Raw materials
follow from the production through the bill of materials, and each month's purchase is rounded up to the minimum order and pack size."""
from __future__ import annotations

import calendar

import numpy as np
import pandas as pd

from .. import store
from ..eda import panel as P
from ..eda import engine as eda
from ..forecast import engine as F
from . import plants as PL


def _tables() -> dict:
    ws = store.read_workspace() or {}
    f = lambda name, need: P._find(ws, "supply", need, name)  # noqa: E731
    inv = P._find(ws, "inventory", {"closing_qty", "safety_stock", "Invoiced_Qty"})
    norms = f("Inventory Norms", {"Product_Family", "Target_Stock_Cover_Days_Min"})
    bom, cap = f("BOM", {"Production_Line", "Gross_Qty_Per_Unit"}), f("Capacity Monthly", {"Rated_Capacity_Qty", "Utilisation_Pct"})
    rmm, pp, rms = f("RM Master", {"Base_Price_INR", "Lead_Time_Days"}), f("RM Planning Params", {"Target_Cover_Days", "Pack_Size_Multiple"}), f("RM Stock Monthly", {"Opening_Stock", "Closing_Stock"})
    sm = P._find(ws, "product_master", {"sku", "description", "family"}, "SKU Master")
    if any(x is None for x in (inv, norms, bom, cap, rmm, pp, rms, sm)):
        raise RuntimeError("The inventory, norms, bill-of-materials, capacity or raw-material tables were not loaded.")
    return dict(inv=inv.assign(date=pd.to_datetime(inv["date"])), norms=norms.set_index("Product_Family"), bom=bom, cap=cap.assign(date=pd.to_datetime(cap["date"])),
                rmm=rmm.drop_duplicates("sku").set_index("sku"), pp=pp.drop_duplicates("sku").set_index("sku"), rms=rms.assign(date=pd.to_datetime(rms["date"])), sm=sm.drop_duplicates("sku").set_index("sku"))


def plan() -> dict:
    r = F.result()
    if r is None:
        return dict(preparing=True)
    t = _tables()
    fm = list(r["fmonths"][:3])
    M = len(fm)
    days = [calendar.monthrange(int(m[:4]), int(m[5:7]))[1] for m in fm]
    # demand per product per month; one more month of daily rate for the cover target at the end of the last month
    sku_u = pd.DataFrame(r["sku_fut"][:, :M + 1], index=r["skus"]["sku"].to_numpy()).groupby(level=0).sum()
    skus = list(sku_u.index)
    fam = t["sm"]["family"].reindex(skus)
    # Demand comes straight from the model forecast (M1). Challenge final values are not integrated here.
    agreed_f: set[str] = set()
    nm = t["norms"]
    tgt = fam.map(lambda f: float((nm.loc[f, "Target_Stock_Cover_Days_Min"] + nm.loc[f, "Target_Stock_Cover_Days_Max"]) / 2) if f in nm.index else 42.5)
    short_l = fam.map(lambda f: float(nm.loc[f, "Short_Flag_Below_Cover_Days"]) if f in nm.index else 35.0)
    over_l = fam.map(lambda f: float(nm.loc[f, "Overstock_Flag_Above_Cover_Days"]) if f in nm.index else 60.0)
    inv = t["inv"]
    start0 = pd.Timestamp(fm[0] + "-01") - pd.Timedelta(days=7)
    wk = inv[inv["date"] <= start0]["date"].max()
    stock = inv[inv["date"] == wk].groupby("sku")["closing_qty"].sum().reindex(skus).fillna(0.0)
    rate = inv[inv["date"] > wk - pd.Timedelta(days=56)].groupby("sku")["Invoiced_Qty"].sum().reindex(skus).fillna(0.0) / 56.0
    gap = max(0, (pd.Timestamp(fm[0] + "-01") - wk).days)
    stock = (stock - rate * gap).clip(lower=0.0)
    bom = t["bom"][t["bom"]["sku"].isin(skus)]
    line_of = bom.drop_duplicates("sku").set_index("sku")["Production_Line"]
    own = set(line_of.index)
    cp = t["cap"].sort_values("date").groupby("Production_Line").tail(1).set_index("Production_Line")
    rated = cp["Rated_Capacity_Qty"].to_dict()
    ref_req = cp["quantity"].to_dict()
    ldem = {ln: float(sku_u.loc[list(g.index), list(range(M))].to_numpy().sum() / M) for ln, g in line_of.groupby(line_of)}
    # each line type's rated capacity is held as it stands in the capacity file, then split over the plants
    cap_fc = {ln: float(rated.get(ln, 0.0)) for ln in ldem}
    pcfg = PL.config()
    reg_share = {}
    # Build SKU -> region shares from the forecast engine (month 0 / October 2026)
    skus_df = r["skus"]
    sku_to_region = skus_df.drop_duplicates(subset="sku").set_index("sku")["region"].to_dict()
    sku_month0 = sku_u[0]  # Series indexed by SKU with month-0 forecast

    sku_region_fc: dict[str, dict[str, float]] = {}
    for sku in skus:
        reg = sku_to_region.get(sku)
        fc_val = float(sku_month0.get(sku, 0.0))
        if sku not in sku_region_fc:
            sku_region_fc[sku] = {}
        if reg:
            sku_region_fc[sku][reg] = sku_region_fc[sku].get(reg, 0.0) + fc_val

    sku_reg: dict[str, dict[str, float]] = {}
    for sku, regions in sku_region_fc.items():
        total = sum(regions.values())
        if total > 0:
            sku_reg[sku] = {rg: v / total for rg, v in regions.items()}
        else:
            sku_reg[sku] = {}

    # Compute regional shares per line type from forecast-weighted SKU shares
    for ln, g in line_of.groupby(line_of):
        ks = list(g.index)
        weighted: dict[str, float] = {}
        total_fc = 0.0
        for sku in ks:
            fc = float(sku_month0.get(sku, 0.0))
            total_fc += fc
            for rg, share in sku_reg.get(sku, {}).items():
                weighted[rg] = weighted.get(rg, 0.0) + share * fc
        if total_fc > 0:
            reg_share[ln] = {rg: v / total_fc for rg, v in weighted.items()}
        else:
            reg_share[ln] = {}
    plant_cap = {ln: {pl: cap_fc[ln] * sh for pl, sh in pcfg["shares"].get(ln, {pl: 1.0 / len(PL.PLANTS) for pl in PL.PLANTS}).items()} for ln in cap_fc}
    plant_rows = {(pl, ln): dict(plant=pl, state=PL.STATE.get(pl, ""), line=ln, capacity=plant_cap[ln][pl], own=[0.0] * M, made=[0.0] * M, sent=[0.0] * M, take=[0.0] * M, util=[0.0] * M) for ln in plant_cap for pl in plant_cap[ln]}
    bl = pd.Series(0.0, index=skus)  # the part of last month's need that no plant could make; it is added to this month's need
    sp = stock.copy()  # stock as planned, had everything been made, so the need is not counted twice
    out = dict(demand=np.zeros(M), prod_req=np.zeros(M), prod_ok=np.zeros(M), buy_fg=np.zeros(M), close=np.zeros(M), unmet=np.zeros(M))
    s = stock.copy()
    prod_sku = {}

    fam_flow, prod_rows = {}, {k: dict(sku=k, name=str(t['sm'].loc[k].get('description', k)), family=str(fam.get(k)), line=str(line_of.get(k, 'Bought in')), sub=str(t['sm'].loc[k].get('Sub_Category', '') or ''), reg=sku_reg.get(k, {}), lo=float(short_l[k]), hi=float(over_l[k]), prod=[0.0] * M, demand=[0.0] * M, close=[0.0] * M, need=[0.0] * M, nxt=[0.0] * M) for k in skus}
    fam_rows, line_rows = [], {ln: dict(line=ln, rated=float(rated.get(ln, 0.0)), cap=cap_fc.get(ln, 0.0), ref=float(ref_req.get(ln, 0.0)), required=[0.0] * M, possible=[0.0] * M, util=[0.0] * M, short=[0.0] * M, backlog=[0.0] * M, fresh=[0.0] * M, carry_in=[0.0] * M) for ln in set(line_of.values)}
    for j in range(M):
        dem = sku_u[j]
        nxt = sku_u[j + 1] / (days[j + 1] if j + 1 < M else days[j])
        full = tgt * nxt
        endt = pd.Series(np.where(full > sp, sp + (full - sp) / (M - j), full), index=skus)
        fresh = (dem + endt - sp).clip(lower=0.0)
        req = fresh + bl
        fac = pd.Series(1.0, index=skus)
        for ln, g in line_of.groupby(line_of):
            ks = list(g.index)
            need = float(req[ks].sum())
            lim = float(cap_fc.get(ln, np.inf)) or np.inf
            if ln in plant_cap and need > 0:
                al = PL.allocate(need, reg_share.get(ln, {}), plant_cap[ln], pcfg["home"])
                f_ = min(1.0, al["made_total"] / need)
                for pl in al["made"]:
                    r_ = plant_rows[(pl, ln)]
                    r_["own"][j], r_["made"][j], r_["sent"][j], r_["take"][j] = al["own"][pl], al["made"][pl], al["sent"][pl], al["take"][pl]
                    r_["util"][j] = al["made"][pl] / r_["capacity"] if r_["capacity"] else 0.0
            else:
                f_ = min(1.0, lim / need) if need > 0 else 1.0
            fac[ks] = f_
            line_rows[ln]["required"][j], line_rows[ln]["possible"][j] = need, need * f_
            line_rows[ln]["fresh"][j], line_rows[ln]["carry_in"][j] = float(fresh[ks].sum()), float(bl[ks].sum())
            line_rows[ln]["util"][j], line_rows[ln]["short"][j] = (need * f_ / lim if lim else 0.0), need * (1 - f_)
        sup = req * fac
        end = s + sup - dem
        unmet = (-end).clip(lower=0.0)
        end = end.clip(lower=0.0)
        carry = req - sup
        for ln, g in line_of.groupby(line_of):
            line_rows[ln]["backlog"][j] = float(carry[list(g.index)].sum())
        bl = carry  # what no plant could make this month moves on to next month
        sp = sp + fresh - dem
        isown = pd.Series([k in own for k in skus], index=skus)
        out["demand"][j], out["prod_req"][j], out["prod_ok"][j] = float(dem.sum()), float(req[isown].sum()), float(sup[isown].sum())
        out["buy_fg"][j], out["close"][j], out["unmet"][j] = float(sup[~isown].sum()), float(end.sum()), float(unmet.sum())
        prod_sku[j] = sup[isown]
        for k in skus:
            prod_rows[k]["prod"][j], prod_rows[k]["demand"][j], prod_rows[k]["close"][j] = float(sup[k]), float(dem[k]), float(end[k])
            prod_rows[k]["need"][j], prod_rows[k]["nxt"][j] = float(req[k]), float(nxt[k])
        for fn, g in pd.DataFrame(dict(fam=fam, dem=dem, req=req, sup=sup, end=end)).groupby("fam"):
            for key, col in (("demand", "dem"), ("need", "req"), ("possible", "sup"), ("close", "end")):
                fam_flow.setdefault(fn, {}).setdefault(key, [0.0] * M)[j] = float(g[col].sum())
        s = end  # next month starts with what is left
        cov = end / nxt.replace(0, np.nan)
        for f_, g in pd.DataFrame(dict(fam=fam, end=end, nxt=nxt, dem=dem, short=short_l, over=over_l)).groupby("fam"):
            c = float(g["end"].sum() / g["nxt"].sum()) if g["nxt"].sum() > 0 else None
            st = None if c is None else ("Short" if c < float(g["short"].iloc[0]) else ("Over-stocked" if c > float(g["over"].iloc[0]) else "Within norm"))
            fam_rows.append(dict(family=f_, month=fm[j], demand=float(g["dem"].sum()), closing=float(g["end"].sum()), cover=c, status=st))
    # raw materials follow from production
    rms = t["rms"].sort_values("date")
    rmat, tot_buy = [], 0.0
    for rm in sorted(bom["RM_Code"].unique()):
        m_, p_ = t["rmm"].loc[rm], t["pp"].loc[rm]
        gross = bom[bom["RM_Code"] == rm].set_index("sku")["Gross_Qty_Per_Unit"]
        need = [float((prod_sku[j].reindex(gross.index).fillna(0.0) * gross).sum()) for j in range(M)]
        stock_rm = float(rms[rms["sku"] == rm].iloc[-1]["Closing_Stock"])
        moq, pack, tcd, lead, price = float(m_["MOQ_Units"]), float(p_.get("Pack_Size_Multiple") or 1) or 1.0, float(p_["Target_Cover_Days"]), float(m_["Lead_Time_Days"]), float(m_["Base_Price_INR"])
        for j in range(M):
            nd = need[j + 1] / days[j + 1] if j + 1 < M else need[j] / days[j]
            buy = max(0.0, need[j] + tcd * nd - stock_rm)
            to_cover = buy  # what it takes to reach target cover, before rounding up to the minimum order and pack size
            if buy > 0:
                buy = max(moq, float(np.ceil(buy / pack) * pack))
            cover_start = stock_rm / (need[j] / days[j]) if need[j] > 0 else None
            end = stock_rm + buy - need[j]
            risk = bool(cover_start is not None and cover_start < lead)
            rmat.append(dict(rm=rm, name=str(m_.get("Raw_Material", rm)), uom=str(m_.get("UoM", "")), month=fm[j], need=need[j], opening=stock_rm, buy=buy, to_cover=to_cover, buy_value=buy * price, closing=end,
                             cover_start=cover_start, lead=lead, at_risk=risk))
            tot_buy += buy * price
            stock_rm = end
    return dict(agreed_families=sorted(agreed_f), months=fm, days=days, stock_week=str(wk.date()), flow=dict({k: [float(x) for x in v] for k, v in out.items()}), lines=list(line_rows.values()), plants=list(plant_rows.values()), plant_names=PL.PLANTS, fam_flow=fam_flow, products=list(prod_rows.values()), stock_rolled_days=gap, materials=rmat, families=fam_rows,
                totals=dict(demand=float(out["demand"].sum()), prod=float(out["prod_ok"].sum()), short=float(sum(l["backlog"][-1] for l in line_rows.values())), unmet=float(out["unmet"].sum()),
                            plants_full=sum(1 for r in plant_rows.values() for u in r["util"] if u >= 0.999),
                            rm_buy=tot_buy, lines_over=sum(1 for l in line_rows.values() if max(l["util"]) >= 0.999), rm_risk=len({x["rm"] for x in rmat if x["at_risk"]})))

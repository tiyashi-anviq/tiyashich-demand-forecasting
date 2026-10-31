"""Builds the analysis panel for the Explore screen.

One row per week x region x SKU x channel (primary sales), joined to every candidate covariate the
cleaned data holds. Built once per loaded workspace, then cached in memory and on disk.
"""
from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pandas as pd

from .. import store

EDA_DIR = store.ROOT / "eda"
EDA_DIR.mkdir(parents=True, exist_ok=True)

# Which family each Nielsen category belongs to. This is an assumption of ours, shown to the user.
NIELSEN_FAMILY = {
    "Carbon Zinc Batteries": "Batteries", "Alkaline Batteries": "Batteries", "Rechargeable Batteries": "Batteries",
    "Coin Cells": "Batteries", "Torches & Lanterns": "Flashlights", "LED Bulbs": "Consumer Lighting",
    "LED Battens, Panels & Downlights": "Consumer Lighting", "Emergency Lights": "Consumer Lighting",
    "Festive Lights": "Consumer Lighting", "Power Banks": "Mobile Accessories",
    "Mobile Chargers & Cables": "Mobile Accessories", "Room Heaters": "Appliances", "Rechargeable Fans": "Appliances",
    "Mosquito Racquets": "Mosquito Care", "Liquid Vaporisers": "Mosquito Care",
}

# Covariate groups, in the order the user's framework lists them.
GROUPS: dict[str, dict] = {
    "calendar": dict(label="Calendar and festivals", cols={
        "woy": "Week of year", "month": "Month", "month_end_week": "Month-end week", "quarter_end_week": "Quarter-end week",
        "weeks_to_diwali": "Weeks to Diwali", "diwali_bell": "Diwali bell curve", "weeks_to_durga": "Weeks to Durga Puja",
        "durga_bell": "Durga Puja bell curve", "weeks_to_festival": "Weeks to next festival"}),
    "weather": dict(label="Weather and environment", cols={
        "rain": "Rainfall (mm)", "rain_roll2": "Rainfall, 2-week average", "rain_anom": "Rain anomaly index",
        "temp": "Temperature", "tmax": "Max temperature", "tmin": "Min temperature", "hum": "Humidity",
        "power_cut": "Power-cut index", "heat": "Heat wave", "cold": "Cold wave", "monsoon_delay": "Monsoon onset delay (days)"}),
    "price": dict(label="Price and promotion", cols={
        "scheme_disc": "Trade scheme discount %", "scheme_on": "Scheme active", "mrp_rel": "MRP vs launch price",
        "price_gap": "Price gap vs competitors"}),
    "commercial": dict(label="Downstream and market", cols={
        "wdist": "Weighted distribution %", "vshare": "Category volume share %", "qc_ratio": "Quick-commerce sell-through / PO"}),
    "macro": dict(label="Commodity and macro", cols={
        "zinc": "Zinc", "mno2": "Manganese dioxide", "copper": "Copper", "aluminium": "Aluminium", "lithium": "Lithium",
        "usd_inr": "USD-INR", "led_index": "LED component index", "road_freight": "Road freight", "diesel": "Diesel price index"}),
}
ALL_FEATURES = {c: lab for g in GROUPS.values() for c, lab in g["cols"].items()}
FEATURE_GROUP = {c: g for g, v in GROUPS.items() for c in v["cols"]}


def _tables(ws: dict) -> list[dict]:
    return ws.get("tables", [])


def _find(ws: dict, ttype: str, need: set[str], name: str | None = None) -> pd.DataFrame | None:
    best = None
    for t in _tables(ws):
        if t["type"] != ttype or not need <= set(t["columns"]):
            continue
        if name and name.lower() not in t["name"].lower():
            continue
        if best is None or t["rows"] > best["rows"]:
            best = t
    return pd.read_parquet(best["path"]) if best else None


def _norm_week(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s).dt.normalize()


def build(ws: dict) -> tuple[pd.DataFrame, dict]:
    t0 = time.time()
    notes: dict = dict(missing=[], sources={})
    sales = _find(ws, "sales", {"date", "region", "sku", "channel", "quantity", "orders_qty"})
    if sales is None:
        raise RuntimeError("No weekly sales table with region, SKU and channel was loaded.")
    keep = [c for c in ["date", "region", "sku", "channel", "orders_qty", "quantity", "quantity_clean", "is_outlier",
                        "stockout_week", "on_promo", "promo_lift", "base_quantity", "value"] if c in sales.columns]
    p = sales[keep].copy()
    p["date"] = _norm_week(p["date"])
    if "quantity_clean" not in p:
        p["quantity_clean"] = p["quantity"]
    notes["sources"]["sales"] = "Region x channel weekly sales"

    sm = _find(ws, "product_master", {"sku", "family", "brand"}, "SKU Master")
    if sm is None:
        sm = _find(ws, "product_master", {"sku", "family"})
    cols = [c for c in ["sku", "family", "brand", "Sub_Category", "Sourcing", "mrp", "Launch_Date"] if c in sm.columns]
    p = p.merge(sm[cols].drop_duplicates("sku"), on="sku", how="left")
    p["family"] = p["family"].fillna("Unmapped")
    weeks = pd.Series(sorted(p["date"].unique()))

    # ---- calendar
    cal = pd.DataFrame({"date": weeks})
    cal["woy"] = cal["date"].dt.isocalendar().week.astype(int)
    cal["month"] = cal["date"].dt.month
    fc = _find(ws, "events", {"Month_End_Week", "Quarter_End_Week"})
    if fc is not None:
        fc = fc.assign(date=_norm_week(fc["date"]))[["date", "Month_End_Week", "Quarter_End_Week"]]
        cal = cal.merge(fc.rename(columns={"Month_End_Week": "month_end_week", "Quarter_End_Week": "quarter_end_week"}), on="date", how="left")
    else:
        cal["month_end_week"] = (cal["date"] + pd.Timedelta(days=7)).dt.month != cal["date"].dt.month
        cal["month_end_week"] = cal["month_end_week"].astype(float)
        cal["quarter_end_week"] = np.nan
    fest = _find(ws, "events", {"name", "Group", "date", "Sell_In_Peak_Weeks_Before"})
    fest_rows = []
    if fest is not None:
        fest = fest.assign(date=_norm_week(fest["date"])).sort_values("date")
        fest_rows = fest[["Group", "name", "date", "Sell_In_Peak_Weeks_Before"]].to_dict("records")

        def nearest(group_key: str):
            g = fest[fest["Group"].astype(str).str.upper().str.contains(group_key)]
            if g.empty:
                return None
            fd = g["date"].to_numpy()
            wk = cal["date"].to_numpy()
            diff = (fd[None, :] - wk[:, None]).astype("timedelta64[D]").astype(float) / 7.0
            idx = np.abs(diff).argmin(axis=1)
            return diff[np.arange(len(wk)), idx]
        for key, tag in (("DIWALI", "diwali"), ("DURGA", "durga")):
            d = nearest(key)
            if d is not None:
                cal[f"weeks_to_{tag}"] = d
                cal[f"{tag}_bell"] = np.exp(-0.5 * (d / 2.0) ** 2)
        fd = fest["date"].to_numpy()
        wk = cal["date"].to_numpy()
        diff = (fd[None, :] - wk[:, None]).astype("timedelta64[D]").astype(float) / 7.0
        diff[diff < 0] = np.inf
        cal["weeks_to_festival"] = np.minimum(diff.min(axis=1), 20)
        for g, gg in fest.groupby(fest["Group"].astype(str).str.upper().str.replace(r"[^A-Z0-9]+", "_", regex=True)):
            win = np.zeros(len(cal), dtype=bool)
            for r in gg.itertuples():
                pw = r.Sell_In_Peak_Weeks_Before if pd.notna(r.Sell_In_Peak_Weeks_Before) else 3
                dd = (r.date - cal["date"]).dt.days
                win |= ((dd >= 0) & (dd <= 7 * min(pw, 8))).to_numpy()
            cal[f"win_{g}"] = win.astype(float)
    notes["festivals"] = [dict(group=str(r["Group"]), name=str(r["name"]), date=r["date"].date().isoformat()) for r in fest_rows]
    p = p.merge(cal, on="date", how="left")

    # ---- weather by region
    w = _find(ws, "weather", {"rainfall", "temperature", "region", "date"})
    if w is not None:
        w = w.assign(date=_norm_week(w["date"]))
        agg = dict(rain=("rainfall", "mean"), temp=("temperature", "mean"))
        for k, c in (("tmax", "Temp_Max_C"), ("tmin", "Temp_Min_C"), ("hum", "Rel_Humidity_Pct"), ("heat", "Heat_Wave_Flag"),
                     ("cold", "Cold_Wave_Flag"), ("power_cut", "Power_Cut_Index_0_100"), ("rain_anom", "Rain_Anomaly_Index")):
            if c in w.columns:
                agg[k] = (c, "mean" if "Flag" not in c else "max")
        wr = w.groupby(["region", "date"]).agg(**agg).reset_index().sort_values(["region", "date"])
        wr["rain_roll2"] = wr.groupby("region")["rain"].transform(lambda s: s.rolling(2, min_periods=1).mean())
        p = p.merge(wr, on=["region", "date"], how="left")
    else:
        notes["missing"].append("weather")
    mo = _find(ws, "weather", {"Delay_Days", "region", "Year"})
    if mo is not None:
        md = mo.groupby(["region", "Year"])["Delay_Days"].mean().rename("monsoon_delay").reset_index()
        p["Year"] = p["date"].dt.year
        p = p.merge(md, on=["region", "Year"], how="left").drop(columns="Year")

    # ---- trade schemes (channel x family, active in the week)
    sch = _find(ws, "promotions", {"channel", "family", "start_date", "end_date", "discount_pct"})
    p["scheme_disc"] = 0.0
    if sch is not None:
        sch = sch.assign(start_date=pd.to_datetime(sch["start_date"]), end_date=pd.to_datetime(sch["end_date"]))
        wk = p[["date", "channel", "family"]].drop_duplicates()
        m = wk.merge(sch, on=["channel", "family"])
        m = m[(m["date"] >= m["start_date"] - pd.Timedelta(days=6)) & (m["date"] <= m["end_date"])]
        pr = m.groupby(["date", "channel", "family"])["discount_pct"].max().rename("scheme_disc2").reset_index()
        p = p.merge(pr, on=["date", "channel", "family"], how="left")
        p["scheme_disc"] = p.pop("scheme_disc2").fillna(0.0)
    p["scheme_on"] = (p["scheme_disc"] > 0).astype(float)

    # ---- MRP
    mr = _find(ws, "product_master", {"sku", "Effective_Date", "mrp"})
    if mr is not None:
        mr = mr.assign(Effective_Date=pd.to_datetime(mr["Effective_Date"])).sort_values("Effective_Date")
        p = p.sort_values("date")
        p = pd.merge_asof(p, mr.rename(columns={"mrp": "mrp_now"})[["sku", "Effective_Date", "mrp_now"]], left_on="date",
                          right_on="Effective_Date", by="sku", direction="backward").drop(columns="Effective_Date")
        first = mr.groupby("sku")["mrp"].first()
        p["mrp_rel"] = p["mrp_now"] / p["sku"].map(first)
    if "mrp_rel" not in p:
        p["mrp_rel"] = np.nan

    # ---- Nielsen: distribution, share, price gap (monthly -> week)
    nl = _find(ws, "market", {"Market_Region", "category", "brand", "Weighted_Distribution_Pct", "price", "Manufacturer"})
    if nl is not None:
        nl = nl.assign(date=pd.to_datetime(nl["date"]), family=nl["category"].map(NIELSEN_FAMILY))
        nl = nl.dropna(subset=["family"])
        ours = nl["Manufacturer"].astype(str).str.contains("Eveready", case=False)
        mine = nl[ours].groupby(["Market_Region", "family", "date"]).agg(wdist=("Weighted_Distribution_Pct", "mean"), vshare=("Volume_Share_Pct", "sum"),
                                                                       my_price=("price", "mean")).reset_index()
        rival = nl[~ours].groupby(["Market_Region", "family", "date"])["price"].mean().rename("rival_price").reset_index()
        nn = mine.merge(rival, on=["Market_Region", "family", "date"], how="left")
        nn["price_gap"] = nn["my_price"] / nn["rival_price"]
        nn = nn.rename(columns={"Market_Region": "region", "date": "month_start"}).drop(columns=["my_price", "rival_price"])
        p["month_start"] = p["date"].dt.to_period("M").dt.to_timestamp()
        p = p.merge(nn, on=["region", "family", "month_start"], how="left")
        notes["sources"]["market"] = "Nielsen market audit (category-to-family mapping is our assumption)"
    else:
        notes["missing"].append("market audit")

    # ---- Quick commerce (dark store partners), by region x family x week; only meaningful for the DARK channel
    ds = _find(ws, "market", {"Depot_Code", "Partner_PO_Qty", "volume", "category"})
    dep = _find(ws, "sales", {"depot", "region"})
    if ds is not None and dep is not None:
        dmap = dep.drop_duplicates("depot").set_index("depot")["region"]
        ds = ds.assign(date=_norm_week(ds["date"]), region=ds["Depot_Code"].map(dmap))
        q = ds.groupby(["region", "category", "date"]).agg(po=("Partner_PO_Qty", "sum"), st=("volume", "sum")).reset_index()
        q["qc_ratio"] = q["st"] / q["po"].replace(0, np.nan)
        q = q.rename(columns={"category": "family"})[["region", "family", "date", "qc_ratio"]]
        p = p.merge(q, on=["region", "family", "date"], how="left")
        p.loc[p["channel"] != "DARK", "qc_ratio"] = np.nan
    else:
        p["qc_ratio"] = np.nan

    # ---- commodity & freight (monthly)
    p["month_start"] = p["date"].dt.to_period("M").dt.to_timestamp()
    cm = _find(ws, "supply", {"Zinc_INR_per_kg", "USD_INR"})
    if cm is not None:
        cm = cm.assign(month_start=pd.to_datetime(cm["date"]).dt.to_period("M").dt.to_timestamp())
        ren = {"Zinc_INR_per_kg": "zinc", "Manganese_Dioxide_INR_per_kg": "mno2", "Copper_INR_per_kg": "copper",
               "Aluminium_INR_per_kg": "aluminium", "Lithium_Carbonate_INR_per_kg": "lithium", "USD_INR": "usd_inr",
               "LED_Component_Index_100": "led_index"}
        cm = cm.rename(columns=ren)[["month_start"] + [v for v in ren.values() if v in cm.columns or v in ren.values()]]
        cm = cm.loc[:, ~cm.columns.duplicated()]
        p = p.merge(cm.drop_duplicates("month_start"), on="month_start", how="left")
    fr = _find(ws, "supply", {"Road_Freight_INR_per_Tonne_Km"})
    if fr is not None:
        fr = fr.assign(month_start=pd.to_datetime(fr["date"]).dt.to_period("M").dt.to_timestamp())
        p = p.merge(fr.rename(columns={"Road_Freight_INR_per_Tonne_Km": "road_freight", "Diesel_Price_Index_100": "diesel"})[
            ["month_start", "road_freight", "diesel"]].drop_duplicates("month_start"), on="month_start", how="left")
    p = p.drop(columns=["month_start"])
    for c in ALL_FEATURES:
        if c not in p:
            p[c] = np.nan
        if c.startswith("win_"):
            continue
    for c in [c for c in p.columns if c.startswith("win_")]:
        p[c] = p[c].fillna(0.0)
    for c in ("region", "channel", "family", "sku", "brand"):
        if c in p:
            p[c] = p[c].astype(str)
    p = p.sort_values(["region", "sku", "channel", "date"]).reset_index(drop=True)
    notes["built_seconds"] = round(time.time() - t0, 1)
    notes["rows"] = int(len(p))
    notes["windows"] = sorted(c for c in p.columns if c.startswith("win_"))
    return p, notes

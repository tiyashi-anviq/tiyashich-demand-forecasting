"""Monthly calendar features for the forecast: festival windows, bell curves, month shape.

Festival rows come from the loaded Festival Calendar table. Rows for later years can be added in
`festivals_extra.json` next to this file (each row: name, Group, date, Sell_In_Peak_Weeks_Before). That file only
exists once the user has approved the dates.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from ..eda import panel as P

EXTRA = Path(__file__).with_name("festivals_extra.json")
BELLS = (("DIWALI", "diwali"), ("DURGA", "durga"))


def festival_rows(ws: dict) -> tuple[pd.DataFrame, list[dict]]:
    fest = P._find(ws, "events", {"name", "Group", "date", "Sell_In_Peak_Weeks_Before"})
    if fest is None:
        raise RuntimeError("The festival calendar was not loaded.")
    fest = fest.assign(date=pd.to_datetime(fest["date"]))[["Group", "name", "date", "Sell_In_Peak_Weeks_Before"]]
    extra: list[dict] = []
    if EXTRA.exists():
        rows = json.loads(EXTRA.read_text())
        extra = rows
        add = pd.DataFrame(rows)
        add["date"] = pd.to_datetime(add["date"])
        fest = pd.concat([fest, add[["Group", "name", "date", "Sell_In_Peak_Weeks_Before"]]], ignore_index=True)
    return fest.sort_values("date").reset_index(drop=True), extra


def monthly_features(ws: dict, first: str = "2022-09-26", last: str = "2028-01-03") -> tuple[pd.DataFrame, dict]:
    """One row per calendar month (weeks counted by their Monday, as in the sales data)."""
    fest, extra = festival_rows(ws)
    weeks = pd.DataFrame({"date": pd.date_range(first, last, freq="7D")})
    wk = weeks["date"].to_numpy()
    for key, tag in BELLS:
        g = fest[fest["Group"].astype(str).str.upper().str.contains(key)]
        if g.empty:
            continue
        fd = g["date"].to_numpy()
        diff = (fd[None, :] - wk[:, None]).astype("timedelta64[D]").astype(float) / 7.0
        d = diff[np.arange(len(wk)), np.abs(diff).argmin(axis=1)]
        weeks[f"{tag}_bell"] = np.exp(-0.5 * (d / 2.0) ** 2)
    for g, gg in fest.groupby(fest["Group"].astype(str).str.upper().str.replace(r"[^A-Z0-9]+", "_", regex=True)):
        win = np.zeros(len(weeks), dtype=bool)
        for r in gg.itertuples():
            pw = r.Sell_In_Peak_Weeks_Before if pd.notna(r.Sell_In_Peak_Weeks_Before) else 3
            dd = (r.date - weeks["date"]).dt.days
            win |= ((dd >= 0) & (dd <= 7 * min(pw, 8))).to_numpy()
        weeks[f"win_{g}"] = win.astype(float)
    weeks["month_end_week"] = ((weeks["date"] + pd.Timedelta(days=7)).dt.month != weeks["date"].dt.month).astype(float)
    weeks["m"] = weeks["date"].dt.to_period("M")
    agg = {c: "max" for c in weeks.columns if c.endswith("_bell")}
    agg.update({c: "mean" for c in weeks.columns if c.startswith("win_")})
    agg["month_end_week"] = "sum"
    agg["date"] = "count"
    mf = weeks.groupby("m").agg(agg).rename(columns={"date": "n_weeks"})
    mf["moy"] = [p.month for p in mf.index]
    last_fest = fest["date"].max()
    return mf, dict(festivals_through=last_fest.date().isoformat(), extra_rows=len(extra))

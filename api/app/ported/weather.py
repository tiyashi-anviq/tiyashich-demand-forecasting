"""Weather & shocks and Seasonal demand, from the weekly sales panel Explore already builds."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import store
from ..eda import engine as eda
from ..eda import panel as P

SEASONS = [
    dict(k="Summer", label="Summer", months=[3, 4, 5], text="March to May"),
    dict(k="Monsoon", label="Monsoon", months=[6, 7, 8, 9], text="June to September"),
    dict(k="Festive", label="Festive", months=[10, 11], text="October and November"),
    dict(k="Winter", label="Winter", months=[12, 1, 2], text="December to February"),
]
CUT = 8          # weeks into the season at which the pre-shock baseline is made
BASE_WEEKS = 8   # weeks of recent sales the baseline is scaled to


def _panel() -> pd.DataFrame:
    p = eda.panel()
    if p is None:
        raise RuntimeError("panel not ready")
    return p


def _split(s):
    return [x for x in s.split("~") if x] if s else None


def _filt(p: pd.DataFrame, family, region, channel=None) -> pd.DataFrame:
    if channel:
        p = p[p["channel"].isin(channel)]
    if family:
        p = p[p["family"].isin(family)]
    if region:
        p = p[p["region"].isin(region)]
    return p


def options() -> dict:
    p = _panel()
    yrs = sorted({int(d.year) for d in p["date"].unique() if d.month >= 4})
    seasons = [y for y in yrs if y >= 2024]
    return dict(
        families=sorted(p["family"].dropna().unique().tolist()),
        regions=sorted(p["region"].dropna().unique().tolist()),
        years=seasons,
    )


def shock(year: int, family, region, channel=None) -> dict:
    """One monsoon, week by week: actual orders against a baseline made `CUT` weeks in, with the rain behind them.

    The baseline carries last year's same-week orders forward, scaled by how this year ran against last year in the
    `BASE_WEEKS` weeks before the cut. It is deliberately simple so a shock shows as a gap against it."""
    p = _filt(_panel(), _split(family), _split(region), _split(channel))
    wk = p.groupby("date")["orders_qty"].sum().sort_index()
    rain_all = _panel()
    rr = _filt(rain_all, None, _split(region)).groupby(["date", "region"])["rain"].mean().groupby("date").mean().sort_index()
    last = wk.index.max()
    start = pd.Timestamp(year=year, month=4, day=1)
    start = start + pd.Timedelta(days=(7 - start.weekday()) % 7)
    end = min(pd.Timestamp(year=year, month=9, day=30), last)
    weeks = pd.date_range(start, end, freq="7D")
    actual = [float(wk.get(w, np.nan)) for w in weeks]
    ly = [wk.get(w - pd.Timedelta(days=364), np.nan) for w in weeks]
    forecast: list = [None] * len(weeks)
    if len(weeks) > CUT and not np.isnan(ly[:CUT]).all():
        lo = max(0, CUT - BASE_WEEKS)
        num = np.nansum(actual[lo:CUT])
        den = np.nansum(ly[lo:CUT])
        k = num / den if den else None
        if k:
            for i in range(CUT, len(weeks)):
                if not np.isnan(ly[i]):
                    forecast[i] = float(ly[i] * k)
    rain = [float(rr.get(w, np.nan)) for w in weeks]
    exp = []
    for w in weeks:
        vals = [rr.get(w + pd.Timedelta(days=364 * d), np.nan) for d in (-3, -2, -1, 1, 2, 3)]
        vals = [v for v in vals if not np.isnan(v)]
        exp.append(float(np.mean(vals)) if len(vals) >= 2 else None)
    mdel = _filt(_panel(), None, _split(region))
    mdel = mdel[mdel["date"].dt.year == year].groupby("region")["monsoon_delay"].mean()
    clean = lambda a: [None if v is None or (isinstance(v, float) and np.isnan(v)) else round(v, 2) for v in a]
    return dict(
        year=year, weeks=[w.strftime("%Y-%m-%d") for w in weeks], cut=CUT, base_weeks=BASE_WEEKS,
        actual=clean(actual), forecast=clean(forecast), rain=clean(rain), expected_rain=clean(exp),
        delay_days=None if mdel.empty else round(float(mdel.mean()), 1),
        delay_by_region={k: round(float(v), 1) for k, v in mdel.items()},
        incomplete=bool(len(weeks) and weeks[-1] < pd.Timestamp(year=year, month=9, day=24)),
    )


def seasonal(family, region, channel=None) -> dict:
    """Average weekly orders in each season against each family's and product's own all-year average."""
    p = _filt(_panel(), _split(family), _split(region), _split(channel))
    p = p.assign(season=p["date"].dt.month.map({m: s["k"] for s in SEASONS for m in s["months"]}))
    weekly = p.groupby(["sku", "family", "date", "season"])["orders_qty"].sum().reset_index()
    wk_all = p.groupby(["date", "season"])["orders_qty"].sum().reset_index()

    def block(df: pd.DataFrame, key: list[str]) -> pd.DataFrame:
        tot = df.groupby(key + ["date"])["orders_qty"].sum().reset_index()
        tot["season"] = tot["date"].dt.month.map({m: s["k"] for s in SEASONS for m in s["months"]})
        per = tot.groupby(key + ["season"])["orders_qty"].mean().unstack("season")
        per["all"] = tot.groupby(key)["orders_qty"].mean()
        return per

    def pack(per: pd.DataFrame, key: str) -> list[dict]:
        rows = []
        for idx, r in per.iterrows():
            rows.append(dict(name=idx if isinstance(idx, str) else idx[0], per_week={s["k"]: round(float(r.get(s["k"], np.nan)), 1) if not np.isnan(r.get(s["k"], np.nan)) else None for s in SEASONS},
                             all=round(float(r["all"]), 1),
                             index={s["k"]: round(float(r[s["k"]] / r["all"]), 3) if r["all"] and not np.isnan(r.get(s["k"], np.nan)) else None for s in SEASONS}))
        return rows

    fam = pack(block(p, ["family"]), "family")
    sk = block(p, ["sku"])
    top = sk["all"].sort_values(ascending=False).head(40).index
    prods = pack(sk.loc[top], "sku")
    sm = P._find(store.read_workspace() or {}, "product_master", {"sku", "description", "family"}, "SKU Master")
    info = {} if sm is None else sm.drop_duplicates("sku").set_index("sku")[["description", "family"]].to_dict("index")
    for r in prods:
        d = info.get(r["name"], {})
        r["sku"], r["name"], r["family"] = r["name"], d.get("description", r["name"]), d.get("family")
    month = p.assign(m=p["date"].dt.month).groupby(["m", "date"])["orders_qty"].sum().reset_index().groupby("m")["orders_qty"].mean()
    cur = pd.Timestamp(eda.panel()["date"].max()).month
    now = next(s["k"] for s in SEASONS if cur in s["months"])
    return dict(seasons=SEASONS, current=now, families=fam, products=prods,
                months={int(m): round(float(v), 1) for m, v in month.items()},
                all_per_week=round(float(wk_all.groupby("date")["orders_qty"].sum().mean()), 1))

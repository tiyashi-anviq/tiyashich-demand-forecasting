"""The evidence behind one family and month in the forecast challenge: history, last year, how reliable each source has been,
stock cover, schemes, festivals and events, the region by business unit split, and the SKUs behind the number."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import store
from ..eda import panel as P
from ..forecast import engine
from ..forecast.views import _wape
from . import core

_cache: dict = {}


def _tables():
    """Workspace tables used here, read once per build."""
    r = engine.result()
    if _cache.get("key") == id(r):
        return _cache["t"]
    ws = store.read_workspace() or {}
    t = {}
    t["horizon"] = P._find(ws, "forecast", {"budget_qty", "bu_qty", "actual_qty"})
    t["inv"] = P._find(ws, "inventory", {"closing_qty", "safety_stock"})
    t["norms"] = P._find(ws, "supply", {"Product_Family", "Target_Stock_Cover_Days_Min"}, "Inventory Norms")
    t["skum"] = P._find(ws, "product_master", {"sku", "family", "brand"})
    t["schemes"] = P._find(ws, "promotions", {"family", "discount_pct"})
    t["fest"] = P._find(ws, "events", {"name", "Group", "date"}, "Festival Calendar")
    t["events"] = P._find(ws, "events", {"Product_Family", "Estimated_Impact"})
    _cache.update(key=id(r), t=t)
    return t


def _wb(a, f) -> dict:
    w = _wape(np.asarray(a, float), np.asarray(f, float))
    return dict(wape=w["wape"], bias=w["bias"])


def _month_label(m: str) -> str:
    return core._label(m)


def detail(m: str, fam: str) -> dict:
    r = engine.result()
    mod = core._model()
    if m not in mod["months"] or fam not in mod["families"]:
        raise ValueError("That month or family is not in this cycle.")
    lead = mod["months"].index(m) + 1
    t = _tables()
    sidx, months, fm = r["sidx"], r["months"], r["fmonths"]
    ym = {x: i for i, x in enumerate(months)}
    fidx = np.where((sidx["family"] == fam).to_numpy())[0]
    hist = np.nansum(r["Y"][fidx], axis=0)
    ens = r["fut"]["ens"][:, fidx].sum(axis=1)

    # 1. the family over time: 18 months of orders, the model for the months ahead, last year alongside
    n = 18
    h_m, h_v = months[-n:], [float(x) for x in hist[-n:]]
    ly = lambda x: (float(hist[ym[f"{int(x[:4]) - 1}{x[4:]}"]]) if f"{int(x[:4]) - 1}{x[4:]}" in ym else None)  # noqa: E731
    ahead = [dict(month=x, label=_month_label(x), model=float(ens[k]), last_year=ly(x)) for k, x in zip(core.MONTHS_AHEAD, mod["months"])]
    first = fm[0]  # the month still filling in
    first_row = dict(month=first, label=_month_label(first), model=float(ens[0]), last_year=ly(first))
    last3 = float(np.mean(hist[-3:]))
    last3_ly = float(np.mean([hist[ym[f"{int(x[:4]) - 1}{x[4:]}"]] for x in months[-3:] if f"{int(x[:4]) - 1}{x[4:]}" in ym] or [np.nan]))
    this = next(a for a in ahead if a["month"] == m)
    series = dict(months=h_m, actual=h_v, first=first_row, ahead=ahead,
                  recent_yoy=(last3 / last3_ly - 1) if last3_ly and np.isfinite(last3_ly) else None,
                  model_yoy=(this["model"] / this["last_year"] - 1) if this["last_year"] else None,
                  last3_avg=last3, peak=dict(month=months[-n:][int(np.argmax(h_v))], value=max(h_v)))

    # 2. how reliable each source has been at this lead time, on the months held back
    test = ~r["is_val"]
    h = lead
    a_t = np.nansum(r["act"][fidx][:, test], axis=0)
    f_t = np.nansum(r["cube"]["ens"][h - 1][fidx][:, test], axis=0)
    tm = [x for x, k in zip(r["tmonths"], test) if k]
    ly_t = np.array([hist[ym[f"{int(x[:4]) - 1}{x[4:]}"]] if f"{int(x[:4]) - 1}{x[4:]}" in ym else np.nan for x in tm])
    reliab = [dict(source="Model", **_wb(a_t, f_t)), dict(source="Last year's number", **_wb(a_t, ly_t))]
    track = []
    units, bu_of = core._units()
    bu_name = {u["bu"]: u["name"] for u in units}
    hz = t["horizon"]
    sku_fam = None
    if hz is not None and t["skum"] is not None:
        sku_fam = t["skum"].drop_duplicates("sku").set_index("sku")["family"]
        hh = hz[(hz["horizon"] == f"M{h}") & hz["actual_qty"].notna()].copy()
        hh["family"] = hh["sku"].map(sku_fam)
        hh = hh[hh["family"] == fam]
        hh["bu"] = hh["channel"].map(lambda c: bu_of.get(c, c))
        if len(hh):
            hh["month"] = pd.to_datetime(hh["date"]).dt.strftime("%Y-%m")
            last12 = sorted(hh["month"].unique())[-12:]
            hh = hh[hh["month"].isin(last12)]
            tot = hh.groupby("month")[["actual_qty", "forecast_qty", "budget_qty"]].sum()
            reliab += [dict(source="Sales team (BU submitted)", **_wb(tot["actual_qty"], tot["forecast_qty"])), dict(source="Budget", **_wb(tot["actual_qty"], tot["budget_qty"]))]
            for dim, col, label in (("Region", "region", "Region"), ("Business unit", "bu", "Business unit")):
                for key, g in hh.groupby(col):
                    gm = g.groupby("month")[["actual_qty", "forecast_qty", "budget_qty"]].sum()
                    if dim == "Region":
                        ix = np.where(((sidx["family"] == fam) & (sidx["region"] == key)).to_numpy())[0]
                    else:
                        ix = np.where(((sidx["family"] == fam) & (sidx["channel"].map(lambda c: bu_of.get(c, c)) == key)).to_numpy())[0]
                    mdl = _wb(np.nansum(r["act"][ix][:, test], axis=0), np.nansum(r["cube"]["ens"][h - 1][ix][:, test], axis=0)) if len(ix) else dict(wape=None, bias=None)
                    tm_, bd = _wb(gm["actual_qty"], gm["forecast_qty"]), _wb(gm["actual_qty"], gm["budget_qty"])
                    track.append(dict(dim=dim, name=bu_name.get(key, key), model=mdl, team=tm_, budget=bd, months=len(gm)))

    # 3. the region by business unit split of the model, for the month
    grid = []
    for reg in mod["regions"]:
        row = dict(region=reg)
        for u in mod["units"]:
            c = mod["cell"].get((fam, reg, u["bu"], m))
            row[u["bu"]] = None if c is None else dict(model=round(c[0]), last_year=None if c[1] is None else round(c[1]))
        grid.append(row)

    # 4. SKUs behind the number: model against the same month last year
    skus = []
    sk = r["skus"].reset_index(drop=True)
    kix = np.where((sk["family"] == fam).to_numpy())[0]
    if len(kix):
        ly3 = [ym.get(f"{int(x[:4]) - 1}{x[4:]}") for x in months[-3:]]
        df = pd.DataFrame(dict(sku=sk["sku"].to_numpy()[kix], recent=np.nansum(r["skuY"][kix][:, -3:], axis=1),
                               ly=np.nansum(r["skuY"][kix][:, [i for i in ly3 if i is not None]], axis=1) if any(i is not None for i in ly3) else np.nan))
        g = df.groupby("sku").sum().sort_values("recent", ascending=False)
        desc = t["skum"].drop_duplicates("sku").set_index("sku")["description"] if t["skum"] is not None and "description" in t["skum"].columns else {}
        tot_r = float(g["recent"].sum()) or 1.0
        for s_, row in g.head(10).iterrows():
            share = float(row["recent"]) / tot_r
            skus.append(dict(sku=s_, description=str(desc.get(s_, "")) if len(desc) else "", share=share, model=this["model"] * share,
                             recent=float(row["recent"]), last_year=float(row["ly"]), yoy=(float(row["recent"]) / float(row["ly"]) - 1) if row["ly"] else None))

    # 5. stock cover against the norm
    stock = None
    inv = t["inv"]
    if inv is not None and sku_fam is not None:
        iv = inv.copy()
        iv["family"] = iv["sku"].map(sku_fam)
        iv = iv[iv["family"] == fam]
        if len(iv):
            iv["date"] = pd.to_datetime(iv["date"])
            last = iv["date"].max()
            now = iv[iv["date"] == last]
            run = iv[iv["date"] > last - pd.Timedelta(days=28)]["Invoiced_Qty"].sum() * 30 / 28 if "Invoiced_Qty" in iv.columns else None
            norm = t["norms"][t["norms"]["Product_Family"] == fam].iloc[0] if t["norms"] is not None and (t["norms"]["Product_Family"] == fam).any() else None
            st = now["stock_status"].value_counts().to_dict() if "stock_status" in now.columns else {}
            app_last = float(hist[-1]) if len(hist) else None
            stock = dict(as_of=last.date().isoformat(), closing=float(now["closing_qty"].sum()), safety=float(now["safety_stock"].sum()), monthly_run_rate=run,
                         units_per_app_unit=(run / app_last) if run and app_last else None,
                         cover_days_now=(float(now["closing_qty"].sum()) / (run / 30)) if run else None,
                         norm_min=None if norm is None else float(norm["Target_Stock_Cover_Days_Min"]), norm_max=None if norm is None else float(norm["Target_Stock_Cover_Days_Max"]),
                         short_below=None if norm is None else float(norm["Short_Flag_Below_Cover_Days"]), over_above=None if norm is None else float(norm["Overstock_Flag_Above_Cover_Days"]),
                         locations=int(len(now)), status={k: int(v) for k, v in st.items()})

    # 6. things that move demand in the month: schemes, festivals, events logged
    start = pd.Timestamp(f"{m}-01")
    end = start + pd.offsets.MonthEnd(0)
    drivers = dict(schemes=[], festivals=[], events=[])
    sc = t["schemes"]
    if sc is not None:
        s = sc[(sc["family"] == fam) & (pd.to_datetime(sc["start_date"]) <= end) & (pd.to_datetime(sc["end_date"]) >= start)]
        for ch, g in s.groupby("channel"):
            drivers["schemes"].append(dict(channel=ch, weeks=int(len(g)), avg_discount=float(g["discount_pct"].mean())))
        # the same month a year ago, for comparison
        s0 = sc[(sc["family"] == fam) & (pd.to_datetime(sc["start_date"]) <= end - pd.DateOffset(years=1)) & (pd.to_datetime(sc["end_date"]) >= start - pd.DateOffset(years=1))]
        drivers["schemes_last_year"] = dict(weeks=int(len(s0)), avg_discount=float(s0["discount_pct"].mean()) if len(s0) else None)
    fe = t["fest"]
    if fe is not None:
        f = fe[(pd.to_datetime(fe["date"]) >= start - pd.Timedelta(days=21)) & (pd.to_datetime(fe["date"]) <= end + pd.Timedelta(days=7))]
        for x in f.sort_values("date").itertuples():
            wk = getattr(x, "Sell_In_Peak_Weeks_Before", None)
            drivers["festivals"].append(dict(name=str(x.name), date=pd.Timestamp(x.date).date().isoformat(), group=str(x.Group), peak_weeks_before=None if pd.isna(wk) else float(wk)))
    ev = t["events"]
    if ev is not None:
        e = ev[ev["Product_Family"] == fam].sort_values("date", ascending=False).head(6)
        drivers["events"] = [dict(date=pd.Timestamp(x.date).date().isoformat(), region=str(x.Region), channel=str(x.Channel), name=str(x.name), impact=str(x.Estimated_Impact), by=str(x.Logged_By)) for x in e.itertuples()]

    return dict(month=m, family=fam, lead=lead, series=series, reliability=reliab, track=track, grid=grid,
                units=[dict(bu=u["bu"], name=u["name"]) for u in mod["units"]], skus=skus, stock=stock, drivers=drivers)


def month_facts(m: str) -> dict:
    """What was going on around a month, nationally: festivals, trade-scheme weeks and logged events, for the month, the month before and the same month a year earlier."""
    t = _tables()

    def one(x: str) -> dict:
        start = pd.Timestamp(f"{x}-01")
        end = start + pd.offsets.MonthEnd(0)
        out = dict(month=x, label=_month_label(x), festivals=[], scheme_weeks=0, avg_discount=None, events=[])
        fe = t["fest"]
        if fe is not None:
            f = fe[(pd.to_datetime(fe["date"]) >= start) & (pd.to_datetime(fe["date"]) <= end)].sort_values("date")
            out["festivals"] = [dict(name=str(r.name), date=pd.Timestamp(r.date).date().isoformat()) for r in f.itertuples()]
            # the calendar ends before some coming months; festivals that fall on the same date every year (Christmas, Republic Day) still happen then
            if "Moves_Each_Year" in fe.columns and start > pd.to_datetime(fe["date"]).max():
                fx = fe[fe["Moves_Each_Year"].astype(str).str.upper() == "N"].copy()
                fx["d"] = pd.to_datetime(fx["date"])
                fx = fx[fx["d"].dt.month == start.month].sort_values("d").drop_duplicates("name", keep="last")
                out["festivals"] += [dict(name=str(r.name), date=pd.Timestamp(year=start.year, month=r.d.month, day=r.d.day).date().isoformat()) for r in fx.itertuples()]
        sc = t["schemes"]
        if sc is not None:
            s = sc[(pd.to_datetime(sc["start_date"]) <= end) & (pd.to_datetime(sc["end_date"]) >= start)]
            out["scheme_weeks"] = int(len(s))
            out["avg_discount"] = float(s["discount_pct"].mean()) if len(s) else None
        ev = t["events"]
        if ev is not None:
            e = ev[(pd.to_datetime(ev["date"]) >= start) & (pd.to_datetime(ev["date"]) <= end)]
            out["events"] = [dict(date=pd.Timestamp(r.date).date().isoformat(), family=str(r.Product_Family), region=str(r.Region), name=str(r.name), impact=str(r.Estimated_Impact)) for r in e.itertuples()]
        return out

    y, mo = int(m[:4]), int(m[5:])
    prev = f"{y - 1}-12" if mo == 1 else f"{y}-{mo - 1:02d}"
    return dict(month=one(m), last_month=one(prev), last_year=one(f"{y - 1}-{mo:02d}"))


def _stock_by_family(r, t) -> dict:
    """Closing stock, the inventory-to-app unit scale and the cover norms for each family, from the latest inventory week."""
    out: dict = {}
    inv, skum = t["inv"], t["skum"]
    if inv is None or skum is None:
        return out
    sku_fam = skum.drop_duplicates("sku").set_index("sku")["family"]
    iv = inv.copy()
    iv["family"] = iv["sku"].map(sku_fam)
    iv["date"] = pd.to_datetime(iv["date"])
    last = iv["date"].max()
    months, sidx = r["months"], r["sidx"]
    for fam, g in iv.groupby("family"):
        now = g[g["date"] == last]
        run = g[g["date"] > last - pd.Timedelta(days=28)]["Invoiced_Qty"].sum() * 30 / 28 if "Invoiced_Qty" in g.columns else None
        fidx = np.where((sidx["family"] == fam).to_numpy())[0]
        app_last = float(np.nansum(r["Y"][fidx][:, -1])) if len(fidx) else None
        norm = t["norms"][t["norms"]["Product_Family"] == fam] if t["norms"] is not None else None
        n = norm.iloc[0] if norm is not None and len(norm) else None
        out[fam] = dict(closing=float(now["closing_qty"].sum()), scale=(run / app_last) if run and app_last else None,
                        norm_min=None if n is None else float(n["Target_Stock_Cover_Days_Min"]), norm_max=None if n is None else float(n["Target_Stock_Cover_Days_Max"]),
                        over_above=None if n is None else float(n["Overstock_Flag_Above_Cover_Days"]), as_of=last.date().isoformat())
    return out


def checks(m: str) -> dict:
    """For every family and business unit in the month: the reference points a number is checked against."""
    r = engine.result()
    mod = core._model()
    if m not in mod["months"]:
        raise ValueError("That month is not in this cycle.")
    t = _tables()
    units, bu_of = core._units()
    sidx, months = r["sidx"], r["months"]
    ym = {x: i for i, x in enumerate(months)}
    ly_i = ym.get(f"{int(m[:4]) - 1}{m[4:]}")
    ly3 = [ym.get(f"{int(x[:4]) - 1}{x[4:]}") for x in months[-3:]]
    bu_col = sidx["channel"].map(lambda c: bu_of.get(c, units[0]["bu"]))
    stock = _stock_by_family(r, t)
    rows = []
    for fam in mod["families"]:
        for u in mod["units"]:
            ix = np.where(((sidx["family"] == fam) & (bu_col == u["bu"])).to_numpy())[0]
            if not len(ix):
                continue
            hist = np.nansum(r["Y"][ix], axis=0)
            model = sum(mod["cell"][(fam, reg, u["bu"], m)][0] for reg in mod["regions"] if (fam, reg, u["bu"], m) in mod["cell"])
            if model <= 0:
                continue
            ly = float(hist[ly_i]) if ly_i is not None else None
            l3 = float(np.mean(hist[-3:]))
            l3ly = [hist[i] for i in ly3 if i is not None]
            rows.append(dict(family=fam, bu=u["bu"], bu_name=u["name"], model=float(model), last_year=ly, last3=l3, last3_ly=float(np.mean(l3ly)) if l3ly else None))
    return dict(month=m, rows=rows, stock=stock)

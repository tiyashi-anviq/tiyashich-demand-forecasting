"""Answers for the Forecasts screen, cut by the family / region / channel the user picked."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..eda.analyses import clean as _clean, fmt
from . import engine

def clean(o):
    def un(x):
        if isinstance(x, np.ndarray):
            return [un(v) for v in x.tolist()]
        if isinstance(x, dict):
            return {k: un(v) for k, v in x.items()}
        if isinstance(x, (list, tuple)):
            return [un(v) for v in x]
        return x
    return _clean(un(o))


DIMS = ("family", "region", "channel")


def _sel(r: dict, f: dict) -> tuple[np.ndarray, np.ndarray]:
    sidx = r["sidx"]
    m = np.ones(len(sidx), dtype=bool)
    for k in DIMS:
        if f.get(k):
            m &= sidx[k].isin(f[k]).to_numpy()
    km = m[r["bucket"]]
    if f.get("product"):
        km &= r["skus"]["sku"].isin(f["product"]).to_numpy()
        m &= np.bincount(r["bucket"][km], minlength=len(sidx)) > 0
    return np.where(m)[0], np.where(km)[0]


def _for(r: dict, f: dict) -> dict:
    """With a product filter, every series is cut down to the chosen products. Actuals are the products' own orders. A forecast is the series
    forecast times the products' share of it (their last 8 weeks of orders), the same split the SKU lines already use. Invoiced and weekly actuals
    are scaled by that share, since they are not kept per product."""
    if not f.get("product"):
        return r
    km = r["skus"]["sku"].isin(f["product"]).to_numpy()
    S = len(r["sidx"])
    b = r["bucket"][km]
    w = np.bincount(b, weights=r["shares_last"][km], minlength=S)
    own = np.zeros((S, r["skuY"].shape[1]))
    np.add.at(own, b, r["skuY"][km])
    Y = np.where(np.isnan(r["Y"]), np.nan, own)
    tc = [r["months"].index(m) for m in r["tmonths"]]
    scale = lambda d, ax: {k: v * np.expand_dims(w, ax) for k, v in d.items()}
    r2 = dict(r)
    r2.update(Y=Y, act=Y[:, tc], Yi=r["Yi"] * w[:, None], Ywk=r["Ywk"] * w[:, None],
              cube=scale(r["cube"], (0, 2)), fcube=scale(r["fcube"], (0, 2)), fut=scale(r["fut"], 0),
              rec={p: {o: v * w[None, :] for o, v in d.items()} for p, d in r["rec"].items()})
    return r2


def _wape(a: np.ndarray, f: np.ndarray) -> dict:
    ok = np.isfinite(a) & np.isfinite(f)
    a, f = a[ok], f[ok]
    t = a.sum()
    if t <= 0:
        return dict(wape=None, under=None, over=None, bias=None)
    return dict(wape=float(np.abs(a - f).sum() / t), under=float(np.clip(a - f, 0, None).sum() / t),
                over=float(np.clip(f - a, 0, None).sum() / t), bias=float((f - a).sum() / t))


def _band(r: dict, idx: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """10th and 90th percentile of log(actual / forecast) for the selection, per horizon, from the validation and test months."""
    lo, hi = np.zeros(15), np.zeros(15)
    q = {}
    for h in (1, 2, 3):
        a = r["act"][idx].sum(axis=0)
        f = np.nansum(r["cube"]["ens"][h - 1][idx], axis=0)
        lr = np.log(a[a > 0] / np.clip(f[a > 0], 1, None))
        q[h] = (float(np.quantile(lr, 0.1)), float(np.quantile(lr, 0.9)))
    for h in range(1, 16):
        b = q[min(h, 3)]
        s = 1.0 if h <= 3 else (h / 3) ** 0.5
        lo[h - 1] = min(b[0] * s, -0.02 * s)
        hi[h - 1] = max(b[1] * s, 0.02 * s)
    return lo, hi


def _median_miss(r: dict, idx: np.ndarray) -> np.ndarray:
    """Median of log(actual / forecast) for the selection, by horizon, over the validation and test months. Index 0 is 1 month ahead."""
    out = []
    for h in (1, 2, 3):
        a = r["act"][idx].sum(axis=0)
        f = np.nansum(r["cube"]["ens"][h - 1][idx], axis=0)
        out.append(float(np.median(np.log(a[a > 0] / np.clip(f[a > 0], 1, None)))))
    return np.array(out)


def options() -> dict:
    r = engine.result()
    sidx = r["sidx"]
    names = r.get("sku_names", {})
    prod = [dict(id=c, label=f"{c} {names[c].replace('Eveready ', '')}" if names.get(c) else c) for c in sorted(r["skus"]["sku"].unique())]
    return dict(family=sorted(sidx["family"].unique()), region=sorted(sidx["region"].unique()), channel=sorted(sidx["channel"].unique()), product=prod)


def _notes(r: dict, team: dict | None, f: dict | None = None) -> list[dict]:
    out = []
    ci = r["cal_info"]
    if not ci.get("extra_rows"):
        out.append(dict(tone="watch", text=f"Festival dates after {pd.Timestamp(ci['festivals_through']).strftime('%-d %b %Y')} are not in the calendar yet, so the 2027 Diwali and Durga Puja peaks are carried over from the pattern of earlier years. Add the 2027 dates to sharpen the Oct to Dec 2027 months."))
    late = [x for x in r.get("late_skus", []) if not (f or {}).get("family") or x["family"] in f["family"]]
    if late:
        names = r.get("sku_names", {})
        out.append(dict(tone="watch", text=f"{len(late)} new SKU{'s' if len(late) > 1 else ''} ({', '.join(x['sku'] for x in late)}) first sold on {pd.Timestamp(min(x['first'] for x in late)).strftime('%-d %b %Y')} and have no full month yet, so they are left out of these numbers."))
    out.append(dict(tone="info", text="Future weather is not known, so rainfall and temperature enter as the usual level for each region and month."))
    return out


def _shapes(r, idx):
    """How each month's units split across its weeks, from the weekly model, for the selection: {Monday: share of its month}.
    Test months use the forecast made 3 months before (what the model knew then); future months use the latest run."""
    wd0 = pd.Timestamp(r["wk_dates"][0])
    months = r["months"]
    mend = r["wk_mend"]
    wp = r["wpred"]
    last_o = len(months) - 1
    out = {}

    def month_share(m, oi):
        arr = wp.get(oi)
        if arr is None:
            return
        mons = pd.date_range(pd.Period(m).start_time, pd.Period(m).end_time, freq="W-MON")
        hw = np.array([(d - wd0).days // 7 - mend[oi] for d in mons])
        if hw.min() < 1 or hw.max() > arr.shape[1]:
            return
        v = np.nansum(arr[idx][:, hw - 1], axis=0)
        tot = v.sum()
        for d, x in zip(mons, v):
            out[d] = float(x / tot) if tot > 0 else 1.0 / len(mons)

    for k, m in enumerate(r["tmonths"]):
        if not r["is_val"][k]:
            oi = months.index(m) - 3
            if oi >= 0:
                month_share(m, oi)
    for m in r["fmonths"]:
        month_share(m, last_o)
    return out


def _weekly(r, idx, fm, ens, p50) -> dict:
    """Weekly view from the start of the test period (Oct 2025) to Dec 2027. Actuals are the real weekly orders. Each month's forecast is
    split across its weeks using the weekly model's own week-by-week shape. Test months show the forecast made 3 months ahead."""
    wd = pd.to_datetime(r["wk_dates"])
    wa = r["Ywk"][idx].sum(axis=0)
    act = {d: float(v) for d, v in zip(wd, wa)}
    last = wd.max()
    test = ~r["is_val"]
    tmo = [m for m, t in zip(r["tmonths"], test) if t]
    cube3 = np.nansum(r["cube"]["ens"][2][idx][:, test], axis=0)
    mm = _median_miss(r, idx)
    bt = {m: float(cube3[k]) for k, m in enumerate(tmo)}
    bt50 = {m: float(cube3[k] * np.exp(mm[2])) for k, m in enumerate(tmo)}
    fpos = {m: i for i, m in enumerate(fm)}
    sh = _shapes(r, idx)
    first_test = pd.Period(tmo[0]).start_time
    days = pd.date_range(first_test, "2027-12-27", freq="W-MON")

    def nweeks(m):
        return len(pd.date_range(pd.Period(m).start_time, pd.Period(m).end_time, freq="W-MON"))
    fc, p5, a_, ly = [], [], [], []
    comb = dict(act)
    for d in days:
        m = str(d.to_period("M"))
        if d > last and m in fpos:
            comb[d] = float(ens[fpos[m]] * sh.get(d, 1.0 / nweeks(m)))
    for d in days:
        m = str(d.to_period("M"))
        s_ = sh.get(d, 1.0 / nweeks(m)) if m in (set(fpos) | set(bt)) else None
        a_.append(act.get(d) if d <= last else None)
        if d > last and m in fpos:
            fc.append(float(ens[fpos[m]] * s_)); p5.append(float(p50[fpos[m]] * s_))
        elif m in bt:
            fc.append(bt[m] * s_); p5.append(bt50[m] * s_)
        else:
            fc.append(None); p5.append(None)
        ly.append(comb.get(d - pd.Timedelta(days=364)))
    a_m = r["act"][idx][:, test].sum(axis=0)
    errs = dict(months=tmo, actual=[float(x) for x in a_m])
    for h in (1, 2, 3):
        fh = np.nansum(r["cube"]["ens"][h - 1][idx][:, test], axis=0)
        errs[f"m{h}"] = [float(x) for x in fh]
        errs[f"pct{h}"] = [float(abs(f - a) / a) if a else None for f, a in zip(fh, a_m)]
    # how close the weekly line is to the real weeks over the test period (WAPE over weeks that have actuals)
    pairs = [(a_[i], fc[i]) for i in range(len(days)) if a_[i] is not None and fc[i] is not None]
    wk_wape = float(sum(abs(a - f) for a, f in pairs) / sum(a for a, f in pairs)) if pairs else None
    tot_a = sum(a for a, f in pairs)
    wk_under = float(sum(max(a - f, 0) for a, f in pairs) / tot_a) if pairs else None
    wk_over = float(sum(max(f - a, 0) for a, f in pairs) / tot_a) if pairs else None
    wk_pct = [float(abs(fc[i] - a_[i]) / a_[i]) if (a_[i] and fc[i] is not None) else None for i in range(len(days))]
    fs = next((d for d in days if d > last), None)
    return dict(dates=[d.date().isoformat() for d in days], actual=a_, forecast=fc, p50=p5, last_year=ly,
                forecast_starts=fs.date().isoformat() if fs is not None else None, test_start=days[0].date().isoformat(),
                test_end=str(last.to_period("M")), errors=errs, week_wape=wk_wape, week_under=wk_under, week_over=wk_over, week_pct=wk_pct, weeks_scored=len(pairs))


def outlook(f: dict, by: str = "family") -> dict:
    r = _for(engine.result(), f)
    idx, kidx = _sel(r, f)
    if not len(idx):
        return dict(empty=True)
    months, fm = r["months"], r["fmonths"]
    act = np.nansum(r["Y"][idx], axis=0)
    inv = np.nansum(r["Yi"][idx], axis=0)
    comps = {c: r["fut"][c][:, idx].sum(axis=1) for c in ("ens", "lgb", "sn", "ets", "wlgb")}
    lo, hi = _band(r, idx)
    ens = comps["ens"]
    mm = _median_miss(r, idx)
    p50 = ens * np.exp(np.array([mm[min(i, 3) - 1] for i in range(1, 16)]))
    ym = {m: i for i, m in enumerate(months)}
    ly = np.array([act[ym[m.replace(m[:4], str(int(m[:4]) - 1))]] if m.replace(m[:4], str(int(m[:4]) - 1)) in ym else np.nan for m in fm])
    ly = np.where(np.isnan(ly), np.array([ens[i - 12] if i >= 12 else np.nan for i in range(len(fm))]), ly)
    y26 = sum(act[ym[m]] for m in months if m.startswith("2026")) + sum(ens[i] for i, m in enumerate(fm) if m.startswith("2026"))
    y25 = sum(act[ym[m]] for m in months if m.startswith("2025"))
    y27 = sum(ens[i] for i, m in enumerate(fm) if m.startswith("2027"))
    y27_p50 = sum(p50[i] for i, m in enumerate(fm) if m.startswith("2027"))
    y27_lo = sum(ens[i] * np.exp(lo[i]) for i, m in enumerate(fm) if m.startswith("2027"))
    y27_hi = sum(ens[i] * np.exp(hi[i]) for i, m in enumerate(fm) if m.startswith("2027"))
    l12, p12 = act[-12:].sum(), act[-24:-12].sum()
    n3 = ens[:3].sum()
    n3_ly = act[ym["2025-10"]] + act[ym["2025-11"]] + act[ym["2025-12"]]
    peak = int(np.argmax(ens))
    weekly = _weekly(r, idx, fm, ens, p50)
    # breakdown
    sidx = r["sidx"]
    rows = []
    if by == "sku":
        sk = r["skus"].iloc[kidx]
        Ks = r["sku_fut"][kidx]
        rows_df = pd.DataFrame(dict(label=sk["sku"].to_numpy(), family=sk["family"].to_numpy(), region=sk["region"].to_numpy(), channel=sk["channel"].to_numpy(),
                                    last12=r["skuY"][kidx][:, -12:].sum(axis=1), f27=Ks[3:15].sum(axis=1), fnext3=Ks[:3].sum(axis=1)))
        g = rows_df.groupby("label").agg(family=("family", "first"), last12=("last12", "sum"), f27=("f27", "sum"), fnext3=("fnext3", "sum"), series=("label", "size"))
        names = r.get("sku_names", {})
        g = g.sort_values("f27", ascending=False)
        rows = [dict(label=i, name=names.get(i, ""), family=x.family, last12=x.last12, f27=x.f27, growth=(x.f27 / x.last12 - 1) if x.last12 > 0 else None, series=int(x.series)) for i, x in g.head(60).iterrows()]
        total_rows = len(g)
    else:
        by = by if by in DIMS else "family"
        total_rows = None
        sub = sidx.iloc[idx]
        for k, gi in sub.groupby(by).groups.items():
            ii = np.array([sub.index.get_loc(i) for i in gi])
            ix = idx[ii]
            a = np.nansum(r["Y"][ix], axis=0)
            e = r["fut"]["ens"][:, ix].sum(axis=1)
            l12_ = a[-12:].sum()
            f27 = e[3:15].sum()
            c26 = sum(a[ym[m]] for m in months if m.startswith("2026")) + e[:3].sum()
            rows.append(dict(label=k, last12=l12_, f26=c26, f27=f27, growth=(f27 / c26 - 1) if c26 > 0 else None, series=len(ix)))
        rows.sort(key=lambda x: -x["f27"])
    # accuracy for this selection on the months held back
    test = ~r["is_val"]
    acc = {}
    for h in (1, 2, 3):
        a = r["act"][idx][:, test].sum(axis=0)
        fh = np.nansum(r["cube"]["ens"][h - 1][idx][:, test], axis=0)
        acc[f"M{h}"] = _wape(a, fh)
    return clean(dict(
        months=months, actual=act, invoiced=inv, fmonths=fm, weekly=weekly,
        forecast=ens, p50=p50, low=[float(ens[i] * np.exp(lo[i])) for i in range(len(fm))], high=[float(ens[i] * np.exp(hi[i])) for i in range(len(fm))], median_miss=[float(np.exp(x) - 1) for x in mm], lgb=comps["lgb"], sn=comps["sn"], ets=comps["ets"], wlgb=comps["wlgb"], last_year=ly,
        kpis=dict(cy2026=y26, cy2025=y25, cy2027=y27, cy2027_p50=y27_p50, g26=y26 / y25 - 1 if y25 else None, g27=y27 / y26 - 1 if y26 else None,
                  last12=l12, prior12=p12, g12=l12 / p12 - 1 if p12 else None, next3=n3, next3_ly=n3_ly, g3=n3 / n3_ly - 1 if n3_ly else None,
                  peak_month=fm[peak], peak_value=ens[peak], series=len(idx), skus=len(kidx)),
        by=by, breakdown=rows, breakdown_total=total_rows, accuracy=acc, weights=r["weights"], notes=_notes(r, engine.team(), f),
        trained_on=dict(first=months[0], last=months[-1], rows=r["n_train_rows"]),
    ))


def _window(r: dict, idx: np.ndarray) -> dict:
    """The window runs (recursive.py): M3, M2 and M1 as the number of recent months read. Backtest on the test months, and the run from the last actual month."""
    months = r["months"]
    midx = {m: i for i, m in enumerate(months)}
    tm = r["tmonths"]
    tmo = [m for m, t in zip(tm, ~r["is_val"]) if t]
    nw = r["nw"]
    rec = r["rec"]
    last_o = len(months) - 1
    fm = r["fmonths"][:3]
    nwf = np.array([len(pd.date_range(pd.Period(m).start_time, pd.Period(m).end_time, freq="W-MON")) for m in fm], dtype=float)

    def one(ix: np.ndarray, p: int):
        """Forecast and actual for the target months, for each step 1 to 3: lists over test months."""
        steps = []
        for h in (1, 2, 3):
            f = np.array([np.nansum(rec[p][midx[m] - h][h - 1][ix]) * nw[midx[m]] for m in tmo])
            steps.append(f)
        return steps

    def scored(ix: np.ndarray) -> dict:
        a = r["act"][ix][:, ~r["is_val"]].sum(axis=0)
        ly = np.array([np.nansum(r["Y"][ix][:, midx[m] - 12]) for m in tmo])
        res = {}
        for p in (3, 2, 1):
            st = one(ix, p)
            res[f"M{p}"] = dict(**_wape(np.tile(a, 3), np.concatenate(st)), steps=[_wape(a, f)["wape"] for f in st])
        res["last_year"] = _wape(a, ly)
        res["units"] = float(a.sum())
        return res

    nat = scored(idx)
    sub = r["sidx"].iloc[idx]
    groups = {}
    for dim in ("family", "region", "channel"):
        rows = []
        for key, gi in sub.groupby(dim).groups.items():
            ix = idx[np.array([sub.index.get_loc(i) for i in gi])]
            rows.append(dict(label=key, **scored(ix)))
        rows.sort(key=lambda x: -x["units"])
        groups[dim] = rows
    ctx = months[-9:]
    actual = [float(np.nansum(r["Y"][idx][:, midx[m]])) for m in ctx]
    runs = {f"M{p}": [float(np.nansum(rec[p][last_o][h][idx]) * nwf[h]) for h in range(3)] for p in (3, 2, 1)}
    return dict(context=ctx, actual=actual, forecast_months=fm, runs=runs, national=nat, by_family=groups["family"], by_region=groups["region"],
                by_channel=groups["channel"], test_months=tmo)


def vintages(f: dict) -> dict:
    r = _for(engine.result(), f)
    team = engine.team()
    idx, kidx = _sel(r, f)
    if not len(idx):
        return dict(empty=True)
    tm = r["tmonths"]
    test = ~r["is_val"]
    tmo = [m for m, t in zip(tm, test) if t]
    months = r["months"]
    ti = [months.index(m) for m in tmo]
    act = r["act"][idx][:, test].sum(axis=0)
    inv = np.nansum(r["Yi"][idx][:, ti], axis=0)
    lo, hi = _band(r, idx)
    mm = _median_miss(r, idx)
    out_h = {}
    for h in (1, 2, 3):
        fc = np.nansum(r["cube"]["ens"][h - 1][idx][:, test], axis=0)
        comps = {c: np.nansum(r["cube"][c][h - 1][idx][:, test], axis=0) for c in ("lgb", "sn", "ets", "wlgb")}
        out_h[f"M{h}"] = dict(forecast=fc, p50=fc * np.exp(mm[h - 1]), lo=fc * np.exp(lo[h - 1]), hi=fc * np.exp(hi[h - 1]), **comps)
        fa = r.get("fcube")
        if fa is not None:
            sel = fa["ens"][h - 1][idx]
            av = np.where(np.isnan(sel).all(axis=0), np.nan, np.nansum(sel, axis=0))
            out_h[f"M{h}"]["ahead"] = [None if not np.isfinite(x) else float(x) for x in av]
            out_h[f"M{h}"]["ahead_p50"] = [None if not np.isfinite(x) else float(x * np.exp(mm[h - 1])) for x in av]
    ly = np.array([np.nansum(r["Y"][idx][:, i - 12]) for i in ti])
    # accuracy
    acc = []
    for h in (1, 2, 3):
        e = out_h[f"M{h}"]["forecast"]
        ser_a = r["act"][idx][:, test]
        ser_f = r["cube"]["ens"][h - 1][idx][:, test]
        sku_a = r["skuY"][kidx][:, ti]
        sku_f = r["sku_cube"][h - 1][kidx][:, test]
        acc.append(dict(horizon=f"M{h}", total=_wape(act, e), series=_wape(ser_a, ser_f), sku=_wape(sku_a, sku_f), months=len(tmo)))
    base = dict(label="Last year's number", total=_wape(act, ly), series=_wape(r["act"][idx][:, test], np.stack([r["Y"][idx][:, i - 12] for i in ti], axis=1)),
                sku=_wape(r["skuY"][kidx][:, ti], np.stack([r["skuY"][kidx][:, i - 12] for i in ti], axis=1)))
    # accuracy for each family, region and channel in the selection (each one's total per month)
    sidx = r["sidx"]
    sub = sidx.iloc[idx]

    def dim_rows(dim: str) -> list[dict]:
        rows = []
        for key, gi in sub.groupby(dim).groups.items():
            ix = idx[np.array([sub.index.get_loc(i) for i in gi])]
            a = r["act"][ix][:, test].sum(axis=0)
            row = {dim: key, "label": key, "units": float(a.sum())}
            for h in (1, 2, 3):
                row[f"M{h}"] = _wape(a, np.nansum(r["cube"]["ens"][h - 1][ix][:, test], axis=0))
            row["last_year"] = _wape(a, np.array([np.nansum(r["Y"][ix][:, i - 12]) for i in ti]))
            rows.append(row)
        rows.sort(key=lambda x: -x["units"])
        return rows

    fam_rows = dim_rows("family")
    nat = {"label": "National, whole selection", "units": float(act.sum()), "last_year": _wape(act, ly)}
    for h in (1, 2, 3):
        nat[f"M{h}"] = _wape(act, out_h[f"M{h}"]["forecast"])
    # each of the three methods on its own against the blend, for the selection
    methods = []
    for key, name in (("ens", "Blend (the forecast)"), ("wlgb", "Weekly boosting"), ("lgb", "Monthly boosting"), ("sn", "Last year + trend"), ("ets", "Smoothing")):
        row = {"name": name}
        for h in (1, 2, 3):
            fc = out_h[f"M{h}"]["forecast"] if key == "ens" else out_h[f"M{h}"][key]
            row[f"M{h}"] = _wape(act, fc)
        methods.append(row)
    # sales team
    st = None
    if team:
        ratio = team.get("scale_ratio")
        like = ratio is not None and abs(ratio - 1) <= 0.03
        st = dict(scale_ratio=ratio, like_for_like=like, horizons={})
        for h in (1, 2, 3):
            a = team[f"M{h}"]
            st["horizons"][f"M{h}"] = dict(bu=np.nansum(a["bu_qty"][idx][:, test], axis=0), consensus=np.nansum(a["forecast_qty"][idx][:, test], axis=0),
                                           budget=np.nansum(a["budget_qty"][idx][:, test], axis=0), invoiced_in_file=np.nansum(a["actual_qty"][idx][:, test], axis=0))
        if like:
            for i, h in enumerate((1, 2, 3)):
                acc[i]["team"] = _wape(inv, st["horizons"][f"M{h}"]["consensus"])
    if st is not None:
        # October is still open and the file ends in September, so the sales team's numbers for it at M3, M2 and M1 are simulated:
        # the model's run for October moved by the sales team's own typical over- or under-forecast at that lead, plus a small repeatable wobble
        import hashlib
        st["ahead"], st["ahead_simulated"] = {}, True
        for h in (1, 2, 3):
            t_ = st["horizons"][f"M{h}"]
            inv_f = float(np.nansum(t_["invoiced_in_file"]))
            bias = float((np.nansum(t_["consensus"]) - inv_f) / inv_f) if inv_f else 0.0
            av = out_h[f"M{h}"].get("ahead")
            jit = (int(hashlib.md5(f"team|M{h}|{r['fmonths'][0]}".encode()).hexdigest()[:6], 16) / 0xFFFFFF - 0.5) * 0.06
            st["ahead"][f"M{h}"] = [None if not av or av[0] is None else float(av[0] * (1 + bias + jit)), None, None]
    fm_ = r["fmonths"]
    ens_ = r["fut"]["ens"][:, idx].sum(axis=1)
    latest = dict(months=list(fm_[:3]), forecast=[float(ens_[i]) for i in range(3)], p50=[float(ens_[i] * np.exp(mm[i])) for i in range(3)], runs=["M1", "M2", "M3"], data_to=months[-1])
    return clean(dict(months=tmo, actual=act, invoiced=inv, horizons=out_h, latest=latest, last_year=ly, accuracy=acc, baseline=base, by_family=fam_rows, by_region=dim_rows("region"), by_channel=dim_rows("channel"), national=nat, window=_window(r, idx), methods=methods, team=st,
                      weights=r["weights"], validation=dict(first=tm[0], last=[m for m, t in zip(tm, test) if not t][-1]),
                      notes=_notes(r, team, f), series=len(idx), skus=len(kidx)))


def calendar_facts() -> dict:
    """Festival dates by month (YYYY-MM) for the 'why' card."""
    from .. import store
    from . import calendar as CAL
    ws = store.read_workspace()
    fest, _ = CAL.festival_rows(ws)
    out: dict = {}
    for r in fest.itertuples():
        pw = int(r.Sell_In_Peak_Weeks_Before) if pd.notna(r.Sell_In_Peak_Weeks_Before) else 3
        start = r.date - pd.Timedelta(days=7 * min(pw, 8))
        out.setdefault(r.date.strftime("%Y-%m"), []).append(
            dict(name=str(r.name), group=str(r.Group), date=r.date.date().isoformat(), peak_from=start.date().isoformat(), weeks=pw))
    return out

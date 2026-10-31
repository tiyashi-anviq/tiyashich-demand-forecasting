"""Descriptive analyses behind the Explore tabs. Each returns plain JSON plus plain-language findings."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .. import store
from . import engine
from .engine import MEASURES, TEST_START
from . import panel as P

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if (math.isnan(o) or math.isinf(o)) else round(float(o), 4)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp,)):
        return o.date().isoformat()
    if isinstance(o, pd.Period):
        return str(o)
    return o


def fmt(n: float) -> str:
    n = float(n)
    a = abs(n)
    if a >= 1e7:
        return f"{n / 1e7:.2f} crore"
    if a >= 1e5:
        return f"{n / 1e5:.1f} lakh"
    if a >= 1e3:
        return f"{n / 1e3:.1f}k"
    return f"{n:.0f}"


def pct(x: float, d: int = 0) -> str:
    return f"{x * 100:.{d}f}%"


# ----------------------------------------------------------------------------- filtering
def view(f: dict) -> tuple[pd.DataFrame, str]:
    p = engine.panel()
    measure = f.get("measure") or "orders"
    col = MEASURES.get(measure, MEASURES["orders"])[0]
    m = np.ones(len(p), dtype=bool)
    for k in ("family", "region", "channel"):
        if f.get(k):
            m &= p[k].isin(f[k]).to_numpy()
    if f.get("date_from"):
        m &= (p["date"] >= pd.Timestamp(f["date_from"])).to_numpy()
    if f.get("date_to"):
        m &= (p["date"] <= pd.Timestamp(f["date_to"])).to_numpy()
    d = p.loc[m].copy()
    d["q"] = d[col].astype(float)
    return d, col


def complete_months(d: pd.DataFrame) -> pd.DataFrame:
    """Monthly totals, leaving out a trailing month that is only partly in the data."""
    mo = d.groupby(d["date"].dt.to_period("M"))["q"].sum()
    weeks = d.groupby(d["date"].dt.to_period("M"))["date"].nunique()
    if len(mo):
        last = mo.index[-1]
        end = d["date"].max() + pd.Timedelta(days=6)
        if end < last.to_timestamp(how="end").normalize() - pd.Timedelta(days=1) or weeks.iloc[-1] < 4:
            mo = mo.iloc[:-1]
        first = mo.index[0] if len(mo) else None
        if first is not None and weeks.iloc[0] < 4:
            mo = mo.iloc[1:]
    return mo.to_frame("q")


def series_key(d: pd.DataFrame) -> pd.Series:
    return d["region"] + "|" + d["sku"] + "|" + d["channel"]


def options() -> dict:
    p = engine.panel()
    return dict(
        family=sorted(p["family"].unique()), region=sorted(p["region"].unique()), channel=sorted(p["channel"].unique()),
        date_from=p["date"].min(), date_to=p["date"].max(),
        measures=[dict(id=k, label=v[1]) for k, v in MEASURES.items()],
    )


# ----------------------------------------------------------------------------- overview
def overview(f: dict) -> dict:
    d, col = view(f)
    if d.empty:
        return dict(empty=True)
    mo = complete_months(d)
    tot = float(d["q"].sum())
    key = series_key(d)
    yoy = None
    yoy_win = None
    if len(mo) >= 24:
        yoy_win = [str(mo.index[-24]), str(mo.index[-13]), str(mo.index[-12]), str(mo.index[-1])]
        a, b = mo["q"].iloc[-12:].sum(), mo["q"].iloc[-24:-12].sum()
        yoy = float(a / b - 1) if b else None
    inv, orders = float(d["quantity"].sum()), float(d["orders_qty"].sum())
    fill = inv / orders if orders else None
    mo_o = complete_months(d.assign(q=d["orders_qty"]))["q"]
    mo_i = complete_months(d.assign(q=d["quantity"]))["q"]

    def _yoy(sr):
        if len(sr) < 24:
            return None
        x, y = sr.iloc[-12:].sum(), sr.iloc[-24:-12].sum()
        return float(x / y - 1) if y else None
    yoy_o, yoy_i = _yoy(mo_o), _yoy(mo_i)
    fam = d.groupby("family")["q"].sum().sort_values(ascending=False)
    ch = d.groupby("channel")["q"].sum().sort_values(ascending=False)
    reg = d.groupby("region")["q"].sum().sort_values(ascending=False)
    kp = dict(volume=tot, series=int(key.nunique()), skus=int(d["sku"].nunique()), weeks=int(d["date"].nunique()),
              date_from=d["date"].min(), date_to=d["date"].max(), yoy=yoy, yoy_win=yoy_win, fill_rate=fill,
              orders=orders, invoiced=inv, unserved=orders - inv, yoy_orders=yoy_o, yoy_sales=yoy_i,
              measure_label=MEASURES.get(f.get("measure") or "orders", MEASURES["orders"])[1])
    fin = []
    top = fam.index[0]
    fin.append(dict(tone="info", text=f"{top} is the largest family at {pct(fam.iloc[0] / tot)} of volume; the top three families make up {pct(fam.iloc[:3].sum() / tot)}."))
    for nm, y in (("Orders received", yoy_o), ("Sales invoiced", yoy_i)):
        if y is not None:
            fin.append(dict(tone="good" if y >= 0 else "watch", text=f"{nm} over the last 12 complete months is {pct(abs(y), 1)} {'above' if y >= 0 else 'below'} the 12 months before."))
    if fill is not None and fill < 0.995:
        fin.append(dict(tone="watch", text=f"Only {pct(fill, 1)} of ordered units were invoiced, so about {fmt(orders - inv)} units of demand went unserved. Order-based demand is higher than invoiced sales."))
    cm = ch.index[0]
    fin.append(dict(tone="info", text=f"{cm} is the biggest channel ({pct(ch.iloc[0] / tot)}); {reg.index[0]} is the biggest region ({pct(reg.iloc[0] / tot)})."))
    return clean(dict(kpis=kp, monthly=[dict(m=str(i), v=float(v), orders=float(mo_o.get(i, 0)), sales=float(mo_i.get(i, 0))) for i, v in mo["q"].items()],
                      family=[dict(k=k, v=float(v)) for k, v in fam.items()],
                      channel=[dict(k=k, v=float(v)) for k, v in ch.items()],
                      region=[dict(k=k, v=float(v)) for k, v in reg.items()], findings=fin))


# ----------------------------------------------------------------------------- data profile
def profile(f: dict) -> dict:
    d, col = view(f)
    if d.empty:
        return dict(empty=True)
    key = series_key(d)
    d = d.assign(key=key)
    g = d.groupby("key")
    st = g.agg(first=("date", "min"), last=("date", "max"), obs=("date", "nunique"), zeros=("q", lambda s: float((s <= 0).mean())),
               vol=("q", "sum"), fam=("family", "first"))
    st["span"] = ((st["last"] - st["first"]).dt.days // 7 + 1)
    st["gap"] = (st["span"] - st["obs"]).clip(lower=0)
    cov = d.pivot_table(index="family", columns="region", values="q", aggfunc="sum").fillna(0)
    ser = st.groupby("fam").size()
    bins = [0, 26, 52, 104, 156, 10_000]
    labs = ["Under 26 weeks", "26 to 51", "52 to 103", "104 to 155", "156 or more"]
    hist = pd.cut(st["span"], bins=bins, labels=labs, right=False).value_counts().reindex(labs).fillna(0)
    zb = pd.cut(st["zeros"], bins=[-0.001, 0, 0.02, 0.1, 0.3, 1.0], labels=["None", "Up to 2%", "2% to 10%", "10% to 30%", "Over 30%"]).value_counts()
    zb = zb.reindex(["None", "Up to 2%", "2% to 10%", "10% to 30%", "Over 30%"]).fillna(0)
    starts = st.groupby(st["first"].dt.to_period("Q")).size()
    # covariate coverage
    p = engine.panel()
    rows = []
    for c, lab in P.ALL_FEATURES.items():
        if c in p.columns:
            nz = p[c].notna()
            rows.append(dict(id=c, label=lab, group=P.FEATURE_GROUP[c], coverage=float(nz.mean()),
                             first=p.loc[nz, "date"].min() if nz.any() else None, last=p.loc[nz, "date"].max() if nz.any() else None))
    # effect of cleaning: stockout correction lives in the depot-level table, so read it from there
    eff = []
    ws0 = store.read_workspace() or {}
    dep = P._find(ws0, "sales", {"depot", "sku", "quantity", "quantity_clean", "stockout_week"})
    if dep is not None:
        fam_of = p.drop_duplicates("sku").set_index("sku")["family"]
        dep = dep.assign(family=dep["sku"].map(fam_of))
        if f.get("family"):
            dep = dep[dep["family"].isin(f["family"])]
        if f.get("region") and "region" in dep:
            dep = dep[dep["region"].isin(f["region"])]
        a = dep.groupby("family").agg(invoiced=("quantity", "sum"), corrected=("quantity_clean", "sum"), weeks=("stockout_week", "sum"), rows=("quantity", "size"))
        for fam, r in a.iterrows():
            eff.append(dict(family=fam, invoiced=float(r["invoiced"]), corrected=float(r["corrected"]), stockout_weeks=int(r["weeks"]),
                            lift=float(r["corrected"] / r["invoiced"] - 1) if r["invoiced"] else None))
    outl = d.groupby("family")["is_outlier"].mean() if "is_outlier" in d else pd.Series(dtype=float)
    so = d.groupby("family")["stockout_week"].mean() if "stockout_week" in d else pd.Series(dtype=float)
    ws = store.read_workspace() or {}
    short = int((st["span"] < 52).sum())
    gappy = int((st["gap"] > 0).sum())
    fin = []
    n = len(st)
    long_ = int((st["span"] >= 104).sum())
    fin.append(dict(tone="good" if long_ / n > 0.7 else "watch", text=f"{pct(long_ / n)} of the {n:,} series have two years or more of weekly history; {short:,} have under a year and will need special handling."))
    if gappy:
        fin.append(dict(tone="watch", text=f"{gappy:,} series have missing weeks inside their history ({int(st['gap'].sum()):,} weeks in total)."))
    else:
        fin.append(dict(tone="good", text="No series has a missing week between its first and last sale."))
    lowcov = [r for r in rows if r["coverage"] < 0.9]
    if lowcov:
        fin.append(dict(tone="watch", text="Covariates with gaps: " + ", ".join(f"{r['label']} ({pct(r['coverage'])})" for r in sorted(lowcov, key=lambda r: r["coverage"])[:4]) + ". Models will see blanks there."))
    if eff:
        big = max(eff, key=lambda e: e["lift"] or 0)
        tot_w = sum(e["stockout_weeks"] for e in eff)
        fin.append(dict(tone="info", text=f"Stockout weeks ({tot_w:,} at depot level) hid real demand. Estimating it adds {pct(big['lift'] or 0, 1)} to {big['family']}, the largest uplift of any family."))
    if len(outl):
        fin.append(dict(tone="info", text=f"{pct(float(d['is_outlier'].mean()), 1)} of weekly values are flagged as spikes (one-off bulk or project orders); they are marked, not removed."))
    return clean(dict(
        coverage=dict(families=list(cov.index), regions=list(cov.columns), volume=cov.values.tolist(), series=[int(ser.get(i, 0)) for i in cov.index]),
        history=[dict(k=k, v=int(v)) for k, v in hist.items()], zeros=[dict(k=k, v=int(v)) for k, v in zb.items()],
        starts=[dict(k=str(k), v=int(v)) for k, v in starts.items()], covariates=rows, cleaning=eff,
        outliers=[dict(family=k, v=float(v)) for k, v in outl.items()], stockouts=[dict(family=k, v=float(v)) for k, v in so.items()],
        fixes=ws.get("fixes", {}), series_count=n, findings=fin))


# ----------------------------------------------------------------------------- trend & seasonality
def _ma12(s: pd.Series) -> pd.Series:
    return s.rolling(12, center=True).mean().rolling(2).mean().shift(-1)


def _decompose(mo: pd.Series):
    """Multiplicative decomposition on the log scale: trend (2x12 moving average), seasonal (month means), remainder."""
    ls = np.log(mo.clip(lower=1))
    tr = _ma12(ls)
    det = ls - tr
    mon = pd.Series(det.values, index=[i.month for i in det.index])
    seas = mon.groupby(level=0).mean()
    seas = seas - seas.mean()
    s = pd.Series([seas.get(i.month, 0.0) for i in ls.index], index=ls.index)
    rem = ls - tr - s
    ok = tr.notna()
    var = lambda x: float(np.var(x[ok]))
    fs = max(0.0, 1 - var(rem) / var(s + rem)) if ok.sum() > 12 else None
    ft = max(0.0, 1 - var(rem) / var(tr + rem)) if ok.sum() > 12 else None
    return tr, s, rem, seas, fs, ft


def trend(f: dict, by: str = "family") -> dict:
    d, col = view(f)
    if d.empty:
        return dict(empty=True)
    by = by if by in ("family", "region", "channel", "total") else "family"
    d = d.assign(month=d["date"].dt.to_period("M"))
    cm = complete_months(d)
    months = list(cm.index)
    d = d[d["month"].isin(months)]
    if by == "total":
        d = d.assign(grp="All selected")
    else:
        d = d.assign(grp=d[by])
    piv = d.pivot_table(index="month", columns="grp", values="q", aggfunc="sum").reindex(months).fillna(0)
    order = piv.sum().sort_values(ascending=False).index.tolist()
    series = [dict(name=g, values=piv[g].tolist()) for g in order[:8]]
    tot = piv.sum(axis=1)
    tr, s, rem, seas, fs_t, ft_t = _decompose(tot)
    # seasonal index heatmap and strengths by family (always family for the heatmap)
    fam = d.pivot_table(index="month", columns="family", values="q", aggfunc="sum").reindex(months).fillna(0)
    heat, strengths, yoy, peaks = [], [], [], []
    for fm in fam.columns:
        v = fam[fm]
        if v.sum() <= 0 or len(v) < 24:
            continue
        trf, sf, rf, seasf, fs, ft = _decompose(v)
        idx = np.exp(seasf.reindex(range(1, 13)).fillna(0.0).values)
        idx = idx / idx.mean()
        heat.append(dict(family=fm, index=idx.tolist()))
        a, b = v.iloc[-12:].sum(), v.iloc[-24:-12].sum()
        g = float(a / b - 1) if b else None
        strengths.append(dict(family=fm, seasonal=fs, trend=ft, growth=g, peak=MONTHS[int(np.argmax(idx))], trough=MONTHS[int(np.argmin(idx))],
                              swing=float(idx.max() / idx.min() - 1)))
    fest = [x for x in engine.S.notes.get("festivals", []) if str(months[0]) <= x["date"][:7] <= str(months[-1])]
    fin = []
    if strengths:
        most = max(strengths, key=lambda x: x["seasonal"] or 0)
        least = min(strengths, key=lambda x: x["seasonal"] or 0)
        fin.append(dict(tone="info", text=f"{most['family']} is the most seasonal family: it peaks in {most['peak']} and bottoms out in {most['trough']}, a swing of {pct(most['swing'])} between the two."))
        fin.append(dict(tone="info", text=f"{least['family']} is the least seasonal (strength {least['seasonal']:.2f}), so its forecast leans on trend and drivers rather than the calendar."))
        gs = [x for x in strengths if x["growth"] is not None]
        if gs:
            up, dn = max(gs, key=lambda x: x["growth"]), min(gs, key=lambda x: x["growth"])
            fin.append(dict(tone="good", text=f"{up['family']} grew fastest over the last 12 months ({pct(up['growth'], 1)})."))
            if dn["growth"] < 0:
                fin.append(dict(tone="watch", text=f"{dn['family']} fell {pct(abs(dn['growth']), 1)} over the same period."))
    if ft_t is not None and fs_t is not None:
        fin.append(dict(tone="info", text=f"For the selection as a whole, seasonality strength is {fs_t:.2f} and trend strength {ft_t:.2f} on a 0 to 1 scale; most of the monthly movement is {'seasonal' if fs_t > ft_t else 'trend'}."))
    wk = d.groupby("date")["q"].sum()
    return clean(dict(
        months=[str(m) for m in months], series=series, by=by,
        decomposition=dict(observed=tot.tolist(), trend=np.exp(tr).tolist(), seasonal=np.exp(s).tolist(), remainder=np.exp(rem).tolist()),
        seasonal_profile=[dict(m=MONTHS[i - 1], v=float(np.exp(seas.get(i, 0.0)))) for i in range(1, 13)],
        heatmap=heat, strengths=strengths, festivals=fest, months_labels=MONTHS,
        weekly=dict(dates=[x.date().isoformat() for x in wk.index], values=wk.tolist()), findings=fin))


# ----------------------------------------------------------------------------- forecastability
SEGMENTS = {
    "smooth": dict(label="Smooth", rule="Steady and regular", model="Gradient boosting with a seasonal baseline; weekly forecasts are reliable."),
    "erratic": dict(label="Erratic", rule="Regular, but sizes vary a lot", model="Gradient boosting with outlier handling; show wider ranges."),
    "intermittent": dict(label="Intermittent", rule="Many empty weeks, steady sizes", model="Croston or TSB style models, or forecast monthly."),
    "lumpy": dict(label="Lumpy", rule="Many empty weeks and sizes vary", model="Forecast at a higher level (region by month) and review by hand."),
}


def segments(f: dict) -> dict:
    d, col = view(f)
    if d.empty:
        return dict(empty=True)
    d = d.assign(key=series_key(d))
    nz = d[d["q"] > 0]
    g = nz.groupby("key")["q"]
    st = pd.DataFrame(dict(nz=g.size(), mean=g.mean(), std=g.std(ddof=0), vol=g.sum()))
    ext = d.groupby("key").agg(first=("date", "min"), last=("date", "max"), fam=("family", "first"), ch=("channel", "first"), reg=("region", "first"))
    st = st.join(ext)
    st["span"] = ((st["last"] - st["first"]).dt.days // 7 + 1)
    st["adi"] = st["span"] / st["nz"]
    st["cv2"] = (st["std"] / st["mean"]) ** 2
    st["seg"] = np.where(st["adi"] < 1.32, np.where(st["cv2"] < 0.49, "smooth", "erratic"), np.where(st["cv2"] < 0.49, "intermittent", "lumpy"))
    tot = st["vol"].sum()
    summ = []
    for k, v in SEGMENTS.items():
        s = st[st["seg"] == k]
        summ.append(dict(id=k, count=int(len(s)), volume_share=float(s["vol"].sum() / tot) if tot else 0, **v))
    by_fam = st.pivot_table(index="fam", columns="seg", values="vol", aggfunc="count").reindex(columns=list(SEGMENTS)).fillna(0)
    sample = st.sort_values("vol", ascending=False).head(600)
    pts = [dict(adi=float(r.adi), cv2=float(min(r.cv2, 3)), vol=float(r.vol), seg=r.seg, fam=r.fam, key=i) for i, r in sample.iterrows()]
    # How hard is each family to forecast? Score last year's number as the forecast for each month since Oct 2025.
    d["m"] = d["date"].dt.to_period("M")
    cm = complete_months(d).index
    dd = d[d["m"].isin(cm)]
    mfam = dd.pivot_table(index="m", columns="family", values="q", aggfunc="sum")
    base = []
    for fm in mfam.columns:
        s = mfam[fm]
        idx = [i for i in s.index if i.to_timestamp() >= TEST_START and (i - 12) in s.index]
        if len(idx) >= 3:
            a = s.loc[idx].values
            fcs = s.loc[[i - 12 for i in idx]].values
            base.append(dict(family=fm, months=len(idx), wape=float(np.abs(a - fcs).sum() / a.sum()), under=float(np.clip(a - fcs, 0, None).sum() / a.sum()),
                             over=float(np.clip(fcs - a, 0, None).sum() / a.sum())))
    # series-level baseline (region x sku x channel x month)
    sm = dd.groupby(["key", "m"])["q"].sum().unstack("m")
    tms = [m for m in sm.columns if m.to_timestamp() >= TEST_START and (m - 12) in sm.columns]
    naive_series = None
    if tms:
        A = sm[tms].values
        Fv = sm[[m - 12 for m in tms]].values
        okm = ~np.isnan(A) & ~np.isnan(Fv)
        A, Fv = np.where(okm, A, 0), np.where(okm, Fv, 0)
        if A.sum() > 0:
            naive_series = dict(wape=float(np.abs(A - Fv).sum() / A.sum()), months=len(tms), series=int(okm.any(axis=1).sum()))
    short = st[st["span"] < 52]
    fin = []
    sm_share = {x["id"]: x for x in summ}
    fin.append(dict(tone="good", text=f"{pct(sm_share['smooth']['count'] / len(st))} of series are smooth (and {pct(sm_share['smooth']['volume_share'])} of volume), so they suit standard weekly models."))
    hard = sm_share["intermittent"]["count"] + sm_share["lumpy"]["count"]
    if hard:
        fin.append(dict(tone="watch", text=f"{hard:,} series are intermittent or lumpy ({pct((sm_share['intermittent']['volume_share'] + sm_share['lumpy']['volume_share']))} of volume); give them a specialist method or forecast them at a higher level."))
    if len(short):
        fin.append(dict(tone="watch", text=f"{len(short):,} series have under a year of history. Borrow the pattern of similar products for these."))
    if base:
        w = max(base, key=lambda x: x["wape"])
        b = min(base, key=lambda x: x["wape"])
        fin.append(dict(tone="info", text=f"Using last year's number for each month, the error since Oct 2025 is {pct(b['wape'])} for {b['family']} and {pct(w['wape'])} for {w['family']}. Any model has to beat this."))
    names = {}
    try:
        ws = store.read_workspace() or {}
        mm = P._find(ws, "product_master", {"sku", "description"}, "SKU Master")
        if mm is not None:
            names = dict(zip(mm["sku"], mm["description"]))
    except Exception:  # noqa: BLE001
        names = {}
    series = [dict(key=i, sku=i.split("|")[1], region=r.reg, channel=r.ch, fam=r.fam, seg=r.seg, vol=float(r.vol),
                   first=r.first.date().isoformat(), last=r.last.date().isoformat(), weeks=int(r.span), adi=float(r.adi), cv2=float(r.cv2))
              for i, r in st.sort_values("vol", ascending=False).iterrows()]
    return clean(dict(summary=summ, points=pts, series=series, sku_names={k: names.get(k, "") for k in st.index.map(lambda x: x.split("|")[1]).unique()}, by_family=[dict(family=i, **{k: int(r[k]) for k in SEGMENTS}) for i, r in by_fam.iterrows()],
                      baseline=base, baseline_series=naive_series, short_history=int(len(short)), series_count=int(len(st)), findings=fin))


# ----------------------------------------------------------------------------- distribution & outliers
def distribution(f: dict) -> dict:
    d, col = view(f)
    if d.empty:
        return dict(empty=True)
    pos = d.loc[d["q"] > 0, "q"]
    edges = np.logspace(0, np.ceil(np.log10(max(pos.max(), 10))), 22)
    h, e = np.histogram(pos, bins=edges)
    hist = [dict(lo=float(e[i]), hi=float(e[i + 1]), n=int(h[i])) for i in range(len(h))]
    med = float(pos.median())
    out = d[d["is_outlier"]] if "is_outlier" in d else d.iloc[0:0]
    lvl = d.assign(key=series_key(d)).groupby("key")["q"].transform("median")
    top = d.assign(mult=d["q"] / lvl.replace(0, np.nan))
    top = top[top.get("is_outlier", pd.Series(False, index=top.index)).fillna(False).astype(bool)].sort_values("mult", ascending=False).head(8)
    topl = [dict(date=r.date, family=r.family, region=r.region, channel=r.channel, sku=r.sku, qty=float(r.q), mult=float(r.mult)) for r in top.itertuples()]
    ofam = (d.groupby("family")["is_outlier"].agg(["sum", "mean"]) if "is_outlier" in d else pd.DataFrame())
    # Pareto by SKU
    sk = d.groupby("sku")["q"].sum().sort_values(ascending=False)
    cum = sk.cumsum() / sk.sum()
    a = int((cum <= 0.8).sum()) + 1
    b = int(((cum > 0.8) & (cum <= 0.95)).sum())
    c = int(len(sk) - a - b)
    curve = [dict(rank=int(i + 1), share=float(cum.iloc[i])) for i in range(len(cum))]
    cls = dict(A=dict(count=a, share=float(cum.iloc[min(a, len(cum)) - 1])), B=dict(count=b, share=float(cum.iloc[min(a + b, len(cum)) - 1] - cum.iloc[min(a, len(cum)) - 1]) if b else 0),
              C=dict(count=c, share=float(1 - cum.iloc[min(a + b, len(cum)) - 1])))
    # channel mix by quarter
    q = d.assign(qtr=d["date"].dt.to_period("Q")).pivot_table(index="qtr", columns="channel", values="q", aggfunc="sum").fillna(0)
    q = q.iloc[1:-1] if len(q) > 4 else q
    mix = dict(quarters=[str(i) for i in q.index], channels=list(q.columns), share=(q.div(q.sum(axis=1), axis=0)).values.tolist())
    # service level: invoiced / ordered
    mm = d.assign(m=d["date"].dt.to_period("M")).groupby("m")[["quantity", "orders_qty"]].sum()
    mm = mm.loc[complete_months(d).index.intersection(mm.index)]
    fr = (mm["quantity"] / mm["orders_qty"]).replace([np.inf], np.nan)
    ffam = d.groupby("family")[["quantity", "orders_qty"]].sum()
    ffam["fill"] = ffam["quantity"] / ffam["orders_qty"]
    fin = []
    if len(ofam):
        w = ofam["mean"].idxmax()
        fin.append(dict(tone="watch", text=f"{pct(float(ofam['sum'].sum() / len(d)), 1)} of weekly values are spikes. {w} has the highest share ({pct(float(ofam.loc[w, 'mean']), 1)}). Spikes are marked so the model can ignore or cap them."))
    fin.append(dict(tone="info", text=f"A small group of SKUs carries most volume: {a} of {len(sk)} SKUs make up 80% of it (class A)."))
    worst = ffam["fill"].idxmin()
    fin.append(dict(tone="watch" if ffam.loc[worst, "fill"] < 0.97 else "info", text=f"{worst} has the lowest fill rate ({pct(float(ffam.loc[worst, 'fill']), 1)}), so the most demand went unserved there."))
    fin.append(dict(tone="info", text=f"The typical weekly value is {fmt(med)} units, but the biggest values are far larger, so volume is heavily skewed. Use a log scale when comparing series."))
    return clean(dict(histogram=hist, median=med, outliers_by_family=[dict(family=k, count=int(r["sum"]), share=float(r["mean"])) for k, r in ofam.iterrows()],
                      top_outliers=topl, pareto=dict(curve=curve[:: max(1, len(curve) // 120)], classes=cls, skus=int(len(sk))), channel_mix=mix,
                      fill_rate=dict(months=[str(i) for i in fr.index], values=fr.tolist(), by_family=[dict(family=k, v=float(v)) for k, v in ffam["fill"].items()]),
                      findings=fin))

"""Covariate learning for the Demand drivers tab: correlation, lags, mutual information, SHAP and out-of-sample checks."""
from __future__ import annotations

import hashlib
import json

import numpy as np
import pandas as pd

from . import engine
from . import panel as P
from .analyses import clean, pct, view
from .engine import MEASURES

_Y: dict[str, pd.Series] = {}
_MI: dict[str, pd.Series] = {}
_LAG: dict[str, dict] = {}
LAGS = list(range(0, 7))

# Raw metric -> engineered covariate -> where it goes (the Phase 3 table).
ENGINEERED = [
    dict(factor="Monsoon impact", raw="Rainfall (mm per week)", engineered="2-week average rainfall, rain anomaly index", feats=["rain_roll2", "rain_anom"], model="Gradient boosting (exogenous feature)"),
    dict(factor="Festival seasonality", raw="Festival calendar dates", engineered="Weeks to Diwali, Diwali bell curve, Durga Puja bell curve", feats=["weeks_to_diwali", "diwali_bell", "durga_bell"], model="Prophet-style custom regressor and boosting"),
    dict(factor="Trade schemes", raw="Scheme discount %", engineered="Scheme active flag and discount", feats=["scheme_on", "scheme_disc"], model="Gradient boosting and Ridge"),
    dict(factor="Month-end loading", raw="Week start", engineered="Month-end week flag, quarter-end week flag", feats=["month_end_week", "quarter_end_week"], model="All model layers"),
    dict(factor="Quick-commerce pull", raw="Partner POs vs sell-through", engineered="Sell-through / PO ratio", feats=["qc_ratio"], model="Dark-store (zero-shot) filter"),
    dict(factor="Price position", raw="MRP and Nielsen prices", engineered="MRP vs launch price, price gap vs competitors", feats=["mrp_rel", "price_gap"], model="Gradient boosting"),
    dict(factor="Commodity cost", raw="Zinc, MnO2, copper, USD-INR", engineered="Monthly index, lagged one month", feats=["zinc", "mno2", "copper", "usd_inr"], model="Gradient boosting (as a slow driver)"),
]

# What is known when a forecast is made, so the user can judge leakage.
AVAILABILITY = {
    "calendar": ("Safe", "Dates are known years ahead."),
    "weather": ("Check", "The data holds actual weather. In production use the weather forecast, or lag it, or the model looks more accurate than it will be."),
    "price": ("Safe", "Schemes come from the approved trade calendar and MRP changes are announced ahead. Check both are on file when the forecast is made."),
    "commercial": ("Check", "Sell-through and share are reported after the week ends. Use values from earlier weeks only."),
    "macro": ("Check", "Monthly prices are published after the month. Use last month's value."),
}


def _y(measure: str) -> pd.Series:
    if measure not in _Y:
        y, _ = engine.relative_target(engine.panel(), measure)
        _Y[measure] = y
    return _Y[measure]


def _fkey(f: dict) -> str:
    return hashlib.md5(json.dumps({k: f.get(k) for k in ("family", "region", "channel", "date_from", "date_to", "measure")}, sort_keys=True, default=str).encode()).hexdigest()


def _mask(sample: pd.DataFrame, f: dict) -> np.ndarray:
    m = np.ones(len(sample), dtype=bool)
    for k in ("family", "region", "channel"):
        if f.get(k):
            m &= sample[k].isin(f[k]).to_numpy()
    if f.get("date_from"):
        m &= (sample["date"] >= pd.Timestamp(f["date_from"])).to_numpy()
    if f.get("date_to"):
        m &= (sample["date"] <= pd.Timestamp(f["date_to"])).to_numpy()
    return m


def _lag_table(f: dict, d: pd.DataFrame, y: pd.Series) -> dict:
    """Correlation of each covariate, shifted back 0 to 6 weeks, with relative demand."""
    key = _fkey(f)
    if key in _LAG:
        return _LAG[key]
    cand = [c for c in ["rain", "rain_roll2", "rain_anom", "temp", "hum", "power_cut", "scheme_disc", "price_gap", "wdist", "qc_ratio", "zinc", "usd_inr", "led_index", "road_freight"] if c in d.columns and d[c].notna().mean() > 0.05]
    t = d[["date", "region", "family"] + cand].copy()
    t["y"] = y.loc[d.index].to_numpy()
    ag = t.groupby(["region", "family", "date"]).mean().reset_index().sort_values(["region", "family", "date"])
    ag["woy"] = ag["date"].dt.isocalendar().week.astype(int).clip(upper=52)
    grp = ["region", "family"]
    rows = []

    def corr(xc: pd.Series, yc: pd.Series):
        ok = xc.notna() & yc.notna()
        if ok.sum() < 200 or xc[ok].std() == 0 or yc[ok].std() == 0:
            return None
        return float(np.corrcoef(xc[ok], yc[ok])[0, 1])
    yraw = ag["y"] - ag.groupby(grp)["y"].transform("mean")
    yadj = ag["y"] - ag.groupby(grp + ["woy"])["y"].transform("mean")
    for c in cand:
        raw, adj = [], []
        for k in LAGS:
            x = ag.groupby(grp)[c].shift(k)
            xraw = x - x.groupby([ag["region"], ag["family"]]).transform("mean")
            xadj = x - x.groupby([ag["region"], ag["family"], ag["woy"]]).transform("mean")
            raw.append(corr(xraw, yraw))
            adj.append(corr(xadj, yadj))
        rows.append(dict(id=c, label=P.ALL_FEATURES[c], raw=raw, adjusted=adj))
    for r in rows:
        for k in ("raw", "adjusted"):
            v = [abs(x) if x is not None else -1 for x in r[k]]
            r["best_lag_" + k] = int(np.argmax(v)) if max(v) >= 0 else None
        r["best_lag"] = r["best_lag_adjusted"]
    out = dict(lags=LAGS, rows=rows)
    _LAG[key] = out
    return out


def _example_check(p: pd.DataFrame) -> dict:
    """Regional weekly correlation of rainfall with battery orders, to test a figure from the framework."""
    b = p[p["family"] == "Batteries"]
    out = []
    for reg, g in b.groupby("region"):
        w = g.groupby("date").agg(orders=("orders_qty", "sum"), rain=("rain", "mean"))
        r0 = float(w["orders"].corr(w["rain"]))
        r1 = float(w["orders"].corr(w["rain"].shift(1)))
        # same, after taking out the usual pattern for that week of the year
        w["woy"] = w.index.isocalendar().week.astype(int).values
        res = w["orders"] / w.groupby("woy")["orders"].transform("mean")
        resr = w["rain"] - w.groupby("woy")["rain"].transform("mean")
        out.append(dict(region=reg, same_week=r0, one_week_earlier=r1, after_seasonal=float(res.corr(resr))))
    return dict(rows=out)


def _event_study(p: pd.DataFrame, y: pd.Series, f: dict) -> dict:
    if "weeks_to_diwali" not in p.columns:
        return {}
    d, _ = view(f)
    t = d[["family", "weeks_to_diwali"]].copy()
    t["r"] = np.exp(y.loc[d.index].to_numpy())
    t["k"] = (-t["weeks_to_diwali"]).round()
    t = t[(t["k"] >= -8) & (t["k"] <= 4)]
    g = t.groupby(["family", "k"])["r"].mean().unstack("k")
    ks = list(range(-8, 5))
    g = g.reindex(columns=ks)
    # Normalise each family to its own average outside the festival run-up (4+ weeks after, 8+ before is too thin to use).
    rows = []
    for fam, r in g.iterrows():
        base = np.nanmean([r.get(8 - 8), r.get(4)]) if False else np.nanmean(r.values)
        rows.append(dict(family=fam, values=(r / base).tolist()))
    return dict(weeks=ks, rows=rows)


def _reference_index(ws: dict) -> dict | None:
    for t in ws.get("tables", []):
        if t["name"].lower().startswith("festival week index"):
            ref = pd.read_parquet(t["path"])
            c0 = [c for c in ref.columns if c.startswith("Weeks_From")][0]
            return dict(weeks=ref[c0].tolist(), series={c: ref[c].tolist() for c in ref.columns if c.endswith("_Index")})
    return None


def drivers(f: dict, feature: str | None = None) -> dict:
    measure = f.get("measure") or "orders"
    engine.want_model(measure)
    mod = engine.S.models.get(measure, {})
    if mod.get("state") != "ready":
        return dict(state=mod.get("state", "building"), message=mod.get("message", "Training the driver model"))
    p = engine.panel()
    d, col = view(f)
    if len(d) < 500:
        return dict(state="ready", empty=True)
    y = _y(measure)
    yy = y.loc[d.index]
    feats = mod["feats"]
    ident = engine.IDENTITY
    # ---- SHAP on the stored sample, restricted to the filters
    sm = _mask(mod["sample"], f)
    shap, samp = mod["shap"][sm], mod["sample"][sm]
    nshap = int(sm.sum())
    imp = shap[feats].abs().mean()
    total_imp = float(imp.sum() + shap[ident].abs().mean().sum())
    # ---- mutual information on a sample
    key = _fkey(f)
    if key not in _MI:
        from sklearn.feature_selection import mutual_info_regression
        rng = np.random.default_rng(1)
        idx = rng.choice(len(d), size=min(12000, len(d)), replace=False)
        X = d.iloc[idx][feats].astype(float)
        X = X.fillna(X.median()).fillna(0)
        ok = X.std() > 0
        mi = pd.Series(0.0, index=feats)
        if ok.any():
            mi[ok[ok].index] = mutual_info_regression(X.loc[:, ok], yy.iloc[idx].to_numpy(), n_neighbors=3, random_state=0)
        _MI[key] = mi
    mi = _MI[key]
    mi_n = mi / mi.max() if mi.max() > 0 else mi
    # ---- correlations
    sub = d.sample(min(40000, len(d)), random_state=2)
    ys = yy.loc[sub.index]
    pear, spear = {}, {}
    for c in feats:
        x = sub[c].astype(float)
        ok = x.notna()
        if ok.sum() > 100 and x[ok].std() > 0:
            pear[c] = float(np.corrcoef(x[ok], ys[ok])[0, 1])
            spear[c] = float(x[ok].rank().corr(ys[ok].rank()))
    lag = _lag_table(f, d, y)
    bl = {r["id"]: r["best_lag"] for r in lag["rows"]}
    # ---- direction and size from SHAP
    rows = []
    for c in feats:
        if c not in samp.columns:
            continue
        x = samp[c].astype(float)
        sv = shap[c]
        ok = x.notna()
        direction, effect = None, None
        if ok.sum() > 100 and x[ok].nunique() > 1:
            direction = float(np.corrcoef(x[ok].rank(), sv[ok])[0, 1]) if sv[ok].std() > 0 else 0.0
            hi, lo = x[ok] >= x[ok].quantile(0.9), x[ok] <= x[ok].quantile(0.1)
            if hi.sum() > 20 and lo.sum() > 20 and x[ok].quantile(0.9) != x[ok].quantile(0.1):
                effect = float(np.expm1(sv[ok][hi].mean() - sv[ok][lo].mean()))
            elif x[ok].nunique() == 2:
                a1, a0 = sv[ok][x[ok] > x[ok].min()], sv[ok][x[ok] == x[ok].min()]
                if len(a1) > 20 and len(a0) > 20:
                    effect = float(np.expm1(a1.mean() - a0.mean()))
        grp = P.FEATURE_GROUP.get(c, "calendar")
        rows.append(dict(id=c, label=P.ALL_FEATURES.get(c, c.replace("win_", "Sell-in window: ").title()), group=grp, shap=float(imp[c]),
                         shap_share=float(imp[c] / total_imp) if total_imp else 0, mi=float(mi_n.get(c, 0)), pearson=pear.get(c), spearman=spear.get(c),
                         direction=direction, effect=effect, best_lag=bl.get(c), coverage=float(d[c].notna().mean())))
    rows.sort(key=lambda r: -r["shap"])
    mx = max(r["shap"] for r in rows) or 1
    for i, r in enumerate(rows):
        strong = r["shap"] >= 0.15 * mx or r["mi"] >= 0.5
        weak = r["shap"] < 0.04 * mx and r["mi"] < 0.15 and abs(r["pearson"] or 0) < 0.03
        r["verdict"] = "Keep" if strong else ("Drop" if weak else "Test")
        r["limited"] = r["coverage"] < 0.5
        if r["limited"]:
            r["verdict"] = "Test"
            r["effect"] = None
    groups = {}
    for r in rows:
        groups[r["group"]] = groups.get(r["group"], 0.0) + r["shap"]
    gl = [dict(group=g, label=P.GROUPS[g]["label"], share=float(v / total_imp)) for g, v in groups.items()]
    gl.append(dict(group="identity", label="Product family, channel and region", share=float(shap[ident].abs().mean().sum() / total_imp)))
    gl.sort(key=lambda r: -r["share"])
    # ---- response curve
    fid = feature if feature in feats else rows[0]["id"]
    resp = _response(d, yy, fid, f)
    # ---- collinearity among the leading covariates
    lead = [r["id"] for r in rows[:12]]
    cm = sub[lead].astype(float).corr().fillna(0)
    ws = __import__("app.store", fromlist=["store"]).read_workspace() or {}
    ev = _event_study(p, y, f)
    ref = _reference_index(ws)
    ex = _example_check(p)
    # ---- validation
    ab = mod["ablation"]
    ablate = [dict(a) for a in ab]
    leak = [dict(group=g, label=P.GROUPS[g]["label"], status=s, note=n) for g, (s, n) in AVAILABILITY.items()]
    eng = []
    imp_map = {r["id"]: r for r in rows}
    for e in ENGINEERED:
        used = [c for c in e["feats"] if c in imp_map]
        eng.append(dict(factor=e["factor"], raw=e["raw"], engineered=e["engineered"], model=e["model"], present=len(used) > 0,
                        shap_share=float(sum(imp_map[c]["shap_share"] for c in used)) if used else 0.0))
    # ---- findings
    fin = []
    top = rows[:3]
    fin.append(dict(tone="info", text="The strongest covariates are " + ", ".join(f"{r['label']} ({pct(r['shap_share'], 1)})" for r in top) + " of the model's attention. Product family, channel and region set the base level first."))
    for r in rows[:8]:
        if r["effect"] is not None and abs(r["effect"]) >= 0.03:
            fin.append(dict(tone="info", text=f"{r['label']}: demand is about {pct(abs(r['effect']))} {'higher' if r['effect'] > 0 else 'lower'} when it is in its top range than in its bottom range, holding everything else equal."))
            if len(fin) >= 5:
                break
    drop = [r["label"] for r in rows if r["verdict"] == "Drop"]
    if drop:
        fin.append(dict(tone="watch", text="Little signal, candidates to leave out: " + ", ".join(drop[:6]) + "."))
    useless = [a for a in ablate if a["wape_change"] <= 0.0005]
    if useless:
        fin.append(dict(tone="watch", text="Removing " + ", ".join(a["label"].lower() for a in useless) + " did not make monthly forecasts worse on the months since Oct 2025, so they may be safe to prune."))
    helpful = sorted([a for a in ablate if a["wape_change"] > 0.0005], key=lambda a: -a["wape_change"])
    if helpful:
        h = helpful[0]
        fin.append(dict(tone="good", text=f"{h['label']} helps most on the test months: leaving it out raises monthly error by {h['wape_change'] * 100:.1f} points."))
    fin.append(dict(tone="watch", text="Weather, market and commodity covariates are actuals here. In production they must come from forecasts or earlier weeks, or accuracy will be overstated."))
    return clean(dict(
        state="ready", measure=measure, feature=fid, n_rows=int(len(d)), n_shap=nshap, rows=rows, groups=gl, lag=lag, response=resp,
        collinearity=dict(ids=lead, labels=[imp_map[i]["label"] for i in lead], matrix=cm.values.tolist()), event_study=ev, reference_index=ref,
        example_check=ex, validation=dict(full=mod["full"], ablation=ablate, n_train=mod["n_train"], n_test=mod["n_test"], test_start=engine.TEST_START),
        leakage=leak, engineered=eng, findings=fin))


def _response(d: pd.DataFrame, yy: pd.Series, fid: str, f: dict) -> dict:
    x = d[fid].astype(float)
    ok = x.notna()
    if ok.sum() < 200:
        return dict(feature=fid, label=P.ALL_FEATURES.get(fid, fid), series=[], x=[])
    nun = x[ok].nunique()
    if nun <= 6:
        bins = pd.Series(pd.Categorical(x[ok]), index=x[ok].index)
        labels = [f"{v:g}" for v in sorted(x[ok].unique())]
        b = x[ok].round(3)
    else:
        q = pd.qcut(x[ok], q=min(10, nun), duplicates="drop")
        labels, b = None, q
    t = pd.DataFrame(dict(b=b, r=np.exp(yy[ok]), fam=d.loc[ok.index[ok], "family"]))
    series = []
    fams = t.groupby("fam")["r"].size().sort_values(ascending=False).index[:6]
    xs = None
    for nm, g in [("All selected", t)] + [(fm, t[t["fam"] == fm]) for fm in fams if len(fams) > 1]:
        m = g.groupby("b", observed=True)["r"].mean()
        m = m / g["r"].mean()
        if xs is None:
            xs = [f"{i.mid:.3g}" if hasattr(i, "mid") else f"{i:g}" for i in m.index]
        if len(m) == len(xs):
            series.append(dict(name=nm, values=(m - 1).tolist()))
    return dict(feature=fid, label=P.ALL_FEATURES.get(fid, fid), x=xs or [], series=series)

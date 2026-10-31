"""Builds every forecast the Forecasts screen shows: backtests for M1/M2/M3 and the run out to Dec 2027."""
from __future__ import annotations

import time

import numpy as np
import pandas as pd

from . import calendar as CAL
from . import core as C
from . import weekly as W_
from . import recursive as R_

TEST_START = pd.Period("2025-10", "M")
VAL_START = pd.Period("2024-10", "M")
FIRST_ORIGIN = pd.Period("2024-07", "M")   # earliest origin needed for the validation months at M3
END_2027 = pd.Period("2027-12", "M")


def _months_complete(p: pd.DataFrame) -> list[pd.Period]:
    wk = pd.Series(p["date"].unique()).sort_values()
    allm = pd.period_range(wk.min().to_period("M"), wk.max().to_period("M"), freq="M")
    have = wk.dt.to_period("M").value_counts()
    out = []
    for m in allm:
        mondays = pd.date_range(m.start_time, m.end_time, freq="W-MON")
        if have.get(m, 0) == len(mondays) and mondays[0] >= wk.min():
            out.append(m)
    return out


def run(ws: dict, panel: pd.DataFrame, progress=lambda f, msg: None) -> dict:
    t0 = time.time()
    p = panel
    months = _months_complete(p)
    M = len(months)
    midx = {m: i for i, m in enumerate(months)}
    p = p.assign(m=p["date"].dt.to_period("M"))
    seen = set(p.loc[p["m"].isin(midx), "sku"].unique())
    late = p[~p["sku"].isin(seen)].groupby(["sku", "family"]).agg(first=("date", "min"), units=("orders_qty", "sum")).reset_index()
    late_skus = [dict(sku=r.sku, family=r.family, first=r.first.date().isoformat(), units=float(r.units)) for r in late.itertuples()]
    p = p[p["m"].isin(midx)]
    ext = pd.period_range(months[0], END_2027, freq="M")
    cal_all, cal_info = CAL.monthly_features(ws)
    cal = cal_all.reindex(ext)
    cal["n_weeks"] = [len(pd.date_range(m.start_time, m.end_time, freq="W-MON")) for m in ext]
    cal = cal.fillna(0.0)
    keep = ["moy", "month_end_week", "n_weeks"] + [c for c in cal.columns if c.endswith("_bell") or c.startswith("win_")]
    cal = cal[keep].reset_index(drop=True)
    cal["moy"] = [m.month for m in ext]
    ncal = len(ext)

    # ---- series: family x region x channel (monthly orders received, as units per week)
    p["mi"] = p["m"].map(midx)
    key = ["family", "region", "channel"]
    g = p.groupby(key + ["mi"])[["orders_qty", "quantity"]].sum().reset_index()
    sidx = g[key].drop_duplicates().sort_values(key).reset_index(drop=True)
    sid = {tuple(r): i for i, r in enumerate(sidx[key].itertuples(index=False))}
    S = len(sidx)
    Y = np.full((S, M), np.nan)
    Yi = np.full((S, M), np.nan)
    for r in g.itertuples(index=False):
        i = sid[(r.family, r.region, r.channel)]
        Y[i, r.mi] = r.orders_qty
        Yi[i, r.mi] = r.quantity
    # months where a series is missing are real zeros only after its first sale; leave leading gaps empty
    first = np.array([np.argmax(~np.isnan(Y[s])) if (~np.isnan(Y[s])).any() else M for s in range(S)])
    for s in range(S):
        Y[s, first[s]:] = np.nan_to_num(Y[s, first[s]:])
        Yi[s, first[s]:] = np.nan_to_num(Yi[s, first[s]:])
    # weekly orders for the same series (actuals for the weekly outlook chart)
    gw = p.groupby(key + ["date"])["orders_qty"].sum().reset_index()
    wk_dates = sorted(pd.to_datetime(gw["date"].unique()))
    wix = {d: i for i, d in enumerate(wk_dates)}
    Ywk = np.zeros((S, len(wk_dates)))
    for r in gw.itertuples(index=False):
        Ywk[sid[(r.family, r.region, r.channel)], wix[pd.Timestamp(r.date)]] = r.orders_qty
    nw = cal["n_weeks"].to_numpy()[:M].astype(float)
    W = Y / nw[None, :]
    zero_share = float((Y[:, 12:] == 0).mean())

    # ---- climate by region and month (only months up to the origin are used by any model)
    regs = sorted(p["region"].unique())
    rix = {r: i for i, r in enumerate(regs)}
    reg_of = sidx["region"].map(rix).to_numpy()
    clim = {}
    for nm, col in (("rain", "rain"), ("temp", "temp")):
        arr = np.full((len(regs), M), np.nan)
        if col in p.columns:
            t = p.groupby(["region", "mi"])[col].mean().unstack()
            for r in regs:
                if r in t.index:
                    arr[rix[r], t.columns.to_numpy()] = t.loc[r].to_numpy()
        clim[nm] = C.clim_by_origin(arr, cal["moy"].to_numpy()[:M], M)
    progress(0.1, "Preparing training rows")

    # ---- training table: every (origin, horizon) whose target is already known
    rows, meta = [], []
    for oi in range(11, M - 1):
        for h in range(1, C.H_MAX + 1):
            ti = oi + h
            if ti > M - 1:
                break
            df = C.features(W, oi, h, ti, cal, sidx, clim["rain"], clim["temp"], reg_of)
            with np.errstate(divide="ignore", invalid="ignore"):
                df["y"] = np.log(W[:, ti] / df["m12"].to_numpy())
            df["ti"] = ti
            df["oi"] = oi
            rows.append(df)
    train = pd.concat(rows, ignore_index=True)
    train = train[np.isfinite(train["y"]) & (train["m12"] > 0)].reset_index(drop=True)
    X_cols = C.FEATS_NUM + [c for c in cal.columns if c.endswith("_bell") or c.startswith("win_")] + C.CAT
    X_cols = list(dict.fromkeys(X_cols))

    # ---- one vintage per origin month: models only ever see data up to that month
    first_o, last_o = midx[FIRST_ORIGIN], M - 1
    origins = list(range(first_o, last_o + 1))
    # weekly model: forecasts by week from each origin, added up into the target months below
    progress(0.12, "Learning week by week")
    fest, _ = CAL.festival_rows(ws)
    wd0 = pd.Timestamp(wk_dates[0])
    mend = {}
    for mi, m in enumerate(months):
        mons = pd.date_range(m.start_time, m.end_time, freq="W-MON")
        mend[mi] = int((mons[-1] - wd0).days // 7)
    wpred = W_.run(Ywk, [d.date().isoformat() for d in wk_dates], sidx, fest, mend, origins, last_o)

    def wk_month(oi, hmax):
        """(hmax, S): the weekly model's forecast for month oi+h, as units per week, to fit the way the other methods are stored."""
        arr = wpred[oi]
        res = np.full((hmax, S), np.nan)
        for h in range(1, hmax + 1):
            m = ext[oi + h]
            mons = pd.date_range(m.start_time, m.end_time, freq="W-MON")
            hw = np.array([(d - wd0).days // 7 - mend[oi] for d in mons])
            if hw.min() >= 1 and hw.max() <= arr.shape[1]:
                res[h - 1] = arr[:, hw - 1].sum(axis=1) / len(mons)
        return res

    pred = {c: {} for c in C.COMPS}    # comp -> origin index -> (hmax, S) weekly-average forecast
    for n, oi in enumerate(origins):
        hmax = C.H_MAX if oi == last_o else 3
        tr = train[train["ti"] <= oi]
        model = C.lgb_fit(tr[X_cols], tr["y"].to_numpy())
        lg = np.zeros((hmax, S))
        for h in range(1, hmax + 1):
            df = C.features(W, oi, h, oi + h, cal, sidx, clim["rain"], clim["temp"], reg_of)
            lg[h - 1] = df["m12"].to_numpy() * np.exp(model.predict(df[X_cols]))
        sn = C.seasonal_naive(W, oi, hmax, oi + 1)
        et = C.ets_forecast(W, oi, hmax, sn)
        pred["lgb"][oi], pred["sn"][oi], pred["ets"][oi] = lg, sn, et
        pred["wlgb"][oi] = wk_month(oi, hmax)
        progress(0.1 + 0.8 * (n + 1) / len(origins), f"Backtesting and forecasting ({n + 1} of {len(origins)})")

    # ---- window runs: M3, M2 and M1 as the number of recent months read (recursive.py); origins from 3 months before the test period
    progress(0.9, "Window runs")
    rec = R_.run(W, cal, sidx, [oi for oi in origins if oi >= midx[TEST_START] - 3])

    # ---- backtest cube: for each horizon h and target month T (Oct 2024 ...), units forecast by each method
    tmonths = [m for m in months if m >= VAL_START]
    tcols = [midx[m] for m in tmonths]
    cube = {c: np.full((3, S, len(tmonths)), np.nan) for c in C.COMPS}
    for j, ti in enumerate(tcols):
        for h in (1, 2, 3):
            oi = ti - h
            if oi in pred["lgb"]:
                for c in C.COMPS:
                    cube[c][h - 1, :, j] = pred[c][oi][h - 1] * nw[ti]
    act = Y[:, tcols]
    is_val = np.array([m < TEST_START for m in tmonths])
    weights = {}
    for h in (1, 2, 3):
        a = act[:, is_val]
        weights[h] = C.best_weights(a, {c: cube[c][h - 1][:, is_val] for c in C.COMPS})
    ens = np.full((3, S, len(tmonths)), np.nan)
    for h in (1, 2, 3):
        w = weights[h]
        ens[h - 1] = sum(w[c] * cube[c][h - 1] for c in C.COMPS)
    cube["ens"] = ens

    # the same runs for months not closed yet: M3 for the next three months, M2 for the first two, M1 for the first,
    # from the origins whose cut-off has already passed (so each is a forecast made with the data that existed then)
    nwf = cal["n_weeks"].to_numpy()[M: M + 3].astype(float)
    fcube = {c: np.full((3, S, 3), np.nan) for c in C.COMPS}
    for j in range(3):
        for h in (1, 2, 3):
            oi = M + j - h
            if oi in pred["lgb"] and oi <= last_o:
                for c in C.COMPS:
                    fcube[c][h - 1, :, j] = pred[c][oi][h - 1] * nwf[j]
    fens = np.full((3, S, 3), np.nan)
    for h in (1, 2, 3):
        w = weights[h]
        fens[h - 1] = sum(w[c] * fcube[c][h - 1] for c in C.COMPS)
    fcube["ens"] = fens

    # ---- long-range run from the last origin
    fut = {c: pred[c][last_o] * cal["n_weeks"].to_numpy()[M: M + C.H_MAX][:, None] for c in C.COMPS}
    wl = weights[3]
    fut["ens"] = sum(wl[c] * fut[c] for c in C.COMPS)

    # ---- SKU shares: last 8 weeks of orders inside each family x region x channel bucket, as of each origin month
    sk = p.groupby(["family", "region", "channel", "sku", "date"])["orders_qty"].sum().reset_index()
    sk["m"] = sk["date"].dt.to_period("M")
    wk_all = np.sort(sk["date"].unique())
    skus = sk.drop_duplicates(["family", "region", "channel", "sku"])[["family", "region", "channel", "sku"]].sort_values(
        ["family", "region", "channel", "sku"]).reset_index(drop=True)
    kid = {tuple(r): i for i, r in enumerate(skus.itertuples(index=False))}
    K = len(skus)
    bucket = np.array([sid[(r.family, r.region, r.channel)] for r in skus.itertuples(index=False)])
    skuY = np.zeros((K, M))
    for r in sk.itertuples(index=False):
        mi = midx.get(r.m)
        if mi is not None:
            skuY[kid[(r.family, r.region, r.channel, r.sku)], mi] += r.orders_qty
    shares = {}
    sk["k"] = [kid[t] for t in zip(sk["family"], sk["region"], sk["channel"], sk["sku"])]
    for oi in origins:
        cut = months[oi].end_time
        wk = pd.DatetimeIndex(wk_all)
        wk = wk[wk <= cut][-8:]
        sub = sk[sk["date"].isin(wk)].groupby("k")["orders_qty"].sum()
        v = np.zeros(K)
        v[sub.index.to_numpy()] = sub.to_numpy()
        tot = np.bincount(bucket, weights=v, minlength=S)
        cnt = np.bincount(bucket, minlength=S)
        sh = np.where(tot[bucket] > 0, v / np.where(tot[bucket] > 0, tot[bucket], 1), 1.0 / cnt[bucket])
        shares[oi] = sh
    # SKU-level forecast cube for the backtest months, at each horizon (units), and the long-range run
    sku_cube = np.full((3, K, len(tmonths)), np.nan)
    for j, ti in enumerate(tcols):
        for h in (1, 2, 3):
            oi = ti - h
            if oi in shares:
                sku_cube[h - 1, :, j] = ens[h - 1][bucket, j] * shares[oi]
    sku_fut = fut["ens"][:, bucket].T * shares[last_o][:, None]

    # ---- sales-team views are read in `engine`; here only what the model itself produced
    return dict(
        months=[str(m) for m in months], tmonths=[str(m) for m in tmonths], fmonths=[str(m) for m in ext[M: M + C.H_MAX]],
        sidx=sidx, skus=skus, bucket=bucket, Ywk=Ywk, wk_dates=[d.date().isoformat() for d in wk_dates], wpred=wpred, wk_mend=mend, Y=Y, Yi=Yi, skuY=skuY, nw=nw, rec=rec, cube=cube, fcube=fcube, act=act, is_val=is_val, weights=weights,
        fut=fut, sku_cube=sku_cube, sku_fut=sku_fut, shares_last=shares[last_o], cal_info=cal_info, zero_share=zero_share,
        n_train_rows=int(len(train)), seconds=round(time.time() - t0, 1), n_series=S, n_skus=K,
        late_skus=late_skus, feature_names=X_cols, ext_months=[str(m) for m in ext],
    )

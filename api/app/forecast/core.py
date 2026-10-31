"""Monthly forecasting maths: three methods and the features the gradient-boosting model sees."""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", message="Mean of empty slice")
H_MAX = 15
COMPS = ("lgb", "sn", "ets", "wlgb")
CAT = ["family", "region", "channel"]


def clim_by_origin(vals: np.ndarray, moy: np.ndarray, n_origin: int) -> np.ndarray:
    """vals: (R, M) monthly values. Returns (M, R, 12): mean per calendar month using only months <= origin."""
    R, M = vals.shape
    out = np.full((M, R, 12), np.nan)
    s = np.zeros((R, 12))
    c = np.zeros((R, 12))
    for m in range(M):
        if not np.isnan(vals[:, m]).all():
            s[:, moy[m] - 1] += np.nan_to_num(vals[:, m])
            c[:, moy[m] - 1] += 1
        with np.errstate(invalid="ignore", divide="ignore"):
            out[m] = np.where(c > 0, s / c, np.nan)
    return out


def features(W: np.ndarray, oi: int, h: int, ti: int, cal: pd.DataFrame, sidx: pd.DataFrame, climR: np.ndarray, climT: np.ndarray,
             reg_of: np.ndarray) -> pd.DataFrame:
    """One row per series for origin month index `oi` and target month index `ti = oi + h`."""
    S, M = W.shape
    m12 = np.nanmean(W[:, oi - 11: oi + 1], axis=1)
    l1 = W[:, oi]
    m3 = np.nanmean(W[:, oi - 2: oi + 1], axis=1)
    k = -(-h // 12)
    si = ti - 12 * k
    sref = W[:, si] if 0 <= si < M and si <= oi else np.full(S, np.nan)
    prev = np.nanmean(W[:, oi - 23: oi - 11], axis=1) if oi >= 23 else np.full(S, np.nan)
    with np.errstate(divide="ignore", invalid="ignore"):
        lg = lambda a, b: np.log(np.clip(a, 1e-9, None) / np.clip(b, 1e-9, None))
        row = dict(h=h, k=k, l1=lg(l1, m12), m3=lg(m3, m12), sref=lg(sref, m12), yoy=lg(m12, prev))
    c = cal.iloc[ti]
    df = pd.DataFrame(row)
    for col in cal.columns:
        df[col] = c[col]
    mo = int(c["moy"]) - 1
    # climate for the target month, relative to that region's annual mean (known at the origin: only months <= origin)
    for nm, arr in (("rain", climR), ("temp", climT)):
        tab = arr[oi]  # (R, 12)
        rel = tab[:, mo] - np.nanmean(tab, axis=1)
        df[nm + "_clim"] = rel[reg_of]
    for cc in CAT:
        df[cc] = pd.Categorical(sidx[cc].to_numpy(), categories=sorted(sidx[cc].unique()))
    df["m12"] = m12
    return df


FEATS_NUM = ["h", "k", "l1", "m3", "sref", "yoy", "moy", "month_end_week", "n_weeks", "rain_clim", "temp_clim"]


def lgb_fit(X: pd.DataFrame, y: np.ndarray, n: int = 220):
    import lightgbm as lgb
    m = lgb.LGBMRegressor(n_estimators=n, learning_rate=0.05, num_leaves=15, min_child_samples=25, subsample=0.8, subsample_freq=1,
                          colsample_bytree=0.8, reg_lambda=2.0, verbose=-1, n_jobs=2)
    return m.fit(X, y)


def seasonal_naive(W: np.ndarray, oi: int, hmax: int, ti0: int) -> np.ndarray:
    """(hmax, S) weekly-average forecast: same month of the last year(s) on record, scaled by a damped recent trend."""
    S, M = W.shape
    out = np.full((hmax, S), np.nan)
    m12 = np.nanmean(W[:, oi - 11: oi + 1], axis=1)
    prev = np.nanmean(W[:, oi - 23: oi - 11], axis=1) if oi >= 23 else None
    g = np.ones(S) if prev is None else np.clip(m12 / np.where(prev > 0, prev, np.nan), 0.8, 1.25) ** 0.5
    g = np.where(np.isnan(g), 1.0, g)
    for h in range(1, hmax + 1):
        k = -(-h // 12)
        si = oi + h - 12 * k
        ref = W[:, si] if 0 <= si <= oi else np.full(S, np.nan)
        out[h - 1] = ref * g ** k
    return np.where(np.isnan(out), m12[None, :], out)


def ets_forecast(W: np.ndarray, oi: int, hmax: int, fallback: np.ndarray) -> np.ndarray:
    """Damped-trend exponential smoothing with additive seasonality on the log scale; falls back to `fallback` if too short."""
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    S = W.shape[0]
    out = fallback.copy()
    if oi + 1 < 24:
        return out
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for s in range(S):
            y = W[s, : oi + 1]
            if np.isnan(y).any() or (y <= 0).any():
                continue
            try:
                f = ExponentialSmoothing(np.log(y), trend="add", damped_trend=True, seasonal="add", seasonal_periods=12,
                                         initialization_method="estimated").fit(optimized=True)
                fc = np.exp(f.forecast(hmax))
                if np.isfinite(fc).all():
                    out[:, s] = fc
            except Exception:  # noqa: BLE001
                pass
    return out


def best_weights(actual: np.ndarray, fcs: dict[str, np.ndarray], step: float = 0.1) -> dict[str, float]:
    """Non-negative weights summing to 1 that minimise total absolute error on the validation months."""
    import itertools
    names = list(fcs)
    ok = np.isfinite(actual)
    for v in fcs.values():
        ok &= np.isfinite(v)
    actual = actual[ok]
    fcs = {k: v[ok] for k, v in fcs.items()}
    n = int(round(1 / step))
    best, bw = np.inf, None
    for combo in itertools.product(range(n + 1), repeat=len(names) - 1):
        if sum(combo) > n:
            continue
        w = np.array(list(combo) + [n - sum(combo)]) * step
        f = sum(wi * fcs[nm] for wi, nm in zip(w, names))
        e = np.abs(actual - f).sum()
        if e < best:
            best, bw = e, w
    return {nm: float(w) for nm, w in zip(names, bw)}

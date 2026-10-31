"""Weekly gradient-boosting model. Festival effects play out week by week (stocking builds in the weeks before a festival), so this
model learns from weekly orders and the weeks to each festival, then its weeks are added up into months for the blend."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import core as C

HB = 18     # weeks ahead for the backtest vintages (covers 3 months)


def calendar(wd_all: pd.DatetimeIndex, fest: pd.DataFrame) -> pd.DataFrame:
    """Per week: weeks until the next and since the last festival of each group, plus week and month of year."""
    WA = len(wd_all)
    days = wd_all.to_numpy().astype("datetime64[D]")
    cal = {}
    for g in sorted(fest["Group"].unique()):
        fd = np.sort(fest.loc[fest["Group"] == g, "date"].to_numpy().astype("datetime64[D]"))
        nxt = np.full(WA, 20.0)
        prv = np.full(WA, 8.0)
        k = np.searchsorted(fd, days, side="left")
        ok = k < len(fd)
        nxt[ok] = np.minimum(20.0, (fd[k[ok]] - days[ok]).astype(int) / 7)
        ok2 = k > 0
        prv[ok2] = np.minimum(8.0, (days[ok2] - fd[k[ok2] - 1]).astype(int) / 7)
        cal["wd_" + g] = nxt
        cal["ws_" + g] = prv
    cal = pd.DataFrame(cal)
    cal["woy"] = wd_all.isocalendar().week.to_numpy().astype(float)
    cal["moy"] = wd_all.month.to_numpy().astype(float)
    cal["dom"] = wd_all.day.to_numpy().astype(float)
    return cal


def _features(Y: np.ndarray, o: int, hmax: int, cal: pd.DataFrame, sidx: pd.DataFrame, cats) -> pd.DataFrame:
    S, Wn = Y.shape
    m52 = np.nanmean(Y[:, o - 51: o + 1], axis=1)
    l4 = np.nanmean(Y[:, o - 3: o + 1], axis=1)
    l13 = np.nanmean(Y[:, o - 12: o + 1], axis=1)
    prev = np.nanmean(Y[:, o - 103: o - 51], axis=1) if o >= 103 else np.full(S, np.nan)
    lg = lambda a, b: np.log(np.clip(a, 1e-9, None) / np.clip(b, 1e-9, None))
    cols = list(cal.columns)
    shift = [c for c in cols if c.startswith("wd_") or c.startswith("ws_")]
    out = []
    for h in range(1, hmax + 1):
        t = o + h
        k = -(-h // 52)
        ref = t - 52 * k
        if ref < 1 or t >= len(cal):
            continue
        sref = np.nanmean(Y[:, ref - 1: min(o, ref + 1) + 1], axis=1)
        df = pd.DataFrame(dict(h=float(h), k=float(k), l4=lg(l4, m52), l13=lg(l13, m52), sref=lg(sref, m52), yoy=lg(m52, prev), m52=m52))
        ct, cr = cal.iloc[t], cal.iloc[ref]
        for c in cols:
            df[c] = ct[c]
        for c in shift:
            df["d_" + c] = ct[c] - cr[c]
        df["o"], df["t"] = o, t
        df["yt"] = Y[:, t] if t < Wn else np.nan
        for cc in C.CAT:
            df[cc] = pd.Categorical(sidx[cc].to_numpy(), categories=cats[cc])
        out.append(df)
    return pd.concat(out, ignore_index=True)


def run(Ywk: np.ndarray, wk_dates: list[str], sidx: pd.DataFrame, fest: pd.DataFrame, month_end_week: dict[int, int], origins: list[int],
        last_o: int, end: str = "2027-12-27", progress=lambda i, n: None) -> dict[int, np.ndarray]:
    """Weekly forecasts (S, h) for each origin month: HB weeks ahead, and as far as `end` from the last origin. Keyed by origin month."""
    wd = pd.to_datetime(wk_dates)
    alld = pd.date_range(wd[0], end, freq="W-MON")
    cal = calendar(alld, fest)
    cats = {cc: sorted(sidx[cc].unique()) for cc in C.CAT}
    S = Ywk.shape[0]
    hf = len(alld) - 1 - month_end_week[last_o]
    T = pd.concat([_features(Ywk, o, hf, cal, sidx, cats) for o in sorted(month_end_week.values()) if o >= 51], ignore_index=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        T["y"] = np.log(T["yt"] / T["m52"])
    Xc = [c for c in T.columns if c not in ("yt", "y", "o", "t", "m52")]
    out = {}
    for n, oi in enumerate(origins):
        o0 = month_end_week[oi]
        hmax = hf if oi == last_o else HB
        ok = (T["o"] <= o0) & (T["t"] <= o0) & np.isfinite(T["y"]) & (T["m52"] > 0) & (T["h"] <= hmax)
        tr = T[ok]
        model = C.lgb_fit(tr[Xc], tr["y"].to_numpy())
        pr = T[(T["o"] == o0) & (T["h"] <= hmax)]
        p = np.exp(model.predict(pr[Xc])) * pr["m52"].to_numpy()
        hs = pr["h"].astype(int).to_numpy()
        arr = np.full((S, hmax), np.nan)
        arr[np.tile(np.arange(S), len(hs) // S), hs - 1] = p
        out[oi] = arr
        progress(n + 1, len(origins))
    return out

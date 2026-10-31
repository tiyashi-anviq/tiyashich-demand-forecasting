"""Window runs. M3, M2 and M1 here are how many recent months a model reads, not how far ahead it was made.

M3 forecasts the next month from the last 3 months of values, then moves the window on one month, now counting its own forecast as the newest
value, and repeats. M2 does the same with a 2-month window and M1 with a 1-month window. Alongside the window, each run may also use what is
known in advance for the month being forecast: the festival calendar, the month of the year, the number of weeks, and the same month last year.
One pooled gradient-boosting model per window length learns the step "next month from the window", and is refitted at every origin month on
data up to that month only.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import core as C

RUNS = (3, 2, 1)


def _lg(a, b):
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.log(np.clip(a, 1e-9, None) / np.clip(b, 1e-9, None))


def _rows(Wm: np.ndarray, t: int, p: int, cal: pd.DataFrame, sidx: pd.DataFrame) -> pd.DataFrame:
    """One row per series for target month index t, read from the p months before it (actual or forecast) and the same month a year earlier."""
    S = Wm.shape[0]
    win = Wm[:, t - p:t]
    with np.errstate(invalid="ignore"):
        ref = np.nanmean(win, axis=1)
    df = pd.DataFrame({"lref": np.log(np.clip(ref, 1e-9, None))})
    for k in range(1, p + 1):
        df[f"l{k}"] = _lg(Wm[:, t - k], ref)
    ly = Wm[:, t - 12]
    df["ly"] = _lg(ly, ref)
    c = cal.iloc[t]
    for col in cal.columns:
        df[col] = c[col]
    for cc in C.CAT:
        df[cc] = pd.Categorical(sidx[cc].to_numpy(), categories=sorted(sidx[cc].unique()))
    df["ref"] = ref
    return df


def _cols(p: int, cal: pd.DataFrame) -> list[str]:
    return ["lref"] + [f"l{k}" for k in range(1, p + 1)] + ["ly"] + list(cal.columns) + C.CAT


def run(W: np.ndarray, cal: pd.DataFrame, sidx: pd.DataFrame, origins: list[int]) -> dict:
    """W: (S, M) monthly orders as units per week. Returns {p: {origin: (3, S) forecasts for the next 3 months, units per week}}."""
    S, M = W.shape
    pad = np.full((S, M + 3), np.nan)
    pad[:, :M] = W
    out: dict = {}
    for p in RUNS:
        cols = _cols(p, cal)
        parts = []
        for t in range(12, M):
            df = _rows(pad, t, p, cal, sidx)
            with np.errstate(divide="ignore", invalid="ignore"):
                df["y"] = np.log(pad[:, t] / df["ref"].to_numpy())
            df["ti"] = t
            parts.append(df)
        train = pd.concat(parts, ignore_index=True)
        train = train[np.isfinite(train["y"]) & (train["ref"] > 0)].reset_index(drop=True)
        train["y"] = train["y"].clip(-2.5, 2.5)
        out[p] = {}
        for oi in origins:
            tr = train[train["ti"] <= oi]
            model = C.lgb_fit(tr[cols], tr["y"].to_numpy(), n=160)
            Wm = pad.copy()
            Wm[:, oi + 1:] = np.nan
            f = np.full((3, S), np.nan)
            for h in (1, 2, 3):
                t = oi + h
                df = _rows(Wm, t, p, cal, sidx)
                v = df["ref"].to_numpy() * np.exp(model.predict(df[cols]))
                Wm[:, t] = v
                f[h - 1] = v
            out[p][oi] = f
    return out

"""State for the Forecasts screen: runs the build in the background and keeps the result in memory."""
from __future__ import annotations

import hashlib
import pickle
import re
import threading
import time
from pathlib import Path

import numpy as np
import pandas as pd

from .. import store
from ..eda import engine as E
from ..eda import panel as P
from . import build as B

_LOCK = threading.RLock()
VERSION = "7"  # change when the build changes so saved results are rebuilt
CACHE = store.ROOT / "forecast"


def _cache_file(key: str) -> Path:
    from .calendar import EXTRA
    extra = hashlib.md5(EXTRA.read_bytes()).hexdigest()[:8] if EXTRA.exists() else "none"
    return CACHE / f"{VERSION}_{extra}_{re.sub(r'[^0-9A-Za-z]+', '_', key)}.pkl"
S: dict = dict(key=None, result=None, status=dict(state="idle", message="", progress=0.0), error=None, team=None)


def status() -> dict:
    ws = store.read_workspace()
    if not ws:
        return dict(state="no_data", message="", progress=0.0)
    key = str(ws.get("loaded_at"))
    with _LOCK:
        if S["key"] != key:
            S.update(key=key, result=None, team=None, error=None, status=dict(state="building", message="Preparing the data", progress=0.02))
            threading.Thread(target=_work, args=(ws, key), daemon=True).start()
        return dict(S["status"], error=S["error"])


def result() -> dict | None:
    return S["result"]


def team() -> dict | None:
    return S["team"]


def _work(ws: dict, key: str) -> None:
    try:
        E.ensure_started()
        while E.panel() is None:
            if E.S.error:
                raise RuntimeError(E.S.error)
            time.sleep(1)
        with _LOCK:
            S["status"] = dict(state="building", message="Preparing the data", progress=0.05)

        def prog(f, msg):
            with _LOCK:
                if S["key"] == key:
                    S["status"] = dict(state="building", message=msg, progress=round(f, 3))

        cf = _cache_file(key)
        if cf.exists():
            try:
                r, tm = pickle.loads(cf.read_bytes())
                with _LOCK:
                    if S["key"] == key:
                        S["result"], S["team"] = r, tm
                        S["status"] = dict(state="ready", message="", progress=1.0)
                return
            except Exception:  # noqa: BLE001
                cf.unlink(missing_ok=True)
        r = B.run(ws, E.panel(), prog)
        mm = P._find(ws, "product_master", {"sku", "description"}, "SKU Master")
        r["sku_names"] = dict(zip(mm["sku"], mm["description"])) if mm is not None else {}
        tm = _sales_team(ws, r)
        try:
            CACHE.mkdir(parents=True, exist_ok=True)
            for old in CACHE.glob("*.pkl"):
                old.unlink(missing_ok=True)
            cf.write_bytes(pickle.dumps((r, tm)))
        except Exception:  # noqa: BLE001
            pass
        with _LOCK:
            if S["key"] == key:
                S["result"], S["team"] = r, tm
                S["status"] = dict(state="ready", message="", progress=1.0)
    except Exception as e:  # noqa: BLE001
        with _LOCK:
            S["error"] = f"{type(e).__name__}: {e}"
            S["status"] = dict(state="error", message=S["error"], progress=0.0)


def _sales_team(ws: dict, r: dict) -> dict | None:
    """The sales team's M3/M2/M1 numbers from the forecast-versions file, summed to family x region x channel x month."""
    h = P._find(ws, "forecast", {"sku", "bu_qty", "horizon"})
    if h is None:
        return None
    fam = r["skus"].drop_duplicates("sku").set_index("sku")["family"]
    h = h.assign(m=pd.to_datetime(h["date"]).dt.to_period("M").astype(str), family=h["sku"].map(fam)).dropna(subset=["family"])
    tmonths = r["tmonths"]
    h = h[h["m"].isin(tmonths)]
    sidx = r["sidx"]
    sid = {tuple(t): i for i, t in enumerate(sidx[["family", "region", "channel"]].itertuples(index=False))}
    out: dict = {}
    for hz in ("M1", "M2", "M3"):
        g = h[h["horizon"] == hz].groupby(["family", "region", "channel", "m"])[["bu_qty", "forecast_qty", "budget_qty", "Prior_Year_Actual_Qty", "actual_qty"]].sum()
        arrs = {c: np.full((len(sidx), len(tmonths)), np.nan) for c in g.columns}
        mi = {m: j for j, m in enumerate(tmonths)}
        for (f, rg, ch, m), row in g.iterrows():
            i = sid.get((f, rg, ch))
            if i is None:
                continue
            for c in g.columns:
                arrs[c][i, mi[m]] = row[c]
        out[hz] = arrs
    # does file 03 sit on the same scale as the sales in the app?  Compare its invoiced actuals with ours on the test months.
    months = r["months"]
    tc = [months.index(m) for m in tmonths]
    ours = np.nansum(r["Yi"][:, tc][:, ~r["is_val"]])
    theirs = np.nansum(out["M1"]["actual_qty"][:, ~r["is_val"]])
    out["scale_ratio"] = float(theirs / ours) if ours else None
    return out

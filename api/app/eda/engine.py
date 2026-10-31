"""State for the Explore screen: the cached panel and the driver model(s), built in the background."""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .. import store
from . import panel as P

TEST_START = pd.Timestamp("2025-10-01")
MEASURES = {"orders": ("orders_qty", "Orders received"), "invoiced": ("quantity", "Invoiced (primary sales)")}
IDENTITY = ["family", "channel", "region"]

_LOCK = threading.RLock()


@dataclass
class State:
    key: str | None = None
    panel: pd.DataFrame | None = None
    notes: dict = field(default_factory=dict)
    status: dict = field(default_factory=lambda: dict(panel="idle", message="", progress=0.0))
    models: dict = field(default_factory=dict)  # measure -> dict(state, ...)
    error: str | None = None


S = State()


def _ws():
    return store.read_workspace()


def ensure_started() -> dict:
    ws = _ws()
    if not ws:
        return dict(panel="no_data")
    key = str(ws.get("loaded_at"))
    with _LOCK:
        if S.key != key:
            S.key, S.panel, S.notes, S.models, S.error = key, None, {}, {}, None
            S.status = dict(panel="building", message="Reading the cleaned data", progress=0.05)
            threading.Thread(target=_build, args=(ws, key), daemon=True).start()
    return status()


def status() -> dict:
    with _LOCK:
        st = dict(S.status)
        st["models"] = {m: dict(state=v.get("state"), message=v.get("message", "")) for m, v in S.models.items()}
        st["error"] = S.error
        return st


def _build(ws: dict, key: str) -> None:
    try:
        p, notes = P.build(ws)
        with _LOCK:
            if S.key != key:
                return
            S.panel, S.notes = p, notes
            S.status = dict(panel="ready", message="", progress=1.0)
        want_model("orders")
    except Exception as e:  # noqa: BLE001
        with _LOCK:
            S.error = f"{type(e).__name__}: {e}"
            S.status = dict(panel="error", message=S.error, progress=0.0)


def panel() -> pd.DataFrame | None:
    return S.panel


# ----------------------------------------------------------------------------- driver model
def feature_list(p: pd.DataFrame) -> list[str]:
    feats = [c for c in P.ALL_FEATURES if c in p.columns and p[c].notna().mean() > 0.05]
    wins = [c for c in p.columns if c.startswith("win_")]
    return feats + wins


def relative_target(p: pd.DataFrame, measure: str) -> tuple[pd.Series, pd.Series]:
    col = MEASURES[measure][0]
    q = p[col].astype(float)
    train = p["date"] < TEST_START
    key = p["region"] + "|" + p["sku"] + "|" + p["channel"]
    lvl = q.where(train).groupby(key).transform("mean")
    lvl = lvl.fillna(q.groupby(key).transform("mean"))
    y = np.log1p(q.clip(lower=0)) - np.log1p(lvl)
    return y, lvl


def want_model(measure: str) -> None:
    with _LOCK:
        cur = S.models.get(measure)
        if cur and cur.get("state") in ("building", "ready"):
            return
        S.models[measure] = dict(state="building", message="Training the driver model")
        key = S.key
    threading.Thread(target=_train, args=(measure, key), daemon=True).start()


def _fit(X: pd.DataFrame, y: pd.Series, n: int = 250):
    import lightgbm as lgb
    m = lgb.LGBMRegressor(n_estimators=n, learning_rate=0.06, num_leaves=48, min_child_samples=100, subsample=0.8,
                          subsample_freq=1, colsample_bytree=0.8, verbose=-1, n_jobs=-1)
    return m.fit(X, y)


def _score(pred: np.ndarray, d: pd.DataFrame, y: pd.Series, lvl: pd.Series, col: str) -> dict:
    err = y - pred
    r2 = float(1 - (err ** 2).sum() / ((y - y.mean()) ** 2).sum())
    qhat = np.expm1(pred + np.log1p(lvl))
    t = d[["region", "sku", "channel", "date"]].copy()
    t["m"] = t["date"].dt.to_period("M")
    t["a"] = d[col].astype(float)
    t["f"] = qhat
    g = t.groupby(["region", "sku", "channel", "m"])[["a", "f"]].sum()
    wape = float((g["a"] - g["f"]).abs().sum() / g["a"].sum()) if g["a"].sum() else float("nan")
    over = float((g["f"] - g["a"]).clip(lower=0).sum() / g["a"].sum())
    under = float((g["a"] - g["f"]).clip(lower=0).sum() / g["a"].sum())
    return dict(r2=round(r2, 3), rmse=round(float(np.sqrt((err ** 2).mean())), 4), monthly_wape=round(wape, 4),
                over_pct=round(over, 4), under_pct=round(under, 4))


def _train(measure: str, key: str) -> None:
    try:
        p = S.panel
        col = MEASURES[measure][0]
        y, lvl = relative_target(p, measure)
        ok = lvl > 5
        d = p[ok].reset_index(drop=True)
        y = y[ok].reset_index(drop=True)
        lvl = lvl[ok].reset_index(drop=True)
        feats = feature_list(d)
        X = d[feats + IDENTITY].copy()
        for c in IDENTITY:
            X[c] = X[c].astype("category")
        tr = (d["date"] < TEST_START).to_numpy()
        te = ~tr
        model = _fit(X[tr], y[tr])
        full = _score(model.predict(X[te]), d[te], y[te], lvl[te], col)
        # TreeSHAP on a fixed random sample (built into LightGBM, no extra dependency)
        rng = np.random.default_rng(0)
        idx = np.sort(rng.choice(len(d), size=min(30000, len(d)), replace=False))
        contrib = model.predict(X.iloc[idx], pred_contrib=True)
        shap = pd.DataFrame(contrib[:, :-1], columns=feats + IDENTITY)
        base = float(contrib[:, -1].mean())
        sample = d.iloc[idx][["date", "region", "sku", "channel", "family"] + feats].reset_index(drop=True)
        # Does each covariate group earn its place on the test months? Retrain without it and compare.
        ablation = []
        groups = {g: [c for c in v["cols"] if c in feats] for g, v in P.GROUPS.items()}
        groups["calendar"] += [c for c in feats if c.startswith("win_")]
        for i, (g, cols) in enumerate(groups.items()):
            if not cols:
                continue
            with _LOCK:
                S.models[measure]["message"] = f"Testing what each group adds ({i + 1} of {len(groups)})"
            keep = [c for c in X.columns if c not in cols]
            m2 = _fit(X.loc[tr, keep], y[tr], n=200)
            sc = _score(m2.predict(X.loc[te, keep]), d[te], y[te], lvl[te], col)
            ablation.append(dict(group=g, label=P.GROUPS[g]["label"], **sc,
                                 wape_change=round(sc["monthly_wape"] - full["monthly_wape"], 4),
                                 rmse_change=round(sc["rmse"] - full["rmse"], 4)))
        with _LOCK:
            if S.key != key:
                return
            S.models[measure] = dict(state="ready", message="", feats=feats, shap=shap, sample=sample, base=base,
                                     full=full, ablation=ablation, n_train=int(tr.sum()), n_test=int(te.sum()))
    except Exception as e:  # noqa: BLE001
        with _LOCK:
            S.models[measure] = dict(state="error", message=f"{type(e).__name__}: {e}")

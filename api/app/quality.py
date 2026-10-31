"""Data checks and demand cleansing.

Two phases, both driven by the user's confirmed column mapping:

1. analyse()  - reads every included table, finds problems and cleansing opportunities,
                returns plain-language issues with a recommended action for each.
2. apply()    - re-reads the tables, applies the user's decisions, writes clean parquet.
"""
from __future__ import annotations

import difflib
import re
import shutil
import threading
import time
from pathlib import Path

import numpy as np
import pandas as pd

from . import store
from .scan import parse_dates
from .schema import DATASET_TYPES, norm

QTY_FIELDS = {"quantity", "orders_qty", "closing_qty", "forecast_qty", "volume"}
KEY_FIELDS = ["depot", "region", "city", "channel", "sku"]


# ---------------------------------------------------------------- loading ------------
def canonical(b: dict, g: dict) -> tuple[pd.DataFrame, dict]:
    """All sheets of a table stacked, mapped columns renamed to the planning field names."""
    frames = []
    for sid in g["sheet_ids"]:
        s = b["sheets"][sid]
        df = pd.read_parquet(s["parquet"])
        df["source_table"] = s["name"]
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    t = DATASET_TYPES[g["type"]]
    kinds = {f["key"]: f["kind"] for f in t["fields"]}
    info = {"bad_dates": {}}
    rename = {}
    for fk, col in g["mapping"].items():
        if col and col in df.columns:
            rename[col] = fk
    # a column already called like a field but not mapped to it gets parked
    for fk in set(rename.values()):
        if fk in df.columns and fk not in rename:
            df = df.rename(columns={fk: f"{fk}_original"})
    df = df.rename(columns=rename)
    for fk, kind in kinds.items():
        if fk not in df.columns:
            continue
        if kind == "date":
            before = df[fk].notna().sum()
            df[fk] = parse_dates(df[fk])
            info["bad_dates"][fk] = int(before - df[fk].notna().sum())
        elif kind == "number":
            df[fk] = pd.to_numeric(df[fk], errors="coerce")
        else:
            df[fk] = df[fk].astype("string").str.strip()
    return df, info


def _is_text(s: pd.Series) -> bool:
    return pd.api.types.is_string_dtype(s) or pd.api.types.is_object_dtype(s)


def _data_cols(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c != "source_table"]


# ----------------------------------------------------------------- checks -----------
def label_variants(df: pd.DataFrame) -> dict[str, dict[str, str]]:
    """Text columns where the same label is typed in more than one way."""
    out = {}
    for c in df.columns:
        if c == "source_table" or not _is_text(df[c]):
            continue
        vc = df[c].dropna().value_counts()
        if len(vc) == 0 or len(vc) > 300:
            continue
        by_norm: dict[str, list[str]] = {}
        for v in vc.index:
            by_norm.setdefault(norm(v), []).append(v)
        rep = {}
        for variants in by_norm.values():
            if len(variants) > 1:
                best = max(variants, key=lambda x: vc[x])
                for v in variants:
                    if v != best:
                        rep[v] = best
        if rep:
            out[c] = rep
    return out


def _weekly(dates: pd.Series) -> bool:
    d = dates.dropna().drop_duplicates().sort_values()
    if len(d) < 3:
        return False
    return float(d.diff().dt.days.median()) <= 8


def _actions(*items):
    return [dict(id=i, label=l, recommended=r) for i, l, r in items]


def check_group(g: dict, df: pd.DataFrame, info: dict) -> list[dict]:
    issues: list[dict] = []
    t = DATASET_TYPES[g["type"]]
    name = g["name"]
    n = len(df)
    req = [f["key"] for f in t["fields"] if f["required"] and f["key"] in df.columns]

    # 1 duplicate rows
    dups = int(df[_data_cols(df)].duplicated().sum())
    if dups:
        ex = df[df[_data_cols(df)].duplicated(keep=False)].head(2)
        issues.append(dict(
            id=f"dup:{g['id']}", scope="cleanup", dataset=name, severity="warn",
            title="Repeated rows",
            detail=f"{dups:,} rows are exact copies of another row. Left in, they would be counted twice.",
            count=dups, total=n,
            actions=_actions(("remove", "Remove the copies", True), ("keep", "Keep them", False)),
            default="remove",
        ))

    # 2 unreadable dates
    for fk, bad in info["bad_dates"].items():
        if bad:
            issues.append(dict(
                id=f"date:{g['id']}:{fk}", scope="cleanup", dataset=name, severity="warn",
                title="Dates we could not read",
                detail=f"{bad:,} values in the '{g['mapping'].get(fk)}' column are not in a date format we recognise.",
                count=bad, total=n,
                actions=_actions(("drop", "Remove those rows", True), ("keep", "Keep, leave the date empty", False)),
                default="drop" if fk in req else "keep",
            ))

    # 3 blanks
    blank_cols = {}
    for c in _data_cols(df):
        if c.endswith("_original"):
            continue
        k = int(df[c].isna().sum())
        if k and (c in [f["key"] for f in t["fields"]] or pd.api.types.is_numeric_dtype(df[c])):
            blank_cols[c] = k
    if blank_cols:
        req_blank = {c: k for c, k in blank_cols.items() if c in req}
        worst = sorted(blank_cols.items(), key=lambda kv: -kv[1])[:4]
        back = {fk: col for fk, col in g["mapping"].items() if col}
        shown = ", ".join(f"{back.get(c, c)} ({k:,})" for c, k in worst)
        has_date = "date" in df.columns
        if req_blank:
            default = "drop"
        elif has_date and g["type"] == "weather":
            default = "fill"
        else:
            default = "keep"
        acts = [("keep", "Leave blanks as they are", default == "keep")]
        if has_date:
            acts.insert(0, ("fill", "Fill gaps by straight-line interpolation", default == "fill"))
        if req_blank:
            acts.insert(0, ("drop", "Remove rows missing a key field", default == "drop"))
        issues.append(dict(
            id=f"blank:{g['id']}", scope="cleanup", dataset=name, severity="info" if not req_blank else "warn",
            title="Blank cells",
            detail=f"{sum(blank_cols.values()):,} blank cells across {len(blank_cols)} columns: {shown}.",
            count=int(sum(blank_cols.values())), total=n,
            actions=_actions(*acts), default=default,
            minor=bool(default == "keep" and not req_blank),
        ))

    # 4 labels typed two ways
    lv = label_variants(df)
    if lv:
        col, rep = next(iter(lv.items()))
        ex = ", ".join(f"'{a}' and '{b}'" for a, b in list(rep.items())[:2])
        cnt = int(sum(df[c].isin(list(r.keys())).sum() for c, r in lv.items()))
        issues.append(dict(
            id=f"label:{g['id']}", scope="cleanup", dataset=name, severity="info",
            title="Same label typed in different ways",
            detail=f"In '{col}', {ex} look like the same thing. {len(lv)} column(s) affected.",
            count=cnt, total=n,
            actions=_actions(("standardise", "Use the most common spelling", True), ("keep", "Keep as they are", False)),
            default="standardise",
        ))

    # 5 negative quantities
    for fk in QTY_FIELDS & set(df.columns):
        neg = int((df[fk] < 0).sum())
        if neg:
            issues.append(dict(
                id=f"neg:{g['id']}:{fk}", scope="cleanup", dataset=name, severity="warn",
                title="Negative quantities",
                detail=f"{neg:,} rows have a negative '{g['mapping'].get(fk)}'. This can be a return or an error.",
                count=neg, total=n,
                actions=_actions(("zero", "Set them to zero", True), ("keep", "Keep them", False)),
                default="zero",
            ))

    # 6 gaps in weekly history (information only)
    if g["type"] in ("sales", "inventory") and "date" in df.columns and _weekly(df["date"]):
        d = df["date"].dropna().drop_duplicates().sort_values()
        full = pd.date_range(d.min(), d.max(), freq="7D")
        miss = len(full.difference(d))
        if miss:
            issues.append(dict(
                id=f"gap:{g['id']}", scope="cleanup", dataset=name, severity="info",
                title="Missing weeks",
                detail=f"{miss} weeks between {d.min():%d %b %Y} and {d.max():%d %b %Y} have no rows at all.",
                count=miss, total=len(full), actions=[], default=None,
            ))
    return issues


def apply_group(g: dict, df: pd.DataFrame, decisions: dict, log: dict) -> pd.DataFrame:
    t = DATASET_TYPES[g["type"]]
    req = [f["key"] for f in t["fields"] if f["required"] and f["key"] in df.columns]
    gid = g["id"]
    for fk in list(df.columns):
        d = decisions.get(f"date:{gid}:{fk}")
        if d == "drop":
            k = len(df)
            df = df[df[fk].notna()]
            log["rows_removed"] += k - len(df)
    if decisions.get(f"dup:{gid}") == "remove":
        k = len(df)
        df = df.drop_duplicates(subset=_data_cols(df))
        log["duplicates_removed"] += k - len(df)
    if decisions.get(f"label:{gid}") == "standardise":
        for c, rep in label_variants(df).items():
            log["labels_standardised"] += int(df[c].isin(list(rep)).sum())
            df[c] = df[c].replace(rep)
    for fk in QTY_FIELDS & set(df.columns):
        if decisions.get(f"neg:{gid}:{fk}") == "zero":
            m = df[fk] < 0
            log["negatives_zeroed"] += int(m.sum())
            df.loc[m, fk] = 0
    bd = decisions.get(f"blank:{gid}")
    if bd == "drop" and req:
        k = len(df)
        df = df.dropna(subset=req)
        log["rows_removed"] += k - len(df)
    elif bd == "fill" and "date" in df.columns:
        keys = [k for k in KEY_FIELDS if k in df.columns]
        nums = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c]) and c not in keys]
        df = df.sort_values(keys + ["date"]).reset_index(drop=True)
        before = int(df[nums].isna().sum().sum())
        lin = lambda s: s.interpolate(method="linear", limit_direction="both")  # noqa: E731
        df[nums] = df.groupby(keys)[nums].transform(lin) if keys else df[nums].apply(lin)
        log["blanks_filled"] += before - int(df[nums].isna().sum().sum())
    return df.reset_index(drop=True)



# ----------------------------------------------------------- entity resolution -------
NOISE = {"warehouse", "depot", "dc", "godown", "store", "stores", "wh", "plant", "hub", "centre", "center", "branch", "office", "stockyard"}


def build_location_lookup(frames: dict, b: dict) -> dict | None:
    """alias text -> (depot code, how it was matched). City-level names go to the city's main depot."""
    cands = [frames[g["id"]] for g in _included(b) if g["type"] == "location_master" and g["id"] in frames and "depot" in frames[g["id"]].columns]
    if not cands:
        return None
    lm = max(cands, key=len).dropna(subset=["depot"])
    look: dict[str, tuple[str, str]] = {}
    first_of_city: dict[str, str] = {}
    for r in lm.to_dict("records"):
        code = str(r["depot"]).strip()
        look[norm(code)] = (code, "depot code")
        if r.get("depot_name"):
            look[norm(r["depot_name"])] = (code, "depot name")
        city = r.get("city")
        if city:
            first_of_city.setdefault(norm(city), code)
        cc = r.get("city_code")
        if cc:
            first_of_city.setdefault(norm(cc), code)
    for alias, code in first_of_city.items():
        look.setdefault(alias, (code, "city, main depot"))
    return look


def resolve_location(value, look: dict) -> tuple[str | None, str | None]:
    if value is None or (isinstance(value, float) and value != value):
        return None, None
    full = norm(value)
    if full in look:
        return look[full]
    n = " ".join(t for t in full.split() if t not in NOISE)
    if not n:
        return None, None
    if n in look:
        return look[n]
    for t in n.split():
        if t in look:
            return look[t][0], look[t][1] + " (from a word in the name)"
    close = difflib.get_close_matches(n, list(look), n=1, cutoff=0.85)
    if close:
        return look[close[0]][0], "close spelling"
    return None, None


def detect_location_cols(g: dict, df: pd.DataFrame, look: dict) -> list[str]:
    """Free-text columns holding place names that are not already clean depot codes."""
    if g["type"] in ("location_master", "sales", "inventory", "forecast") or "depot" in df.columns:
        return []
    fields = {f["key"] for f in DATASET_TYPES[g["type"]]["fields"]}
    codes = {x[0] for x in look.values()}
    for c in df.columns:  # a table that already carries clean depot codes needs no resolving
        if c not in fields and c != "source_table" and _is_text(df[c]) and df[c].notna().any() and df[c].dropna().astype(str).isin(codes).all():
            return []
    out = []
    for c in df.columns:
        if c in fields or c == "source_table" or c.endswith("_original") or c.endswith("_depot_code"):
            continue
        if not _is_text(df[c]):
            continue
        vals = df[c].dropna().astype(str).unique()
        if not (1 <= len(vals) <= 60):
            continue
        res = [resolve_location(v, look)[0] for v in vals]
        hit = sum(1 for r in res if r)
        exact = sum(1 for v in vals if v in {x[0] for x in look.values()})
        distinct_places = len({r for r in res if r})
        # messy = the same place is written in more than one way
        if hit / len(vals) >= 0.8 and exact < len(vals) and len(vals) > distinct_places:
            out.append(c)
    return out

# -------------------------------------------------------------- cleansing ----------
def _keys(df):
    return [k for k in KEY_FIELDS if k in df.columns]


def outlier_mask(df: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Weeks far above what is normal for that series (median + 8 robust deviations)."""
    keys = _keys(df)
    q = df["quantity"].astype(float)
    grp = [df[k] for k in keys] or [pd.Series(0, index=df.index)]
    med = q.groupby(grp).transform("median")
    mad = (q - med).abs().groupby(grp).transform("median")
    size = q.groupby(grp).transform("size")
    floor = (0.05 * med.clip(lower=1))
    thr = med + 8 * 1.4826 * mad.clip(lower=floor)
    mask = (q > thr) & (q > 3 * med) & (med > 0) & (size >= 12)
    return mask, thr


def stockout_flags(inv: pd.DataFrame) -> pd.DataFrame:
    if "stock_status" in inv.columns and inv["stock_status"].notna().any():
        m = inv["stock_status"].str.lower().eq("stockout")
    else:
        m = inv["closing_qty"] <= 0
    x = inv.loc[m.fillna(False), ["date", "sku", "depot"]].dropna().drop_duplicates()
    x["_stockout"] = True
    return x


def lost_demand(df: pd.DataFrame, so: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    m = df[["date", "sku", "depot"]].merge(so, on=["date", "sku", "depot"], how="left")
    flag = m["_stockout"].fillna(False).astype(bool).to_numpy()
    flag = pd.Series(flag, index=df.index)
    keys = _keys(df)
    ordr = df.sort_values(keys + ["date"]).index
    q = df["quantity"].astype(float)
    clean = q.where(~flag)
    srt = clean.loc[ordr]
    roll = srt.groupby([df.loc[ordr, k] for k in keys]).transform(lambda s: s.shift(1).rolling(4, min_periods=1).mean())
    roll = roll.reindex(df.index)
    est = np.maximum(q, roll.fillna(q))
    est = np.minimum(est, 3 * q.clip(lower=1))
    adj = q.where(~flag, est)
    return flag, adj


def expand_schemes(sch: pd.DataFrame) -> pd.DataFrame:
    rows = []
    has_ch = "channel" in sch.columns
    has_fam = "family" in sch.columns
    s = sch.dropna(subset=["start_date", "end_date"])
    for r in s.itertuples(index=False):
        st = r.start_date - pd.Timedelta(days=r.start_date.weekday())
        disc = getattr(r, "discount_pct", np.nan)
        for w in pd.date_range(st, r.end_date, freq="7D"):
            rows.append((w, norm(r.channel) if has_ch and pd.notna(r.channel) else "*",
                         norm(r.family) if has_fam and pd.notna(r.family) else "*", disc))
    return pd.DataFrame(rows, columns=["date", "channel_n", "family_n", "discount"])


def promo_effect(df: pd.DataFrame, sch_w: pd.DataFrame, fam_of: dict) -> tuple[pd.Series, pd.Series, pd.Series]:
    fam = df["sku"].map(fam_of).map(lambda x: norm(x) if isinstance(x, str) else None)
    left = pd.DataFrame({"date": df["date"], "family_n": fam})
    use_ch = "channel" in df.columns and (sch_w["channel_n"] != "*").any()
    if use_ch:
        left["channel_n"] = df["channel"].map(lambda x: norm(x) if isinstance(x, str) else None)
        sw = sch_w[sch_w["channel_n"] != "*"].groupby(["date", "family_n", "channel_n"], as_index=False)["discount"].max()
        m = left.merge(sw, on=["date", "family_n", "channel_n"], how="left")
    else:
        sw = sch_w.groupby(["date", "family_n"], as_index=False)["discount"].max()
        m = left.merge(sw, on=["date", "family_n"], how="left")
    on = pd.Series(m["discount"].notna().to_numpy(), index=df.index)
    disc = pd.Series(m["discount"].to_numpy(), index=df.index)
    q = df["quantity"].astype(float)
    keys = _keys(df)
    grp = [df[k] for k in keys]
    mean_on = q.where(on).groupby(grp).transform("mean")
    mean_off = q.where(~on).groupby(grp).transform("mean")
    n_on = on.astype(int).groupby(grp).transform("sum")
    n_off = (~on).astype(int).groupby(grp).transform("sum")
    lift = (mean_on / mean_off.replace(0, np.nan)).where((n_on >= 3) & (n_off >= 3)).clip(1, 3).fillna(1.0)
    base = q.where(~on, q / lift)
    return on, lift.where(on, 1.0), base


def sales_ready(df: pd.DataFrame) -> bool:
    return {"date", "sku", "quantity"} <= set(df.columns)


# --------------------------------------------------------------- orchestration ------
def _job(b: dict, key: str, **kw) -> dict:
    b[key] = dict(status="running", progress=0.0, message="Starting", **kw)
    store.save(b)
    return b[key]


def start_analysis(bid: str) -> None:
    threading.Thread(target=_analyse, args=(bid,), daemon=True).start()


def start_apply(bid: str, decisions: dict) -> None:
    threading.Thread(target=_apply, args=(bid, decisions), daemon=True).start()


def _included(b):
    return [g for g in b["groups"] if g["include"] and g["type"] in DATASET_TYPES and g["type"] != "reference"]


def _first_of(frames: dict, gtype: str, b: dict):
    parts = [frames[g["id"]] for g in _included(b) if g["type"] == gtype and g["id"] in frames]
    return pd.concat(parts, ignore_index=True) if parts else None


def _primary(frames: dict, gtype: str, b: dict):
    """The biggest included table of a kind, e.g. the real product list rather than a price history."""
    gs = [g for g in _included(b) if g["type"] == gtype and g["id"] in frames]
    if not gs:
        return None
    return frames[max(gs, key=lambda g: len(frames[g["id"]]))["id"]]


def _analyse(bid: str) -> None:
    b = store.load(bid)
    q = _job(b, "quality", issues=[])
    try:
        groups = _included(b)
        frames, issues = {}, []
        total = len(groups) + 3
        for i, g in enumerate(groups):
            q["message"] = f"Checking {g['name']}"
            df, info = canonical(b, g)
            frames[g["id"]] = df
            issues += check_group(g, df, info)
            q["progress"] = round((i + 1) / total, 3)
            store.save(b)

        # cross checks against the master lists
        q["message"] = "Comparing codes with your master lists"
        pm = _primary(frames, "product_master", b)
        lm = _primary(frames, "location_master", b)
        for key, master, label in (("sku", pm, "product"), ("depot", lm, "depot")):
            if master is None or key not in master.columns:
                continue
            known = set(master[key].dropna())
            if not known:
                continue
            unknown, rows = set(), 0
            for g in groups:
                if g["type"] in ("sales", "inventory") and key in frames[g["id"]].columns:
                    s = frames[g["id"]][key].dropna()
                    miss = s[~s.isin(known)]
                    rows += len(miss)
                    unknown |= set(miss.unique())
            if unknown:
                issues.append(dict(
                    id=f"keys:{key}", scope="cleanup", dataset="Sales and stock", severity="warn",
                    title=f"{label.capitalize()} codes not in your master list",
                    detail=f"{len(unknown)} {label} codes (for example {', '.join(sorted(map(str, unknown))[:3])}) appear in sales or stock but not in the {label} list.",
                    count=rows, total=None,
                    actions=_actions(("keep", "Keep those rows", True), ("drop", "Remove those rows", False)),
                    default="keep",
                ))
        look = build_location_lookup(frames, b)
        if look:
            q["message"] = "Matching place names to depots"
            for g in groups:
                for col in detect_location_cols(g, frames[g["id"]], look):
                    vals = frames[g["id"]][col].dropna().astype(str)
                    uniq = sorted(vals.unique(), key=lambda v: -int((vals == v).sum()))
                    codes = {resolve_location(v, look)[0] for v in uniq}
                    issues.append(dict(
                        id=f"loc:{g['id']}:{col}", scope="cleanup", dataset=g["name"], severity="warn",
                        title="Place names to match to depots",
                        detail=(f"'{col}' has {len(uniq)} different spellings (for example {', '.join(repr(u) for u in uniq[:4])}). "
                                f"We can match them to depot codes ({', '.join(sorted(c for c in codes if c)[:5])} and so on). "
                                "Where a name covers a whole city, we use that city's main depot, which is an assumption."),
                        count=int(len(vals)), total=int(len(vals)),
                        actions=_actions(("resolve", "Add a depot code column", True), ("keep", "Leave as typed", False)),
                        default="resolve",
                    ))
        q["progress"] = round((len(groups) + 1) / total, 3)
        store.save(b)

        # demand cleansing on sales tables
        q["message"] = "Looking for demand distortions"
        sales_groups = [g for g in groups if g["type"] == "sales" and sales_ready(frames[g["id"]])]
        inv = _first_of(frames, "inventory", b)
        sch = _first_of(frames, "promotions", b)

        out_n = out_total = 0
        for g in sales_groups:
            m, _ = outlier_mask(frames[g["id"]])
            out_n += int(m.sum())
            out_total += len(m)
        issues.append(dict(
            id="cleansing:outliers", scope="cleansing", dataset="Sales history",
            severity="info" if out_n else "ok", title="Unusual spikes",
            detail=(f"{out_n:,} weekly values are far above what is normal for their product and location (for example one-off bulk or project orders). "
                    "They would distort the forecast if treated as normal demand.") if out_n else "No unusual spikes found.",
            count=out_n, total=out_total,
            actions=_actions(("flag", "Mark them, keep the numbers", True), ("cap", "Cap them at the normal ceiling", False), ("keep", "Do nothing", False)) if out_n else [],
            default="flag" if out_n else None,
        ))
        q["progress"] = round((len(groups) + 2) / total, 3)
        store.save(b)

        q["message"] = "Estimating demand lost to stockouts"
        if inv is not None and {"date", "sku", "depot", "closing_qty"} <= set(inv.columns):
            so = stockout_flags(inv)
            eligible = [g for g in sales_groups if {"depot"} <= set(frames[g["id"]].columns) and _weekly(frames[g["id"]]["date"])]
            ln = lt = 0
            for g in eligible:
                f, adj = lost_demand(frames[g["id"]], so)
                ln += int(f.sum())
                lt += len(f)
            issues.append(dict(
                id="cleansing:lost_demand", scope="cleansing", dataset="Sales history",
                severity="info" if ln else "ok", title="Sales lost to stockouts",
                detail=(f"{ln:,} weekly sales figures fall in weeks when that depot had run out of stock. "
                        "Real demand was higher than what was shipped, so we can estimate it from the weeks before.") if ln else "No sales fall in stockout weeks.",
                count=ln, total=lt,
                actions=_actions(("impute", "Estimate the lost demand", True), ("keep", "Do nothing", False)) if ln else [],
                default="impute" if ln else None,
            ))
        else:
            issues.append(dict(
                id="cleansing:lost_demand", scope="cleansing", dataset="Sales history", severity="skipped",
                title="Sales lost to stockouts",
                detail="Not run. This needs stock data by depot and week with a mapped closing stock column.",
                count=0, total=None, actions=[], default=None,
            ))

        q["message"] = "Separating promotion lift"
        if sch is not None and pm is not None and {"start_date", "end_date"} <= set(sch.columns) and "family" in pm.columns:
            fam_of = pm.dropna(subset=["sku", "family"]).drop_duplicates("sku").set_index("sku")["family"].to_dict()
            sw = expand_schemes(sch)
            pn = pt = 0
            for g in sales_groups:
                df = frames[g["id"]]
                if _weekly(df["date"]) and "channel" in df.columns:
                    on, _, _ = promo_effect(df, sw, fam_of)
                    pn += int(on.sum())
                    pt += len(on)
            issues.append(dict(
                id="cleansing:promo", scope="cleansing", dataset="Sales history",
                severity="info" if pn else "ok", title="Promotion weeks",
                detail=(f"{pn:,} weekly sales figures (in tables that show the sales channel) fall inside a trade scheme. We can estimate the lift and keep a base-demand column "
                        "so the forecast does not mistake promotions for normal demand.") if pn else "No sales fall inside a scheme.",
                count=pn, total=pt,
                actions=_actions(("isolate", "Add a base-demand column", True), ("keep", "Do nothing", False)) if pn else [],
                default="isolate" if pn else None,
            ))
        else:
            issues.append(dict(
                id="cleansing:promo", scope="cleansing", dataset="Sales history", severity="skipped",
                title="Promotion weeks",
                detail="Not run. This needs a schemes table with start and end dates and a product list with product families.",
                count=0, total=None, actions=[], default=None,
            ))
        order = {"warn": 0, "info": 1, "ok": 2, "skipped": 3}
        issues.sort(key=lambda i: (i["scope"] != "cleanup", order.get(i["severity"], 9)))
        q.update(status="done", progress=1.0, message="Done", issues=issues, finished=time.time())
    except Exception as e:  # noqa: BLE001
        q.update(status="error", message=f"The check failed ({type(e).__name__}: {e}).")
    store.save(b)


def _apply(bid: str, decisions: dict) -> None:
    b = store.load(bid)
    c = _job(b, "confirm")
    log = dict(rows_removed=0, duplicates_removed=0, labels_standardised=0, negatives_zeroed=0,
               blanks_filled=0, locations_resolved=0, outliers_flagged=0, outliers_capped=0, demand_estimated=0, promo_weeks=0)
    try:
        issues = {i["id"]: i for i in (b.get("quality") or {}).get("issues", [])}
        dec = {k: i["default"] for k, i in issues.items() if i.get("default")}
        dec.update({k: v for k, v in decisions.items() if k in issues})
        groups = _included(b)
        frames = {}
        for i, g in enumerate(groups):
            c["message"] = f"Cleaning {g['name']}"
            df, _ = canonical(b, g)
            frames[g["id"]] = apply_group(g, df, dec, log)
            c["progress"] = round(0.5 * (i + 1) / len(groups), 3)
            store.save(b)

        pm = _primary(frames, "product_master", b)
        for key, master in (("sku", pm), ("depot", _primary(frames, "location_master", b))):
            if dec.get(f"keys:{key}") == "drop" and master is not None and key in master.columns:
                known = set(master[key].dropna())
                for g in groups:
                    if g["type"] in ("sales", "inventory") and key in frames[g["id"]].columns:
                        k = len(frames[g["id"]])
                        frames[g["id"]] = frames[g["id"]][frames[g["id"]][key].isin(known) | frames[g["id"]][key].isna()]
                        log["rows_removed"] += k - len(frames[g["id"]])

        look = build_location_lookup(frames, b)
        if look:
            for g in groups:
                for col in detect_location_cols(g, frames[g["id"]], look):
                    if dec.get(f"loc:{g['id']}:{col}") == "resolve":
                        res = frames[g["id"]][col].map(lambda v: resolve_location(v, look))
                        frames[g["id"]][f"{col}_depot_code"] = res.map(lambda t: t[0])
                        frames[g["id"]][f"{col}_match"] = res.map(lambda t: t[1])
                        log["locations_resolved"] += int(frames[g["id"]][f"{col}_depot_code"].notna().sum())

        sales_groups = [g for g in groups if g["type"] == "sales" and sales_ready(frames[g["id"]])]
        inv = _first_of(frames, "inventory", b)
        sch = _first_of(frames, "promotions", b)
        so = stockout_flags(inv) if inv is not None and {"date", "sku", "depot", "closing_qty"} <= set(inv.columns) else None
        sw = fam_of = None
        if sch is not None and pm is not None and {"start_date", "end_date"} <= set(sch.columns) and "family" in pm.columns:
            sw = expand_schemes(sch)
            fam_of = pm.dropna(subset=["sku", "family"]).drop_duplicates("sku").set_index("sku")["family"].to_dict()

        for i, g in enumerate(sales_groups):
            c["message"] = f"Cleansing demand in {g['name']}"
            df = frames[g["id"]]
            df["quantity_clean"] = df["quantity"].astype(float)
            o = dec.get("cleansing:outliers")
            if o in ("flag", "cap"):
                m, thr = outlier_mask(df)
                df["is_outlier"] = m
                log["outliers_flagged" if o == "flag" else "outliers_capped"] += int(m.sum())
                if o == "cap":
                    df.loc[m, "quantity_clean"] = thr[m].round()
            if dec.get("cleansing:lost_demand") == "impute" and so is not None and "depot" in df.columns and _weekly(df["date"]):
                f, adj = lost_demand(df, so)
                df["stockout_week"] = f
                df["quantity_clean"] = np.where(f, np.maximum(df["quantity_clean"], adj), df["quantity_clean"])
                log["demand_estimated"] += int(f.sum())
            if dec.get("cleansing:promo") == "isolate" and sw is not None and _weekly(df["date"]) and "channel" in df.columns:
                on, lift, base = promo_effect(df, sw, fam_of)
                df["on_promo"] = on
                df["promo_lift"] = lift.round(3)
                df["base_quantity"] = np.where(on, df["quantity_clean"] / lift, df["quantity_clean"]).round(2)
                log["promo_weeks"] += int(on.sum())
            frames[g["id"]] = df
            c["progress"] = round(0.5 + 0.3 * (i + 1) / max(len(sales_groups), 1), 3)
            store.save(b)

        # write
        c["message"] = "Saving"
        out = store.DATASETS
        shutil.rmtree(out, ignore_errors=True)
        out.mkdir(parents=True, exist_ok=True)
        tables = []
        for i, g in enumerate(groups):
            df = frames[g["id"]]
            for col in df.columns:
                if df[col].dtype == object or str(df[col].dtype) == "string":
                    df[col] = df[col].astype("object").where(df[col].notna(), None)
            d = out / g["type"]
            d.mkdir(exist_ok=True)
            p = d / f"{g['id']}.parquet"
            df.to_parquet(p, index=False)
            dcol = "date" if "date" in df.columns else ("start_date" if "start_date" in df.columns else None)
            lo = df[dcol].min() if dcol else None
            hi = df[dcol].max() if dcol else None
            tables.append(dict(
                id=g["id"], name=g["name"], type=g["type"], type_label=DATASET_TYPES[g["type"]]["label"],
                rows=int(len(df)), columns=list(df.columns), path=str(p),
                date_from=lo.date().isoformat() if pd.notna(lo) else None,
                date_to=hi.date().isoformat() if pd.notna(hi) else None,
                weekly=bool("date" in df.columns and _weekly(df["date"])),
            ))
            c["progress"] = round(0.8 + 0.2 * (i + 1) / len(groups), 3)
            store.save(b)
        ws = dict(loaded_at=time.time(), batch_id=bid, tables=tables, fixes=log,
                  decisions={k: v for k, v in dec.items()})
        store.write_workspace(ws)
        c.update(status="done", progress=1.0, message="Done", result=ws)
    except Exception as e:  # noqa: BLE001
        c.update(status="error", message=f"Loading failed ({type(e).__name__}: {e}).")
    store.save(b)

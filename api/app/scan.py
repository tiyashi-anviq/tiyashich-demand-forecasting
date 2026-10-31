"""Read uploaded workbooks into parquet and describe every table (sheet)."""
from __future__ import annotations

import datetime as dt
import re
import threading
from pathlib import Path

import numpy as np
import pandas as pd
from python_calamine import CalamineWorkbook

from . import store
from .schema import DATASET_TYPES, classify, suggest_mapping

SKIP_SHEETS = re.compile(r"^(about|readme|read me|notes?|legend|cover|index|contents)$", re.I)
DATE_NAME = re.compile(r"date|month|week|period|start|end|day", re.I)
DATE_FORMATS = ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%d-%m-%y", "%d %b %Y", "%d %B %Y", "%b %Y", "%d-%b-%Y", "%Y/%m/%d", "%d.%m.%Y")


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _coerce(values: list) -> pd.Series:
    """Turn a column of python objects into something parquet can hold."""
    types = {type(v) for v in values if v is not None and v != ""}
    if not types:
        return pd.Series([None] * len(values), dtype="object")
    if types <= {dt.datetime, dt.date}:
        return pd.to_datetime(pd.Series([v if v != "" else None for v in values]), errors="coerce")
    if types <= {int, float, bool}:
        return pd.to_numeric(pd.Series([None if v == "" else v for v in values]), errors="coerce")
    if types <= {str}:
        return pd.Series([None if v == "" else v for v in values], dtype="object")

    def fix(v):
        if v is None or v == "":
            return None
        if isinstance(v, dt.datetime):
            return v.date().isoformat() if v.time() == dt.time(0) else v.isoformat()
        if isinstance(v, dt.date):
            return v.isoformat()
        return str(v)

    return pd.Series([fix(v) for v in values], dtype="object")


def _looks_like_dates(s: pd.Series) -> bool:
    sample = s.dropna().astype(str).head(200)
    if sample.empty:
        return False
    ok = 0
    for v in sample:
        for f in DATE_FORMATS:
            try:
                dt.datetime.strptime(v.strip(), f)
                ok += 1
                break
            except ValueError:
                continue
    return ok / len(sample) >= 0.5


def _kind(name: str, s: pd.Series) -> str:
    if s.notna().sum() == 0:
        return "empty"
    if pd.api.types.is_datetime64_any_dtype(s):
        return "date"
    if pd.api.types.is_numeric_dtype(s):
        return "number"
    if DATE_NAME.search(name) and _looks_like_dates(s):
        return "date"
    return "text"


def _sample(v) -> str:
    if isinstance(v, (pd.Timestamp, dt.datetime)):
        return v.strftime("%d %b %Y")
    if isinstance(v, float):
        return f"{v:,.2f}".rstrip("0").rstrip(".")
    return str(v)


def profile_frame(df: pd.DataFrame) -> list[dict]:
    cols = []
    for c in df.columns:
        s = df[c]
        nn = s.dropna()
        cols.append(
            dict(
                name=str(c),
                kind=_kind(str(c), s),
                nulls=int(s.isna().sum()),
                unique=int(nn.nunique()) if len(nn) < 300_000 else None,
                samples=[_sample(v) for v in nn.head(3).tolist()],
            )
        )
    return cols


def _unique_headers(raw: list) -> list[str]:
    out, seen = [], {}
    for i, h in enumerate(raw):
        name = str(h).strip() if h not in (None, "") else f"Column {i + 1}"
        if name in seen:
            seen[name] += 1
            name = f"{name} ({seen[name]})"
        else:
            seen[name] = 1
        out.append(name)
    return out


def frame_from_rows(rows: list[list]) -> pd.DataFrame | None:
    if not rows or len(rows) < 2:
        return None
    header = _unique_headers(rows[0])
    body = rows[1:]
    width = len(header)
    cols = {}
    for i, h in enumerate(header):
        cols[h] = _coerce([r[i] if i < len(r) else None for r in body])
    df = pd.DataFrame(cols)
    # drop columns that are completely empty and unnamed, then fully empty rows
    df = df.loc[:, ~(df.isna().all() & df.columns.str.startswith("Column "))]
    df = df.dropna(how="all").reset_index(drop=True)
    return df if len(df.columns) >= 2 else None


# ----------------------------------------------------------------------------------------
def start_scan(bid: str, fid: str, path: Path) -> None:
    t = threading.Thread(target=_scan_file, args=(bid, fid, path), daemon=True)
    t.start()


_SEM = threading.Semaphore(2)


def _scan_file(bid: str, fid: str, path: Path) -> None:
    with _SEM:
        _scan_file_inner(bid, fid, path)


def _scan_file_inner(bid: str, fid: str, path: Path) -> None:
    b = store.load(bid)
    f = b["files"][fid]
    try:
        f["status"] = "reading"
        store.save(b)
        outdir = store.batch_dir(bid) / "raw"
        outdir.mkdir(exist_ok=True)
        notes = 0
        if path.suffix.lower() == ".csv":
            df = pd.read_csv(path)
            _register(b, f, store.new_id(), path.stem, df, outdir)
            f["progress"] = 1.0
        else:
            wb = CalamineWorkbook.from_path(str(path))
            names = wb.sheet_names
            total = max(len(names), 1)
            for i, name in enumerate(names):
                if SKIP_SHEETS.match(name.strip()):
                    notes += 1
                else:
                    rows = wb.get_sheet_by_name(name).to_python(skip_empty_area=False)
                    df = frame_from_rows(rows)
                    del rows
                    if df is None:
                        notes += 1
                    else:
                        _register(b, f, store.new_id(), name, df, outdir)
                        del df
                f["progress"] = round((i + 1) / total, 3)
                f["sheets_done"] = i + 1
                f["sheets_total"] = total
                store.save(b)
        f["notes"] = notes
        f["status"] = "done"
        f["error"] = None
    except Exception as e:  # noqa: BLE001
        f["status"] = "error"
        f["error"] = f"We could not read this file ({type(e).__name__}). Check it opens in Excel and try again."
    finally:
        store.save(b)
        rebuild_groups(bid)


def _register(b: dict, f: dict, sid: str, name: str, df: pd.DataFrame, outdir: Path) -> None:
    pq = outdir / f"{sid}.parquet"
    df.to_parquet(pq, index=False)
    b["sheets"][sid] = dict(
        id=sid, file_id=f["id"], name=name, rows=int(len(df)), columns=profile_frame(df), parquet=str(pq)
    )
    f.setdefault("sheets", []).append(sid)


# ----------------------------------------------------------------------------------------
_STEM = re.compile(r"([_\s-]*(fy)?[_\s-]*\d{4}([_-]\d{2,4})?|[_\s-]m\d)$", re.I)


def stem_of(name: str) -> str:
    return _STEM.sub("", name).strip("_ -") or name


def pretty(stem: str) -> str:
    s = stem.replace("_", " ").strip()
    return s[:1].upper() + s[1:]


def rebuild_groups(bid: str) -> None:
    """Group sheets that are the same table split by year, and suggest a type + mapping."""
    with store.LOCK:
        b = store.load(bid)
        old = {g["id"]: g for g in b["groups"]}
        buckets: dict[tuple, list[str]] = {}
        for sid, s in b["sheets"].items():
            key = (stem_of(s["name"]).lower(), tuple(c["name"] for c in s["columns"]))
            buckets.setdefault(key, []).append(sid)
        groups = []
        for (stem, cols), sids in buckets.items():
            sids.sort(key=lambda x: b["sheets"][x]["name"])
            gid = slug(stem) + "-" + slug("|".join(cols))[:6]
            first = b["sheets"][sids[0]]
            columns = first["columns"]
            if gid in old and old[gid]["sheet_ids"] == sids:
                groups.append(old[gid])
                continue
            tkey, score, mapping = classify(stem, columns)
            groups.append(
                dict(
                    id=gid,
                    name=pretty(stem_of(first["name"])),
                    sheet_ids=sids,
                    sheet_names=[b["sheets"][x]["name"] for x in sids],
                    rows=sum(b["sheets"][x]["rows"] for x in sids),
                    columns=columns,
                    type=tkey,
                    confidence=round(score, 2),
                    mapping={k: v["column"] for k, v in mapping.items()},
                    match_conf={k: v["confidence"] for k, v in mapping.items()},
                    include=tkey != "reference",
                    user_edited=False,
                    source_file=b["files"][first["file_id"]]["name"],
                )
            )
        # stable order: core first, then by name
        order = {k: i for i, k in enumerate(DATASET_TYPES)}
        groups.sort(key=lambda g: (order.get(g["type"], 99), g["name"]))
        b["groups"] = groups
        b["quality"] = None
        b["confirm"] = None
        store.save(b)


def remap_group(g: dict, new_type: str) -> None:
    m = suggest_mapping(new_type, g["columns"]) if new_type in DATASET_TYPES else {}
    g["type"] = new_type
    g["mapping"] = {k: v["column"] for k, v in m.items()}
    g["match_conf"] = {k: v["confidence"] for k, v in m.items()}
    g["include"] = new_type != "reference"


def group_status(g: dict) -> dict:
    """What is still missing for this table to be usable."""
    t = DATASET_TYPES.get(g["type"])
    if not t:
        return dict(ok=True, missing=[])
    miss = [f["label"] for f in t["fields"] if f["required"] and not g["mapping"].get(f["key"])]
    return dict(ok=not miss, missing=miss)


def date_range(b: dict, g: dict) -> tuple[str | None, str | None]:
    col = g["mapping"].get("date") or g["mapping"].get("start_date")
    if not col:
        return None, None
    lo = hi = None
    for sid in g["sheet_ids"]:
        s = pd.read_parquet(b["sheets"][sid]["parquet"], columns=[col])[col]
        s = parse_dates(s).dropna()
        if len(s):
            lo = s.min() if lo is None else min(lo, s.min())
            hi = s.max() if hi is None else max(hi, s.max())
    return (lo.date().isoformat() if lo is not None else None, hi.date().isoformat() if hi is not None else None)


def parse_dates(s: pd.Series) -> pd.Series:
    """Parse dates that may be real dates or text in several day-first formats."""
    if pd.api.types.is_datetime64_any_dtype(s):
        return s
    out = pd.Series(pd.NaT, index=s.index, dtype="datetime64[ns]")
    txt = s.astype("string").str.strip()
    for f in DATE_FORMATS:
        todo = out.isna() & txt.notna()
        if not todo.any():
            break
        out[todo] = pd.to_datetime(txt[todo], format=f, errors="coerce")
    return out

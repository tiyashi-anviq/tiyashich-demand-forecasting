"""SQLite store for every graph. Each chart payload is saved once per view, filter set and data version, then read back from SQLite."""
from __future__ import annotations

import hashlib
import json
import math
import sqlite3
import threading
from typing import Callable

from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response

from . import store

DB = store.ROOT / "graphs.sqlite"
_LOCK = threading.RLock()


def _con() -> sqlite3.Connection:
    c = sqlite3.connect(DB, timeout=30)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute(
        "CREATE TABLE IF NOT EXISTS graph_payloads (area TEXT, view TEXT, params TEXT, version TEXT, built_at REAL DEFAULT (strftime('%s','now')), payload TEXT, "
        "PRIMARY KEY (area, view, params))"
    )
    return c


def _nan_free(o):
    if hasattr(o, "tolist"):
        o = o.tolist()
    if isinstance(o, float) and not math.isfinite(o):
        return None
    if isinstance(o, dict):
        return {k: _nan_free(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_nan_free(v) for v in o]
    return o


def version(*parts) -> str:
    """Version of the data a graph was drawn from. A different value means every saved graph is stale."""
    return hashlib.md5("|".join(map(str, parts)).encode()).hexdigest()[:12]


def serve(area: str, view: str, params: dict, ver: str, compute: Callable[[], object]) -> Response:
    """Return the saved graph payload from SQLite, or compute it, save it and return it."""
    key = json.dumps(params, sort_keys=True, default=str)
    with _LOCK:
        con = _con()
        try:
            row = con.execute("SELECT payload FROM graph_payloads WHERE area=? AND view=? AND params=? AND version=?", (area, view, key, ver)).fetchone()
            if row:
                return Response(row[0], media_type="application/json")
            result = compute()
            text = json.dumps(_nan_free(jsonable_encoder(_nan_free(result))), allow_nan=False)
            # Don't cache building or error states - they should be recomputed
            result_state = result.get("state") if isinstance(result, dict) else None
            should_cache = result_state not in ("building", "error")
            if should_cache:
                con.execute("DELETE FROM graph_payloads WHERE area=? AND view=? AND version<>?", (area, view, ver))
                con.execute("INSERT OR REPLACE INTO graph_payloads (area, view, params, version, payload) VALUES (?,?,?,?,?)", (area, view, key, ver, text))
                con.commit()
            return Response(text, media_type="application/json")
        finally:
            con.close()

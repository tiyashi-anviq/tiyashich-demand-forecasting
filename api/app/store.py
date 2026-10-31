"""Tiny file-backed state. One JSON file per upload batch, parquet for the data."""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path

ROOT = Path(os.environ.get("EVEREADY_STORAGE", Path(__file__).resolve().parents[1] / "storage"))
BATCHES = ROOT / "batches"
DATASETS = ROOT / "datasets"
for p in (BATCHES, DATASETS):
    p.mkdir(parents=True, exist_ok=True)

LOCK = threading.RLock()
_CACHE: dict[str, dict] = {}


def new_id() -> str:
    return uuid.uuid4().hex[:10]


def batch_dir(bid: str) -> Path:
    d = BATCHES / bid
    d.mkdir(parents=True, exist_ok=True)
    return d


def create_batch() -> dict:
    bid = new_id()
    b = dict(id=bid, created=time.time(), files={}, sheets={}, groups=[], quality=None, confirm=None)
    with LOCK:
        _CACHE[bid] = b
        save(b)
    return b


def save(b: dict) -> None:
    with LOCK:
        tmp = batch_dir(b["id"]) / "state.json.tmp"
        tmp.write_text(json.dumps(b, default=str))
        tmp.replace(batch_dir(b["id"]) / "state.json")


def load(bid: str) -> dict | None:
    with LOCK:
        if bid in _CACHE:
            return _CACHE[bid]
        f = BATCHES / bid / "state.json"
        if not f.exists():
            return None
        b = json.loads(f.read_text())
        # A restart kills background threads: anything half-done is marked as interrupted.
        for fi in b["files"].values():
            if fi["status"] in ("uploading", "queued", "reading"):
                fi["status"] = "error"
                fi["error"] = "Interrupted by a restart. Please upload this file again."
        for key in ("quality", "confirm"):
            if b.get(key) and b[key].get("status") == "running":
                b[key] = None
        _CACHE[bid] = b
        return b


def latest_batch_id() -> str | None:
    with LOCK:
        cands = [p for p in BATCHES.iterdir() if (p / "state.json").exists()]
    if not cands:
        return None
    cands.sort(key=lambda p: (p / "state.json").stat().st_mtime, reverse=True)
    return cands[0].name


WORKSPACE_FILE = ROOT / "workspace.json"


def read_workspace() -> dict | None:
    if WORKSPACE_FILE.exists():
        return json.loads(WORKSPACE_FILE.read_text())
    return None


def write_workspace(ws: dict | None) -> None:
    if ws is None:
        WORKSPACE_FILE.unlink(missing_ok=True)
    else:
        WORKSPACE_FILE.write_text(json.dumps(ws, default=str))

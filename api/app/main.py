from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import quality, scan, store
from .challenge import core as challenge_core
from .challenge.router import router as challenge_router
from .datasources import router as datasources_router
from .eda.router import router as eda_router
from .forecast.router import router as forecast_router
from .ported.router import (
    inv_router,
    npd_router,
    qc_router,
    router as ported_router,
    sup_router,
)
from .schema import DATASET_TYPES, public_schema

app = FastAPI(title="Eveready Demand Planning API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(eda_router)
app.include_router(forecast_router)
app.include_router(challenge_router)
app.include_router(ported_router)
app.include_router(qc_router)
app.include_router(npd_router)
app.include_router(datasources_router)
app.include_router(sup_router)
app.include_router(inv_router)

ALLOWED = {".xlsx", ".xlsm", ".xls", ".csv"}
MAX_BYTES = 600 * 1024 * 1024  # 600 MB

DEMO_WORKBOOKS = {
    "01_Sales_History": "01_Sales_History.xlsx",
    "02_Inventory_and_Service": "02_Inventory_and_Service.xlsx",
    "03_Forecast_Versions": "03_Forecast_Versions.xlsx",
    "04_Masters_Market_Weather_Events": "04_Masters_Market_Weather_Events.xlsx",
    "05_Supply_Procurement_RawMaterial": "05_Supply_Procurement_RawMaterial.xlsx",
}

SOURCES = [
    dict(
        id="sap",
        group="Internal systems",
        name="SAP S/4HANA",
        what="Orders, invoices, purchase orders",
        mode="demo",
    ),
    dict(
        id="oracle",
        group="Internal systems",
        name="Oracle ERP",
        what="Orders, invoices, purchase orders",
        mode="demo",
    ),
    dict(
        id="salesforce",
        group="Internal systems",
        name="Salesforce",
        what="Accounts, schemes, opportunities",
        mode="demo",
    ),
    dict(
        id="wms",
        group="Internal systems",
        name="Warehouse system (WMS)",
        what="Depot stock and movements",
        mode="demo",
    ),
    dict(
        id="pos",
        group="Internal systems",
        name="POS and partner feeds",
        what="Sell-through from retailers and quick commerce",
        mode="demo",
    ),
    dict(
        id="weather",
        group="External signals",
        name="Weather",
        what="Rainfall, temperature, monsoon onset",
        mode="file",
    ),
    dict(
        id="market",
        group="External signals",
        name="Market audit",
        what="Competitor share and pricing",
        mode="file",
    ),
    dict(
        id="macro",
        group="External signals",
        name="Commodities and macro",
        what="Metal prices, exchange rate, freight",
        mode="file",
    ),
]


# ---------------------------------------------------------------------------- helpers
def get_batch(bid: str) -> dict:
    b = store.load(bid)
    if not b:
        raise HTTPException(404, "That upload no longer exists. Start a new one.")
    return b


def view_files(b: dict) -> list[dict]:
    out = []
    for f in b["files"].values():
        sheets = [b["sheets"][s] for s in f.get("sheets", []) if s in b["sheets"]]
        out.append(
            dict(
                id=f["id"],
                name=f["name"],
                size=f["size"],
                status=f["status"],
                progress=f.get("progress", 0),
                error=f.get("error"),
                sheets=len(sheets),
                rows=sum(s["rows"] for s in sheets),
                sheets_done=f.get("sheets_done"),
                sheets_total=f.get("sheets_total"),
            )
        )
    return out


def view_groups(b: dict) -> list[dict]:
    res = []
    for g in b["groups"]:
        st = scan.group_status(g)
        res.append(
            dict(
                id=g["id"],
                name=g["name"],
                type=g["type"],
                confidence=g["confidence"],
                include=g["include"],
                rows=g["rows"],
                sheet_names=g["sheet_names"],
                source_file=g["source_file"],
                columns=g["columns"],
                mapping=g["mapping"],
                match_conf=g["match_conf"],
                ok=st["ok"],
                missing=st["missing"],
                user_edited=g["user_edited"],
            )
        )
    return res


def readiness(b: dict) -> dict:
    inc = [g for g in b["groups"] if g["include"] and g["type"] != "reference"]
    problems = []
    if not any(g["type"] == "sales" for g in inc):
        problems.append("Add at least one sales history table.")
    for g in inc:
        st = scan.group_status(g)
        if not st["ok"]:
            problems.append(
                f"{g['name']}: choose a column for {', '.join(st['missing'])}."
            )
    busy = any(
        f["status"] in ("uploading", "queued", "reading")
        for f in b["files"].values()
    )
    if busy:
        problems.insert(0, "Files are still being read.")
    if not b["files"]:
        problems = ["Add your files first."]
    return dict(ready=not problems, problems=problems, included=len(inc))


# ----------------------------------------------------------------------------- routes
@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/schema")
def schema():
    return {"types": public_schema(), "sources": SOURCES}


@app.get("/api/workspace")
def workspace():
    ws = store.read_workspace()
    if not ws:
        return {"loaded": False}
    return {"loaded": True, **{k: v for k, v in ws.items() if k != "decisions"}}


@app.delete("/api/workspace")
def reset_workspace():
    store.write_workspace(None)
    challenge_core.reset()
    shutil.rmtree(store.DATASETS, ignore_errors=True)
    store.DATASETS.mkdir(parents=True, exist_ok=True)
    return {"loaded": False}


@app.post("/api/batches")
def create_batch():
    b = store.create_batch()
    return {"id": b["id"]}


@app.get("/api/batches/latest")
def latest():
    bid = store.latest_batch_id()
    return {"id": bid}


@app.get("/api/batches/{bid}")
def batch(bid: str):
    b = get_batch(bid)
    return dict(
        id=b["id"], files=view_files(b), groups=view_groups(b), **readiness(b)
    )


@app.post("/api/batches/{bid}/files")
async def upload(bid: str, files: list[UploadFile] = File(...)):
    b = get_batch(bid)
    added = []
    for uf in files:
        ext = Path(uf.filename or "").suffix.lower()
        if ext not in ALLOWED:
            raise HTTPException(
                400, f"'{uf.filename}' is not an Excel or CSV file."
            )
        fid = store.new_id()
        updir = store.batch_dir(bid) / "uploads"
        updir.mkdir(exist_ok=True)
        dest = updir / f"{fid}{ext}"
        size = 0
        with dest.open("wb") as out:
            while chunk := await uf.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(
                        413, f"'{uf.filename}' is larger than 600 MB."
                    )
                out.write(chunk)
        b["files"][fid] = dict(
            id=fid,
            name=uf.filename,
            size=size,
            status="queued",
            progress=0.0,
            error=None,
            sheets=[],
        )
        store.save(b)
        scan.start_scan(bid, fid, dest)
        added.append(fid)
    return {"added": added}


@app.post("/api/batches/{bid}/demo-files/{file_key}")
def upload_demo_file(bid: str, file_key: str):
    b = get_batch(bid)
    filename = DEMO_WORKBOOKS.get(file_key)
    if not filename:
        raise HTTPException(404, "Demo workbook not found.")

    source = Path(__file__).resolve().parents[2] / "er-data" / filename
    if not source.is_file():
        raise HTTPException(404, f"Demo workbook '{filename}' is not available.")

    existing = next(
        (f for f in b["files"].values() if f["name"] == filename),
        None,
    )
    if existing:
        return {"added": [existing["id"]]}

    size = source.stat().st_size
    if size > MAX_BYTES:
        raise HTTPException(413, f"'{filename}' is larger than 600 MB.")

    fid = store.new_id()
    dest = store.batch_dir(bid) / "uploads" / f"{fid}{source.suffix.lower()}"
    dest.parent.mkdir(exist_ok=True)
    shutil.copyfile(source, dest)
    b["files"][fid] = dict(
        id=fid,
        name=filename,
        size=size,
        status="queued",
        progress=0.0,
        error=None,
        sheets=[],
    )
    store.save(b)
    scan.start_scan(bid, fid, dest)
    return {"added": [fid]}


@app.delete("/api/batches/{bid}/files/{fid}")
def remove_file(bid: str, fid: str):
    b = get_batch(bid)
    f = b["files"].pop(fid, None)
    if not f:
        raise HTTPException(404, "File not found.")
    for sid in f.get("sheets", []):
        s = b["sheets"].pop(sid, None)
        if s:
            Path(s["parquet"]).unlink(missing_ok=True)
    store.save(b)
    scan.rebuild_groups(bid)
    return {"ok": True}


class GroupEdit(BaseModel):
    type: str | None = None
    mapping: dict[str, str | None] | None = None
    include: bool | None = None


@app.put("/api/batches/{bid}/groups/{gid}")
def edit_group(bid: str, gid: str, body: GroupEdit):
    b = get_batch(bid)
    g = next((x for x in b["groups"] if x["id"] == gid), None)
    if not g:
        raise HTTPException(404, "Table not found.")
    with store.LOCK:
        if body.type is not None:
            if body.type not in DATASET_TYPES:
                raise HTTPException(400, "Unknown data type.")
            if body.type != g["type"]:
                scan.remap_group(g, body.type)
        if body.mapping is not None:
            valid = {c["name"] for c in g["columns"]}
            fields = {f["key"] for f in DATASET_TYPES[g["type"]]["fields"]}
            used = [c for c in body.mapping.values() if c]
            if len(used) != len(set(used)):
                raise HTTPException(400, "Each column can only be used once.")
            for fk, col in body.mapping.items():
                if fk not in fields or (col and col not in valid):
                    raise HTTPException(400, "Unknown field or column.")
                g["mapping"][fk] = col
                g["match_conf"][fk] = 1.0 if col else 0.0
        if body.include is not None:
            g["include"] = body.include
        g["user_edited"] = True
        b["quality"] = None
        b["confirm"] = None
        store.save(b)
    return dict(
        group=next(x for x in view_groups(b) if x["id"] == gid), **readiness(b)
    )


@app.get("/api/batches/{bid}/groups/{gid}/preview")
def preview(bid: str, gid: str, rows: int = 5):
    import pandas as pd

    b = get_batch(bid)
    g = next((x for x in b["groups"] if x["id"] == gid), None)
    if not g:
        raise HTTPException(404, "Table not found.")
    s = b["sheets"][g["sheet_ids"][0]]
    df = pd.read_parquet(s["parquet"]).head(rows)
    out = []
    for r in df.to_dict("records"):
        out.append(
            {
                k: (
                    v.strftime("%d %b %Y")
                    if hasattr(v, "strftime")
                    else (None if v is None or v != v else v)
                )
                for k, v in r.items()
            }
        )
    return {"columns": list(df.columns), "rows": out}


@app.post("/api/batches/{bid}/quality")
def run_quality(bid: str):
    b = get_batch(bid)
    r = readiness(b)
    if not r["ready"]:
        raise HTTPException(400, " ".join(r["problems"]))
    quality.start_analysis(bid)
    return {"started": True}


@app.get("/api/batches/{bid}/quality")
def get_quality(bid: str):
    b = get_batch(bid)
    return b.get("quality") or {"status": "idle"}


class ConfirmBody(BaseModel):
    decisions: dict[str, str] = {}


@app.post("/api/batches/{bid}/confirm")
def confirm(bid: str, body: ConfirmBody):
    b = get_batch(bid)
    q = b.get("quality")
    if not q or q.get("status") != "done":
        raise HTTPException(400, "Run the data check first.")
    quality.start_apply(bid, body.decisions)
    return {"started": True}


@app.get("/api/batches/{bid}/confirm")
def get_confirm(bid: str):
    b = get_batch(bid)
    return b.get("confirm") or {"status": "idle"}
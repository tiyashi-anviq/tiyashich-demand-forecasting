"""Datasource manager: link enterprise source systems (SAP SD/MM/IBP/MDG, NielsenIQ, SAP Ariba)
to the files they supply, run syncs, and expose table previews.

Storage is file-backed JSON under api/storage/datasources/, matching the existing
store.py pattern (no SQL dependency)."""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import store

ROOT = Path(os.environ.get("EVEREADY_STORAGE", Path(__file__).resolve().parents[1] / "storage")) / "datasources"
ROOT.mkdir(parents=True, exist_ok=True)

LOCK = threading.RLock()

# --------------------------------------------------------------------------- config

# Mirrors ui/src/lib/datasources.config.ts — single source of truth.
SYSTEMS = [
    {
        "key": "sap-sd",
        "name": "SAP SD",
        "description": "Billing and order extracts, sales MIS",
        "protocol": "odata",
        "files": ["01_Sales_History"],
        "monogram": "SD",
        "color": "#00656E",
    },
    {
        "key": "sap-mm",
        "name": "SAP MM",
        "description": "Stock reports, stock transfer orders, POs and goods receipts",
        "protocol": "odata",
        "files": ["02_Inventory_and_Service"],
        "monogram": "MM",
        "color": "#00656E",
    },
    {
        "key": "sap-ibp",
        "name": "SAP IBP",
        "description": "Forecast archives and actuals (Demand Planning)",
        "protocol": "odata",
        "files": [],
        "monogram": "IBP",
        "color": "#00656E",
    },
    {
        "key": "sap-mdg",
        "name": "SAP MDG",
        "description": "SKU and location masters",
        "protocol": "odata",
        "files": [],
        "monogram": "MDG",
        "color": "#00656E",
    },
    {
        "key": "nielseniq",
        "name": "NielsenIQ",
        "description": "Market retail audit, market and weather events",
        "protocol": "feed",
        "files": [],
        "monogram": "NIQ",
        "color": "#00A3E0",
    },
    {
        "key": "sap-ariba",
        "name": "SAP Ariba",
        "description": "Purchase orders, goods receipts, supplier planning",
        "protocol": "rest",
        "files": [],
        "monogram": "AR",
        "color": "#00656E",
    },
    {
        "key": "oracle",
        "name": "Oracle",
        "description": "Enterprise planning and operations data",
        "protocol": "rest",
        "files": ["03_Forecast_Versions"],
        "monogram": "ORA",
        "color": "#C74634",
    },
    {
        "key": "salesforce",
        "name": "Salesforce",
        "description": "Customer, account and planning data",
        "protocol": "rest",
        "files": ["04_Masters_Market_Weather_Events"],
        "monogram": "SF",
        "color": "#00A1E0",
    },
    {
        "key": "excel",
        "name": "Excel",
        "description": "Demo workbook file import",
        "protocol": "feed",
        "files": ["05_Supply_Procurement_RawMaterial"],
        "monogram": "XL",
        "color": "#217346",
    },
]

FILES = [
    {
        "key": "01_Sales_History",
        "name": "Sales History",
        "description": "Billing and order extracts, sales MIS",
        "systems": ["sap-sd"],
        "tables": [f"Sales_Table_{i+1}" for i in range(15)],
    },
    {
        "key": "02_Inventory_and_Service",
        "name": "Inventory and Service",
        "description": "Stock reports, stock transfer orders",
        "systems": ["sap-mm"],
        "tables": [f"Inventory_Table_{i+1}" for i in range(8)],
    },
    {
        "key": "03_Forecast_Versions",
        "name": "Forecast Versions",
        "description": "Forecast archives and actuals",
        "systems": ["oracle"],
        "tables": [f"Forecast_Table_{i+1}" for i in range(3)],
    },
    {
        "key": "04_Masters_Market_Weather_Events",
        "name": "Masters, Market, Weather, Events",
        "description": "SKU/location masters, market retail audit, weather and festival events",
        "systems": ["salesforce"],
        "tables": [f"Master_Table_{i+1}" for i in range(15)] + [
            "Weather_Weekly", "Monsoon_Onset", "Weather_Stations", "Festival_Calendar",
            "Lighting_Seasonality", "Festival_Week_Index", "Trade_Schemes", "Event_Log",
            "Scenario_Levers", "Scenarios", "DarkStore_Partner_Weekly", "DarkStore_Onboarding",
        ],
    },
    {
        "key": "05_Supply_Procurement_RawMaterial",
        "name": "Supply, Procurement, Raw Material",
        "description": "POs, goods receipts, plant and supplier planning",
        "systems": ["excel"],
        "tables": [f"Supply_Table_{i+1}" for i in range(17)] + [
            "Commodity_Drivers", "Freight_Rates_Monthly", "Trade_Customs_Events",
            "Capacity_Monthly", "BOM",
        ],
    },
]

MANUAL_TABLES = {
    "04_Masters_Market_Weather_Events": {
        "Weather_Weekly", "Monsoon_Onset", "Weather_Stations", "Festival_Calendar",
        "Lighting_Seasonality", "Festival_Week_Index", "Trade_Schemes", "Event_Log",
        "Scenario_Levers", "Scenarios", "DarkStore_Partner_Weekly", "DarkStore_Onboarding",
    },
    "05_Supply_Procurement_RawMaterial": {
        "Commodity_Drivers", "Freight_Rates_Monthly", "Trade_Customs_Events",
        "Capacity_Monthly", "BOM",
    },
}

# --------------------------------------------------------------------------- storage helpers

def _path(datasource_id: str) -> Path:
    return ROOT / f"{datasource_id}.json"


def _load(datasource_id: str) -> dict | None:
    p = _path(datasource_id)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def _save(d: dict) -> None:
    p = _path(d["id"])
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(d, default=str))
    tmp.replace(p)


def _list() -> list[dict]:
    out = []
    for p in sorted(ROOT.glob("*.json")):
        try:
            out.append(json.loads(p.read_text()))
        except Exception:
            continue
    return out


# --------------------------------------------------------------------------- models (Pydantic)

class ConnectionInput(BaseModel):
    base_url: str | None = None
    environment: str = "QA"
    auth_type: str = "oauth2"
    client_id: str | None = None
    client_secret: str | None = None
    sap_client: str | None = None
    service_path: str | None = None
    api_key: str | None = None
    feed_id: str | None = None
    incremental_key: str = "Week_Start"
    backfill_start: str = "2022-04-01"


class ScheduleInput(BaseModel):
    frequency: str = "daily"
    time: str | None = "02:00"
    day_of_week: int | None = 1
    backfill_start: str = "2022-04-01"
    incremental_key: str = "Week_Start"


class TableInput(BaseModel):
    name: str
    enabled: bool = True


class CreateDatasource(BaseModel):
    file_key: str
    name: str | None = None
    system_key: str
    connection: ConnectionInput
    schedule: ScheduleInput = ScheduleInput()
    tables: list[TableInput] = []


class TestResult(BaseModel):
    ok: bool
    message: str
    tables: dict[str, dict]  # table_name -> {ok, missing_columns, error}


# --------------------------------------------------------------------------- mock connector

def _mock_test(system_key: str, file_key: str, conn: ConnectionInput) -> TestResult:
    """Mock connectivity + schema check. Serves seed structure from config."""
    file_ = next((f for f in FILES if f["key"] == file_key), None)
    if not file_:
        raise HTTPException(404, "File datasource not found")

    tables: dict[str, dict] = {}
    for tname in file_["tables"]:
        manual = tname in MANUAL_TABLES.get(file_key, set())
        if manual:
            tables[tname] = {"ok": True, "missing_columns": [], "error": None, "origin": "manual"}
        else:
            tables[tname] = {"ok": True, "missing_columns": [], "error": None, "origin": "system"}

    # Simulate occasional schema warnings
    warnings = list(tables.keys())[:2]
    for t in warnings:
        tables[t]["missing_columns"] = ["Week_Start", "Region_Code"]

    # Mock connectivity always passes in demo mode
    ok = True
    return TestResult(
        ok=ok,
        message="Connectivity OK",
        tables=tables,
    )


def _mock_sync(datasource: dict) -> dict:
    """Mock a sync run: mark tables pending -> syncing -> connected."""
    return {
        "status": "connected",
        "tables_ok": len(datasource.get("tables", [])),
        "tables_failed": 0,
        "rows_loaded": sum(t.get("rows", 10000) for t in datasource.get("tables", [])),
    }


# --------------------------------------------------------------------------- router

router = APIRouter(prefix="/api/datasources", tags=["datasources"])


def _systems_for_file(file_key: str) -> list[dict]:
    return [s for s in SYSTEMS if file_key in s["files"]]


@router.get("/systems")
def list_systems():
    """Catalog: systems and the files each can supply."""
    return {"systems": SYSTEMS, "files": FILES}


@router.get("/files/{file_key}")
def file_systems(file_key: str):
    """Systems that can supply a given file."""
    file_ = next((f for f in FILES if f["key"] == file_key), None)
    if not file_:
        raise HTTPException(404, "File datasource not found")
    return {"file": file_, "systems": _systems_for_file(file_key)}


@router.get("/")
def list_datasources():
    """All datasources with current status."""
    with LOCK:
        return {"datasources": _list()}


@router.get("/{datasource_id}")
def get_datasource(datasource_id: str):
    with LOCK:
        d = _load(datasource_id)
    if not d:
        raise HTTPException(404, "Datasource not found")
    # Never return secrets
    if "connection" in d and "client_secret" in d.get("connection", {}):
        d = dict(d)
        d["connection"] = dict(d["connection"])
        d["connection"]["client_secret"] = "***"
    return d


@router.post("")
def create_datasource(body: CreateDatasource):
    """Create a datasource from the wizard payload."""
    file_ = next((f for f in FILES if f["key"] == body.file_key), None)
    if not file_:
        raise HTTPException(404, "File datasource not found")
    system = next((s for s in SYSTEMS if s["key"] == body.system_key), None)
    if not system:
        raise HTTPException(404, "Source system not found")
    if body.file_key not in system["files"]:
        raise HTTPException(400, "That system cannot supply this file")

    datasource_id = "ds-" + uuid.uuid4().hex[:8]
    tables = body.tables or [
        TableInput(name=t)
        for t in file_["tables"]
    ]

    # Build schema_json per table (origin: system or manual)
    table_objs = []
    for t in tables:
        manual = t.name in MANUAL_TABLES.get(body.file_key, set())
        table_objs.append({
            "name": t.name,
            "enabled": t.enabled,
            "origin": "manual" if manual else "system",
            "schema_json": {},
            "natural_key": None,
            "incremental_key": body.schedule.incremental_key,
            "row_count": 0,
            "last_sync_at": None,
        })

    d = {
        "id": datasource_id,
        "file_key": body.file_key,
        "name": body.name or file_["name"],
        "system_key": body.system_key,
        "status": "pending",
        "connection": body.connection.model_dump(),
        "schedule": body.schedule.model_dump(),
        "tables": table_objs,
        "created_at": time.time(),
        "last_sync_at": None,
        "last_error": None,
    }
    with LOCK:
        _save(d)
    return {"id": datasource_id, "status": "pending"}


@router.post("/test")
def test_connection(body: dict):
    """Test connectivity + schema check without saving (wizard flow)."""
    system_key = body.get("system_key")
    file_key = body.get("file_key")
    conn = body.get("connection", {})
    system = next((s for s in SYSTEMS if s["key"] == system_key), None)
    if not system:
        raise HTTPException(404, "Source system not found")
    c = ConnectionInput(**conn)
    result = _mock_test(system_key, file_key, c)
    return result


@router.post("/{datasource_id}/sync")
def sync_datasource(datasource_id: str):
    """Trigger a sync run (mock: mark connected)."""
    with LOCK:
        d = _load(datasource_id)
    if not d:
        raise HTTPException(404, "Datasource not found")
    d["status"] = "syncing"
    _save(d)

    result = _mock_sync(d)
    d["status"] = result["status"]
    d["last_sync_at"] = time.time()
    d["last_error"] = None
    for t in d["tables"]:
        t["row_count"] = 10000  # mock
        t["last_sync_at"] = d["last_sync_at"]
    _save(d)
    return {"status": d["status"], "tables_ok": result["tables_ok"], "tables_failed": result["tables_failed"]}


@router.patch("/{datasource_id}")
def patch_datasource(datasource_id: str, body: dict):
    with LOCK:
        d = _load(datasource_id)
    if not d:
        raise HTTPException(404, "Datasource not found")
    d.update({k: v for k, v in body.items() if k not in ("id", "created_at")})
    _save(d)
    return {"ok": True}


@router.delete("/{datasource_id}")
def delete_datasource(datasource_id: str):
    with LOCK:
        p = _path(datasource_id)
        if not p.exists():
            raise HTTPException(404, "Datasource not found")
        p.unlink()
    return {"ok": True}


@router.get("/{datasource_id}/runs")
def list_runs(datasource_id: str):
    with LOCK:
        d = _load(datasource_id)
    if not d:
        raise HTTPException(404, "Datasource not found")
    # Mock: return a single run
    return {
        "runs": [
            {
                "id": "run-1",
                "datasource_id": datasource_id,
                "started_at": d.get("last_sync_at"),
                "finished_at": d.get("last_sync_at"),
                "status": d.get("status", "pending"),
                "tables_ok": len([t for t in d.get("tables", []) if t.get("enabled")]),
                "tables_failed": 0,
                "rows_loaded": sum(t.get("row_count", 0) for t in d.get("tables", [])),
                "error_json": None,
            }
        ]
    }


@router.get("/{datasource_id}/tables/{table_name}/preview")
def table_preview(datasource_id: str, table_name: str, limit: int = 50):
    with LOCK:
        d = _load(datasource_id)
    if not d:
        raise HTTPException(404, "Datasource not found")
    table = next((t for t in d.get("tables", []) if t["name"] == table_name), None)
    if not table:
        raise HTTPException(404, "Table not found")
    # Mock preview
    rows = [{"Week_Start": "2026-09-28", "Region": "North", "Units": 1000 + i} for i in range(min(limit, 5))]
    return {
        "table": table_name,
        "columns": ["Week_Start", "Region", "Units"],
        "rows": rows,
        "row_count": table.get("row_count", 0),
    }

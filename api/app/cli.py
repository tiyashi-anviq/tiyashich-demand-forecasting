"""Run the whole data pipeline without the UI.

    uv run python -m app.cli ../er-data

Reads every workbook in the folder, matches the columns, runs the checks with the recommended
choices, applies the cleaning and writes the result to storage/datasets. It uses exactly the same
code as the screens, so the two always agree.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from . import quality, scan, store


def run(paths: list[Path], include_readme: bool = True) -> dict:
    files = []
    for p in paths:
        files += sorted(x for x in p.glob("*") if x.suffix.lower() in {".xlsx", ".xlsm", ".xls", ".csv"} and not x.name.startswith("~")) if p.is_dir() else [p]
    if not include_readme:
        files = [f for f in files if not f.name.startswith("00_")]
    if not files:
        raise SystemExit("No Excel or CSV files found.")
    t0 = time.time()
    b = store.create_batch()
    bid = b["id"]
    for f in files:
        fid = store.new_id()
        b["files"][fid] = dict(id=fid, name=f.name, size=f.stat().st_size, status="queued", progress=0.0, error=None, sheets=[])
        store.save(b)
        scan._scan_file_inner(bid, fid, f)
        fi = b["files"][fid]
        print(f"  read   {f.name:42s} {fi['status']:6s} {len(fi.get('sheets', [])):>3d} sheets", flush=True)
    t1 = time.time()
    b = store.load(bid)
    inc = [g for g in b["groups"] if g["include"] and g["type"] != "reference"]
    print(f"  matched {len(inc)} tables ({len(b['groups']) - len(inc)} left out as reference)", flush=True)
    quality._analyse(bid)
    q = store.load(bid)["quality"]
    if q["status"] != "done":
        raise SystemExit(f"Check failed: {q.get('message')}")
    t2 = time.time()
    for i in q["issues"]:
        if i["actions"]:
            print(f"  check  {i['title']:38s} {i['dataset'][:26]:26s} {i['count']:>9,d} -> {i['default']}")
    quality._apply(bid, {})
    c = store.load(bid)["confirm"]
    if c["status"] != "done":
        raise SystemExit(f"Load failed: {c.get('message')}")
    t3 = time.time()
    fx = c["result"]["fixes"]
    print("\nCleaning applied:")
    for k, v in fx.items():
        if v:
            print(f"  {k.replace('_', ' '):28s} {v:>10,d}")
    print(f"\nTimings: read {t1 - t0:.0f}s, check {t2 - t1:.0f}s, clean and save {t3 - t2:.0f}s, total {t3 - t0:.0f}s")
    print(f"Wrote {len(c['result']['tables'])} tables to {store.DATASETS}")
    return c["result"]


def main() -> None:
    ap = argparse.ArgumentParser(description="Run the data pipeline on a folder of workbooks.")
    ap.add_argument("paths", nargs="+", type=Path, help="Folder(s) or file(s) to process")
    ap.add_argument("--no-readme", action="store_true", help="Skip files that start with 00_")
    a = ap.parse_args()
    run(a.paths, include_readme=not a.no_readme)


if __name__ == "__main__":
    sys.exit(main())

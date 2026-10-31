"""Convert every sheet of the er-data Excel workbooks to Parquet.

Usage: python -m pipeline.ingest
Output: data/parquet/<workbook>__<sheet>.parquet
"""
import re

import pandas as pd

from app.config import settings


def slug(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")


def main() -> None:
    settings.parquet_dir.mkdir(parents=True, exist_ok=True)
    for xlsx in sorted(settings.raw_data_dir.glob("0[1-5]_*.xlsx")):
        print(f"Reading {xlsx.name} ...", flush=True)
        for sheet, df in pd.read_excel(xlsx, sheet_name=None).items():
            out = settings.parquet_dir / f"{slug(xlsx.stem)}__{slug(sheet)}.parquet"
            df.to_parquet(out, index=False)
            print(f"  {sheet}: {len(df):,} rows -> {out.name}", flush=True)


if __name__ == "__main__":
    main()

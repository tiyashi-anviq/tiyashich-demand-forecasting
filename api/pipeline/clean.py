"""Cleaning layer: reads the Parquet written by pipeline.ingest, writes cleaned tables.

Usage: python -m pipeline.clean
Output: data/clean/{sales_depot_weekly,weather_weekly,non_po_receipts}.parquet
        data/clean/report.json
"""
import glob
import json
import re

import pandas as pd

from app.config import settings

SALES_KEY = ["Week_Start", "Depot_Code", "SKU_Code"]
WEATHER_COLS = [
    "Rainfall_mm_Week",
    "Temp_Mean_C",
    "Temp_Max_C",
    "Temp_Min_C",
    "Rel_Humidity_Pct",
    "Power_Cut_Index_0_100",
]
# Words that describe the place type, not the place.
NOISE = re.compile(r"\b(warehouse|depot|wh|godown)\b")


def _read(name: str) -> pd.DataFrame:
    return pd.read_parquet(settings.parquet_dir / f"{name}.parquet")


def clean_sales() -> tuple[pd.DataFrame, dict]:
    files = sorted(glob.glob(str(settings.parquet_dir / "01_Sales_History__Depot_Weekly_FY*.parquet")))
    sales = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    before = len(sales)
    sales = sales.drop_duplicates().reset_index(drop=True)
    removed = before - len(sales)
    # Duplicates must be exact copies; a repeated key with different values is a real conflict.
    conflicts = int(sales.duplicated(SALES_KEY).sum())
    if conflicts:
        raise ValueError(f"{conflicts} rows share a key but differ in values; not an exact duplicate")
    return sales, {"rows_in": before, "duplicates_removed": removed, "rows_out": len(sales)}


def clean_weather() -> tuple[pd.DataFrame, dict]:
    weather = _read("04_Masters_Market_Weather_Events__Weather_Weekly")
    weather = weather.sort_values(["City_Code", "Week_Start"]).reset_index(drop=True)
    nulls_before = {c: int(weather[c].isna().sum()) for c in WEATHER_COLS}
    # Interpolate within each city in week order. Gaps at the very start or end have no
    # neighbour on one side, so they take the nearest value.
    weather[WEATHER_COLS] = weather.groupby("City_Code")[WEATHER_COLS].transform(
        lambda s: s.interpolate(method="linear", limit_direction="both")
    )
    nulls_after = int(weather[WEATHER_COLS].isna().sum().sum())
    return weather, {
        "nulls_filled": sum(nulls_before.values()) - nulls_after,
        "nulls_by_column": nulls_before,
        "nulls_remaining": nulls_after,
    }


def _location_lookup() -> tuple[dict[str, str], dict[str, str]]:
    """Alias -> City_Code, and City_Code -> primary Depot_Code (largest national share)."""
    depots = _read("04_Masters_Market_Weather_Events__Depot_Master")
    primary = (
        depots.sort_values("Depot_Share_Of_National", ascending=False)
        .drop_duplicates("City_Code")
        .set_index("City_Code")["Depot_Code"]
        .to_dict()
    )
    alias: dict[str, str] = {}
    for row in depots[["City_Code", "City"]].drop_duplicates().itertuples():
        alias[row.City_Code.lower()] = row.City_Code
        alias[row.City.lower()] = row.City_Code
    return alias, primary


def clean_non_po() -> tuple[pd.DataFrame, dict]:
    receipts = _read("05_Supply_Procurement_RawMaterial__Non_PO_Receipts")
    alias, primary = _location_lookup()

    def city_of(text) -> str | None:
        key = NOISE.sub("", str(text).lower()).strip()
        return alias.get(key)

    receipts["City_Code"] = receipts["Received_At"].map(city_of)
    receipts["Depot_Code"] = receipts["City_Code"].map(primary)
    unresolved = receipts.loc[receipts["Depot_Code"].isna(), "Received_At"]
    return receipts, {
        "rows": len(receipts),
        "mapped": int(receipts["Depot_Code"].notna().sum()),
        "unresolved_labels": sorted(unresolved.dropna().unique().tolist()),
        "mapping": (
            receipts.groupby("Received_At")["Depot_Code"].first().fillna("UNRESOLVED").to_dict()
        ),
        "rule": "City-level label -> the city's primary depot (largest Depot_Share_Of_National)",
    }


def main() -> dict:
    out = settings.clean_dir
    out.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, step in [
        ("sales_depot_weekly", clean_sales),
        ("weather_weekly", clean_weather),
        ("non_po_receipts", clean_non_po),
    ]:
        df, stats = step()
        df.to_parquet(out / f"{name}.parquet", index=False)
        report[name] = stats
        print(f"{name}: {stats}", flush=True)
    (out / "report.json").write_text(json.dumps(report, indent=2, default=str))
    return report


if __name__ == "__main__":
    main()

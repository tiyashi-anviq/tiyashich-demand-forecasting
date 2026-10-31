"""What the planning engine needs, expressed as dataset types and fields.

The UI asks the user to confirm which type each uploaded table is and which of their
columns fills each field. Everything here is only used to *suggest* a starting point.
"""
from __future__ import annotations

import re

# kind: date | number | text
F = lambda key, label, help, kind, syn, required=False: dict(  # noqa: E731
    key=key, label=label, help=help, kind=kind, synonyms=syn, required=required
)

DATASET_TYPES: dict[str, dict] = {
    "sales": dict(
        label="Sales history",
        help="What was sold, by week or month. This is what the forecast learns from.",
        core=True,
        hints=r"weekly|monthly|sales|history|invoice",
        fields=[
            F("date", "Week or month", "The period the sales belong to", "date",
              ["week start", "week", "month", "date", "period", "invoice date"], True),
            F("sku", "Product code", "SKU or material code", "text",
              ["sku code", "sku", "material code", "material", "item code", "product code", "article"], True),
            F("quantity", "Quantity sold", "Units actually sold (invoiced)", "number",
              ["invoiced qty", "invoiced quantity", "quantity sold", "sales qty", "sold qty", "quantity", "qty", "units", "volume"], True),
            F("orders_qty", "Quantity ordered", "Units customers asked for", "number",
              ["orders received qty", "orders qty", "order qty", "ordered qty", "orders"]),
            F("depot", "Depot", "Depot or warehouse code", "text",
              ["depot code", "depot", "warehouse code", "warehouse", "plant"]),
            F("region", "Region", "East, West, North, South", "text", ["region", "zone"]),
            F("city", "City", "City name", "text", ["city", "city name", "town"]),
            F("channel", "Sales channel", "GT, EOD, Modern Trade and so on", "text", ["channel", "channel code", "sales channel"]),
            F("value", "Sales value", "Net value in rupees", "number",
              ["net value inr", "net value", "sales value", "revenue", "value inr", "value"]),
            F("split", "Train or test flag", "Which rows are held back for testing", "text", ["split", "train test", "dataset split"]),
        ],
    ),
    "inventory": dict(
        label="Stock and service",
        help="Depot stock by week, so the engine knows about stockouts and cover.",
        core=False,
        hints=r"inventory|stock|service|transfer",
        fields=[
            F("date", "Week", "The week the stock position is for", "date", ["week start", "week", "date", "dispatch week"], True),
            F("sku", "Product code", "SKU or material code", "text", ["sku code", "sku", "material code", "item code"], True),
            F("depot", "Depot", "Depot or warehouse code", "text", ["depot code", "depot", "warehouse", "from depot"], True),
            F("closing_qty", "Closing stock", "Units in stock at week end", "number", ["closing qty", "closing stock", "closing", "stock qty", "on hand"], True),
            F("opening_qty", "Opening stock", "Units in stock at week start", "number", ["opening qty", "opening stock", "opening"]),
            F("safety_stock", "Safety stock", "Target buffer", "number", ["safety stock qty", "safety stock"]),
            F("stock_status", "Stock status", "Stockout, OK, Overstock", "text", ["stock status", "status"]),
            F("region", "Region", "Region", "text", ["region", "zone"]),
        ],
    ),
    "forecast": dict(
        label="Forecast versions",
        help="Past forecasts and budgets, used to measure how accurate planning has been.",
        core=False,
        hints=r"horizon|forecast|budget",
        fields=[
            F("date", "Target month", "The month being forecast", "date", ["target month", "month", "forecast month", "period"], True),
            F("sku", "Product code", "SKU or material code", "text", ["sku code", "sku", "material code"], True),
            F("forecast_qty", "Forecast quantity", "The agreed forecast", "number",
              ["consensus qty", "forecast qty", "consensus", "forecast"], True),
            F("bu_qty", "Sales team forecast", "What the business units submitted", "number", ["bu submitted qty", "bu submitted", "submitted qty"]),
            F("baseline_qty", "Statistical baseline", "The system's own forecast", "number", ["stat baseline qty", "baseline qty", "baseline"]),
            F("region", "Region", "Region", "text", ["region", "zone"]),
            F("channel", "Channel", "Sales channel", "text", ["channel", "channel code"]),
            F("budget_qty", "Budget", "Budgeted units", "number", ["budget qty", "budget"]),
            F("actual_qty", "Actual", "What really sold", "number", ["actual qty", "actual", "actuals"]),
            F("horizon", "Horizon", "How far ahead the forecast was made (M1, M2, M3)", "text", ["horizon", "lead month"]),
        ],
    ),
    "product_master": dict(
        label="Product list",
        help="One row per product: name, family, brand, price.",
        core=False,
        hints=r"sku_master|product_master|item_master|catalogue|catalog|sku_rel",
        fields=[
            F("sku", "Product code", "SKU or material code", "text", ["sku code", "sku", "material code", "item code"], True),
            F("description", "Product name", "Description", "text", ["description", "product name", "item description", "name"]),
            F("family", "Product family", "Batteries, Lighting and so on", "text", ["product family", "family", "category", "sub category"]),
            F("brand", "Brand", "Brand", "text", ["brand"]),
            F("mrp", "Price (MRP)", "Maximum retail price", "number", ["mrp inr", "mrp", "price"]),
        ],
    ),
    "location_master": dict(
        label="Locations and channels",
        help="Depots, cities, regions and channels, and how they roll up.",
        core=False,
        hints=r"depot_master|city_master|hierarchy|channel_master|location|station",
        fields=[
            F("depot", "Depot", "Depot code", "text", ["depot code", "depot"]),
            F("depot_name", "Depot name", "Depot name", "text", ["depot name"]),
            F("city_code", "City code", "Short city code such as KOL", "text", ["city code"]),
            F("city", "City", "City", "text", ["city", "city name"]),
            F("region", "Region", "Region", "text", ["region", "zone"]),
            F("channel", "Channel", "Channel code", "text", ["channel code", "channel"]),
        ],
    ),
    "weather": dict(
        label="Weather",
        help="Rainfall and temperature by week and city. Explains monsoon swings.",
        core=False,
        hints=r"weather|monsoon|rain|temperature",
        fields=[
            F("date", "Week", "The week", "date", ["week start", "week", "date"]),
            F("rainfall", "Rainfall", "Millimetres in the week", "number", ["rainfall mm week", "rainfall", "rain mm", "precipitation"]),
            F("city", "City", "City", "text", ["city", "city code"]),
            F("region", "Region", "Region", "text", ["region"]),
            F("temperature", "Temperature", "Mean temperature", "number", ["temp mean c", "temperature", "temp"]),
        ],
    ),
    "market": dict(
        label="Market and sell-through",
        help="Competitor, market-audit and partner sell-through data.",
        core=False,
        hints=r"nielsen|market|darkstore|dark_store|sellthrough|pos|competitor",
        fields=[
            F("date", "Period", "Week or month", "date", ["week start", "period", "month", "date"]),
            F("volume", "Volume", "Units sold or sold through", "number",
              ["sales volume units", "actual sell through qty", "sell through", "volume", "units"]),
            F("brand", "Brand", "Brand or partner", "text", ["brand", "qc partner", "partner"]),
            F("category", "Category", "Category or product family", "text", ["category", "product family"]),
            F("price", "Price", "Average price per unit", "number", ["avg price per unit", "price", "average price"]),
        ],
    ),
    "promotions": dict(
        label="Schemes and promotions",
        help="Trade schemes with start and end dates. Used to separate promo lift from base demand.",
        core=False,
        hints=r"scheme|promo|offer",
        fields=[
            F("start_date", "Starts", "Scheme start", "date", ["scheme start", "start date", "start"], True),
            F("end_date", "Ends", "Scheme end", "date", ["scheme end", "end date", "end"], True),
            F("discount_pct", "Discount", "Discount percentage", "number", ["discount pct", "discount", "scheme pct"]),
            F("channel", "Channel", "Channel", "text", ["channel"]),
            F("family", "Product family", "Product family", "text", ["product family", "family", "category"]),
        ],
    ),
    "events": dict(
        label="Calendar and events",
        help="Festivals, fiscal calendar and logged events.",
        core=False,
        hints=r"festival|event|calendar|holiday|seasonality",
        fields=[
            F("date", "Date", "Event date", "date", ["event date", "date", "week start", "month"]),
            F("name", "Name", "Festival or event", "text", ["festival", "event", "description", "name"]),
        ],
    ),
    "supply": dict(
        label="Supply and procurement",
        help="Purchase orders, capacity, raw materials, suppliers and costs.",
        core=False,
        hints=r"^po_|_po_|moq|capacity|^rm_|bom|supplier|vendor|freight|commodity|working_capital|non_po|cycle_time|priority|supply|customs|trade_",
        fields=[
            F("date", "Date", "Order or month", "date", ["po date", "month", "date", "request date", "start date"]),
            F("supplier", "Supplier", "Supplier or vendor code", "text", ["vendor code", "supplier code", "supplier"]),
            F("sku", "Product or material", "SKU or raw material code", "text", ["sku code", "rm code", "sku"]),
            F("quantity", "Quantity", "Ordered quantity", "number", ["ordered qty", "quantity", "qty"]),
        ],
    ),
    "service": dict(
        label="Service levels",
        help="Fill rate and on-time-in-full by week, region and product family.",
        core=False,
        hints=r"service",
        fields=[
            F("date", "Week", "The week", "date", ["week start", "week", "date"]),
            F("region", "Region", "Region", "text", ["region"]),
            F("family", "Product family", "Product family", "text", ["product family", "family"]),
            F("fill_rate", "Fill rate", "Share of orders shipped", "number", ["fill rate value", "fill rate qty", "fill rate"]),
            F("otif", "On time in full", "OTIF rate", "number", ["otif value", "otif"]),
        ],
    ),
    "new_products": dict(
        label="New product launches",
        help="Launch cases, early sales, plans and look-alike products.",
        core=False,
        hints=r"npd|launch",
        fields=[
            F("date", "Week or month", "Period", "date", ["week start", "month", "date"]),
            F("sku", "Product code", "SKU", "text", ["sku code", "new sku", "sku"]),
            F("quantity", "Quantity", "Units", "number", ["invoiced qty", "orders qty", "planned units national", "quantity"]),
        ],
    ),
    "reference": dict(
        label="Other reference data",
        help="Kept as-is for later. Not used by the forecast.",
        core=False,
        hints=r"scenario|lever",
        fields=[],
    ),
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


def _score(col_name: str, col_kind: str, field: dict) -> float:
    n = norm(col_name)
    toks = set(n.split())
    best = 0.0
    for syn in field["synonyms"]:
        s = norm(syn)
        st = set(s.split())
        if n == s:
            sc = 1.0
        elif st and st <= toks:
            sc = 0.85 - 0.01 * (len(toks) - len(st))
        elif re.search(rf"\b{re.escape(s)}\b", n):
            sc = 0.7
        else:
            continue
        best = max(best, sc)
    if best == 0:
        return 0.0
    kind = field["kind"]
    if kind == "date" and col_kind != "date":
        best *= 0.25
    elif kind == "number" and col_kind != "number":
        best *= 0.25
    elif kind == "text" and col_kind == "date":
        best *= 0.3
    return best


def suggest_mapping(type_key: str, columns: list[dict]) -> dict[str, dict]:
    """field -> {column, confidence} using greedy best-first assignment."""
    fields = DATASET_TYPES[type_key]["fields"]
    cands = []
    for f in fields:
        for c in columns:
            sc = _score(c["name"], c["kind"], f)
            if sc >= 0.6:
                cands.append((sc, f["key"], c["name"]))
    cands.sort(key=lambda t: -t[0])
    out: dict[str, dict] = {f["key"]: {"column": None, "confidence": 0.0} for f in fields}
    used: set[str] = set()
    for sc, fk, cn in cands:
        if out[fk]["column"] is None and cn not in used:
            out[fk] = {"column": cn, "confidence": round(sc, 2)}
            used.add(cn)
    return out


def classify(stem: str, columns: list[dict]) -> tuple[str, float, dict]:
    """Pick the most likely dataset type for a table."""
    for pat, key in OVERRIDES:
        if re.search(pat, stem.lower()):
            m = suggest_mapping(key, columns) if DATASET_TYPES[key]["fields"] else {}
            return key, 0.9, m
    best = ("reference", 0.0, {})
    for key, t in DATASET_TYPES.items():
        if key == "reference":
            continue
        m = suggest_mapping(key, columns)
        req = [f["key"] for f in t["fields"] if f["required"]]
        opt = [f["key"] for f in t["fields"] if not f["required"]]
        req_frac = (sum(1 for k in req if m[k]["column"]) / len(req)) if req else 0.5
        opt_frac = (sum(1 for k in opt if m[k]["column"]) / len(opt)) if opt else 0.0
        hint = 1.0 if re.search(t["hints"], stem.lower()) else 0.0
        score = 0.5 * hint + 0.4 * req_frac + 0.1 * opt_frac
        if score > best[1]:
            best = (key, score, m)
    if best[1] < 0.35:
        return "reference", best[1], {}
    return best


OVERRIDES = [
    (r"forecast_to_supply|calibration|data_dictionary|file_map|limitations|relationship|requirement|deliberate|scenario|lever", "reference"),
    (r"station", "location_master"),
    (r"npd", "new_products"),
    (r"mrp|sku_master|sku_rel|category_map", "product_master"),
    (r"service", "service"),
    (r"inventory_norm|capacity|transfer|supply_request|cycle|moq|^po_|_po_|^rm_|bom|supplier|vendor|freight|commodity|working_capital|non_po|priority|customs", "supply"),
    (r"monsoon|weather", "weather"),
    (r"nielsen|darkstore|dark_store", "market"),
    (r"scheme|promo", "promotions"),
    (r"festival|event_log|calendar|seasonality", "events"),
    (r"depot_master|city_master|hierarchy|channel_master", "location_master"),
    (r"horizon|forecast", "forecast"),
    (r"^inventory|^stock", "inventory"),
    (r"weekly|monthly|sales|history", "sales"),
]


def public_schema() -> list[dict]:
    return [
        dict(key=k, label=v["label"], help=v["help"], core=v["core"], fields=v["fields"])
        for k, v in DATASET_TYPES.items()
    ]

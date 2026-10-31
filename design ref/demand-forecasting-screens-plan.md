# Feature: Demand Forecasting screens, Plan group

Overview, Forecast and accuracy, and New products: every view and card.

Part 5 of 9. Files are under `ui/src/screens`.

## Why

- A builder can rebuild each screen from this list.
- Numbers on screen come from named fields. They are listed here.

## What it does

Terms: M3, M2, M1 are forecasts made 13, 9, 4 weeks ahead. Accuracy =
1 - sum(abs error) / sum(actual), floored at 0. Test window = last 13
weeks (actuals hidden). P10 and P90 are the low and high case.

### Overview (`/overview`, `overview/`)

Header: model picker, Use cases, Scenario controls. Tabs:

**Demand outlook** (`?view=outlook`, default)
- `OutlookCard` "LightGBM demand outlook, Oct 2026 - 3 Jan 2027":
  - Filters (`Ctl`): Level (National/Kolkata depots), Category, Product.
    State kept as `ov:lvl`, `ov:cat`, `ov:prod`.
  - 4 KPIs: Forecast next 13 weeks (sum of `lt`, with base case line
    when levers are on), vs budget, vs same weeks last year, then Peak
    week (or Shippable demand when availability < 100 %).
  - `LineChart`: last 26 history weeks plus 13 forecast weeks. Lines:
    Actual, LightGBM forecast (backtest M3 in history, `lt` after),
    base case (dashed, only with levers), P10, P90, Budget, Last year,
    Supply-constrained. One band for the forecast window. Click a
    week to open it on Forecast.
  - By-month `DataTable`: LightGBM, P10, P90, Budget, vs budget, Last
    year, vs last year. P10/P90 are summed across series, so the range
    is wider than a true total range (a note says so).
- Card "Forecast accuracy": table by horizon, for depot rows and
  national total, LightGBM and sales forecast (from `D.lgsc`).
- Card "LightGBM vs sales forecast, by horizon": 4-series bar chart.

**Operations** (`?view=ops`)
- 4 KPIs: Replenishment OTIF, Quick-commerce OTIF, Depot fill rate,
  Challenge flags sales/procurement.
- Card "Budget vs actual sales by financial year (INR Cr)": FY24-FY27.
  FY24 and FY27 are part years.

### Forecast and accuracy (`/forecast`, `forecast/Forecast.tsx`)

Header: model picker, Festive impact, Scenario controls. Filters in the
header (`PageFilters`): Level, Depot (Kolkata only), Segment, Category,
Horizon (not on Flags tab), "Flags from" (Flags tab only). State is
tab memory `fc:*`. Changing Level resets Depot. Changing Segment resets
Category.

Tabs: **Accuracy**, **Model value**, **Challenge flags**.

**Accuracy**
- KPIs: LightGBM accuracy, Sales forecast same weeks (with gain in
  points as a toned tag), Sales/procurement flags share.
- With a festival applied the KPIs change: festival-week accuracy (or
  the forecast and P10-P90 for a future festival), Festival demand lift
  (week vs mean of 4 weeks before), vs same festival last year.
- Card "Actual vs LightGBM forecast": `ForecastChart`. Opens on the
  52-week backtest plus forecast. A festival cuts to 13 weeks either
  side and drops the slider. Dividers: Forecast starts, Selected week,
  festival name. Budget starts hidden. Click picks a week into `?week=`.
- `WeekExplain` card "Why this week?" (see drawers doc).
- Card "Under- vs over-forecast by horizon": stacked bars of units.
- Card "Accuracy by category": bars LightGBM vs sales forecast, and a
  table with units, bias, gain. Click a row to set the Category filter.
  The (i) text is built live: best, worst, count of wins.

**Model value**
- KPIs: Gain over sales forecast (points), LightGBM bias.
- Info notice: read accuracy as a best case, because the model leans on
  the sales forecast and the budget.
- Card "LightGBM against the sales forecast": bars by level x horizon,
  with a table of gain.

**Challenge flags**
- Info notice "What a flag means".
- KPIs: Sales forecasts flagged, Procurement asks flagged (shares of
  product-weeks in window), Most flagged product.
- Card "Where to look first": stacked bars, top 10 products, with a
  full table behind the Table switch.
- Card "Flags in this selection": searchable table. Columns: Week,
  Type tag, Severity (sigma), Product, Grain, Why (plain words), The
  figures (raw text). `plainReason()` turns the raw formula into words.
- Window filter: Last 13 weeks (default) or All history.
- Flag row = `[level, product, depot|ALL, weekIndex, salesReason,
  procurementReason]`. One row can make two table rows.

### New products (`/new-products`, `newp/`)

No header actions. Tabs: Launches, Cannibalisation, Similarity index.
Shared state `newp:np` = `{ id, geo, metric, pack, case, simBasis }`
(default `npd01`, National). Parent holds it, children get `np, setNp`.

**Launches** (`Launch.tsx`)
- Filters: Level, Launch (5 products).
- 6 KPIs: Launch date (slip vs plan), First 13 weeks (vs budget),
  First 52 weeks, Sourced from own portfolio, Lost sales 13 weeks,
  Lost to competitor actions.
- Card "Weekly demand vs budget": 8 weeks before to 52 after launch.
  Marks: Launch, End of first 13 weeks, Hidden test.
- `LaunchTiming` card "Units by launch month": KPIs Best, Worst, Actual
  month. Bars first-52 and first-13 week units for 12 launch months.
  Tooltip gives verdict and rank. Table adds value, verdict chip.
- Card "Compare launches": bars of 13-week achievement. Row click loads
  that launch.
- For `npd05` only: `Vap` (mosquito vaporizer, no history):
  - Filters: Level, Market metric (6 metrics).
  - 3 KPIs, one per method A company plan, B market share, C
    recalibrated. Accuracy tone: > 50 % good, <= 20 % bad.
  - Cards: launch forecast case (weeks 0-25), market panel (5 brands
    from 2024-12-30), accuracy by window and method, pre-launch pack
    table with a Section filter.

**Cannibalisation** (`Cannib.tsx`)
- One filter "Cannibalisation type": Internal or External (`end`).
- Internal: bars of units lost per pair ("old <- NPD"), detail table.
- External: bars per competitor event (tooltip names competitor and
  action), vaporizer share-point loss by brand (bars and table), event
  detail table.

**Similarity index** (`Sim.tsx`)
- Filters: Basis (Pre-launch or Refined), New product.
- For `npd05`: a callout warns the best analogue is weak.
- 4 KPIs: Best analogue, Top-3 average index, Same/Different rank #1,
  Analogue volume benchmark (weighted units per week).
- Cards: top 8 analogues stacked by 6 weighted fits (category, price,
  pack, channel, weather, supply), demand since launch indexed to the
  first 13 weeks = 100, full ranked table with search.
- For `npd05` also: "Vaporizer vs market incumbents" table.

## What it will not do

- No screen fetches data itself. All read `useData()`.
- No filter state in the URL except tab and table state.

## Update notes

- 2026-10-13: created. Hand-off reference for the next module.

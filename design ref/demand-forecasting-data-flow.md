# Feature: Demand Forecasting data flow and state

How data gets from a JSON file and an API into every screen.

Part 3 of 9. Read `demand-forecasting-ui-shell.md` first.

## Why

- The screens never fetch. They read one merged object. Copy that idea.
- If you break the merge, every chart shows wrong numbers.

## What it does

### Two sources, one object

| Source | What it holds | When loaded |
|--------|---------------|-------------|
| `ui_data.json` | history, supply, launches | once, forever |
| `GET /forecast/all` | P50/P10/P90 forecast | per model, 5 min |
| `GET /backtest` | model backtest tables | per model, 5 min |
| `GET /models` | model list | 60 s |
| `POST /explain` | SHAP "why this week" | per week, 5 min |

- `ui_data.json` is read with `fetch(BASE_URL + 'data/ui_data.json')`.
  Query key `['dataset']`, `staleTime: Infinity`.
- The JSON is bundled in `ui/public/data/`. It is 5 MB. It has no
  generator script in the repo. Treat it as a checked-in asset.
- The JSON also holds keys `acc`, `acccat`, `fva`, `fvar`. No code reads
  them. They are left over. Types in `data/types.ts` skip them.

### Dataset shape (`src/data/types.ts`)

- `weeks`: 170 Monday dates, 2023-10-02 to 2026-12-28.
- `nh = 157`: history weeks. Index `>= nh` is the hidden test window
  (13 weeks, 2026-10-05 to 2026-12-28). Actuals are null there.
- Every weekly array has length 170. Gaps are `null`.
- `prods` (31): `id, name, cat, seg, npd, asp, slot, b2b, el`.
  - 4 segments, 11 categories. `el` is price elasticity.
  - `npd` marks the 5 new products (`npd01` to `npd05`).
- `dep`: depot code to name (`tar` Taratala, `bar` Barasat, `dan`,
  `bkp`, `bpr`).
- `nat[productId]` and `kol["<depot>|<productId>"]` hold weekly series.

Series keys the UI reads:

| Key | Meaning | In nat | In kol |
|-----|---------|--------|--------|
| `a` | actual demand | yes | yes |
| `f3 f2 f1` | sales forecast, 13/9/4 wk | yes | yes |
| `sb` | seasonal baseline | yes | yes |
| `bu`, `ly` | budget, last year | yes | yes |
| `fl`, `sfl` | sales, procurement flag | yes | yes |
| `lg3 lg2 lg1` | LightGBM backtest | yes | yes |
| `lt lt10 lt90` | LightGBM forecast P50/10/90 | yes | yes |
| `cl os ss w` | close, open, safety stock, cover | no | yes |
| `pr pc pa` | plant ask, capacity, allocated | yes | no |
| `b2c p1 p2` | allocation by channel | yes | no |
| `lb2c lp1 lp2` | lost sales by channel | yes | no |

- `lt*` are null before `nh`. The API overwrites them (see below).
- Other tables: `rs` (8227 challenge flags), `rep` (OTIF), `trf`
  (transfers), `moq`, `npdr/lt/ican/ecan/inf/infw` (launches, timing,
  cannibalisation, competitors, influencer), `fest` (72 festivals),
  `qc/qcprod` (quick commerce), `vap/vcase/vsum/vpack/vext` (vaporizer),
  `sim/simw/simv` (similarity), `kpi`, `bud/budt`, `lgsc/lgwin/lgimp`.
- `cal`: weekly drivers `rain temp dengue rural zinc power` and flags
  `shock recov dpuja diwali ledp margin scen fest win`.

### Merge (`src/api/forecastApi.ts`)

- `mergeApi(D, api)`: for each API point with week index `>= nh`, set
  `lt, lt10, lt90`. Keys: `nat|ALL|<pid>`, `kol|<depot>|<pid>`.
- `mergeBacktest(D, bt)`: write `lg3/lg2/lg1` per series. Replace
  `lgsc, lgwin, lgimp` with the model's own tables.
- Both copy arrays before writing. The cached base is never changed.
- `useLiveForecast(base, model)` runs both queries and returns
  `{ merged, source, fetching }`.
  - Backtest is only used when it is not placeholder data. Else the
    bundled backtest stands. `source.backtestFrom` says which model.
  - `source.kind`: `live`, `sample` (API failed) or `loading`.
  - Nothing shows `kind` or `error` today. An offline API falls back to
    the bundled forecast with no sign on screen.
- Queries use `keepPreviousData`. A model switch keeps old numbers
  visible until new ones arrive. `fetching` then drives `pulse-refresh`.

### Request helper

- `request(path)` calls `fetch(env.demandForecastingApiUrl + path,
  { credentials: 'include' })`.
- On 403 it calls `reportAccessDenied(message)`. `AuthProvider` then
  swaps the app for the access-denied page.
- On other errors it throws `Error(detail)`. FastAPI puts text in
  `detail`. A 422 sends a list, so the text falls back to
  `API <path> returned <status>`.
- `postJson` is exported for the explainer.

### `DataProvider` and hooks

- `useDataValue()` builds `DataCtx` once, memoised:
  `D, W (weeks), NH, LABELS, PM (id to product), CATS, SEGS, prodsIn,
  nameOf, source, refetching`.
- `DataProvider`: error shows `ApiErrorNotification` with retry. No data
  yet shows `PageSkeleton`. Else it provides the context.
- The chat pane calls `useDataValue()` too. Keys are shared, so it does
  not fetch twice.
- `useData()` throws if used outside the provider.

### App state (`src/state/`)

`AppStateProvider` keeps:

| State | Use |
|-------|-----|
| `lev`, `levBusy`, `applyLev` | applied scenario levers |
| `drawerOpen` | levers drawer |
| `ucOpen` | use-case modal |
| `festOpen`, `festival` | festive drawer, applied festival id |
| `model` | forecast model, default `lightgbm_stacked` |
| `readTab`, `writeTab` | memory behind `useTabState` |

- `applyLev` sets `levBusy`, waits 350 ms, then sets levers. The delay
  shows the "Recalculating" state. It does no real work.
- `useLevers()` binds levers to the dataset. It returns
  `{ lev, busy, active, COMP, mult, adj, NH }`. Use `adj(array, pid)`
  on any forecast array before you draw it.

### Lever math (`src/lib/levers.ts`)

- Levers: `shift` (-20..20 %), `scheme` (0..10 pts), `fest` (-30..30 %),
  `comp` (0..100 %), `avail` (80..100 %). Base: all 0, `avail` 100.
- Multiplier for product `p`, forecast week `i`:
  `(1+shift/100) * (1+el*scheme/100) * (festWeek ? 1+fest/100 : 1)
  * (COMP[p] ? 1 - COMP[p]*comp/100 : 1)`
- `festWeek` is `cal.win[i] || cal.fest[i]`. `COMP[p]` is the largest
  national peak impact of a competitor event on `p`.
- Only weeks `>= nh` change. `avail` is not in the multiplier: charts
  draw a separate "Supply-constrained" line = forecast x avail/100.
- Presets: Base case, Weak festive season, Competitor price war, Strong
  festive + scheme, Supply squeeze.

## What it will not do

- No re-run of the model for a scenario. Levers scale P50, P10, P90.
- No write path. Everything is read only.

## How

Copy `data/`, `api/forecastApi.ts` merge style and `state/`. Keep the
rule: screens read `useData()` only, and never call `fetch`.

## Update notes

- 2026-10-13: created. Hand-off reference for the next module.

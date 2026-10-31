# Feature: Demand Forecasting API and models

The Python service behind the UI: routes, models, explain, and deploy.

Part 8 of 9. Files are under `modules/demand-forecasting/api`.

## Why

- The UI is only half the module. The numbers come from here.
- Another module can reuse the "one folder per model" design.

## What it does

### Input data

- One CSV: `data/raw/eveready_mock_weekly_model_ready.csv`. Long table,
  one row per week and series. Synthetic.
- Grains: `national` rows (depot `ALL`) and `kolkata_depot_product`
  rows. 31 products x (1 national + 5 depots) = 186 series.
- `split` is `history` or `test`. History ends 2026-09-28. Test is the
  13 weeks 2026-10-05 to 2026-12-28.
- Columns by kind:
  - target: `actual_demand_units`
  - known ahead: festival, monsoon, scheme, price, budget, last year,
    launch age, influencer
  - benchmarks: `sales_fc_m3/m2/m1_units`, `seasonal_baseline_fc_units`
  - supply: stock, safety stock, replenishment, plant capacity, lost
    sales (not used by models)
- Series id: first 3 letters of grain, depot, product, joined by `|`.
  Examples: `nat|ALL|bt20`, `kol|bar|bt20`. The UI builds the same ids.

### Models (one folder each)

| Folder | Features | Notes |
|--------|----------|-------|
| `lightgbm_stacked` | 55 | adds sales fcst + baseline. Default |
| `lightgbm_base` | 48 | no sales-forecast inputs |

- `train_lgbm.py` (same file in both): target is `log1p(demand)`. One
  global model per horizon. Horizons M3=13, M2=9, M1=4 weeks. A row's
  history features are cut at `T - h`, so no leak.
- `stack_lgbm.py` (stacked only) adds `log_sales_fc`, `log_baseline_fc`,
  and ratios to mean13, budget, last year, baseline.
- `build_models.py` refits on all history. It writes 9 files:
  `models/{M1,M2,M3}_{p50,p10,p90}.txt` and `meta.json`.
  P10 and P90 are LightGBM quantile models (alpha 0.1, 0.9).
- Rounds come from `outputs/validation_scores.csv`: `best*1.1+10`.
- `backtest.json` (per model): 52 weeks, 4 windows. Made by
  `make_backtest_json.py <folder> <preds.csv> <pred_col> <scores.csv>
  <importance.csv>`. Holds `weeks, series, lgsc, lgwin, lgimp, lgbt`.
- Which horizon serves a forecast week: the smallest `h` whose cut-off
  `T - h` is still `<= history end` (freshest model). `horizon=` forces
  one. Quantiles are clamped so `p10 <= p50 <= p90`.

### Predictor interface

`predictor.py` in each folder exposes class `Predictor(data_path)`:
`health()`, `series()`, `resolve(series_id, product_id, depot_id)`,
`forecast(series_id, horizon)`, `forecast_all(horizon)`, `horizons`.
The explainer also needs the attributes `X`, `models`, `cols`, `df`,
`test_weeks`, `last_hist`.

### Routes (`app.py`, version 2.1)

| Method and path | Returns |
|-----------------|---------|
| GET `/models` | `health()` of each model |
| GET `/health` | `{status, models}` for the probe |
| GET `/series?model=` | 186 series records |
| GET `/forecast` | one series, 13 points |
| GET `/forecast/all?model=` | all series. The UI uses it |
| GET `/backtest?model=` | contents of `backtest.json` |
| POST `/explain` | SHAP drivers and facts |
| POST `/report/forecast` | PDF (no UI button yet) |

- A point: `week_start, horizon, weeks_ahead, p50, p10, p90,
  sales_forecast, seasonal_baseline`.
- `/forecast` takes `series_id`, or `product_id` and `depot_id`
  (`ALL` = national). Errors: 404 unknown model or series, 400 bad
  horizon, 422 missing ids.
- `/explain` body: `series_ids` (1 to 400), `week_start`, `model`,
  `horizon?`, `ref_weeks` (1 to 13, default 4). Errors: 404 for no
  rows, 400 if the model has no boosters.
- Models load once at start (`lifespan`) into `PRED`. Backtest JSON is
  cached in `BT` on first read.
- CORS allows the Vite ports 5173 and 4173 only. Override with env
  `EVEREADY_CORS`. In production CORS is moot: one origin.
- There is no auth code here. Caddy `forward_auth` guards the path.
- `/docs` is always on. There is no `STAGE` switch in this app.

### Explain (`xai/explain.py`)

1. SHAP via `booster.predict(pred_contrib=True)` for the target week and
   for each reference week (previous N weeks), per series.
2. Per-feature change in log space is turned into units with a log-mean
   weight `(e^a - e^b)/(a - b)`. Drivers then add up exactly to the
   change in the summed forecast.
3. Features are grouped into 11 plain drivers: Festival and calendar,
   Weather and economy, Price and schemes, Marketing, Budget / plan,
   Sales team forecast, Seasonal baseline, Same week last year, Recent
   demand trend, New-product effects, Product and depot.
4. A "Forecast horizon" driver appears when the week and its references
   use different horizon models.
5. `facts`: plain inputs (budget, sales forecast, baseline, last year,
   scheme, price) for the week vs the reference average. Only inputs the
   model uses are listed.
6. A reference week with missing series is skipped, so the compare
   stays like for like.

### Report (`report/forecast_report.py`)

- `build_pdf(p, series_ids, model, title, scope, horizon)` makes an A4
  PDF with reportlab and matplotlib: headline numbers, chart, by
  horizon, by month, week by week.

### Deploy

- `api/Dockerfile`: two stages on `python:3.12-slim`. `uv sync --frozen
  --no-dev`. Installs `libgomp1` for LightGBM. Runs as user 10001.
  Port 8080. `MPLCONFIGDIR=/tmp/matplotlib` for the PDF.
- It copies `app.py, report, xai, lightgbm_base, lightgbm_stacked,
  data`. The repo `.dockerignore` blocks `**/data` and `**/*.csv`, and
  re-allows this one folder. Without that, start-up fails at run time.
- `modules/docker-compose.yml`: service `demand-forecasting-api`
  (`<<: *api`, `STAGE: production`). Probe: GET `/health` on 8080.
- `modules/Caddyfile`: `handle_path /demand-forecasting/api/*` runs
  `import gate demand-forecasting`, then proxies to
  `demand-forecasting-api:8080`. The static side is `import spa`.
- Local: `./run-local.sh` in `api/` (needs `uv`, and `libomp` on
  macOS). Port 4004 (`DEMAND_FORECASTING_PORT`). Tests:
  `uv run pytest -q test_api.py`.

## What it will not do

- No retraining at run time. Models are files in the image.
- No forecast past the 13 test weeks in the data.
- No per-user data. Everyone sees the same synthetic set.

## How

To add a model type, see `api/README.md`: new folder with a
`Predictor`, then add its name to `MODEL_FOLDERS`. The UI model picker
shows it by itself once `/models` lists two or more.

## Update notes

- 2026-10-13: created. Hand-off reference for the next module.

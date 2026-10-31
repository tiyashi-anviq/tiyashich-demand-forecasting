# Feature: Demand Forecasting design reference (start here)

Map of the Demand Forecasting module: what lies where, and how it fits.

This is part 1 of 9. Read it first. The other parts are listed at the end.

## Why

- Another module can copy this module's design and get the same result.
- One person needs one map. Not 70 files to open.
- Every fact here comes from the code in `modules/demand-forecasting`.

## What it does

The module shows a demand forecast and the supply picture around it.

- Data is synthetic. It mimics Eveready (lights, batteries, home care).
- 31 products. 5 Kolkata depots. 157 history weeks. 13 forecast weeks.
- The forecast comes from a Python API (LightGBM models).
- Everything else (history, supply, launches) is one bundled JSON file.
- Six screens. 19 "use cases" that deep-link into the screens.
- Scenario levers, a festival lens, a "Why this week?" explainer.
- A chat pane that answers from a built-in matcher (not an LLM).

## What lies where

```text
modules/demand-forecasting/
  api/                    Python FastAPI service (uv)
    app.py                routes, model registry, CORS
    data/raw/*.csv        the one input table (long, weekly)
    lightgbm_stacked/     model type 1 (default)
    lightgbm_base/        model type 2
      predictor.py        the Predictor interface app.py calls
      models/             9 boosters + meta.json
      backtest.json       52-week backtest, served by /backtest
    xai/explain.py        SHAP "why this week" engine
    report/               PDF report builder (API only, no UI yet)
  ui/                     React 19 + Vite + Carbon SPA
    public/data/ui_data.json   the bundled dataset (5 MB)
    src/app/              App, AppProviders
    src/config/env.ts     base URLs
    src/data/             types, DataProvider, hooks
    src/api/forecastApi.ts      API calls and merge functions
    src/state/            AppState (context) and hooks
    src/screens/          one folder per screen + registry.tsx
    src/layouts/          header, drawers, modal, left rail
    src/components/       cards, charts, table, controls, skeletons
    src/xai/              "Why this week?" UI
    src/lib/              format, levers, glossary, festival, charts
    src/design/global.css module-only CSS classes
packages/reiq-ui/         shared: tokens, Carbon, shell, auth, chat
```

## How a request travels

| Step | What | Where |
|------|------|-------|
| 1 | Browser opens the SPA | `/demand-forecasting/` |
| 2 | Caddy serves static files | volume `/var/www/<app>` |
| 3 | SPA calls the API | `/demand-forecasting/api/*` |
| 4 | Caddy checks the session | `forward_auth` to auth-api |
| 5 | Caddy strips the prefix | API sees `/forecast/all` |
| 6 | FastAPI answers | container port 8080 |

- Local dev: UI on port 3004, API on 4004. Vite proxies the API path.
- Local dev also proxies `/auth/api` to 4001 and `/auth` to 3001.
- The UI never reads a `.env` for URLs. See `src/config/env.ts`.

## Tech stack

- React 19, TypeScript, Vite, `react-router-dom` (BrowserRouter).
- `@carbon/react` only through `@reiq/ui/carbon`.
- `@carbon/charts-react` for charts. `@carbon/icons-react` for icons.
- TanStack Query for the three server calls. Axios is a dependency but
  unused: all calls use `fetch`.
- Python 3.12, FastAPI, LightGBM, pandas, SHAP via `pred_contrib`.
- pnpm workspace. Versions come from `catalog:` in `pnpm-workspace.yaml`.

## What it will not do

- No database. No secret. No login screen of its own.
- No model training in the UI. Scenario levers only scale numbers.
- No server-side render. It is a static build.

## How

The other parts, in reading order:

1. This file: the map.
2. `demand-forecasting-ui-shell.md`: boot, providers, routes, header.
3. `demand-forecasting-data-flow.md`: dataset, API merge, state.
4. `demand-forecasting-ui-parts.md`: cards, charts, table, controls.
5. `demand-forecasting-screens-plan.md`: Overview, Forecast, New products.
6. `demand-forecasting-screens-operate.md`: Supply, Channels, Guide.
7. `demand-forecasting-drawers.md`: levers, festival, explainer, chat.
8. `demand-forecasting-api.md`: endpoints, models, explain, deploy.
9. `demand-forecasting-reuse.md`: copy it into another module.

## Update notes

- 2026-10-13: created. Hand-off reference for the next module.

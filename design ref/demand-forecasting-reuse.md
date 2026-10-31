# Feature: Reuse the Demand Forecasting design in another module

Steps to copy this module's design into a new module, and the traps.

Part 9 of 9. Read parts 1 to 8 first.

## Why

- A new forecasting module should look and work the same.
- Copying blind brings the dead code too. This list says what to skip.

## What it does

### What to copy, what to rewrite

| Part | Copy as is | Rewrite |
|------|------------|---------|
| `main.tsx`, `AppProviders` | yes | no |
| `App.tsx` | yes | routes only |
| `registry.tsx` | shape | the screens |
| `layouts/PageHeader` | yes | tags per module |
| `components/*` | yes | glossary text |
| `lib/format, chartData` | yes | no |
| `lib/levers, festival` | no | domain math |
| `screens/*` | no | all |
| `screens/ask/engine.ts` | no | all |
| API folder layout | yes | models, data |

Pick: copy the shell and `components/`. Write screens fresh.

### Steps

1. Make `modules/<name>/ui` from this folder. Keep `package.json`
   (uses `catalog:`), `tsconfig*`, `eslint.config.js`, `vite.config.ts`.
2. In `vite.config.ts` change `base`, the API proxy path, and the
   dev ports. Use the next free pair in the fixed port table.
3. In `index.html` change the title. Keep the theme script and fonts.
4. Keep `main.tsx` CSS order. Do not move `responsive.css`.
5. In `config/env.ts` set `moduleLabel` and the API URL
   `/<name>/api`.
6. In `PageHeader.tsx` and `DemandForecastingLayout.tsx` change the
   label strings and the home link.
7. Rewrite `SCREENS` in `registry.tsx`. Keep the group names Plan,
   Operate, Assist only if they fit.
8. Build each screen from `Card`, `Kpi`, `SelectCtl`, `SegCtl`,
   `DataTable`, `LineChart`, `BarChart`. Add filters with `PageFilters`.
9. Put the screen's views behind `SubNav` and `useView`.
10. Replace `data/types.ts`, the JSON file, and `forecastApi.ts`.
    Keep the `request()` helper and its 403 handling.
11. Keep one `DataProvider`. Keep the skeleton, error, loaded states.
12. Rewrite `glossary.ts`. Every card and KPI needs one plain line.
13. API: copy the folder layout. One folder per model with a
    `predictor.py`. Register it in `MODEL_FOLDERS`.
14. Wire the module in. Edit all of these (keep them in step by hand):
    - `modules/Caddyfile`: gate, API proxy, redirect, SPA block
    - `modules/docker-compose.yml`: `<name>-ui-build`, `<name>-api`
    - `modules/Dockerfile.ui`: a `VITE_<NAME>_URL` build variable
    - `modules/hub/ui/src/data/modules.ts`: the hub tile
    - the auth module's module list and role list
    - `.github/workflows/ci.yml`: test matrix and build matrix
    - `scripts/ui/check_shared_ui.sh`: add the app to `APPS`
    - `.dockerignore`: re-allow the API data folder
15. Run `corepack pnpm run lint` and `build` in the new UI. Run
    `uv run pytest` in the API.

### Rules that carry over

- Carbon only through `@reiq/ui/carbon`. CI fails on `@carbon/react`.
- Colours `--reiq-*`, spacing and type `--cds-*`. No hex, no px.
- Chart colours only `COL(i)` or `themed()`. Charts follow the theme.
- Type steps: `label-01`, `body-01`, `body-02`, `heading-03`,
  `heading-05`. Weight stops at semibold.
- Square corners. One 150 ms motion. Reduced-motion guard is global.
- Four data states per view: loading skeleton, empty state, error,
  loaded. Plus refetch in place with `pulse-refresh`.
- Sentence case. Units always shown. Direction has a sign, not colour
  alone.
- Estimated values need an `Est.` tag. This module has none: all its
  figures are synthetic, and the Guide says so.

### Known gaps in this module (do not copy)

- `ui/README.md` is old. It names `tokens.css`, hash routing, a
  top-bar "Live" tag, an Explainability screen and a PDF button. None
  exist now.
- `ui/start.bat`, `ui/package-lock.json` and `local-run.sh` use npm,
  ports 5173 and 8000. The real flow is pnpm, 3004 and 4004.
- `axios` is a dependency. Nothing imports it.
- `ScreenDef.tabbed` is set but never read.
- `ui_data.json` has four unused keys: `acc, acccat, fva, fvar`.
- An offline API falls back to the bundled forecast with no sign on
  screen. `source.kind` and `source.error` are never shown.
- `POST /report/forecast` has no button in the UI.
- `screens/ask/engine.ts` is `@ts-nocheck` and lint-disabled.
- The hub tile text says "Prophet". That is the other module.
- `docs/guide/module-run-demand-forecasting-api.md` and
  `docs/bug/demand-forecasting-openapi-public.md` describe the Prophet
  module (`router.py`, `STAGE`). This API has neither.
- `tableId` in `DataTable` hashes column keys. Two tables with the same
  keys on one screen share URL params.
- The API sets CORS for dev ports only and has no `STAGE` switch.

## What it will not do

- It does not give a generator for `ui_data.json`. There is none.
- It does not make a new module for you. It lists the steps.

## How

Work the Steps list in order. Check each step before the next.
Open `modules/demand-forecasting` side by side while you work.

## Update notes

- 2026-10-13: created. Hand-off reference for the next module.

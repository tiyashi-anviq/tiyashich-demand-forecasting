# Demand Forecasting (demo, synthetic data)

Folders: `er-data` (synthetic workbooks), `api` (FastAPI), `ui` (React + Vite + Carbon).

## Run the API
    cd api
    uv sync
    uv run uvicorn app:app --reload

## Run the UI (first time run `npm install`)
    cd ui
    npm install
    npm run dev

Open http://localhost:5173 and add the files from `er-data`.
Command-line check of the cleaning pipeline: `cd api && uv run python -m app.cli ../er-data`

## Explore screen (EDA)

After loading data, open **Explore** in the left rail. It needs two extra Python packages (lightgbm, scikit-learn), so re-run `uv sync` in `api` once. The first visit builds a weekly panel (about 15 s) and trains the driver model in the background (about a minute); the Demand drivers tab shows a progress note until it is ready. The default measure is Orders received (invoiced + unfulfilled). All figures are synthetic.

## Forecasts

The Forecasts screen (rail item "Forecasts") has two views: **Outlook to Dec 2027** and **M3, M2 and M1 forecasts**.

- Level: monthly orders received, forecast for each family x region x channel (176 series), then shared across SKUs by each SKU's share of its group's orders in the last 8 weeks before the forecast starts.
- Methods: gradient boosting (LightGBM), last year's month with a damped trend, and damped exponential smoothing. Blend weights are fitted on Oct 2024 to Sep 2025 and never on the test months (Oct 2025 to Sep 2026).
- First visit after loading data builds every past forecast again as it would have looked at the time (about 3 to 5 minutes), then keeps it in `api/storage/forecast`.
- Needs one new package: run `uv sync` again (adds statsmodels).
- 2027 festival dates are not in the calendar until you approve them; until then the Oct to Dec 2027 peaks are carried over from earlier years.

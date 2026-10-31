# Feature: Demand Forecasting drawers, modal, explainer and chat

The side panels, the use-case modal, "Why this week?" and the chat pane.

Part 7 of 9. Files: `ui/src/layouts`, `ui/src/xai`, `ui/src/screens/ask`.

## Why

- These parts hold the module's special tricks. They are easy to miss.

## What it does

### Draft then apply (the drawer pattern)

- Both drawers use the shared `SettingsDrawer` (right rail panel).
- The drawer body mounts only while open (`key="open"`). So the working
  copy (draft) always starts from what is applied.
- Edits change the draft only. The page changes on Apply.
- Footer: primary Apply (disabled until dirty), tertiary Reset or Clear
  with a `Reset` icon. Short labels on phone ("Apply", "Reset").
- Open state lives in `AppState` (`drawerOpen`, `festOpen`, `ucOpen`).

### Scenario controls (`layouts/LeversDrawer.tsx`)

- Sections: Presets, Levers, Impact on national demand.
- Presets: a list of buttons (`aria-pressed`). The active one is the
  preset whose levers equal the draft. A click copies it to the draft.
  Active state shows by border, fill and name colour, not colour alone.
- Levers: 5 Carbon `Slider`s with `hideTextInput`. Each row has label,
  an info button (`aria-expanded`) that shows help text, and the value.
  Value text: `+4%`, `3 pts`, `88%` (`levText`).
- Impact: sum of `lt` over forecast weeks for all products, base vs
  draft. Shows the total and a tag with signed percent (green or red).
  With availability under 100 % it also shows the shippable units.
- Apply calls `applyLev(draft)`. While busy: both buttons disabled and an
  `InlineLoading` "Recalculating forecast...". Page shows `pulse-refresh`.
- Reset sets draft to base. It applies at once if levers are active.
- A subtitle says the model is not re-run.

### Festive impact (`layouts/FestiveDrawer.tsx`)

- Applied state is one festival id: `"<festival>|<date>"`.
- Controls: Year dropdown, then a switch Festivals | Calendar.
  - Festivals: `FestivalTiles` grid. Tile = date block, name, reach
    (Pan-India or Kolkata-centric) with a dot. `aria-pressed`.
  - Calendar: `YearCalendar`, 12 month cards. A day with a festival is
    a button. Each day is tinted by that week's demand:
    `color-mix(... highlight N% ...)` where
    N = clamp(value / median - 0.7, 0, 1) x 58.
    Days in the forecast window get an underline.
- The tint uses the Forecast screen's own filters (read from tab memory
  `fc:lvl`, `fc:depot`, `fc:seg`, `fc:cat`) and the scenario levers.
- Only festivals whose Monday is in the data weeks are listed. Seasons
  and exams are dropped (`datedFestivals`).
- Apply: sets the festival, and sets URL `?week=<Monday of festival>`,
  so "Why this week?" jumps to it. Clear removes it.
- The Forecast screen turns the festival into a lens (see plan screens).

### Use cases modal (`layouts/UseCasesModal.tsx`)

- Carbon `ComposedModal` size `lg`. Label "19 use cases". A `grid g3` of
  `UseCaseTile`. A click closes the modal and navigates.

### "Why this week?" (`xai/`)

Page card (`WeekExplain.tsx`):
- Props: `ids` (series ids), `scope`, `week`, `label`, `horizonFor`,
  `festival`, `range`, `categories`.
- Calls `useExplain` -> `POST /explain` with `series_ids, week_start,
  model, ref_weeks` and optional `horizon`. Cache key includes all.
- A history week passes the horizon the page scores (M3/M2/M1). A
  forecast week passes none, so the API picks the freshest model.
- 4 KPIs: Forecast, Previous N weeks avg, Change (signed, toned), then
  Actual demand (history) or Likely range P10-P90 (forecast).
- States: error `InlineNotification` (not shown if old data exists),
  `KpiRowSkeleton` while first load, `pulse-refresh` on refetch.
- "View full details" button portals into the card head (`CardSlot`).

Drawer (`WeekDrawer.tsx`, `parts.tsx`):
- A "Compare with the previous" dropdown: 1, 2, 4 or 8 weeks.
- Sections: The figures; In short (one generated sentence); Categories
  in the festival week (when a festival is applied); What moved the
  forecast; The inputs behind it; Good to know.
- Bars: diverging, one row per driver. Green right = pushes up. Red
  left = pulls down. Each row has an arrow and a signed number. A row
  opens to its top features. Rows under 1 % of the change are hidden.
- Story sentence picks drivers larger than 5 % of the change.
- `format.ts` maps feature names to plain words (`days_to_durga_puja`
  -> "days to Durga Puja"). Unknown names get underscores replaced.
- Notes always say: data is simulated, SHAP shows what the model used
  not what caused demand, scenario levers are not included.

### Chat pane (`screens/ask/`)

- `DemandChatPane` uses the shared `LocalChatPane` (storage key
  `demand-forecasting`, conversation kept in `sessionStorage`).
- `AppScaffold chatPane={...}` adds the top-bar button and the right
  column that narrows the page.
- Answers come from `engine.ts` `makeAnswer(ctx)`. It runs in the
  browser on the same merged dataset. It is a keyword matcher, not an
  LLM. The pane footnote says so.
- Matching: finds products (by id or name words), category, depot,
  horizon (m1/m2/m3), year. Then the first matching topic wins, in this
  order: quick commerce, OTIF/replenishment, flags, accuracy and
  rankings, stock and cover, MOQ, cannibalisation, vaporizer, launches,
  influencer, budget, festival, monsoon, transfers, plant capacity,
  demand totals. No match gives the `noMatch` text.
- An answer = `{ t (html), cols, rows, go: [screenKey, view] }`.
  `toLocal()` formats cells to strings (functions cannot be saved) and
  turns `go` into an "Open this screen" link.
- `engine.ts` is `@ts-nocheck` and `eslint-disable`. It is ported code.
  Do not copy its style. Copy its idea.
- 6 sample questions show before the first message.

## What it will not do

- The drawers do not run the model. Levers are overlays.
- The chat does not call any API. It does not remember across tabs.

## Update notes

- 2026-10-13: created. Hand-off reference for the next module.

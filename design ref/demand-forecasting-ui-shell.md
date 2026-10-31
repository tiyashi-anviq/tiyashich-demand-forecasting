# Feature: Demand Forecasting UI shell and routing

How the SPA boots, what wraps what, how screens and the header are wired.

Part 2 of 9. Start with `demand-forecasting-overview.md`.

## Why

- The shell is the part another module copies first.
- Order matters here: CSS order, provider order, slot order.

## What it does

### Boot files

- `ui/index.html`
  - Title "Demand Forecasting". Manifest and icons come from hub root.
  - A small inline script sets the `theme` attribute on `<html>` before
    first paint. It reads cookie `reiq_theme` (`g10` or `g100`). If none,
    it follows the OS. This stops a wrong-theme flash.
  - Fonts: Vend Sans and JetBrains Mono from Google Fonts.
- `ui/src/main.tsx` imports CSS in this exact order:
  1. `@reiq/ui/styles/carbon-theme.scss` (Carbon + brand palette)
  2. `@reiq/ui/styles/global.css`
  3. `@reiq/ui/styles/fixed-shell.css`
  4. `@reiq/ui/styles/surfaces.css` (card, stat tile recipes)
  5. `./design/global.css` (module-only classes)
  6. `./app/App` (its CSS loads here)
  7. `@reiq/ui/styles/responsive.css` (LAST, so it wins the cascade)
- Then `createRoot(...).render(<StrictMode><App/></StrictMode>)`.

### Vite config (`ui/vite.config.ts`)

- `base: '/demand-forecasting/'`. Built asset URLs depend on it.
- Aliases: `@reiq/ui` to `packages/reiq-ui/src`, `@` to `ui/src`.
- `dedupe` react, react-dom, router, carbon, icons, axios.
- One extra chunk `react-vendor` for React and the router.
- Dev server: port 3004, `strictPort`. Proxies:
  - `/demand-forecasting/api` to `127.0.0.1:4004` (prefix stripped)
  - `/auth/api` to `127.0.0.1:4001` (prefix stripped)
  - `/auth` to `localhost:3001`
  - manifest and icons at the root to hub on `localhost:3000`

### Provider tree (`src/app/App.tsx`, `AppProviders.tsx`)

```text
ThemeProvider                    (@reiq/ui)
  QueryClientProvider            retry 1, staleTime 60s, no focus refetch
    AuthProvider                 (@reiq/ui)
      AppStateProvider           levers, drawers, model, tab memory
        BrowserRouter            basename = import.meta.env.BASE_URL
          ToastProvider          (@reiq/ui)
            Root
```

### Root

- `AppScaffold label="Demand Forecasting" chatPane={<DemandChatPane/>}`
  gives the top bar and the chat button.
- If `useAuth().accessDenied` is set, show `AccessDeniedPage` inside the
  scaffold. The top bar stays, so sign out and theme still work.
- Else: `DemandForecastingLayout` (the `ModuleShell` left rail) wraps
  `DataProvider`. Inside it: `TipProvider`, the `Routes`, and three
  overlays: `LeversDrawer`, `UseCasesModal`, `FestiveDrawer`.
- The dataset loads INSIDE the content pane. Chrome paints at once.
- Routes: `/` redirects to `/overview`. One route per screen. `*` also
  redirects to `/overview`.

### Screen registry (`src/screens/registry.tsx`)

One array `SCREENS` drives routes, left rail and header. Fields:

| Field | Meaning |
|-------|---------|
| id, path | route key and URL |
| title, subtitle | page title and description |
| group | crumb: Plan, Operate or Assist |
| icon | Carbon icon for the rail |
| Component | the screen |
| model | header shows the forecast-model picker |
| scenario | header shows "Scenario controls" button |
| useCases | header shows "Use cases" button |
| festive | header shows "Festive impact" button |
| filters | screen has page-level filters in the header |
| noModelViews | `?view=` values that hide the picker |
| tabbed | marker only. Nothing reads it. |

The six screens:

| Screen | Path | Group |
|--------|------|-------|
| Overview | `/overview` | Plan |
| Forecast & accuracy | `/forecast` | Plan |
| New products | `/new-products` | Plan |
| Supply & inventory | `/supply` | Operate |
| Channels & events | `/channels` | Operate |
| Guide | `/guide` | Assist |

### Page wrapper (`Page` in `App.tsx`)

- Renders `PageHeader`, then the screen inside a div.
- The div gets class `pulse-refresh` and `aria-busy` while
  `levBusy || refetching` is true. Old numbers stay on screen.
- It makes two React contexts for the screen:
  - `ToolbarSlot`: a DOM node in the header. `PageFilters` portals into it.
  - `SubNavSlot`: a DOM node at the right end of the tab row.

### Header (`src/layouts/PageHeader.tsx`)

Built on the shared `ModulePageHeader`. It sets the document title.

- Crumb: the group name. Title and description from the registry.
- Toolbar, in this order:
  1. Filter slot (screen filters) and `ModelPicker` at the row end.
  2. Red Tag "Backtest figures: <model>" when the forecast model and the
     backtest model differ.
  3. Purple dismissible Tag "Festival: <name> - <date>".
  4. Teal dismissible Tag "Scenario: <preset or N levers changed>".
- Actions (tertiary, size md, icon only on phone): Use cases, Festive
  impact, Scenario controls. Each shows only if the screen asks.
- The toolbar hides when empty (CSS `:has` rule in `PageHeader.css`).

### Tabs, URL and memory

- `SubNav` is Carbon `Tabs`. Tab = `?view=` in the URL (`useView`).
  It uses `replace`, so Back does not fill with tab clicks.
- `useTabState(key, initial)` is `useState` that survives a screen
  switch. Memory only (a ref in `AppState`). A reload clears it.
- Rule used here: URL for things to share (view, week, table sort).
  Tab memory for filter choices.

### Config (`src/config/env.ts`)

- `moduleLabel`, `demandForecastingApiUrl = '/demand-forecasting/api'`,
  `hubUrl`, `authApiUrl`, `reiqLoginUrl`, `authEnabled`.
- Only `VITE_AUTH_ENABLED=false` is read from the environment.

## What it will not do

- No third page shape. All six screens are "Full width, one scroll pane".
- No per-screen providers. One data provider serves all screens.

## How

To copy the shell: copy `main.tsx` order, `AppProviders`, `App`,
`registry.tsx`, `PageHeader`, `SubNav`, `useView`, slots. Then edit
`SCREENS`. Part 9 has the full steps.

## Update notes

- 2026-10-13: created. Hand-off reference for the next module.

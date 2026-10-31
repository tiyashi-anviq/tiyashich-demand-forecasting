# Feature: Demand Forecasting UI building blocks

The cards, KPI tiles, filters, charts and table every screen is made of.

Part 4 of 9. Files are under `modules/demand-forecasting/ui/src`.

## Why

- Screens are thin. They pick data and call these parts.
- One part per job. Copy the parts, and screens come out the same.

## What it does

### Screen anatomy

Every screen body follows this order:

1. `SubNav` tabs (if the screen has views).
2. Filters. In the header via `PageFilters`, or in a `Ctl` row.
3. A row of `Kpi` tiles in a `grid gN`.
4. `Card`s holding a chart or a table. Rows of cards use `grid g2/g3`.

### `components/Controls.tsx`

| Part | Job |
|------|-----|
| `Card` | titled surface, (i) help, chart switch slot |
| `Kpi` | stat tile with (i) and number tags |
| `SelectCtl` | pick one value: Dropdown or ComboBox |
| `SegCtl` | 2 to 5 views, no URL change |
| `Ctl` | the filter row wrapper (`.ctl`) |
| `Chip` | small Tag: neutral, good (green), bad (red) |

- `SelectCtl`: up to 8 options is a Carbon `Dropdown`. More is a
  searchable `ComboBox`. Both size `sm`. `all="All x"` adds an ALL
  option. In a ComboBox "All" is the placeholder and clearing means ALL.
  Props `wide` (more width) and `end` (fixed width, right end).
- `SegCtl`: Carbon `ContentSwitcher` size `sm`, class `df-switcher`.
  With a `label` it sits in a labelled group so it lines up with fields.
- `Card`: props `title, note, id, info, infoText, children`.
  - A string title finds its help text in the glossary by name.
  - `info` names a glossary key. `infoText` is built help text.
  - It renders an empty slot span in the title row. Charts portal
    their Chart/Table switch into it through `CardSlot`.
- `Kpi`: props `l` label, `v` value, `d` sub line, `cls` (`pos`/`neg`
  colours the value), `info`, `dTone`. It wraps the shared `StatTile`.
  A string `d` goes through `NumberBadges`: each figure becomes a gray
  Tag (green or red with `dTone`). The +/- sign carries direction.

### `components/DataTable.tsx` (the one table)

- Carbon table parts, size `sm`, sortable headers, shared
  `TablePagination`, optional `SearchField`.
- Column: `{ k, l, n?, f?, txt? }`. `n` right-aligns a number. `f` renders
  a cell. `txt` is what search matches when `f` returns markup.
- Props: `cols, rows, per, search, maxh, sort, dir, onRow, title, noun`.
- Search, sort, page and size live in the URL. Each table has a stable
  id from a hash of its column keys: `<id>q`, `<id>s`, `<id>d`,
  `<id>Page`, `<id>Size`. A change resets to page 1. Uses `replace`.
- Missing values sink to the bottom for either sort direction.
- `onRow` makes rows clickable (click, Enter, Space) and focusable.
- Empty: `EmptyState` with a cause and a fix. Never a bare empty body.
- Page sizes: `per`, then 25, 50, 100 (those larger than `per`).

### Charts (all Carbon Charts)

Shared base (`lib/chartData.ts`, `useChartBase`):
`resizable`, height `CHART_HEIGHT` (token 260 px), theme `g10`/`g100`
from `useTheme`, toolbar off. One height keeps cards in a row level.

Time axis: `xAxisOf(labels)` reads labels like `05 Oct 25` or `Oct '25`
as dates (time axis). `Wk 12` makes a numeric axis. Else category axis.

| Part | Use |
|------|-----|
| `LineChart` | most trends. Config object `LineCfg` |
| `ForecastChart` | the one big actual-vs-forecast chart |
| `BarChart` | grouped or stacked bars. Config `BarCfg` |

`LineCfg`: `id, labels, series[{name,color,data,dash,w}], bands, marks,
yfmt, tfmt, ylabel, yzero, ymax, hidden, tipLabels, explain, title, h`.
- A `band` or `mark` becomes a labelled vertical threshold line at its
  start. Carbon draws lines, not shaded ranges.
- Points show only when there are 40 labels or fewer.
- Y domain: `niceDomain` (rounded ticks) unless `yzero:false`.
- `explain: {weeks}`: a click on the plot picks the nearest week and
  goes to `/forecast?week=<iso>` (`lib/chartClick.ts`, `weekAtClick`).

`ForecastChart`: no points, no bands, thresholds for "Forecast starts",
"Selected week" and the festival. Y axis does not start at zero. A zoom
slider on top opens on `focus=[i0,i1]`. Legend click hides a line.
`hidden` starts lines off (Budget). `onPickWeek` sets `?week=`.

`BarChart`: if there are over 7 categories, or label text over 56
characters, bars turn horizontal and the chart grows (max 900 px).
Bar width steps 64/48/32 px by count. `tipExtra(i)` adds tooltip text.
`table` swaps in a richer table behind the Table switch.

Colours: `COL(i)` returns `var(--reiq-chart-<1..8>)`. Never a hex.
Colour is never the only cue: lines also differ by dash and name.

### `components/ChartFrame.tsx`

- Every chart sits in a frame with a Chart | Table `ContentSwitcher`.
- The table is the chart's own data (`lib/chartTable.ts`): first column
  is x, then one numeric column per series. Or `cfg.table` if given.
- No data: `ChartEmpty` says what to do, at chart height.

### Loading (`components/Skeletons.tsx`)

- `PageSkeleton`, `KpiRowSkeleton(count)`, `CardSkeleton`,
  `ExplainSkeleton`. Same grid, tile and chart height as the real thing.
- Each has `role="status"`, `aria-busy`, and a label.
- Refetch in place uses class `pulse-refresh` instead.

### Help and numbers

- `components/Info.tsx`: (i) button, Carbon `Toggletip`, label
  "About <label>". `Labelled` keeps the last word with the icon.
- `lib/glossary.ts`: `INFO` map of plain text per card or stat. Lookup
  `infoFor`: exact, then the longest key at start, end or middle.
- `lib/format.ts`: `fN` (en-IN grouping, `L` lakh, `Cr` crore), `fK`
  (axis, `k`/`L`/`Cr`), `fP` percent, `fS` signed percent, `mlab`,
  `dlabOf`, `addArr`, `sum`, `COL`, `niceTicks`. Null prints `-`.
- `Tip.tsx` and `useTip.ts`: a fixed tooltip for hand-drawn cells
  (heatmap). It flips near the screen edge.
- `UseCaseTile.tsx`: Carbon `ClickableTile` that is a real link.

### Module CSS (`src/design/global.css`)

- Colours `--reiq-*`. Spacing and type `--cds-*`. No literals.
- Grid: `.grid` plus `.g2 .g3 .g4 .g5`. It auto-fills columns with
  no media query. Tiles in one row share label, value and sub-line
  rows (CSS subgrid), so figures line up.
- `.ctl` filter row. `.df-subnav` tab row. `.callout`, `.note`,
  `.legend`, `.tip`, `.df-info`, `.df-table`, `.card-head`.
- Bold stops at semibold (600).

## What it will not do

- No chart colour outside `COL()`. No second table component.
- No chart taller than 260 px, except long horizontal bar lists.

## How

Copy `components/`, `lib/`, `design/global.css`. Then change glossary
text and `COL` mapping only.

## Update notes

- 2026-10-13: created. Hand-off reference for the next module.

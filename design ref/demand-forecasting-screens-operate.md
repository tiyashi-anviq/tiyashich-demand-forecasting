# Feature: Demand Forecasting screens, Operate and Assist groups

Supply and inventory, Channels and events, and the Guide: every view.

Part 6 of 9. Files are under `ui/src/screens`.

## Why

- A builder can rebuild each screen from this list.

## What it does

Terms: OTIF = on time and in full. MOQ = minimum order quantity. Cover =
closing stock divided by weekly demand, in weeks. The "hidden test
window" band marks the last 13 weeks, where actuals are withheld.

### Supply and inventory (`/supply`, `supply/Supply.tsx`)

No header actions. Five tabs, each a function in one file.

**Depot stock and cover** (`?view=cover`, default)
- Filters: Depot, Product, Week starting (history weeks, newest first).
  State `supply:depot`, `supply:prod`, `supply:week`. Defaults: `tar`,
  `cvt`, last history week.
- 4 KPIs: Weeks of cover (red under 0.6), Closing stock, Safety stock,
  Weeks below safety stock.
- Card "<Depot> - <Product>": lines Closing stock, Safety stock (dashed),
  Weekly demand, Opening stock (starts hidden).
- Card "Weeks of cover heatmap" (`Heatmap.tsx`): products in rows,
  5 depots in columns. A real Carbon table. Each cell is one button
  that sets Depot and Product above. Colour:
  - under 0.6 weeks: error colour, 55 % mix (stock-out risk)
  - 0.6 to 3: neutral border colour, 14 % mix
  - over 3: `--reiq-chart-1`, 55 % mix (over-stocked)
  Legend swatches repeat the three bands in words.
  Colours use `color-mix(in srgb, <token> N%, transparent)`.

**Replenishment and OTIF** (`?view=repl`)
- KPIs: OTIF, On time, In full, Fill rate (with average lead time).
- Cards: monthly OTIF lines, delay reasons (bars, names shortened to 30
  characters, full text in tooltip), by depot, by truck slot, planned
  vs actual day, by category table.

**Plant capacity** (`?view=plant`)
- Filter: Product. KPIs: Production ask, Allocated, Lost sales,
  Capacity used.
- Cards: production vs capacity (lines), allocation by channel and lost
  sales by channel (stacked bars, every 8th week). Order is
  B2C, then P1, then P2.

**Depot transfers** (`?view=trf`)
- KPIs: Transfers, Units moved, Value moved. One searchable table.
- Row = `[week, pid, product, from, fromCover, to, toCover, units,
  value, exp, slot]`.

**MOQ and price breaks** (`?view=moq`)
- KPIs: Captured, Foregone, Lots taken at break, Capture rate.
- Cards: monthly savings, by supply source, by product table.

### Channels and events (`/channels`, `channels/Channels.tsx`)

Five tabs. Each has a product, hub or event picker in the header.

- **Quick commerce** (`qc`): Hub and Partner filters. State `chan:qc`
  = `"<hub>|<partner>"`. KPIs: Over-ordering (orders / true demand),
  OTIF vs allocation, Shipped / ordered, Lost sales. Cards: orders vs
  demand vs shipped, OTIF parts, dark-store stock and returns, units by
  product (top 6, rest rolled into "Other products (n)"), all partner x
  hub table (row click loads it).
- **Delayed monsoon** (`mon`): Product filter. Demand with two bands:
  Monsoon delay shock (alert colour) and Recovery. Rainfall and dengue
  index chart.
- **Kolkata festivals** (`fest`): Product and Depot filters. Demand with
  one band per festival week. Festival calendar table (searchable).
- **Influencer test** (`inf`): Campaign filter. KPIs: Lift vs control,
  Incremental units, Spend, Cost per incremental unit. Test vs control
  lines with a Campaign band. All campaigns table.
- **Competitor actions** (`comp`): Event filter. KPIs: Peak hit
  Kolkata, Peak hit national, Units lost, Value lost. Demand vs budget
  vs baseline with a Competitor action band.

### Guide (`/guide`, `guide/Guide.tsx`)

Tabs: Start here, Where the data lives, Glossary and notes. All static.
- Start here: two cards of numbered steps (6 steps, 10-minute demo).
  Steps link to screens with `<Link>`.
- Data map: one table, use case -> screen -> source columns -> grain.
- Glossary and notes: a `dl` of 12 terms and five callouts. Callouts
  say the data is synthetic and the last 13 weeks are a hidden test
  window.

### Use cases (`lib/useCases.ts`)

- 19 entries `{ n, path, view, title, desc, anchor }`.
- `useGoUseCase`: navigate to `path?view=`, then after 120 ms scroll to
  the element with id `anchor`, else scroll the content pane to top.
- Shown as tiles on the modal. Anchors in code: `ovo`, `fch`, `ffl`,
  `fva`, `tlc`. Set as `id` on a `Card`.

## What it will not do

- No tab fetches its own data. Quick commerce, transfers and the rest
  are all read from the bundled JSON.
- Supply screen filters do not reach the URL. A reload resets them.

## Update notes

- 2026-10-13: created. Hand-off reference for the next module.

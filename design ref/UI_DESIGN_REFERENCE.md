# AnvIQ UI Design Reference

**Purpose:** this document is an exact extraction of how this app's UI is actually built — not
the aspirational rules in `docs/brand-kit/` and `the brand-kit rules`, but what the shipped code does,
file by file. Give this file to your AI assistant (with the same `--reiq-*` / `--cds-*` brand-kit tokens
already in the target project) to reproduce this app's look, feel and structure exactly, rather
than reinventing a different-looking Carbon UI from the same tokens.

Canonical reference module for most patterns: **`land-feasibility`** (most complete
implementation — collapsible sidebar, mobile drawer, sticky header, split-view shell). Where
another module diverges, it's called out explicitly under "Divergences."

Every finding below cites `file:line`. Read the cited file before copying a pattern — this
document is a map, not a substitute for the source.

---

## 0. Design Philosophy (why this app looks the way it does)

- **Carbon is used as a foundation, not a skin.** Where Carbon's own component doesn't fit the
  shape needed (a right-side drawer, a rail-style nav link), the team writes a hand-rolled
  component rather than forcing Carbon's component into a shape it wasn't built for — but it
  keeps Carbon's *tokens*, *spacing scale*, and *button semantics* throughout. See §5, §6.
- **One scroll surface per view, never `body`.** Every shell is built around exactly one
  `overflow-y: auto` pane, sized against `calc(100vh - var(--reiq-size-topbar))`. This is the
  single most load-bearing layout rule in the app — see §3.
- **Square corners, flat surfaces, minimal chrome.** No card, tile, drawer or badge in this app
  has a `border-radius` other than `0`. Hierarchy is carried by background tint
  (`--reiq-layer-*`), a hairline border (`--reiq-border-subtle`), and typography weight — never
  by rounding, drop shadow stacking, or color alone.
- **State transitions never blank the screen.** Loading states are shape-matched skeletons of
  the real layout (§8), not spinners; disabled states target only the one control that started
  the action (§6); a slide-in drawer/panel is the only "modal-like" surface, and even that keeps
  a single scroll container inside it (§5).

---

## 1. Navigation Rail / Sidebar

Custom implementation, **deliberately not Carbon's `SideNavLink`** — the code comment on why is
worth reading verbatim: *"A plain anchor, deliberately NOT Carbon's SideNavLink... spent about
ten `:global` overrides ... undoing its height, padding, margin, radius and `::before` accent."*
(`modules/land-feasibility/ui/src/design/components/ModuleSidebarLink.tsx:4-7`)

**Hierarchy:** `ModuleShell` (`design/layouts/ModuleShell.tsx:18-56`) renders either
`.module-shell-rail` (desktop) or `ModuleNavDrawer` (mobile, <672px) around a `<nav>` from
`ModuleSidebar` (`design/components/ModuleSidebar/index.tsx:33-45`), whose rows are
`ModuleSidebarLink` — a `react-router-dom` `NavLink`, not a `<button>`.

**Width & collapse**
- Expanded: `clamp(var(--reiq-size-sidebar-md), 18vw, var(--reiq-size-sidebar))` = clamp(13rem,
  18vw, 16rem) — `ModuleShell.css:18`
- Collapsed: `--reiq-size-sidebar-collapsed: 3rem` — `ModuleShell.css:28`
- Transition: `transition: flex-basis var(--reiq-motion-fast)` — `ModuleShell.css:24`
- Collapse state is **not persisted** (no localStorage). `useModuleRailCollapse()`
  (`app/AppShell/ModuleRailContext.tsx:61-74`) is plain `useState`, seeded once at mount from
  `matchMedia(max-width: 672px)`. It resets on every page load/module switch by design.

**Active item** — no left border, no accent bar. Purely background wash + weight + icon tint
(`ModuleSidebar.css:54-62`):
```css
.module-sidebar-link-active {
  background: var(--reiq-layer-01);
  font-weight: var(--reiq-weight-semibold);
  color: var(--reiq-text-primary);
}
.module-sidebar-link-active svg { color: var(--reiq-interactive-01); }
```
Hover: `background: var(--reiq-layer-hover)` (`ModuleSidebar.css:43-45`). No `:focus-visible`
override on the link itself — relies on the global `--reiq-focus` ring.

**Spacing / icon**
- Row padding: `var(--cds-spacing-03) var(--cds-spacing-06)` (`ModuleSidebar.css:36`)
- Icon–label gap: `var(--cds-spacing-03)` (`ModuleSidebar.css:32`)
- Icon size: fixed `16px`, passed as a prop (`ModuleSidebarLink.tsx:32`)
- Row-to-row gap in rail: `var(--cds-spacing-01)`; rail top/bottom padding `--cds-spacing-03` /
  `--cds-spacing-04` (`ModuleSidebar.css:4,7-8`)
- Collapsed: icon-only, centered, label unmounted, `title` attribute added for a11y
  (`ModuleSidebarLink.tsx:33`, `ModuleSidebar.css:64-68`)

**Grouping** — flat list by design; section labels and rows are siblings, not a nested
accordion, "to keep one consistent vertical rhythm" (`ModuleSidebar/index.tsx:8-14`).

**Positioning**
- Topbar: Carbon `<Header>`, `position: fixed`, height `3rem` = `--reiq-size-topbar`.
- `.module-shell-rail`: `position: sticky; top: 0; max-height: calc(100vh - var(--reiq-size-topbar)); overflow: hidden; border-right: 1px solid var(--reiq-border-subtle)` (`ModuleShell.css:17-25`)
- Content pane scrolls independently: `max-height: calc(100vh - var(--reiq-size-topbar)); overflow-y: auto` (`ModuleShell.css:35-44`)

**Mobile (<672px)** — `useIsMobile()` swaps the inline rail for `ModuleNavDrawer`: full overlay
(`position: fixed; inset:0`), slide-in animation, `z-index` 9500/9501. Same `collapsed`
boolean/hamburger drives both desktop-collapse and mobile-drawer-open
(`ModuleShell.tsx:11-15,45-51`). Route change auto-closes the mobile drawer
(`ModuleShell.tsx:36-40`).

**Divergences to NOT copy:** `hub` has no sidebar at all (topbar-only landing page).
`demand-forecasting` and `title-search` each still carry a legacy standalone sidebar component
(`DemandForecastSidebar.tsx`, `TitleSearchSidebar.tsx`) alongside the shared `ModuleSidebar` —
dead duplication, not an intentional variant. Build against the shared component only.

---

## 2. Header / Topbar / Page Title

**Topbar** — stock Carbon `<Header>`, no local height/bg/border override
(`app/AppShell/AppTopBar.tsx:16`). Height is Carbon's xl control size, 48px, confirmed by
`--reiq-size-topbar: 3rem`, which every shell subtracts from `100vh`.

- Brand block: `display:flex; align-items:baseline; gap: var(--cds-spacing-02)`
  (`AppTopBar.css:4-16`). In rail-based modules it's width-constrained to
  `calc(var(--reiq-size-sidebar) - var(--reiq-size-topbar))` so it lines up with the sidebar
  edge below it.
- Right side: Carbon `<HeaderGlobalBar>` → theme toggle → `<UserMenu>`
  (`AppTopBar.tsx:24-33,43-52`). Rail modules prepend a `<HeaderMenuButton>` that toggles the
  rail/drawer.

**Page title block** (`ModulePageHeader.css` — byte-identical across land-feasibility and
demand-forecasting-manufacturing):
```css
.module-page-title {
  margin: 0 0 var(--cds-spacing-02);
  font-size: var(--cds-heading-05-font-size);
  line-height: var(--cds-heading-05-line-height);
  font-weight: var(--reiq-weight-regular);   /* 400 — not Carbon's default light */
  color: var(--reiq-text-primary);
}
```
`heading-05` is the largest of the five sanctioned type steps — reserved for the page title,
nothing else on the page should use it.

**Breadcrumb (module pages, not hub's landing page)**
- Row: `display:flex; align-items:center; gap: var(--cds-spacing-04)` (`ModulePageHeader.css:37-43`)
- Carbon `<Breadcrumb noTrailingSlash size={isMobile ? 'sm' : 'md'}>`: hub-exit crumb (Apps
  icon) → module crumb → optional mid crumbs → current page.
- Hub instead shows a plain uppercase eyebrow (`label-01`, `--reiq-weight-semibold`,
  `letter-spacing: var(--reiq-letter-spacing-caps)` = 0.06em, color `--reiq-interactive-01`) since
  it has no parent to link back to.

**Title row + actions + subtitle**
- `.app-title-row`: flex row holding `<h1 className="module-page-title">` and
  `.module-page-header-actions` (`display:flex; align-items:center; gap: var(--cds-spacing-03)`).
- Subtitle (`.module-page-subtitle`, body-01) sits below the title; note a real, undocumented
  numeric divergence — `max-width: 54rem` in hub vs `42rem` in land-feasibility/dfm. Treat
  `42rem` as canonical for module pages, `54rem` only for hub's landing page.
- Optional `toolbar` slot renders below the subtitle, still inside the sticky box.

**Sticky behavior** — rail modules default `sticky = true`:
```css
.module-page-header-sticky {
  position: sticky;
  top: calc(-1 * var(--cds-spacing-03));
  z-index: 200;
  background: var(--reiq-ui-01);
}
```
Reverts to `position: static` under 672px. Hub's trimmed `ModulePageHeader` has no sticky logic,
no breadcrumb, no actions/toolbar slot — it's an intentionally reduced variant for a landing
page, not the pattern to copy for a data-bearing module page.

---

## 3. Page Shells — exactly three shapes, one scroller each

Every shell subtracts the fixed topbar height and puts `overflow-y: auto` on exactly one pane.
`body` never scrolls.

### Split view (persistent side pane, tabs share its data)
`modules/land-feasibility/ui/src/pages/LandFeasibilityLayout.tsx:250-290` wraps `ModuleShell`
around an `<Outlet/>`; the sidebar's own data (`useParameterGroups()`) is fetched once by the
layout and shared by every child route through the query cache — a tab re-fetching what its
shell already holds is treated as a bug, not a missing optimization.
```css
.module-shell        { min-height: calc(100vh - var(--reiq-size-topbar)); }
.module-shell-rail    { position: sticky; top: 0; max-height: calc(100vh - var(--reiq-size-topbar)); overflow: hidden; }
.module-shell-content { flex: 1; max-height: calc(100vh - var(--reiq-size-topbar)); overflow-y: auto; overflow-x: hidden; }
```
Content pane also carries `thin-scroll thin-scroll-strong` (`ModuleShell.tsx:42-55`).

### Full width (list/grid/analytics — content scrolls in its own pane)
```jsx
<div className="page-scroll-pane thin-scroll thin-scroll-strong">
  <Grid className="modules-hub">...
```
(`modules/hub/ui/src/pages/ModulesHubPage.tsx:78-81`, `AdminConsolePage.tsx:36-37`)
```css
.page-scroll-pane { max-height: calc(100vh - var(--reiq-size-topbar)); overflow-y: auto; overflow-x: hidden; }
```

### Focused (settings/filters/single-record, constrained width)
`modules/title-search/ui/src/pages/PlotDetailPage.tsx` — a bounded two-tile grid, not the full
list-page width:
```css
.title-search-detail-stack { /* mobile: single column */ }
@media (min-width: 672px) {
  .title-search-detail-stack {
    grid-template-columns: minmax(0,3fr) minmax(0,2fr);
    height: max(20rem, calc(100vh - 17rem));
  }
}
```
Height is computed against the viewport/header, not left to content — only the inner
khatians-list scrolls (`.title-search-detail-khatians-scroll.thin-scroll`); the outer tile
doesn't.

---

## 4. Drawers / Side Panels (slide in from the right)

**Not Carbon Modal/ComposedModal.** Hand-rolled, with the reasoning documented inline: *"a
full-height side panel with its own single scroll container, and Carbon has no side variant"*
(`SettingsDrawer.tsx:39-42`). `role="dialog" aria-modal="true"`, manual focus containment,
Escape-to-close on the capture phase, focus restored on close.

**Width** — uses a dedicated token, not the filter-rail width:
`width: var(--reiq-size-simulation-drawer)` = **40rem** (`settingsDrawer.css:28`), explicitly
*not* `--reiq-size-drawer` (20rem) and *not* `--reiq-size-filter-rail` (24rem). The token's own
comment states both "simulate" surfaces intentionally share this one value. `max-width: 92vw`;
at ≤671px, `max-width: 100vw`. `ModuleNavDrawer` (the mobile nav overlay) instead defaults to
`--reiq-size-sidebar` (16rem).

**Animation** — compliant with the one-duration rule:
```css
animation: dfm-drawer-in var(--reiq-motion-fast); /* translateX(100%) → translateX(0) */
```
wrapped in a `prefers-reduced-motion` guard collapsing duration to `0.01ms`.

**Overlay** — `position: fixed; inset:0; z-index:9500; background: var(--reiq-scrim-backdrop)`
(rgba(0,0,0,0.4)); `onClick={onClose}` on the backdrop (`role="presentation"`), plus Escape.

**Header** — flex row, `padding: var(--cds-spacing-05) var(--cds-spacing-06)`, bottom border
`1px solid var(--reiq-border-subtle)`. Title: `heading-03` size/line-height +
`--reiq-weight-semibold`. Subtitle: `body-01`, `--reiq-text-secondary`. Close control is a plain
`<button>` with Carbon's `Close` icon (not Carbon `IconButton`), fixed `2.5rem × 2.5rem`.

**Footer** — a separate `flex: none` block outside the scroll region (genuinely pinned), same
horizontal padding as the header, `border-top: 1px solid var(--reiq-border-subtle)`,
`background: var(--reiq-ui-01)`. Buttons are Carbon `Button` — primary action first, then
tertiary/ghost — `size="sm"`.

**Body** — `<div className="dfm-drawer-body thin-scroll thin-scroll-strong">` — the one scroll
container inside the panel; no nested scrollbars.

**Stacking** — backdrop `z-index: 9500`, panel `9501` — the same numeric tier used by
`ModuleNavDrawer`, by design ("both are app-level overlays that must sit above every sticky
in-page header"). Not tokenized as `--reiq-z-*`, but consistently reused across modules.

**Note:** `ScenarioDrawer`/`SettingsDrawer` and `ModuleNavDrawer` are duplicated per module
(dfm, land-feasibility, product-mix, title-search, demand-forecasting) with only class-prefix
differences (`dfm-` vs `lf-`) — copy-paste, not a shared package. When replicating in a new
project, implement it once.

---

## 5. Buttons & Actions

**Size tiers** (Carbon `size` prop — this codebase never literally writes `"xl"`; its "hero"
tier is `size="lg"`, 48px):
- `lg` (48px) — hero search rows only, e.g. `PlotSearchPanel.tsx:250,260`,
  `LocationSearchBlock.tsx:56,66`.
- `md` — standalone page-level actions outside dense forms, e.g. `PortfolioPage.tsx:25`.
- `sm` — the dominant tier: forms, cards, modals, toolbars, e.g.
  `WhatIfAnalysisPage.tsx:489`, `SimulationControls.tsx:127`, `ProductMixFilterRail.tsx:197`.

**Kinds**
- `primary` — the one committed action per surface.
- `secondary` — a real alternative action (approve/close pairs) — `NcrPanel.tsx:61,66`.
- `tertiary` — de-emphasized/nav-like actions (retry, cancel, "Back to sign in") —
  `SiteSimulationsCard.tsx:184`, `ForgotPasswordPage.tsx:45,62`.
- `ghost` — row-level/inline actions in dense contexts — `UsersPanel.tsx:163`,
  `NotificationBell.tsx:73`.
- `danger--ghost` / `danger--tertiary` — inline destructive row actions (not full `danger`) —
  `SpecificationTab.tsx:193`, `StageStepper.tsx:155`.
- Full `danger` — reserved for a confirmation **Modal**'s primary button (see below), never a
  bare inline button.

**Icon usage** — `renderIcon={Component}` is the only pattern used (icon precedes label, no
manual spacing wrapper). Icon-only controls are usually a plain `<button aria-label="...">`
rather than Carbon `IconButton`; the one real `IconButton` usage
(`ProductMixFilterRail.tsx:143-152`) uses its `label` prop as the accessible name.

**Async disabled state** — the rule is documented inline and should be followed exactly:
> *"InlineLoading REPLACES the button rather than sitting beside a disabled one — two controls
> saying the same thing reads as broken."* (`LoginPage.tsx:186-197`)

On submit, swap the `Button` for `<InlineLoading description="..." />` rather than graying the
button out. For a Modal's own footer button, `primaryButtonDisabled={mutation.isPending}` plus a
separate `InlineLoading` line is the accepted variant (`DeleteLocationModal.tsx:63-64`). Disable
only the control that started the action — don't cascade `disabled` onto sibling inputs unless
there's a real reason (LoginPage's cascading disable of the password field alongside the submit
button is called out as a deviation worth tightening, not a pattern to copy).

**Grouping/alignment** — modal/form footers right-align via `justify-content: flex-end`. Two
adjacent ghost icon buttons on a row deliberately get **no gap** — documented rationale: *"two
ghost icon buttons already carry their own hit padding, and spacing them further apart reads as
two unrelated controls"* (`landFeasibility.css:524-528`). Standard row gaps use
`var(--cds-spacing-03)`.

**Destructive action pattern** — confirmation `Modal` with `danger`, entity name embedded in the
confirmation sentence, `primaryButtonText="Delete"`, `secondaryButtonText="Cancel"`:
```jsx
<Modal danger open={...} modalHeading="Delete location" primaryButtonText="Delete"
  secondaryButtonText="Cancel" primaryButtonDisabled={remove.isPending} onRequestSubmit={...}>
```
(`DeleteLocationModal.tsx:46-53`)

**Avoid:** overriding Carbon's own `.cds--btn` class directly for custom padding/width
(`AuthCard.css:44-51`) — it works, but it's a fragile deviation from token-only theming. Prefer
a wrapper element instead of reaching into Carbon's internal class.

---

## 6. Cards / Tiles

**Record card** (e.g. `LocationCard.tsx:75-193`) — scan order is image → overlay badge/pin →
title+status+chevron → coordinates → primary metric row → secondary metadata row → overlay
action buttons:
```css
.lf-location-card { padding: 0; overflow: hidden; border: 1px solid var(--reiq-border-subtle); }
/* no border-radius set → Carbon/brand default of 0 applies */
.lf-location-card-thumb { aspect-ratio: 3 / 2; }
.lf-location-card-body { padding: var(--cds-spacing-04) var(--cds-spacing-05) var(--cds-spacing-05); }
```

**Generic tile grid** (`ModuleTile.css:14-37`):
```css
.tile-grid   { grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); }
.module-tile { border-left: 4px solid var(--reiq-interactive-01); min-height: 8rem; }
```
Internal order: icon → name → description (`flex: 1`) → footer with `border-top` and a trailing
chevron.

---

## 7. Loading / Empty / Error / Refetch states

**Loading is always shape-matched to the real layout**, never a generic spinner over blank
space:
```jsx
// PlotDetailPage.tsx:176-198 — mirrors the loaded two-tile grid exactly
<SkeletonText heading width="40%" />         {/* title */}
<SkeletonPlaceholder />                       {/* fact rows / map */}
<DataTableSkeleton columnCount={5} rowCount={3} />  {/* inside the SAME .table-scroll.thin-scroll wrapper the real table uses, so nothing shifts once real content lands */}
```
Sidebar-shape loading uses fixed-width `SkeletonText` rows matched to collapsed/expanded state
(`LandFeasibilityLayout.tsx:351-355`). `InlineLoading` is reserved for unknown-shape loading
(e.g. a full-page auth check: `LoginPage.tsx:104`).

**Empty state** — a shared component, not ad hoc markup
(`design/components/EmptyState/index.tsx:32-58`):
```ts
{ icon: CarbonIconType, title: string, message?: string, action?: ReactNode,
  tone?: 'brand' | 'danger', children?: ReactNode }
```
`border-radius: 0`, `min-height: 40vh`. Used with a resolving action (e.g. icon `Location`,
title "Pick a parcel to begin", primary Button linking back — `LandFeasibilityLayout.tsx:274-283`)
or bare with no action where there's nothing to resolve.

**Error**
```jsx
<InlineNotification kind="error" title="Couldn't load plot detail" subtitle={loadError}
  lowContrast hideCloseButton />
```
(`PlotDetailPage.tsx:200-207`). States what failed, never a raw status code. A sidebar-scoped
variant adds a Retry button since it must coexist with the still-rendered static rail rows
(`LandFeasibilityLayout.tsx:361-370`).

**Refetch-in-place** — `.pulse-refresh` (`global.css:33-40`), `animation: pulse-refresh 1s
ease-in-out infinite`, keyframes fade opacity 1 → 0.55 → 1. Apply this to stale-but-still-visible
values while refetching; never collapse a populated view back to skeleton on a filter change.

**`.thin-scroll`** (`global.css:87-120`) — the class every independently-scrolling pane must
carry: `scrollbar-width: thin; scrollbar-color: var(--reiq-scrollbar-thumb) transparent;`
WebKit thumb `border-radius: 999px`, width `3px` (`.thin-scroll-strong` → `5px`), hover color
`var(--reiq-text-helper)`.

---

## 8. Checklist for matching this design in a new project

1. Import the same `--reiq-*`/`--cds-*` tokens (already shared) — never invent a new hex, radius,
   breakpoint, or duration.
2. Build one shell primitive with a fixed topbar (`--reiq-size-topbar`, 48px) and exactly one
   `overflow-y: auto` content pane per view, sized off `calc(100vh - var(--reiq-size-topbar))`.
3. Build the sidebar as a plain anchor list (not Carbon `SideNavLink`), active state = background
   wash + semibold + tinted icon, no accent bar. Don't persist collapse state.
4. Build the page-title block at `heading-05` / `--reiq-weight-regular`, breadcrumb above it,
   actions row beside it, subtitle capped at `42rem`, sticky at `z-index: 200`.
5. Any right-side panel is hand-rolled (not Carbon Modal), `--reiq-motion-fast` slide-in,
   `--reiq-scrim-backdrop` overlay, single `thin-scroll` body, pinned footer with right-aligned
   Carbon buttons, `z-index` 9500/9501 tier.
6. Buttons: `sm` inside forms/cards/toolbars, `lg` only for a hero search row, `renderIcon` for
   icon+label, `InlineLoading` *replacing* (not beside) a button during its own async action,
   `Modal danger` for destructive confirmation.
7. Cards/tiles: `border-radius: 0` always, hairline `--reiq-border-subtle` border, scan order
   image → primary metric → secondary metadata.
8. Every data surface: shape-matched skeleton, shared `EmptyState` component, `InlineNotification
   kind="error"`, and `.pulse-refresh` on refetch — never a bare spinner, a generic "no results"
   string, or a flash-to-empty on filter change.
9. Don't copy the inconsistencies flagged above (hub's missing sidebar/breadcrumb, the legacy
   duplicate sidebars in demand-forecasting/title-search, the `42rem`/`54rem` subtitle-width
   mismatch, the `.cds--btn` override in AuthCard) — they're drift in this codebase, not intended
   variants.

import { createContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CarbonIconType } from '@carbon/icons-react'
import { useLocation } from 'react-router-dom'
import { RailCollapsedContext, useModuleRailCollapse, useModuleRailState } from './ModuleRailContext'
import { ModuleSidebar } from './ModuleSidebar'
import { ModuleSidebarLink } from './ModuleSidebarLink'
import { useIsMobile } from '../hooks/useIsMobile'
import { ModuleNavDrawer } from './ModuleNavDrawer'
import './ModuleShell.css'

/** The two-column module shell. Geometry here is load-bearing for every module
 *  page - see 00-foundation.md section 3.1 before changing any of it.
 *
 *  Below the app's one breakpoint the rail is not a narrower/hidden sibling
 *  column any more - there is nowhere for it to go inline - it moves into a
 *  ModuleNavDrawer overlay, opened by the same hamburger/`collapsed` state
 *  the desktop rail already uses (`collapsed: false` still means "the rail is
 *  open", now as "the drawer is open" instead of "the rail is expanded").
 *
 *  An app passes its places as `nav`, or its own rail as `sidebar` (built from ModuleSidebar
 *  and ModuleSidebarLink) when the rail needs sections or live data. The collapsed state is
 *  this shell's own; the top bar's hamburger reaches it through ModuleRailContext. */
/** The pinned strip at the top of the content pane. ModulePageHeader portals its compact title
 *  bar into it once the page's own title scrolls away. Null outside a ModuleShell: the header
 *  then pins whole, as before. */
export const PageBarSlotContext = createContext<HTMLDivElement | null>(null)

export interface NavItem {
  to: string
  label: string
  icon: CarbonIconType
  /** Active only on an exact match (a home route that prefixes every other). */
  end?: boolean
}

/** Marks each `.tabs-sticky` row in the pane `data-pinned` while it is stuck under the page bar,
 *  so it can span the full pane only then (ModulePageHeader.css). CSS cannot ask "am I stuck"
 *  in every browser yet (scroll-state container queries are Chromium only). Cheap: a handful of
 *  rows, one rect each, on scroll. */
function markPinnedRows(event: { currentTarget: HTMLElement }) {
  const pane = event.currentTarget
  // Sticky offsets count from inside the pane's padding, not from its border.
  const paneTop = pane.getBoundingClientRect().top + (parseFloat(getComputedStyle(pane).paddingTop) || 0)
  pane.querySelectorAll<HTMLElement>('.tabs-sticky').forEach((row) => {
    const stickyTop = parseFloat(getComputedStyle(row).top) || 0
    const pinned = pane.scrollTop > 0 && row.getBoundingClientRect().top - paneTop <= stickyTop + 1
    row.toggleAttribute('data-pinned', pinned)
  })
}

export function ModuleShell({
  label,
  nav,
  sidebar,
  aside,
  asideOpen = false,
  onAsideClose,
  asideLabel = 'Filters',
  children,
}: {
  /** The module's name; labels the rail for screen readers. */
  label: string
  nav?: NavItem[]
  sidebar?: ReactNode
  /** A right-hand panel, e.g. a filter rail: a column beside the content on desktop (it narrows
   *  the content, covers nothing), a drawer from the right on mobile. It brings its own header
   *  and close button. Shown while `asideOpen`. */
  aside?: ReactNode
  asideOpen?: boolean
  onAsideClose?: () => void
  /** Names the aside for screen readers, e.g. "Amenities filter". */
  asideLabel?: string
  children: ReactNode
}) {
  const collapsed = useModuleRailCollapse()
  const isMobile = useIsMobile()
  const rail = useModuleRailState()
  const { pathname } = useLocation()
  const previousPathname = useRef(pathname)
  const [pageBarSlot, setPageBarSlot] = useState<HTMLDivElement | null>(null)

  // Selecting a destination in the mobile drawer navigates but should also close it - otherwise
  // the new page loads underneath a drawer the visitor now has to dismiss by hand. Keyed off the
  // route actually changing, not the click itself, so it also closes for a link rendered inside
  // the sidebar's own content, not just ModuleSidebarLink specifically.
  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    if (isMobile && !collapsed) rail?.toggle()
  }, [pathname, isMobile, collapsed, rail])

  const railContent = sidebar ?? (
    <ModuleSidebar label={`${label} navigation`}>
      {nav?.map((item) => (
        <ModuleSidebarLink key={item.to} href={item.to} label={item.label} icon={item.icon} end={item.end} />
      ))}
    </ModuleSidebar>
  )

  return (
    <RailCollapsedContext.Provider value={collapsed}>
    <PageBarSlotContext.Provider value={pageBarSlot}>
    <div className="module-shell">
      <div className="module-shell-body">
        {isMobile ? (
          <ModuleNavDrawer open={!collapsed} onClose={() => rail?.toggle()} ariaLabel="Module navigation">
            {railContent}
          </ModuleNavDrawer>
        ) : (
          <div className={`module-shell-rail${collapsed ? ' module-shell-rail-collapsed' : ''}`}>{railContent}</div>
        )}
        <div className="module-shell-content thin-scroll thin-scroll-strong" id="main-content" onScroll={markPinnedRows}>
          <div ref={setPageBarSlot} className="module-shell-page-bar" />
          {children}
        </div>
        {aside && asideOpen && !isMobile ? <div className="module-shell-aside">{aside}</div> : null}
        {aside && isMobile ? (
          <ModuleNavDrawer
            open={asideOpen}
            onClose={() => onAsideClose?.()}
            ariaLabel={asideLabel}
            anchor="right"
            showClose={false}
            width="var(--reiq-size-filter-rail)"
          >
            {aside}
          </ModuleNavDrawer>
        ) : null}
      </div>
    </div>
    </PageBarSlotContext.Provider>
    </RailCollapsedContext.Provider>
  )
}

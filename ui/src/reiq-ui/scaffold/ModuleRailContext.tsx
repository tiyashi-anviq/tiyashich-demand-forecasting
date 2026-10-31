import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { layout } from '../brand/tokens'

/** Below the app's one breakpoint, a module's rail renders INLINE ABOVE its content rather than
 *  beside it (ModuleShell.css / the module's own shell CSS, `max-width: 671px`) - there is no
 *  room for a side column. A rail that starts expanded there forces a mobile visitor to scroll
 *  past the whole nav (land-feasibility's runs to 16+ links once a site is selected) before
 *  reaching any actual page content. Read once, at mount, via a lazy initializer - not
 *  `useSyncExternalStore`'d to matchMedia - because this is a starting default, not a value that
 *  should snap shut on someone who opened the rail on a desktop window they then resize. */
function startsCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(`(max-width: ${layout.breakpoint.md})`).matches
}

/** "Child writes, distant ancestor reads": a module layout owns its own rail's
 *  collapsed state, but the control that flips it lives in the shared top bar,
 *  mounted far above any module route. This context is that channel - the same
 *  shape ModuleNavContext used before the global nav drawer it fed was removed.
 *
 *  Only ONE module rail is ever mounted at a time (routing guarantees that), so
 *  a single slot rather than a map keyed by module is enough. */
export interface ModuleRailState {
  collapsed: boolean
  toggle: () => void
}

interface ModuleRailContextValue {
  rail: ModuleRailState | null
  setRail: (value: ModuleRailState | null) => void
}

const ModuleRailContext = createContext<ModuleRailContextValue | null>(null)

export function ModuleRailProvider({ children }: { children: ReactNode }) {
  const [rail, setRail] = useState<ModuleRailState | null>(null)
  return (
    <ModuleRailContext.Provider value={{ rail, setRail }}>{children}</ModuleRailContext.Provider>
  )
}

/** Read side, for the top bar's hamburger. Null outside any module with a
 *  collapsible rail (the Projects hub, Account pages) - the hamburger hides
 *  itself then rather than controlling nothing. */
// eslint-disable-next-line react-refresh/only-export-components -- context + provider + its two hooks stay co-located
export function useModuleRailState(): ModuleRailState | null {
  return useContext(ModuleRailContext)?.rail ?? null
}

/** Write side AND the state itself, for a module layout with a collapsible
 *  rail. The layout does not keep its own `useState` for this - this hook IS
 *  that state, published to the shared top bar so its one hamburger can
 *  collapse whichever module's rail happens to be mounted. Clears on unmount,
 *  same reason as the old useModuleNav: leaving the module must not leave the
 *  hamburger wired to a toggle that no longer does anything.
 *
 *  Returns the current value so the layout can use it for its own render
 *  (passing `collapsed` into ModuleShell and the sidebar) without reading back
 *  through the context it just wrote to. */
// eslint-disable-next-line react-refresh/only-export-components
export function useModuleRailCollapse(): boolean {
  const [collapsed, setCollapsed] = useState(startsCollapsed)
  const toggle = useCallback(() => setCollapsed((value) => !value), [])
  const ctx = useContext(ModuleRailContext)
  const setRail = ctx?.setRail

  useEffect(() => {
    if (!setRail) return
    setRail({ collapsed, toggle })
    return () => setRail(null)
  }, [setRail, collapsed, toggle])

  return collapsed
}

/** Whether the mounted rail is icon-only. ModuleShell provides it; ModuleSidebarLink and any
 *  custom rail read it instead of having `collapsed` threaded through every row. */
// eslint-disable-next-line react-refresh/only-export-components
export const RailCollapsedContext = createContext(false)

// eslint-disable-next-line react-refresh/only-export-components
export function useRailCollapsed(): boolean {
  return useContext(RailCollapsedContext)
}

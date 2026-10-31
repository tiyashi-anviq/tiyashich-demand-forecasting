import { useState, type ReactNode } from 'react'
import { PageBarSlotContext } from './ModuleShell'
import './PageShell.css'

/** A page with no left rail (hub's tiles, the admin console): the same one
 *  scrolling pane, grey surface and page bar slot as ModuleShell's content pane,
 *  so ModulePageHeader renders as the same card with the same compact bar. Use
 *  ModuleShell when the page has a rail. */
export function PageShell({ children }: { children: ReactNode }) {
  const [pageBarSlot, setPageBarSlot] = useState<HTMLDivElement | null>(null)
  return (
    <PageBarSlotContext.Provider value={pageBarSlot}>
      <div className="page-shell page-scroll-pane thin-scroll thin-scroll-strong" id="main-content">
        <div ref={setPageBarSlot} className="module-shell-page-bar" />
        {children}
      </div>
    </PageBarSlotContext.Provider>
  )
}

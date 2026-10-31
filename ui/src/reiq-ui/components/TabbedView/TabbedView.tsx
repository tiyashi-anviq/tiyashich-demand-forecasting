import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '../../carbon'
import './TabbedView.css'

export interface TabDef {
  id: string
  label: string
  content: ReactNode
  /** Left out while false (a tab that only some data has). */
  show?: boolean
}

/** A page's sections as tabs. Tabs, not a ContentSwitcher: each is a section of the page and the
 *  choice is kept in the URL (?tab=), so a reload or a shared link lands on the same one. The row
 *  pins under the page bar (.tabs-sticky); `end` sits at its right edge. Only the open tab's
 *  content is rendered, so a closed tab's charts do not draw.
 *
 *  A page with filters pins its header toolbar under the page bar too; the tab row would pin on top
 *  of it. So the row measures the toolbar's pinned height (--tabbed-view-toolbar-pin) and pins right
 *  below it. */
export function TabbedView({ tabs, end }: { tabs: TabDef[]; end?: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const rowRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const row = rowRef.current
    const header = document.querySelector<HTMLElement>('.module-page-header')
    if (!row || !header) return
    const measure = () => {
      const toolbar = header.querySelector<HTMLElement>('.module-page-header-toolbar')
      // A hidden toolbar (a tab with no inputs) has no offset to measure and pins nothing.
      const pin = toolbar && toolbar.offsetParent ? header.offsetHeight - toolbar.offsetTop : 0
      row.style.setProperty('--tabbed-view-toolbar-pin', `${pin}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  const shown = tabs.filter((tab) => tab.show !== false)
  const selected = Math.max(0, shown.findIndex((tab) => tab.id === params.get('tab')))
  const select = (index: number) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('tab', shown[index].id)
        return next
      },
      { replace: true },
    )

  return (
    <Tabs selectedIndex={selected} onChange={({ selectedIndex }) => select(selectedIndex)}>
      <div ref={rowRef} className="tabbed-view-row tabs-sticky">
        <TabList aria-label="Sections">
          {shown.map((tab) => (
            <Tab key={tab.id}>{tab.label}</Tab>
          ))}
        </TabList>
        {end ? <div className="tabbed-view-end">{end}</div> : null}
      </div>
      <TabPanels>
        {shown.map((tab, index) => (
          <TabPanel key={tab.id} className="tabbed-view-panel">
            {index === selected ? tab.content : null}
          </TabPanel>
        ))}
      </TabPanels>
    </Tabs>
  )
}

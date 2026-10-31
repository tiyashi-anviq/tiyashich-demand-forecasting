import type { ComponentProps } from 'react'
import { TabList as CarbonTabList } from '@carbon/react'

/** The one tab strip for every app: Carbon's CONTAINED tabs - each tab a filled block with a divider
 *  between, the selected one lifted onto the page's layer with an accent line on top. Wrapping it
 *  here, behind the Carbon boundary, is what keeps every tab row in every module the same; a call
 *  site that needs the plain line style can still pass `contained={false}`. */
export function TabList({ contained = true, ...rest }: ComponentProps<typeof CarbonTabList>) {
  return <CarbonTabList contained={contained} {...rest} />
}

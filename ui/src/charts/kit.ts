import '@carbon/charts-react/styles.css'
import { useBrandTheme } from '@reiq/ui'
import { layout, themed } from '@reiq/ui/brand/tokens'

/** Every chart canvas is the one chart-card height, so cards in a row line up. */
export const CHART_HEIGHT = layout.size['chart-card-body']

export type Tone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type Series = { name: string; values: (number | null)[]; tone?: Tone }

/** Chart colours come from the brand tokens through themed(), re-read when the theme changes. They never go into a style attribute. */
export function useChartKit() {
  const theme = useBrandTheme()
  const tone = (n: Tone) => themed(`color.chart.${n}`, theme)
  const token = (path: string) => themed(path, theme)
  return {
    tone,
    token,
    base: {
      height: CHART_HEIGHT,
      resizable: true,
      theme: theme === 'dark' ? ('g100' as const) : ('g10' as const),
      toolbar: { enabled: false },
    },
  }
}

/** The same numbers as a table, for the Chart / Table switch: one row per x value, one column per series. */
export function seriesTable(xHead: string, x: string[], series: Series[], fmt: (n: number) => string): { headers: string[]; rows: (string | number)[][] } {
  return {
    headers: [xHead, ...series.map((s) => s.name)],
    rows: x.map((label, i) => [label, ...series.map((s) => (s.values[i] === null || s.values[i] === undefined ? '' : fmt(s.values[i] as number)))]),
  }
}

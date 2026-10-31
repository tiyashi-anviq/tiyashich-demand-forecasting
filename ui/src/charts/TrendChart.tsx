/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef } from 'react'
import { LineChart } from '@carbon/charts-react'
import { fmtN, monthDate } from '../lib/format'
import { CHART_HEIGHT, useChartKit, type Series, type Tone } from './kit'

export type TrendPoint = { group: string; index: number }

/** A line chart. Months and weeks are drawn on a real time axis; anything else (weeks from Diwali, rank) on a labels axis.
 *  The axis title carries the unit. `markers` draw a labelled line at a position; `onPick` makes every point
 *  clickable and says which series and which position was chosen. */
export default function TrendChart({
  x, series, kind = 'month', yTitle, yFmt = fmtN, zero = true, markers, onPick, label, pointsAlways, dotRadius = 3, noDots = false, height = CHART_HEIGHT, legend = true,
}: {
  x: string[]
  series: Series[]
  kind?: 'month' | 'week' | 'labels'
  yTitle: string
  yFmt?: (n: number) => string
  zero?: boolean
  markers?: { i: number; label: string }[]
  onPick?: (p: TrendPoint) => void
  label: string
  pointsAlways?: boolean
  /** Point size; a small value keeps a dense series readable while every point stays clickable. */
  dotRadius?: number
  /** No point markers at all, for a dense line where the markers hide the shape. The line is then not clickable. */
  noDots?: boolean
  /** Canvas height in pixels; a wide, dense series (weeks over two years) needs more than the standard card height. */
  height?: number | string
  /** false when the page draws its own switchable legend */
  legend?: boolean
}) {
  const { tone, token, base } = useChartKit()
  const ref = useRef<any>(null)
  const key = (i: number) => (kind === 'month' ? monthDate(x[i]) : kind === 'week' ? new Date(`${x[i]}T00:00:00Z`) : x[i])
  const data = useMemo(
    () => series.flatMap((s) => s.values.flatMap((v, i) => (v === null || v === undefined || !isFinite(v) ? [] : [{ group: s.name, key: key(i), value: v, index: i }]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, x, kind],
  )
  const thresholds = (markers ?? []).filter((m) => m.i >= 0 && m.i < x.length).map((m) => ({ value: key(m.i), label: m.label, fillColor: token('color.border.strong') }))
  const options: any = {
    ...base,
    height,
    title: '',
    accessibility: { svgAriaLabel: label },
    axes: {
      bottom: kind !== 'labels'
        ? { mapsTo: 'key', scaleType: 'time', title: kind === 'week' ? 'Week starting' : 'Month', thresholds, ticks: { number: 8 }, ...(x.length > 1 ? { domain: [key(0), key(x.length - 1)] } : {}) }
        : { mapsTo: 'key', scaleType: 'labels', thresholds: [] },
      left: { mapsTo: 'value', scaleType: 'linear', title: yTitle, includeZero: zero, ticks: { number: 5, formatter: (v: number) => yFmt(+v) } },
    },
    timeScale: { addSpaceOnEdges: 0 },
    grid: { x: { enabled: false } },
    points: { enabled: !noDots && (pointsAlways || onPick !== undefined || x.length <= 40), radius: dotRadius },
    legend: { enabled: legend && series.length > 1, truncation: { type: 'none' } },
    color: { scale: Object.fromEntries(series.map((s, k) => [s.name, tone((s.tone ?? ((k % 8) + 1)) as Tone)])) },
    tooltip: { truncation: { type: 'none' }, showTotal: false, valueFormatter: (v: number | string | Date) => (typeof v === 'number' ? yFmt(v) : v instanceof Date ? v.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : String(v)) },
  }
  useEffect(() => {
    const events = ref.current?.chart?.services?.events
    if (!onPick || !events) return
    const handler = (e: any) => { const d = e.detail?.datum; if (d) onPick({ group: d.group, index: d.index }) }
    events.addEventListener('scatter-click', handler)
    return () => events.removeEventListener('scatter-click', handler)
  })
  return <LineChart key={`${x.length}|${series.length}|${x[0]}`} ref={ref} data={data} options={options} />
}

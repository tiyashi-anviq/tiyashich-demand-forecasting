/* eslint-disable @typescript-eslint/no-explicit-any */
import { SimpleBarChart } from '@carbon/charts-react'
import { fmtN } from '../lib/format'
import { CHART_HEIGHT, useChartKit, type Tone } from './kit'

export type Bar = { label: string; value: number; tone?: Tone }

/** One bar per item. Horizontal for names, vertical for periods or ranges. The axis title carries the unit. */
export default function BarsChart({ items, horizontal, yTitle, xTitle, fmt = fmtN, label, domain, log }: {
  items: Bar[]; horizontal?: boolean; yTitle: string; xTitle?: string; fmt?: (n: number) => string; label: string; domain?: [number, number]; log?: boolean
}) {
  const { tone, base } = useChartKit()
  const data = items.map((b) => ({ group: b.label, value: b.value }))
  const value = { mapsTo: 'value', scaleType: log ? 'log' : 'linear', title: yTitle, ...(domain ? { domain } : {}), ticks: { formatter: (v: number) => fmt(+v) } }
  const names = { mapsTo: 'group', scaleType: 'labels', ...(xTitle ? { title: xTitle } : {}) }
  const options: any = {
    ...base,
    height: CHART_HEIGHT,
    title: '',
    accessibility: { svgAriaLabel: label },
    axes: horizontal ? { left: names, bottom: value } : { bottom: names, left: value },
    legend: { enabled: false },
    bars: { maxWidth: 48 },
    color: { scale: Object.fromEntries(items.map((b) => [b.label, tone(b.tone ?? 1)])) },
    tooltip: { valueFormatter: (v: number | string) => (typeof v === 'number' ? fmt(v) : String(v)) },
  }
  return <SimpleBarChart data={data} options={options} />
}

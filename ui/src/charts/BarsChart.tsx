/* eslint-disable @typescript-eslint/no-explicit-any */
import { SimpleBarChart } from '@carbon/charts-react'
import { fmtN } from '../lib/format'
import { CHART_HEIGHT, useChartKit, type Tone } from './kit'

export type Bar = { label: string; value: number; tone?: Tone }

/** One bar per item. Horizontal for names, vertical for periods or ranges. The axis title carries the unit. */
export default function BarsChart({ items, horizontal, yTitle, xTitle, fmt = fmtN, label, domain, log, barThickness = 48 }: {
  items: Bar[]; horizontal?: boolean; yTitle: string; xTitle?: string; fmt?: (n: number) => string; label: string; domain?: [number, number]; log?: boolean; barThickness?: number
}) {
  const { tone, base } = useChartKit()
  const data = items.map((b) => ({ group: b.label, value: b.value }))
  const positiveValues = items.map((item) => item.value).filter((v) => Number.isFinite(v) && v > 0)
  const valueDomain = domain ?? (log && positiveValues.length
    ? [Math.min(...positiveValues) / 1.5, Math.max(...positiveValues) * 1.3] as [number, number]
    : undefined)
  const logTicks = log && valueDomain
    ? (() => {
        const ticks: number[] = []
        for (let power = Math.floor(Math.log10(valueDomain[0])); power <= Math.ceil(Math.log10(valueDomain[1])); power++) {
          for (const multiple of [1, 2, 5]) {
            const tick = multiple * 10 ** power
            if (tick >= valueDomain[0] && tick <= valueDomain[1]) ticks.push(tick)
          }
        }
        return ticks
      })()
    : undefined
  const value = {
    mapsTo: 'value',
    scaleType: log ? 'log' : 'linear',
    title: yTitle,
    ...(valueDomain ? { domain: valueDomain } : {}),
    ticks: { ...(logTicks ? { values: logTicks } : {}), formatter: (v: number) => fmt(+v) },
  }
  const names = { mapsTo: 'group', scaleType: 'labels', ...(xTitle ? { title: xTitle } : {}) }
  const options: any = {
    ...base,
    height: CHART_HEIGHT,
    title: '',
    accessibility: { svgAriaLabel: label },
    axes: horizontal ? { left: names, bottom: value } : { bottom: names, left: value },
    legend: { enabled: false },
    bars: { maxWidth: barThickness },
    color: { scale: Object.fromEntries(items.map((b) => [b.label, tone(b.tone ?? 1)])) },
    tooltip: { valueFormatter: (v: number | string) => (typeof v === 'number' ? fmt(v) : String(v)) },
  }
  return <div className={log ? 'log-bars-chart' : undefined}><SimpleBarChart data={data} options={options} /></div>
}

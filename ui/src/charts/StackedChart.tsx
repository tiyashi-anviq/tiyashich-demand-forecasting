/* eslint-disable @typescript-eslint/no-explicit-any */
import { StackedBarChart } from '@carbon/charts-react'
import { fmtN } from '../lib/format'
import { CHART_HEIGHT, useChartKit, type Series, type Tone } from './kit'

/** Stacked columns, one stack per label. `share` shows each stack as a share of its total. */
export default function StackedChart({ labels, series, yTitle, xTitle, share, fmt = fmtN, label }: {
  labels: string[]; series: Series[]; yTitle: string; xTitle?: string; share?: boolean; fmt?: (n: number) => string; label: string
}) {
  const { tone, base } = useChartKit()
  const data = series.flatMap((s) => s.values.map((v, i) => ({ group: s.name, key: labels[i], value: v ?? 0 })))
  const options: any = {
    ...base,
    height: CHART_HEIGHT,
    title: '',
    accessibility: { svgAriaLabel: label },
    axes: {
      bottom: { mapsTo: 'key', scaleType: 'labels', ...(xTitle ? { title: xTitle } : {}) },
      left: { mapsTo: 'value', stacked: true, scaleType: 'linear', title: yTitle, ...(share ? { percentage: true } : {}), ticks: { formatter: (v: number) => (share ? `${v}%` : fmt(+v)) } },
    },
    legend: { enabled: series.length > 1, truncation: { type: 'none' } },
    bars: { maxWidth: 40 },
    color: { scale: Object.fromEntries(series.map((s, k) => [s.name, tone((s.tone ?? ((k % 8) + 1)) as Tone)])) },
  }
  return <StackedBarChart data={data} options={options} />
}

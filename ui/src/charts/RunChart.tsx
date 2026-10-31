/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react'
import { ComboChart } from '@carbon/charts-react'
import { fmtN, monthDate } from '../lib/format'
import { CHART_HEIGHT, useChartKit, type Series } from './kit'

/** Months on a time axis. Every series is a line except `dots`, which is drawn as large dots on top of the lines, so a series
 *  that sits within a percent or two of another (P50 against its forecast) can still be told apart. */
export default function RunChart({ x, series, dots, yTitle, yFmt = fmtN, label }: {
  x: string[]; series: Series[]; dots: string; yTitle: string; yFmt?: (n: number) => string; label: string
}) {
  const { tone, base } = useChartKit()
  const data = useMemo(
    () => series.flatMap((s) => s.values.flatMap((v, i) => (v === null || v === undefined || !isFinite(v) ? [] : [{ group: s.name, key: monthDate(x[i]), value: v }]))),
    [series, x],
  )
  const options: any = {
    ...base, height: CHART_HEIGHT, title: '', accessibility: { svgAriaLabel: label },
    axes: {
      bottom: { mapsTo: 'key', scaleType: 'time', title: 'Month', ticks: { number: 8 }, domain: [monthDate(x[0]), monthDate(x[x.length - 1])] },
      left: { mapsTo: 'value', scaleType: 'linear', title: yTitle, includeZero: false, ticks: { number: 5, formatter: (v: number) => yFmt(+v) } },
    },
    timeScale: { addSpaceOnEdges: 0 },
    comboChartTypes: [
      { type: 'line', options: { points: { enabled: true, radius: 3 } }, correspondingDatasets: series.filter((s) => s.name !== dots).map((s) => s.name) },
      { type: 'scatter', options: { points: { enabled: true, radius: 6, fillOpacity: 1, strokeWidth: 2 } }, correspondingDatasets: [dots] },
    ],
    grid: { x: { enabled: false } },
    legend: { enabled: true, truncation: { type: 'none' } },
    color: { scale: Object.fromEntries(series.map((s, k) => [s.name, tone((s.tone ?? ((k % 8) + 1)) as any)])) },
    tooltip: { showTotal: false, truncation: { type: 'none' }, valueFormatter: (v: number | string | Date) => (typeof v === 'number' ? yFmt(v) : v instanceof Date ? v.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(v)) },
  }
  return <ComboChart data={data} options={options} />
}

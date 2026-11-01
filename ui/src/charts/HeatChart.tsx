/* eslint-disable @typescript-eslint/no-explicit-any */
import { HeatmapChart } from '@carbon/charts-react'
import { CHART_HEIGHT, useChartKit } from './kit'

/** A grid of values, rows by columns. `diverging` runs from orange (low) through a neutral middle to blue (high). */
export default function HeatChart({ rows, cols, values, diverging, softDiverging = false, domain, fmt, label, legendTitle, legendTicks }: {
  rows: string[]; cols: string[]; values: (number | null)[][]; diverging?: boolean; softDiverging?: boolean; domain?: [number, number]; fmt: (n: number) => string; label: string; legendTitle: string; legendTicks?: number[]
}) {
  const { tone, token, base } = useChartKit()
  const data = rows.flatMap((r, i) => cols.flatMap((c, j) => (values[i]?.[j] === null || values[i]?.[j] === undefined ? [] : [{ group: r, key: c, value: values[i][j] as number }])))
  const lowColor = tone(2)
  const highColor = tone(1)
  const neutralColor = token('color.layer.01')
  const divergingColors = softDiverging
    ? [
        lowColor,
        `color-mix(in srgb, ${lowColor} 50%, ${neutralColor})`,
        `color-mix(in srgb, ${lowColor} 25%, ${neutralColor})`,
        neutralColor,
        `color-mix(in srgb, ${highColor} 25%, ${neutralColor})`,
        `color-mix(in srgb, ${highColor} 50%, ${neutralColor})`,
        highColor,
      ]
    : [lowColor, neutralColor, highColor]
  const options: any = {
    ...base,
    height: `max(${CHART_HEIGHT}, ${rows.length * 2 + 9}rem)`,
    title: '',
    accessibility: { svgAriaLabel: label },
    axes: { bottom: { mapsTo: 'key', scaleType: 'labels' }, left: { mapsTo: 'group', scaleType: 'labels' } },
    heatmap: { colorLegend: { title: legendTitle, type: diverging ? 'linear' : 'quantize' }, ...(domain ? { colorDomain: { min: domain[0], max: domain[1] } } : {}), divider: { state: 'auto' } },
    color: { gradient: { enabled: true, colors: diverging ? divergingColors : [neutralColor, highColor] } },
    tooltip: { valueFormatter: (v: number | string) => (typeof v === 'number' ? fmt(v) : String(v)) },
  }
  return (
    <div className="heat-chart">
      <HeatmapChart data={data} options={options} />
      {legendTicks && (
        <div className={`heat-color-legend${diverging ? ' heat-color-legend-diverging' : ''}`} role="img" aria-label={`${legendTitle}: ${legendTicks.map(fmt).join(', ')}`}>
          <span className="heat-color-legend-title">{legendTitle}</span>
          <div className="heat-color-gradient" aria-hidden="true" />
          <div className="heat-color-ticks" aria-hidden="true">
            {legendTicks.map((tick) => <span key={tick}>{fmt(tick)}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}

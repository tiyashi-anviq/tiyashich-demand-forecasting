/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef } from 'react'
import { ComboChart } from '@carbon/charts-react'
import { Button } from '@reiq/ui/carbon'
import { fmtN, monthDate } from '../lib/format'
import { CHART_HEIGHT, useChartKit, type Tone } from './kit'

export type RunLine = { name: string; values: (number | null)[]; tone: Tone; style: 'solid' | 'line' | 'dash' | 'dot' | 'dots' }

/** The run view: actual orders as a solid line, the run as a dashed line, the latest run dotted, and the median as large dots.
 *  Each series can be switched off from the legend under the chart, the selected month is marked, and clicking a point selects its month. */
export default function RunLines({ x, series, hidden, onToggle, selected, onSelect, yTitle, label }: {
  x: string[]; series: RunLine[]; hidden: Record<string, boolean>; onToggle: (name: string) => void; selected: string; onSelect: (m: string) => void; yTitle: string; label: string
}) {
  const { tone, base } = useChartKit()
  const ref = useRef<any>(null)
  const box = useRef<HTMLDivElement>(null)
  const shown = series.filter((s) => !hidden[s.name])
  const data = useMemo(
    () => shown.flatMap((s) => s.values.flatMap((v, i) => (v === null || v === undefined || !isFinite(v) ? [] : [{ group: s.name, key: monthDate(x[i]), value: v }]))),
    [shown, x],
  )
  const lines = shown.filter((s) => s.style !== 'dots').map((s) => s.name)
  const dots = shown.filter((s) => s.style === 'dots').map((s) => s.name)
  const options: any = {
    ...base, height: CHART_HEIGHT, title: '', accessibility: { svgAriaLabel: label },
    axes: {
      bottom: { mapsTo: 'key', scaleType: 'time', title: 'Month', ticks: { number: 8 }, domain: [monthDate(x[0]), monthDate(x[x.length - 1])],
        thresholds: [{ value: monthDate(selected), label: 'Selected month', fillColor: tone(8) }] },
      left: { mapsTo: 'value', scaleType: 'linear', title: yTitle, includeZero: false, ticks: { number: 6, formatter: (v: number) => fmtN(+v) } },
    },
    timeScale: { addSpaceOnEdges: 0 },
    comboChartTypes: [
      ...(lines.length ? [{ type: 'line', options: { points: { enabled: true, radius: 3 } }, correspondingDatasets: lines }] : []),
      ...(dots.length ? [{ type: 'scatter', options: { points: { enabled: true, radius: 4.5, fillOpacity: 1, strokeWidth: 1.5 } }, correspondingDatasets: dots }] : []),
    ],
    grid: { x: { enabled: false } },
    legend: { enabled: false },
    color: { scale: Object.fromEntries(series.map((s) => [s.name, tone(s.tone)])) },
    tooltip: { showTotal: false, truncation: { type: 'none' }, valueFormatter: (v: number | string | Date) => (typeof v === 'number' ? fmtN(v) : v instanceof Date ? v.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(v)) },
  }
  // dashed and dotted lines: Carbon draws every line solid, so the stroke pattern is set on each line's path by its series name
  useEffect(() => {
    const el = box.current
    if (!el) return
    const apply = () => el.querySelectorAll<SVGPathElement>('path.line').forEach((p) => {
      const g = ((p as any).__data__?.name ?? (p as any).__data__?.[0]?.group) as string | undefined
      const s = series.find((r) => r.name === g)
      p.style.strokeDasharray = s?.style === 'dash' ? '8 5' : s?.style === 'dot' ? '2 4' : ''
      p.style.strokeWidth = s?.style === 'solid' ? '3' : '2'
    })
    apply()
    const mo = new MutationObserver(apply)
    mo.observe(el, { childList: true, subtree: true })
    return () => mo.disconnect()
  })
  useEffect(() => {
    const events = ref.current?.chart?.services?.events
    if (!events) return
    const h = (e: any) => { const k = e.detail?.datum?.key; if (k instanceof Date) onSelect(`${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}`) }
    events.addEventListener('scatter-click', h)
    return () => events.removeEventListener('scatter-click', h)
  })
  return (
    <div className="stack-03">
      <div className="row-03" role="group" aria-label="Choose which lines to show">
        {series.map((s) => {
          const on = !hidden[s.name]
          return (
            <Button key={s.name} kind={on ? 'tertiary' : 'ghost'} size="sm" aria-pressed={on} onClick={() => onToggle(s.name)}>
              <span className={`line-swatch tone-${s.tone} ${s.style}${on ? '' : ' off'}`} aria-hidden="true" />{s.name}
            </Button>
          )
        })}
      </div>
      <div ref={box}><ComboChart ref={ref} data={data} options={options} /></div>
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef } from 'react'
import { LineChart } from '@carbon/charts-react'
import { Button } from '@reiq/ui/carbon'
import { fmtN, monthDate } from '../lib/format'
import { CHART_HEIGHT, useChartKit } from './kit'

type Line = { name: string; values: (number | null)[] }

/** Actual orders and the M3, M2 and M1 forecasts on one chart. The run that is selected is drawn in colour and the others in
 *  grey; selecting a run's name below the chart, or any point on its line, makes it the selected run. */
export default function RunPicker({ x, actual, runs, selected, onSelect, label }: {
  x: string[]; actual: (number | null)[]; runs: Line[]; selected: string; onSelect: (run: string) => void; label: string
}) {
  const { tone, base } = useChartKit()
  const ref = useRef<any>(null)
  const ACT = 'Orders received (actual)'
  const data = useMemo(() => [{ name: ACT, values: actual }, ...runs].flatMap((s) => s.values.flatMap((v, i) => (v === null || v === undefined || !isFinite(v) ? [] : [{ group: s.name, key: monthDate(x[i]), value: v }]))), [x, actual, runs])
  const options: any = {
    ...base, height: CHART_HEIGHT, title: '', accessibility: { svgAriaLabel: label },
    axes: {
      bottom: { mapsTo: 'key', scaleType: 'time', title: 'Month', ticks: { number: 8 }, domain: [monthDate(x[0]), monthDate(x[x.length - 1])] },
      left: { mapsTo: 'value', scaleType: 'linear', title: 'Orders received (units)', includeZero: false, ticks: { number: 5, formatter: (v: number) => fmtN(+v) } },
    },
    timeScale: { addSpaceOnEdges: 0 },
    grid: { x: { enabled: false } },
    points: { enabled: true, radius: 4 },
    legend: { enabled: false },
    color: { scale: { [ACT]: tone(1), ...Object.fromEntries(runs.map((r) => [r.name, r.name.startsWith(selected) ? tone(2) : tone(8)])) } },
    tooltip: { showTotal: false, truncation: { type: 'none' }, valueFormatter: (v: number | string | Date) => (typeof v === 'number' ? fmtN(v) : v instanceof Date ? v.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(v)) },
  }
  useEffect(() => {
    const events = ref.current?.chart?.services?.events
    if (!events) return
    const h = (e: any) => { const g: string | undefined = e.detail?.datum?.group; const r = runs.find((x2) => x2.name === g); if (r) onSelect(r.name.slice(0, 2)) }
    events.addEventListener('scatter-click', h)
    return () => events.removeEventListener('scatter-click', h)
  })
  return (
    <div className="stack-03">
      <LineChart ref={ref} data={data} options={options} />
      <div className="row-03" role="group" aria-label="Choose a run">
        <span className="legend-item"><span className="swatch swatch-1" aria-hidden="true" />Orders received (actual)</span>
        {runs.map((r) => {
          const on = r.name.startsWith(selected)
          return (
            <Button key={r.name} kind={on ? 'primary' : 'ghost'} size="sm" aria-pressed={on} onClick={() => onSelect(r.name.slice(0, 2))}>
              <span className={`swatch ${on ? 'swatch-2' : 'swatch-8'}`} aria-hidden="true" />{r.name}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

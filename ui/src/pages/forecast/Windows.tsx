/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { ContentSwitcher, Switch } from '@reiq/ui/carbon'
import { fmtN, fmtPct, fmtSigned, monthLong } from '../../lib/format'
import { queryOf, type Filters } from '../../lib/filters'
import { useView } from '../../lib/useView'
import TrendChart from '../../charts/TrendChart'
import { seriesTable } from '../../charts/kit'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { StatRow } from '../../ui/StatRow'
import { ViewShell } from '../../ui/ViewShell'

const RUNS = ['M3', 'M2', 'M1'] as const
const VIEWS = ['National', 'Family', 'Region', 'Channel'] as const
const READS: Record<string, string> = { M3: 'the last 3 months', M2: 'the last 2 months', M1: 'the last month' }
const TONE = { M3: 2, M2: 3, M1: 6 } as const

/** M3, M2 and M1 as the number of recent months each run reads. The actuals end at the last complete month and every run starts from there. */
export default function Windows({ f, onClear, only }: { f: Filters; onClear: () => void; only: (typeof RUNS)[number] }) {
  const R = [only] as const
  const [view, setView] = useState<(typeof VIEWS)[number]>('National')
  const q = useView<any>('forecast', 'vintages', queryOf(f, undefined, {}, false))
  return (
    <ViewShell query={q} errorTitle="Could not load the M3, M2 and M1 forecasts" onClear={onClear}>
      {(d) => {
        const w = d.window
        const last = w.context[w.context.length - 1]
        const fm: string[] = w.forecast_months.slice(0, 1)
        const x: string[] = [...w.context, ...fm]
        const nA = w.context.length
        const pad = (v: number[]) => [...v, ...fm.map(() => null)] as (number | null)[]
        const run = (r: string) => [...w.context.map((_: string, i: number) => (i === nA - 1 ? w.actual[i] : null)), ...w.runs[r].slice(0, 1)] as (number | null)[]
        const series = [
          { name: 'Orders received (actual)', values: pad(w.actual), tone: 1 as const },
          ...R.map((r) => ({ name: `${r} forecast`, values: run(r), tone: TONE[r] })),
        ]
        const tbl = seriesTable('Month', x.map(monthLong), series, (n) => String(Math.round(n)))
        const nat = w.national
        const acc = (r: string) => 1 - (nat[r].wape ?? 0)
        const p = (n: number | null | undefined) => (n === null || n === undefined ? '–' : fmtPct(n, 1))
        const rows: any[] = [
          ...R.map((r) => ({ name: `${r}, reads ${READS[r]}`, acc: acc(r), under: nat[r].under, over: nat[r].over, bias: nat[r].bias, steps: nat[r].steps })),
          { name: "Last year's number", acc: 1 - nat.last_year.wape, under: nat.last_year.under, over: nat.last_year.over, bias: nat.last_year.bias, steps: null },
        ]
        const cols: Col<any>[] = [
          { header: 'Run', cell: (r) => r.name },
          { header: 'Accuracy (%)', num: true, cell: (r) => p(r.acc), sort: (r) => r.acc },
          { header: 'Under-forecast (%)', num: true, cell: (r) => p(r.under), sort: (r) => r.under },
          { header: 'Over-forecast (%)', num: true, cell: (r) => p(r.over), sort: (r) => r.over },
          { header: 'Net bias (%)', num: true, cell: (r) => fmtSigned(r.bias, 1), sort: (r) => r.bias },
          ...[0, 1, 2].map((k): Col<any> => ({ header: `Accuracy, month ${k + 1} of the run (%)`, num: true, cell: (r) => (r.steps ? p(1 - r.steps[k]) : '–'), sort: (r) => (r.steps ? 1 - r.steps[k] : null) })),
        ]
        const dimRows: any[] = view === 'National' ? [{ label: 'National, whole selection', ...nat }] : view === 'Family' ? w.by_family : view === 'Region' ? w.by_region : w.by_channel
        const a = (r: any, k: string) => (r[k]?.wape === null || r[k]?.wape === undefined ? null : 1 - r[k].wape)
        const dimCols: Col<any>[] = [
          { header: view === 'National' ? 'View' : view, cell: (r) => r.label, sort: (r) => String(r.label).toLowerCase() },
          { header: 'Units in test months', num: true, cell: (r) => fmtN(r.units), sort: (r) => r.units },
          ...R.map((k): Col<any> => ({ header: `${k} accuracy (%)`, num: true, cell: (r) => (a(r, k) === null ? '–' : p(a(r, k))), sort: (r) => a(r, k) })),
          { header: "Last year's number (%)", num: true, cell: (r) => (a(r, 'last_year') === null ? '–' : p(a(r, 'last_year'))), sort: (r) => a(r, 'last_year') },
        ]
        return (
          <>
            <StatRow items={[
              { label: `${only} forecast for ${monthLong(w.forecast_months[0])} (units)`, value: fmtN(w.runs[only][0]), sublabel: `Reads ${READS[only]}. Est.` },
              { label: `${only} accuracy`, value: fmtPct(acc(only), 1), sublabel: `Under ${p(nat[only].under)}, over ${p(nat[only].over)}` },
              { label: "Last year's accuracy", value: fmtPct(1 - nat.last_year.wape, 1), sublabel: 'Same months, same method' },
            ]} />

            <ChartCard title={`${monthLong(fm[0])}: the M3, M2 and M1 forecasts`}
              subtitle={`Actuals end at ${monthLong(last)}. Each run starts from there and forecasts ${monthLong(fm[0])} from the months it reads: M3 the last 3 actual months, M2 the last 2, M1 only ${monthLong(last)}.`}
              label="Orders received to the last actual month, then the M3, M2 and M1 forecasts for the next month"
              headers={tbl.headers} rows={tbl.rows}
              chart={<TrendChart x={x} series={series} yTitle="Orders received (units)" yFmt={(n) => fmtN(n)} zero={false} pointsAlways
                markers={[{ i: nA, label: 'Forecast starts' }]} label="Orders received to the last actual month, then the M3, M2 and M1 forecasts" />}
              note={`${only} reads ${READS[only]}. It also knows the festival calendar, the month of the year and the same month last year. The shorter the window, the less of the recent pattern a run can see.`} />

            <DataCard id="acc" title="How accurate each run was" description={`Tested on ${monthLong(w.test_months[0])} to ${monthLong(w.test_months[w.test_months.length - 1])}, months each run had not seen. Every test month was forecast from 1, 2 and 3 steps out.`}
              cols={cols} rows={rows} itemsLabel="Rows per page" rowKey={(r) => r.name}
              note="Accuracy is 100% minus WAPE: the sum of the monthly misses divided by the units ordered. Under- and over-forecast are the two parts of the miss. Each run was refitted at every month using only the data up to that month." />

            <ContentSwitcher size="sm" selectedIndex={VIEWS.indexOf(view)} onChange={({ index = 0 }) => setView(VIEWS[index])}>
              {VIEWS.map((v) => <Switch key={v} name={v} text={v} />)}
            </ContentSwitcher>
            <DataCard id="views" title={view === 'National' ? 'National accuracy' : `Accuracy by ${view.toLowerCase()}`} description="Each row is added up over its own series, on the same test months"
              cols={dimCols} rows={dimRows} itemsLabel="Rows per page" rowKey={(r) => String(r.label)} />
          </>
        )
      }}
    </ViewShell>
  )
}

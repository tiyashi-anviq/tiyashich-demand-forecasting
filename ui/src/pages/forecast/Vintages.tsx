/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJson } from '../../lib/http'
import BarsChart from '../../charts/BarsChart'
import { Dropdown, InlineNotification, Tile, ContentSwitcher, Switch } from '@reiq/ui/carbon'
import { fmtN, fmtPct, fmtSigned, monthLong } from '../../lib/format'
import { queryOf, type Filters } from '../../lib/filters'
import { useView } from '../../lib/useView'
import RunLines, { type RunLine } from '../../charts/RunLines'
import { seriesTable } from '../../charts/kit'
import { G } from '../../lib/glossary'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { Delta, StatRow } from '../../ui/StatRow'
import { Findings } from '../../ui/Findings'
import { ViewShell } from '../../ui/ViewShell'

const RUNS = ['M3', 'M2', 'M1'] as const
const cutOff = (m: string, k: number) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - k, 0)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const VIEWS = ['National', 'Family', 'Region', 'Channel'] as const
/** Reference points from the CFO workbook: Eveready's own M3 accuracy today, and the industry range (about 80% at M3 rising to 90% at M1). */
const REF = { eveready: 0.68, industry: { M3: 0.8, M2: 0.85, M1: 0.9 } as Record<string, number> }
const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(0)} pts`

/** The sales team's forecast for the same run, when its file is on the same scale as the app's sales. */
function showTeamRun(d: any, run: string): number[] | null {
  return d.team?.like_for_like ? d.team.horizons[run].consensus : null
}


const daysIn = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()
const shiftM = (m: string, k: number) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

/** What was going on around the month: festivals, trade schemes and logged events, next to last month and the same month a year earlier. */
function MonthFacts({ month }: { month: string }) {
  const q = useQuery({ queryKey: ['month-facts', month], queryFn: () => getJson<any>(`/api/challenge/month-facts?month=${month}`), staleTime: 60_000 })
  if (!q.data) return null
  const d = q.data
  const rows = [d.month, d.last_month, d.last_year].map((x: any, i: number) => ({ ...x, which: ['This month', 'Last month', 'Same month last year'][i] }))
  const cols: Col<any>[] = [
    { header: 'Month', cell: (r) => `${r.which}, ${r.label}` },
    { header: 'Festivals', cell: (r) => (r.festivals.length ? r.festivals.map((f: any) => f.name).join(', ') : 'None') },
    { header: 'Trade scheme weeks', num: true, cell: (r) => r.scheme_weeks },
    { header: 'Average discount (%)', num: true, cell: (r) => (r.avg_discount === null ? '–' : r.avg_discount.toFixed(1)) },
    { header: 'Events logged', num: true, cell: (r) => r.events.length },
  ]
  return <DataCard id="facts" title="What was going on around the month" description="Festivals, trade schemes and events logged, for the selected month and the two months it is compared with" cols={cols} rows={rows} itemsLabel="Months per page" rowKey={(r) => r.month} />
}

/** The sales team's simulated numbers for the months still open (the month each run is about: October for M1, November for M2, December for M3), when its file is on the app's scale. */
function teamAhead(d: any, run: string): (number | null)[] | null {
  return d.team?.ahead?.[run] ?? null
}

export default function Vintages({ f, onClear, only }: { f: Filters; onClear: () => void; only?: (typeof RUNS)[number] }) {
  const [run, setRun] = useState<(typeof RUNS)[number]>(only ?? 'M3')
  const [view, setView] = useState<(typeof VIEWS)[number]>('National')
  const [vm, setVm] = useState<string | null>(null)
  const [basis, setBasis] = useState<'mom' | 'yoy'>('mom')
  const [hid, setHid] = useState<Record<string, boolean>>({})
  const q = useView<any>('forecast', 'vintages', queryOf(f, undefined, {}, false))
  return (
    <ViewShell query={q} errorTitle="Could not load the replayed forecasts" onClear={onClear}>
      {(d) => {
        const K = +run.slice(1)
        const ahead = `${K} month${K === 1 ? '' : 's'}`
        const a = d.accuracy.find((x: any) => x.horizon === run)
        const ms: string[] = d.months
        const acc1 = 1 - a.total.wape
        const p = (n: number | null) => (n === null ? '–' : fmtPct(n, 1))
        // one row per forecast being scored: this run, last year's number, and the sales team's same run
        const rows: any[] = [
          { name: `${run}, made ${ahead} before`, acc: acc1, ref: REF.industry[run], under: a.total.under, over: a.total.over, bias: a.total.bias, sku: 1 - a.sku.wape },
          { name: "Last year's number", acc: 1 - d.baseline.total.wape, ref: null, under: d.baseline.total.under, over: d.baseline.total.over, bias: d.baseline.total.bias, sku: 1 - d.baseline.sku.wape },
          ...(a.team ? [{ name: `Sales team ${run}`, acc: 1 - a.team.wape, ref: null, under: a.team.under, over: a.team.over, bias: a.team.bias, sku: null }] : []),
        ]
        const score: Col<any>[] = [
          { header: 'Forecast', cell: (r) => r.name },
          { header: 'Accuracy (%)', num: true, cell: (r) => fmtPct(r.acc, 1), sort: (r) => r.acc },
          { header: 'Industry (%)', num: true, cell: (r) => (r.ref === null ? '–' : fmtPct(r.ref, 0)), sort: (r) => r.ref },
          { header: 'Against industry', num: true, cell: (r) => (r.ref === null ? '–' : pts(r.acc - r.ref)), sort: (r) => (r.ref === null ? null : r.acc - r.ref) },
          { header: 'Under-forecast (%)', num: true, cell: (r) => p(r.under), sort: (r) => r.under },
          { header: 'Over-forecast (%)', num: true, cell: (r) => p(r.over), sort: (r) => r.over },
          { header: 'Net bias (%)', num: true, cell: (r) => fmtSigned(r.bias, 1), sort: (r) => r.bias },
          { header: 'By SKU, region and channel (%)', num: true, cell: (r) => (r.sku === null ? '–' : fmtPct(r.sku, 1)), sort: (r) => r.sku },
        ]
        const horizonRows: any[] = RUNS.map((h) => {
          const x = d.accuracy.find((y: any) => y.horizon === h)
          return { name: h, ahead: `${h.slice(1)} month${h === 'M1' ? '' : 's'} ahead`, acc: 1 - x.total.wape, ref: REF.industry[h], under: x.total.under, over: x.total.over, team: x.team ? 1 - x.team.wape : null }
        })
        const horizonCols: Col<any>[] = [
          { header: 'Forecast made', cell: (r) => `${r.name}, ${r.ahead}` },
          { header: 'Accuracy (%)', num: true, cell: (r) => fmtPct(r.acc, 1), sort: (r) => r.acc },
          { header: 'Industry (%)', num: true, cell: (r) => fmtPct(r.ref, 0), sort: (r) => r.ref },
          { header: 'Under-forecast, lost sales (%)', num: true, cell: (r) => p(r.under), sort: (r) => r.under },
          { header: 'Over-forecast, overstock (%)', num: true, cell: (r) => p(r.over), sort: (r) => r.over },
          { header: 'Sales team (%)', num: true, cell: (r) => (r.team === null ? '–' : fmtPct(r.team, 1)), sort: (r) => r.team },
        ]
        const dimRows: any[] = view === 'National' ? [d.national] : view === 'Family' ? d.by_family : view === 'Region' ? d.by_region : d.by_channel
        const w = (r: any, h: string) => (r[h]?.wape === null || r[h]?.wape === undefined ? null : 1 - r[h].wape)
        const accCols: Col<any>[] = [
          { header: view === 'National' ? 'View' : view, cell: (r) => r.label, sort: (r) => String(r.label).toLowerCase() },
          { header: 'Units in test months', num: true, cell: (r) => fmtN(r.units), sort: (r) => r.units },
          { header: `${run} accuracy (%)`, num: true, cell: (r) => (w(r, run) === null ? '–' : fmtPct(w(r, run) as number, 1)), sort: (r) => w(r, run) },
          { header: `${run} bias (%)`, num: true, cell: (r) => fmtSigned(r[run]?.bias, 1), sort: (r) => r[run]?.bias },
          { header: "Last year's number, accuracy (%)", num: true, cell: (r) => (w(r, 'last_year') === null ? '–' : fmtPct(w(r, 'last_year') as number, 1)), sort: (r) => w(r, 'last_year') },
        ]
        const methodCols: Col<any>[] = [
          { header: 'Method', cell: (r) => r.name },
          { header: `${run} accuracy (%)`, num: true, cell: (r) => (w(r, run) === null ? '–' : fmtPct(w(r, run) as number, 1)), sort: (r) => w(r, run) },
        ]
        return (
          <>
            {!only && (
            <ContentSwitcher size="sm" selectedIndex={RUNS.indexOf(run)} onChange={({ index = 0 }) => { setRun(RUNS[index]); setVm(null) }}>
                {RUNS.map((r) => <Switch key={r} name={r} text={`${r}: made ${r.slice(1)} month${r === 'M1' ? '' : 's'} ahead`} />)}
              </ContentSwitcher>
            )}
            <StatRow items={[
              { label: `${run} accuracy (%)`, info: G.horizon + ' ' + G.industry, value: fmtPct(acc1, 1), sublabel: `Made ${ahead} before. Industry ${fmtPct(REF.industry[run], 0)}, ${pts(acc1 - REF.industry[run])}.${run === 'M3' ? ` Eveready today ${fmtPct(REF.eveready, 0)}.` : ''}` },
              { label: `${run} under-forecast (%)`, info: G.under, value: p(a.total.under), sublabel: 'Demand the plan did not cover: lost-sales risk' },
              { label: `${run} over-forecast (%)`, info: G.over, value: p(a.total.over), sublabel: 'Planned beyond what sold: overstock risk' },
              { label: `${run} accuracy by SKU, region and channel (%)`, value: fmtPct(1 - a.sku.wape, 1), sublabel: 'Finer than the monthly total' },
              { label: "Using last year's number (accuracy, %)", value: fmtPct(1 - d.baseline.total.wape, 1), sublabel: 'The simple alternative' },
              ...(a.team ? [{ label: `Sales team ${run} (accuracy, %)`, value: fmtPct(1 - a.team.wape, 1), sublabel: 'Their forecast from the same point in time' }] : []),
              { label: 'Months scored', value: ms.length, sublabel: `${monthLong(ms[0])} to ${monthLong(ms[ms.length - 1])}` },
            ]} />
            <Findings items={d.notes} title="Read this first" />

            {(() => {
              const K = +run.slice(1)
              const hz = d.horizons[run]
              const tm = showTeamRun(d, run)
              const ta = teamAhead(d, run)
              const L = d.latest
              const ahead = L.months as string[]
              const xs = [...ms, ...ahead]
              const pad = (v: number[]) => [...v, ...ahead.map(() => null)] as (number | null)[]
              const runSeries: RunLine[] = [
                { name: 'Orders received (actual)', values: pad(d.actual), tone: 1, style: 'solid' },
                { name: `${run} forecast`, values: [...hz.forecast, ...ahead.map((_: string, i: number) => hz.ahead?.[i] ?? null)] as (number | null)[], tone: 2, style: 'dash' },
                { name: 'P50 (median)', values: [...hz.p50, ...ahead.map((_: string, i: number) => hz.ahead_p50?.[i] ?? null)] as (number | null)[], tone: 6, style: 'line' },
                ...(tm || ta ? [{ name: `Sales team ${run}`, values: [...(tm ?? ms.map(() => null)), ...ahead.map((_: string, i: number) => ta?.[i] ?? null)] as (number | null)[], tone: 3 as const, style: (tm ? 'line' : 'dots') as 'line' | 'dots' }] : []),
              ]
              const latestRows = ahead.map((m: string, i: number) => ({ month: m, run: L.runs[i], v: L.forecast[i], p50: L.p50[i] }))
              const latestCols: Col<any>[] = [
                { header: 'Month', cell: (r) => monthLong(r.month) },
                { header: 'Made as', cell: (r) => `${r.run}, ${r.run.slice(1)} month${r.run === 'M1' ? '' : 's'} ahead` },
                { header: 'Forecast (units)', num: true, cell: (r) => fmtN(r.v), sort: (r) => r.v },
                { header: 'P50 (units)', num: true, cell: (r) => fmtN(r.p50), sort: (r) => r.p50 },
              ]
              const hidden = { [`Sales team ${run}`]: !!tm, ...hid }
              const mine = ahead[Math.min(+run.slice(1) - 1, ahead.length - 1)]  // the one open month this run is about: M1 October, M2 November, M3 December
              const choices = [...ms, mine]
              const sel = vm && choices.includes(vm) ? vm : mine
              const si = xs.indexOf(sel)
              const open = si >= ms.length
              const fcast: number | null = open ? (hz.ahead?.[si - ms.length] ?? null) : hz.forecast[si]
              const actual = open ? null : d.actual[si]
              const err = actual && fcast !== null ? fcast / actual - 1 : null
              // a month's number: what sold, or for months still to come the latest run
              const valueOf = (m: string): { v: number; kind: string } | null => { const i = xs.indexOf(m); if (i < 0) return null; return i < ms.length ? { v: d.actual[i], kind: 'actual' } : { v: L.forecast[i - ms.length], kind: 'latest run' } }
              const prev = valueOf(`${+sel.slice(5) === 1 ? +sel.slice(0, 4) - 1 : sel.slice(0, 4)}-${String(+sel.slice(5) === 1 ? 12 : +sel.slice(5) - 1).padStart(2, '0')}`)
              const lyArr: (number | null)[] | undefined = Array.isArray(d.last_year) ? d.last_year : undefined
              const lyV = lyArr && si >= 0 && si < ms.length ? lyArr[si] : null
              const lastYear = valueOf(`${+sel.slice(0, 4) - 1}${sel.slice(4)}`) ?? (lyV ? { v: lyV, kind: 'actual' } : null)
              const cur = valueOf(sel)
              const refMonth = basis === 'mom' ? shiftM(sel, -1) : shiftM(sel, -12)
              const refV = basis === 'mom' ? prev : lastYear
              const wCur = daysIn(sel) / 7, wRef = daysIn(refMonth) / 7
              const perWeek = (v: number, ref: number) => (v / wCur) / (ref / wRef) - 1
              const cmpRows = [
                { title: 'Against last month', ref: prev, month: shiftM(sel, -1) },
                { title: 'Against the same month last year', ref: lastYear, month: shiftM(sel, -12) },
              ].map((c) => ({ ...c, change: c.ref && cur ? cur.v / c.ref.v - 1 : null, diff: c.ref && cur ? cur.v - c.ref.v : null,
                pw: c.ref && cur ? perWeek(cur.v, c.ref.v) : null, days: daysIn(c.month) }))
              const cmpCols: Col<any>[] = [
                { header: 'Compared with', cell: (r) => r.title },
                { header: 'That month (units)', num: true, cell: (r) => (r.ref ? `${fmtN(r.ref.v)}, ${r.ref.kind}` : 'Not in the test months') },
                { header: `${monthLong(sel)} (units)`, num: true, cell: () => (cur ? `${fmtN(cur.v)}, ${cur.kind}` : '–') },
                { header: 'Change (%)', num: true, cell: (r) => <Delta value={r.change} text={fmtSigned(r.change, 1)} /> },
                { header: 'Change (units)', num: true, cell: (r) => (r.diff === null ? '–' : `${r.diff >= 0 ? '+' : '−'}${fmtN(Math.abs(r.diff))}`) },
                { header: 'Days in that month', num: true, cell: (r) => r.days },
                { header: 'Per week, like for like (%)', num: true, cell: (r) => <Delta value={r.pw} text={fmtSigned(r.pw, 1)} /> },
              ]
              const oddDays = cmpRows.some((c) => c.ref && c.days !== daysIn(sel))
              // what each method on its own says for the selected month, set against the comparison month
              const methodsRows: { name: string; v: number | undefined }[] = si < ms.length ? ([['Seasonal naive', 'sn'], ['ETS', 'ets'], ['LightGBM', 'lgb']] as const).map(([name, k]) => ({ name: name as string, v: hz[k]?.[si] as number | undefined })).concat([{ name: `${run} blend (the forecast)`, v: hz.forecast[si] }]).filter((x) => typeof x.v === 'number') : []
              const mCols: Col<any>[] = [
                { header: 'Method', cell: (r) => r.name },
                { header: `Forecast for ${monthLong(sel)} (units)`, num: true, cell: (r) => fmtN(r.v), sort: (r) => r.v },
                ...(actual ? [{ header: 'Against actual (%)', num: true, cell: (r: any) => <Delta value={r.v / actual - 1} text={fmtSigned(r.v / actual - 1, 1)} />, sort: (r: any) => r.v / actual - 1 } as Col<any>] : []),
                { header: `Against ${basis === 'mom' ? 'last month' : 'the same month last year'} (%)`, num: true, cell: (r) => (refV ? <Delta value={r.v / refV.v - 1} text={fmtSigned(r.v / refV.v - 1, 1)} /> : '–'), sort: (r) => (refV ? r.v / refV.v - 1 : null) },
                { header: 'Per week, like for like (%)', num: true, cell: (r) => (refV ? <Delta value={perWeek(r.v, refV.v)} text={fmtSigned(perWeek(r.v, refV.v), 1)} /> : '–') },
              ]
              const vs = methodsRows.slice(0, 3).map((x) => x.v as number)
              const spread = vs.length ? (Math.max(...vs) - Math.min(...vs)) / (hz.forecast[si] || 1) : null
              // misses month by month, for the bars
              const gapItems = ms.map((m: string, i: number) => ({ label: monthLong(m), value: d.actual[i] ? hz.forecast[i] / d.actual[i] - 1 : 0, tone: (hz.forecast[i] >= d.actual[i] ? 2 : 1) as 1 | 2 }))
              const under = ms.map((_: string, i: number) => i).filter((i: number) => hz.forecast[i] < d.actual[i])
              const over = ms.map((_: string, i: number) => i).filter((i: number) => hz.forecast[i] > d.actual[i])
              const cover = (idx: number[]) => { const a2 = idx.reduce((t: number, i: number) => t + d.actual[i], 0); return a2 ? idx.reduce((t: number, i: number) => t + hz.forecast[i], 0) / a2 : null }
              const uoRows = [
                { kind: 'Under-forecast', risk: 'Lost sales: demand the plan did not cover', share: a.total.under, months: under.length, level: cover(under), what: 'of demand covered in those months' },
                { kind: 'Over-forecast', risk: 'Excess stock: planned beyond what sold', share: a.total.over, months: over.length, level: cover(over), what: 'of demand planned in those months' },
              ]
              const uoCols: Col<any>[] = [
                { header: 'Kind of miss', cell: (r) => r.kind },
                { header: 'Risk', cell: (r) => r.risk },
                { header: 'Share of total demand (%)', num: true, cell: (r) => fmtPct(r.share, 1) },
                { header: 'Months', num: true, cell: (r) => `${r.months} of ${ms.length}` },
                { header: 'Level in those months (%)', num: true, cell: (r) => (r.level === null ? '–' : fmtPct(r.level, 0)) },
              ]
              const rt = seriesTable('Month', xs.map(monthLong), runSeries, (n) => String(Math.round(n)))
              const rrows: any[] = [
                ...ms.map((m: string, i: number) => ({ m, label: monthLong(m), made: cutOff(m, K), f: hz.forecast[i], a: d.actual[i], p: hz.p50[i], t: tm ? tm[i] : null })),
                ...ahead.filter((_: string, i: number) => hz.ahead?.[i] != null).map((m: string) => { const i = ahead.indexOf(m); return { m, label: `${monthLong(m)}, open`, made: cutOff(m, K), f: hz.ahead[i], a: null, p: hz.ahead_p50[i], t: ta?.[i] ?? null } }),
              ]
              const runCols: Col<any>[] = [
                { header: 'Month', cell: (r) => r.label, sort: (r) => r.m },
                { header: 'Forecast made on', cell: (r) => `${r.made}` },
                { header: 'Forecast (units)', num: true, cell: (r) => fmtN(r.f), sort: (r) => r.f },
                { header: 'Actual (units)', num: true, cell: (r) => (r.a === null ? 'Not in yet' : fmtN(r.a)), sort: (r) => r.a },
                { header: 'Miss (%)', num: true, cell: (r) => (r.a ? fmtSigned(r.f / r.a - 1, 1) : '–'), sort: (r) => (r.a ? r.f / r.a - 1 : null) },
                { header: 'P50 (units)', num: true, cell: (r) => fmtN(r.p), sort: (r) => r.p },
                ...(tm || ta ? [{ header: `Sales team ${run} (units)`, num: true, cell: (r: any) => (r.t == null ? '' : fmtN(r.t)), sort: (r: any) => r.t } as Col<any>] : []),
              ]
              return (
                <>
                  <div className="challenge-bar">
                    <Dropdown id="vm" size="md" titleText="Target month" label="Target month" items={choices} itemToString={(m: string | null) => (m ? `${monthLong(m)}${xs.indexOf(m) >= ms.length ? ' (open)' : ''}` : '')}
                      selectedItem={sel} onChange={({ selectedItem }) => selectedItem && setVm(selectedItem)} />
                  </div>
                  <StatRow items={[
                    { label: `${run} forecast for ${monthLong(sel)} (units)`, value: fcast === null ? '–' : fmtN(fcast), sublabel: open ? (fcast === null ? `Not made yet: the ${run} run for ${monthLong(sel)} needs data to ${cutOff(sel, K)}` : `Made ${cutOff(sel, K)}, the month is still open`) : <>Made {cutOff(sel, K)}, against actual <Delta value={err} text={fmtSigned(err, 1)} /></> },
                    open ? { label: 'Actual', value: 'Not in yet', sublabel: 'The month has not closed' } : { label: 'Actual (units)', value: fmtN(actual), sublabel: `What was received in ${monthLong(sel)}` },
                    { label: 'P50 (units)', value: (open ? hz.ahead_p50?.[si - ms.length] : hz.p50[si]) == null ? '–' : fmtN(open ? hz.ahead_p50[si - ms.length] : hz.p50[si]), sublabel: 'Half of past months landed above, half below' },
                    ...(tm && !open ? [{ label: `Sales team ${run} (units)`, value: fmtN(tm[si]), sublabel: <>Against actual <Delta value={actual ? tm[si] / actual - 1 : null} text={fmtSigned(actual ? tm[si] / actual - 1 : null, 1)} /></> }] : []),
                    ...(open && ta?.[si - ms.length] != null ? [{ label: `Sales team ${run} (units)`, value: fmtN(ta[si - ms.length] as number), sublabel: <>Simulated. Against the model <Delta value={fcast ? (ta[si - ms.length] as number) / fcast - 1 : null} text={fmtSigned(fcast ? (ta[si - ms.length] as number) / fcast - 1 : null, 1)} /></> }] : []),
                  ]} />
                  <ChartCard title={`${run} forecast runs by month`}
                    subtitle={`Each month's ${run} forecast was made with data up to the end of the month ${K} month${K === 1 ? '' : 's'} before it, so it only knew what was known then. Click a point, or pick a target month, to compare it. The dashed line carries on past the last actual month for the months where this run has already been made.`}
                    label={`${run} forecast against orders received, with its P50`} headers={rt.headers} rows={rt.rows}
                    chart={<RunLines key={run} x={xs} series={runSeries} hidden={hidden} onToggle={(n) => setHid({ ...hidden, [n]: !hidden[n] })} selected={sel} onSelect={setVm} yTitle="Orders received (units)" label={`${run} forecast against orders received, with its P50`} />}
                    note={`P50 is this run's forecast moved by its median miss (${fmtSigned(hz.p50[0] / hz.forecast[0] - 1, 1)}), so half of the months landed above it and half below. It comes from the same months it is drawn against, so it describes this period rather than predicting the next. Est.${ta?.some((x) => x != null) ? ' The sales team numbers for October are simulated from their usual over- or under-forecast at this lead, because their file ends in September.' : ''}`} />
                  <DataCard id="latest" info={G.p50} title={`Latest run, with data to ${monthLong(L.data_to)}`}
                    description={`The forecast made now for the one month that sits at ${run} distance: ${monthLong(latestRows.find((r) => r.run === run)?.month ?? ahead[0])}.`}
                    cols={latestCols} rows={latestRows.filter((r) => r.run === run)} itemsLabel="Rows per page" rowKey={(r) => r.month}
                    note="Units of orders received for the month. P50 is the forecast moved by its median past miss. Est." />
                  <ContentSwitcher size="sm" selectedIndex={basis === 'mom' ? 0 : 1} onChange={({ index = 0 }) => setBasis(index === 0 ? 'mom' : 'yoy')}>
                    <Switch name="mom" text="Compare with last month" /><Switch name="yoy" text="Compare with the same month last year" />
                  </ContentSwitcher>
                  <DataCard id="cmp" title={`${monthLong(sel)} against other months`} description="Where the selected month sits against last month and the same month a year earlier" cols={cmpCols} rows={cmpRows} itemsLabel="Rows per page" rowKey={(r) => r.title}
                    note={oddDays ? `Why the total and the per-week figure differ: months have 28 to 31 days, about 4 to 4.4 weeks. ${monthLong(sel)} has ${daysIn(sel)} days. The per-week figure takes month length out, so it shows the change in demand.` : undefined} />
                  {methodsRows.length > 0 ? (
                    <DataCard id="mth" title="What each method says" description={`The three methods behind the ${run} blend, for ${monthLong(sel)}, set against ${basis === 'mom' ? 'last month' : 'the same month last year'}`} cols={mCols} rows={methodsRows} itemsLabel="Methods per page" rowKey={(r) => r.name}
                      note={spread === null ? undefined : spread < 0.05 ? `The three methods agree to within ${fmtPct(spread, 0)} of the blend, so the forecast does not hang on one method.` : `The three methods are ${fmtPct(spread, 0)} of the blend apart, so treat this month's forecast with more care.`} />
                  ) : <p className="supporting">The method-by-method breakdown is available for the months already scored. {monthLong(sel)} is still open, so only the run made now is shown.</p>}
                  <MonthFacts month={sel} />
                  <ChartCard title={`${run} forecast minus actual, month by month`} subtitle="Bars above zero are months the forecast ran high (excess stock risk); below zero, months it ran low (lost-sales risk)."
                    label={`${run} forecast minus actual by month`} headers={['Month', 'Forecast minus actual (%)']} rows={gapItems.map((g: any) => [g.label, fmtSigned(g.value, 1)])}
                    chart={<BarsChart key={run} items={gapItems} yTitle="Forecast minus actual (%)" xTitle="Month" fmt={(n) => `${(n * 100).toFixed(0)}%`} label={`${run} forecast minus actual by month`} />} />
                  <DataCard id="uo" title={`Under- and over-forecast, ${run} run`} description={`Over the ${ms.length} completed months. The two are never netted against each other`} cols={uoCols} rows={uoRows} itemsLabel="Rows per page" rowKey={(r) => r.kind}
                    note="Where the forecast fell short, the level is the share of demand it covered; where it ran high, the share of demand it planned. The excess is stock built for demand that did not come." />
                  <DataCard id="run" title={`${run} month by month`} description={`What the ${run} run said, when it was made, and how far off it was`}
                    cols={runCols} rows={rrows} itemsLabel="Months per page" rowKey={(r) => r.m} />
                </>
              )
            })()}

            <DataCard id="score" title={`${run} accuracy`} description={`Over the ${ms.length} test months, ${monthLong(ms[0])} to ${monthLong(ms[ms.length - 1])}. Under and over add up to the miss, and they cost differently.`}
              cols={score} rows={rows} itemsLabel="Rows per page" rowKey={(r) => r.name}
              note={`Accuracy is 100% minus the sum of the monthly misses divided by the units ordered. The industry range is about 80% at M3 rising to 90% at M1, and Eveready's own M3 is ${fmtPct(REF.eveready, 0)} today (CFO workbook, all products). SKU-line figures come from sharing each family forecast across its SKUs by their last 8 weeks of orders.`} />

            <ContentSwitcher size="sm" selectedIndex={VIEWS.indexOf(view)} onChange={({ index = 0 }) => setView(VIEWS[index])}>
              {VIEWS.map((v) => <Switch key={v} name={v} text={v} />)}
            </ContentSwitcher>
            <DataCard id="acc" title={view === 'National' ? `${run} accuracy, national` : `${run} accuracy by ${view.toLowerCase()}`}
              description={view === 'National' ? 'The whole selection added together, month by month' : 'Each one added up over its own series, month by month'}
              cols={accCols} rows={dimRows} itemsLabel="Rows per page" rowKey={(r) => String(r.label)}
              note="Accuracy is on the months from Oct 2025 the model never saw. Bias above zero means the forecast ran high." />
            <DataCard id="methods" title={`${run} accuracy of each method`} description="The three methods on their own against the blend, same test months"
              cols={methodCols} rows={d.methods} itemsLabel="Methods per page" rowKey={(r) => r.name} />

            {d.team && (
              <Tile className="card stack-05">
                <div className="row-between">
                  <span className="card-heading"><span className="card-title">Against the sales team</span><span className="footnote">BU submitted, consensus and budget from the forecast-versions file. Scored for the run selected above.</span></span>
                </div>
                {d.team.like_for_like
                  ? <p className="supporting">The sales-team file and the app&apos;s sales are on the same scale (their invoiced actuals are {fmtPct(d.team.scale_ratio, 1)} of ours), so they can be compared directly. Team figures are scored against invoiced units, the app&apos;s forecast against orders received.</p>
                  : <InlineNotification kind="warning" lowContrast hideCloseButton title="The sales-team numbers are not on the same scale as the sales in the app"
                    subtitle={`Their invoiced actuals are ${fmtPct(d.team.scale_ratio, 1)} of the invoiced units in the app for the same months, so the file was not lifted with the sales history. A comparison would make the sales team look worse than they were, so it is not drawn. Bring the forecast-versions file to the same scale and it will appear here.`} />}
              </Tile>
            )}
            <DataCard id="horizons" title="Accuracy as the forecast gets closer, M3 to M1" info={G.accuracy + ' ' + G.bias}
              description={`Same ${ms.length} test months at each distance. Under-forecast is lost sales; over-forecast is overstock. They are shown apart and never netted.`}
              cols={horizonCols} rows={horizonRows} itemsLabel="Rows per page" rowKey={(r) => r.name}
              note={`Industry is about 80% at M3 rising to 90% at M1. Eveready's own M3 is about ${fmtPct(REF.eveready, 0)} today. Accuracy is 100% minus WAPE on the monthly national total.`} />
          </>
        )
      }}
    </ViewShell>
  )
}

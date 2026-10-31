/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiErrorNotification } from '@reiq/ui'
import { Tag, Tile } from '@reiq/ui/carbon'
import RunChart from '../../charts/RunChart'
import type { Series } from '../../charts/kit'
import { getJson } from '../../lib/http'
import { fmtInt, fmtN, fmtPct, fmtSigned, monthLong } from '../../lib/format'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { Delta, StatRow } from '../../ui/StatRow'

const gap = (a: number | null | undefined, b: number | null | undefined) => (a && b ? a / b - 1 : null)
const acc = (w: number | null | undefined) => (w === null || w === undefined ? null : 1 - w)

type Check = { name: string; value: string; rule: string; ok: boolean | null; why: string }

/** The checks a number should pass before it is agreed: against the model, last year, the recent run-rate, how reliable the
 *  sources have been and the stock on hand. A check that fails is a reason to ask, not a block. */
function checks(d: any, now: number): Check[] {
  const s = d.series
  const this_ = s.ahead.find((a: any) => a.month === d.month)
  const out: Check[] = []
  const vsModel = gap(now, this_.model)
  out.push({ name: 'Against the model', value: fmtSigned(vsModel, 1), rule: 'Within 10% either way', ok: vsModel === null ? null : Math.abs(vsModel) <= 0.1,
    why: vsModel !== null && Math.abs(vsModel) > 0.1 ? `The number is ${Math.abs(vsModel * 100).toFixed(0)}% ${vsModel > 0 ? 'above' : 'below'} the model. Ask what the model does not know.` : 'Close to what the model expects.' })
  const vsLy = gap(now, this_.last_year)
  out.push({ name: 'Against the same month last year', value: fmtSigned(vsLy, 1), rule: 'Within 15 points of the recent year-on-year trend', ok: vsLy === null || s.recent_yoy === null ? null : Math.abs(vsLy - s.recent_yoy) <= 0.15,
    why: vsLy === null ? 'No last year to compare.' : `Recent months run ${fmtSigned(s.recent_yoy, 0)} on last year; this number is ${fmtSigned(vsLy, 0)}.` })
  const vsRun = gap(now, s.last3_avg)
  out.push({ name: 'Against the last three months', value: fmtSigned(vsRun, 1), rule: 'Within 25% of the recent monthly average', ok: vsRun === null ? null : Math.abs(vsRun) <= 0.25,
    why: `The last three months averaged ${fmtN(s.last3_avg)} units a month.` })
  const team = d.reliability.find((r: any) => r.source.startsWith('Sales team'))
  out.push({ name: 'Sales team history at this lead', value: team?.bias === null || !team ? '–' : fmtSigned(team.bias, 1), rule: 'Typical over- or under-forecast within 10%', ok: team?.bias === null || !team ? null : Math.abs(team.bias) <= 0.1,
    why: team ? `At ${d.lead} month${d.lead === 1 ? '' : 's'} ahead the sales team has run ${fmtSigned(team.bias, 0)} against what sold. Allow for it when you set the number.` : 'No history.' })
  const st = d.stock
  if (st && st.units_per_app_unit && st.norm_min) {
    const days = st.closing / ((now * st.units_per_app_unit) / 30)
    out.push({ name: 'Stock cover', value: `${days.toFixed(0)} days of this month's number`, rule: `At least ${st.norm_min.toFixed(0)} days (the norm)`, ok: days >= st.norm_min,
      why: `Stock on hand on ${monthLong(st.as_of.slice(0, 7))} covers ${st.cover_days_now?.toFixed(0)} days of the recent run-rate; the norm is ${st.norm_min.toFixed(0)} to ${st.norm_max.toFixed(0)}.` })
  }
  return out
}

export function Evidence({ month, family, now }: { month: string; family: string; now: number }) {
  const q = useQuery({ queryKey: ['challenge-detail', month, family], queryFn: () => getJson<any>(`/api/challenge/detail?month=${month}&family=${encodeURIComponent(family)}`), staleTime: 60_000 })
  const d = q.data
  const chart = useMemo(() => {
    if (!d) return null
    const s = d.series
    const x: string[] = [...s.months, s.first.month, ...s.ahead.map((a: any) => a.month)]
    const lyOf = (m: string) => { const j = s.months.indexOf(`${+m.slice(0, 4) - 1}${m.slice(4)}`); return j >= 0 ? s.actual[j] : null }
    const at = (m: string) => x.indexOf(m)
    const mk = (f: (i: number) => number | null) => x.map((_, i) => f(i))
    const model = mk((i) => (i === s.months.length - 1 ? s.actual[s.months.length - 1] : i >= s.months.length ? [s.first, ...s.ahead][i - s.months.length].model : null))
    const series: Series[] = [
      { name: 'Orders received (actual)', values: mk((i) => (i < s.months.length ? s.actual[i] : null)), tone: 1 },
      { name: 'Model', values: model, tone: 2 },
      { name: 'Same month last year', values: mk((i) => lyOf(x[i])), tone: 8 },
      { name: 'Number on the table', values: mk((i) => (i === at(month) ? now : null)), tone: 6 },
    ]
    return { x, series }
  }, [d, month, now])

  if (q.isPending) return <p className="supporting">Loading the evidence...</p>
  if (q.isError) return <ApiErrorNotification error={q.error} fallbackTitle="Could not load the evidence" onRetry={() => void q.refetch()} />
  const s = d.series
  const this_ = s.ahead.find((a: any) => a.month === month)
  const list = checks(d, now)
  const flagged = list.filter((c) => c.ok === false).length
  const st = d.stock

  const relCols: Col<any>[] = [
    { header: 'Source', cell: (r) => r.source },
    { header: 'Accuracy (%)', num: true, cell: (r) => fmtPct(acc(r.wape), 1), sort: (r) => acc(r.wape) },
    { header: 'Over (+) or under (-) forecast (%)', num: true, cell: (r) => fmtSigned(r.bias, 1), sort: (r) => r.bias },
  ]
  const trackCols: Col<any>[] = [
    { header: 'Region or unit', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
    { header: 'Kind', cell: (r) => r.dim },
    { header: 'Model accuracy (%)', num: true, cell: (r) => fmtPct(acc(r.model.wape), 1), sort: (r) => acc(r.model.wape) },
    { header: 'Sales team accuracy (%)', num: true, cell: (r) => fmtPct(acc(r.team.wape), 1), sort: (r) => acc(r.team.wape) },
    { header: 'Sales team over (+) or under (-) (%)', num: true, cell: (r) => fmtSigned(r.team.bias, 1), sort: (r) => r.team.bias },
    { header: 'Budget accuracy (%)', num: true, cell: (r) => fmtPct(acc(r.budget.wape), 1), sort: (r) => acc(r.budget.wape) },
  ]
  const gridCols: Col<any>[] = [
    { header: 'Region', cell: (r) => r.region },
    ...d.units.map((u: any) => ({ header: `${u.name} (units)`, num: true, cell: (r: any) => (r[u.bu] ? fmtInt(r[u.bu].model) : '–'), sort: (r: any) => r[u.bu]?.model ?? 0 } as Col<any>)),
    { header: 'Region total (units)', num: true, cell: (r) => fmtInt(d.units.reduce((a: number, u: any) => a + (r[u.bu]?.model ?? 0), 0)), sort: (r) => d.units.reduce((a: number, u: any) => a + (r[u.bu]?.model ?? 0), 0) },
    { header: 'Against last year (%)', num: true, cell: (r) => { const m = d.units.reduce((a: number, u: any) => a + (r[u.bu]?.model ?? 0), 0); const l = d.units.reduce((a: number, u: any) => a + (r[u.bu]?.last_year ?? 0), 0); const g = gap(m, l); return <Delta value={g} text={fmtSigned(g, 1)} /> } },
  ]
  const skuCols: Col<any>[] = [
    { header: 'SKU', cell: (r) => r.sku, sort: (r) => r.sku },
    { header: 'Description', cell: (r) => r.description || '–' },
    { header: 'Share of the family (%)', num: true, cell: (r) => fmtPct(r.share, 1), sort: (r) => r.share },
    { header: 'Model, by share (units)', num: true, cell: (r) => fmtN(r.model), sort: (r) => r.model },
    { header: 'Last three months (units)', num: true, cell: (r) => fmtN(r.recent), sort: (r) => r.recent },
    { header: 'Same three months last year (units)', num: true, cell: (r) => fmtN(r.last_year), sort: (r) => r.last_year },
    { header: 'Year on year (%)', num: true, cell: (r) => <Delta value={r.yoy} text={fmtSigned(r.yoy, 1)} />, sort: (r) => r.yoy },
  ]
  const chkCols: Col<any>[] = [
    { header: 'Check', cell: (r) => r.name },
    { header: 'This number', num: true, cell: (r) => r.value },
    { header: 'Rule', cell: (r) => r.rule },
    { header: 'Result', cell: (r) => <Tag size="sm" type={r.ok === null ? 'gray' : r.ok ? 'green' : 'red'}>{r.ok === null ? 'No data' : r.ok ? 'Passes' : 'Look again'}</Tag> },
    { header: 'What it says', cell: (r) => r.why },
  ]
  const events = d.drivers.events
  const evCols: Col<any>[] = [
    { header: 'Date', cell: (r) => r.date, sort: (r) => r.date },
    { header: 'Region', cell: (r) => r.region },
    { header: 'Channel', cell: (r) => (r.channel === 'nan' ? 'All' : r.channel) },
    { header: 'What happened', cell: (r) => r.name },
    { header: 'Estimated effect', cell: (r) => r.impact },
    { header: 'Logged by', cell: (r) => r.by },
  ]
  const fest = d.drivers.festivals
  const festCols: Col<any>[] = [
    { header: 'Festival', cell: (r) => r.name },
    { header: 'Date', cell: (r) => r.date, sort: (r) => r.date },
    { header: 'Group', cell: (r) => r.group },
    { header: 'Sell-in peak (weeks before)', num: true, cell: (r) => (r.peak_weeks_before === null ? '–' : r.peak_weeks_before) },
  ]
  const sch = d.drivers.schemes
  const schCols: Col<any>[] = [
    { header: 'Channel', cell: (r) => r.channel },
    { header: 'Scheme weeks in the month', num: true, cell: (r) => r.weeks },
    { header: 'Average discount (%)', num: true, cell: (r) => r.avg_discount.toFixed(1) },
  ]
  const lyS = d.drivers.schemes_last_year

  return (
    <div className="stack-05">
      <StatRow items={[
        { label: 'Number on the table (units)', value: fmtN(now), sublabel: `For ${monthLong(month)}, ${d.lead} month${d.lead === 1 ? '' : 's'} ahead` },
        { label: 'Against the model', value: <Delta value={gap(now, this_.model)} text={fmtSigned(gap(now, this_.model), 1)} />, sublabel: `Model ${fmtN(this_.model)} units` },
        { label: 'Against the same month last year', value: <Delta value={gap(now, this_.last_year)} text={fmtSigned(gap(now, this_.last_year), 1)} />, sublabel: this_.last_year ? `${fmtN(this_.last_year)} units` : 'No last year' },
        { label: 'Against the last three months', value: <Delta value={gap(now, s.last3_avg)} text={fmtSigned(gap(now, s.last3_avg), 1)} />, sublabel: `Average ${fmtN(s.last3_avg)} units a month` },
        { label: 'Checks to look at again', value: `${flagged} of ${list.length}`, sublabel: flagged ? 'See the checks below' : 'The number passes every check' },
        ...(st ? [{ label: 'Stock cover now (days)', value: st.cover_days_now?.toFixed(0) ?? '–', sublabel: `Norm ${st.norm_min?.toFixed(0)} to ${st.norm_max?.toFixed(0)} days` }] : []),
      ]} />

      <DataCard id="chk" title="Checks on the number" description="What to ask before agreeing it. A failed check is a reason to ask, not a block" cols={chkCols} rows={list} itemsLabel="Checks per page" rowKey={(r) => r.name} />

      {chart ? (
        <ChartCard title={`${family}: orders, the model and the number on the table`} subtitle={`The last ${s.months.length} months of orders received, the model for ${monthLong(s.first.month)} to ${monthLong(s.ahead[s.ahead.length - 1].month)}, and the number now on the table for ${monthLong(month)}.`}
          label={`${family} orders, model and the number on the table`}
          headers={['Month', ...chart.series.map((x) => x.name)]}
          rows={chart.x.map((m, i) => [monthLong(m), ...chart.series.map((x) => (x.values[i] === null ? '' : fmtInt(Math.round(x.values[i] as number))))])}
          chart={<RunChart key={`${family}|${month}`} x={chart.x} series={chart.series} dots="Number on the table" yTitle="Orders received (units)" label={`${family} orders, model and the number on the table`} />}
          note={`The grey line is the same month a year earlier. The peak in the window was ${monthLong(s.peak.month)} at ${fmtN(s.peak.value)} units.`} />
      ) : null}

      <DataCard id="rel" title="How reliable each source has been" description={`Scored ${d.lead} month${d.lead === 1 ? '' : 's'} ahead, on months already known, for ${family}. Higher accuracy is better; a plus means it usually over-forecasts`}
        cols={relCols} rows={d.reliability} itemsLabel="Sources per page" rowKey={(r) => r.source} defaultSort={{ col: 1, dir: 'desc' }}
        note="Sales team and budget are scored on the forecast-versions file, which is on a different scale from the app's orders, so only the percentages compare." />

      <DataCard id="trk" title="Track record by region and business unit" description="Who has been closest, and who leans high or low, for this family at this lead time" cols={trackCols} rows={d.track} itemsLabel="Rows per page" rowKey={(r) => `${r.dim}|${r.name}`} defaultSort={{ col: 0, dir: 'asc' }} />

      <DataCard id="grid" title="The model, region by business unit" description={`${monthLong(month)}: where the model puts ${family} demand`} cols={gridCols} rows={d.grid} itemsLabel="Regions per page" rowKey={(r) => r.region} />

      <DataCard id="sku" title="The SKUs behind the number" description="The ten largest, by the last three months. The model is split by each SKU's recent share" cols={skuCols} rows={d.skus} itemsLabel="SKUs per page" rowKey={(r) => r.sku} defaultSort={{ col: 2, dir: 'desc' }} />

      {st ? (
        <Tile className="card stack-05">
          <span className="card-heading">
            <span className="card-title">Stock on hand</span>
            <span className="footnote">As of {st.as_of}, across {fmtInt(st.locations)} depot and SKU lines. Stock is in the inventory file's units, which are not the app's.</span>
          </span>
          <StatRow items={[
            { label: 'Closing stock (units)', value: fmtN(st.closing), sublabel: `Safety stock ${fmtN(st.safety)}` },
            { label: 'Cover now (days)', value: st.cover_days_now?.toFixed(0) ?? '–', sublabel: `Norm ${st.norm_min?.toFixed(0)} to ${st.norm_max?.toFixed(0)}. Short below ${st.short_below?.toFixed(0)}, overstock above ${st.over_above?.toFixed(0)}` },
            { label: 'Lines short or out', value: fmtInt((st.status.Short ?? 0) + (st.status.Stockout ?? 0)), sublabel: `of ${fmtInt(st.locations)}` },
            { label: 'Lines overstocked', value: fmtInt(st.status.Overstock ?? 0), sublabel: `${fmtInt(st.status.OK ?? 0)} are within the norm` },
          ]} />
        </Tile>
      ) : null}

      <Tile className="card stack-05">
        <span className="card-heading">
          <span className="card-title">What moves demand in {monthLong(month)}</span>
          <span className="footnote">Trade schemes, festivals and events people have logged for {family}.</span>
        </span>
        <p className="supporting">{sch.length ? `Trade schemes run in ${sch.length} channel${sch.length === 1 ? '' : 's'} this month.` : 'No trade scheme is on for this family this month.'} {lyS?.weeks ? `A year ago there were ${lyS.weeks} scheme weeks at an average ${lyS.avg_discount?.toFixed(1)}% discount.` : 'There were none a year ago.'}</p>
        {sch.length > 0 && <DataCard id="sch" title="Trade schemes" cols={schCols} rows={sch} itemsLabel="Channels per page" rowKey={(r) => r.channel} />}
        {fest.length > 0 ? <DataCard id="fest" title="Festivals around the month" description="From three weeks before to a week after" cols={festCols} rows={fest} itemsLabel="Festivals per page" rowKey={(r) => r.name + r.date} /> : <p className="supporting">No festival falls in or just around this month.</p>}
        {events.length > 0 && <DataCard id="ev" title="Events logged for this family" description="The most recent, with the effect people estimated at the time" cols={evCols} rows={events} itemsLabel="Events per page" rowKey={(r) => r.date + r.name + r.region} />}
      </Tile>
    </div>
  )
}

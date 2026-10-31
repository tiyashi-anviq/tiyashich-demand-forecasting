/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Dropdown } from '@reiq/ui/carbon'
import { fmtDate, fmtN, fmtSigned } from '../../lib/format'
import { queryOf, type Filters, type Options } from '../../lib/filters'
import { useView } from '../../lib/useView'
import TrendChart from '../../charts/TrendChart'
import { seriesTable, type Series } from '../../charts/kit'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { StatRow } from '../../ui/StatRow'
import { ViewShell } from '../../ui/ViewShell'

const SHOCK = -0.25, RECOVERY = 0.1
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Each week after the cut against the baseline: a shock is more than 25% under it, a recovery more than 10% over it once a shock has been seen. */
function phases(d: any) {
  let seen = false
  const dev: (number | null)[] = d.weeks.map((_: string, i: number) => (i >= d.cut && d.forecast[i] && d.actual[i] != null ? d.actual[i] / d.forecast[i] - 1 : null))
  const ph: string[] = dev.map((v) => {
    if (v === null) return ''
    if (v < SHOCK) { seen = true; return 'Shock' }
    if (seen && v > RECOVERY) return 'Recovery'
    return 'Normal'
  })
  return { dev, ph }
}

export default function Shocks({ f, opts, onClear }: { f: Filters; opts: Options; onClear: () => void }) {
  const [year, setYear] = useState(2026)
  const q = useView<any>('weather', 'shock', queryOf(f, opts, { year: String(year) }, false))
  const years = [2024, 2025, 2026]
  return (
    <ViewShell query={q} errorTitle="Could not load the weather view" onClear={onClear}>
      {(d) => {
        const { dev, ph } = phases(d)
        const n = d.weeks.length
        const noBase = d.forecast.every((v: any) => v === null)
        const worst = dev.reduce((b: number, v, i) => (v !== null && (b < 0 || v < (dev[b] as number)) ? i : b), -1)
        const peak = dev.reduce((b: number, v, i) => (ph[i] === 'Recovery' && (b < 0 || (v as number) > (dev[b] as number)) ? i : b), -1)
        const nShock = ph.filter((p) => p === 'Shock').length, nRec = ph.filter((p) => p === 'Recovery').length
        let sa = 0, sf = 0, lost = 0, regained = 0
        for (let i = d.cut; i < n; i++) {
          if (!d.forecast[i] || d.actual[i] == null) continue
          sa += d.actual[i]; sf += d.forecast[i]
          if (ph[i] === 'Shock') lost += d.forecast[i] - d.actual[i]
          if (ph[i] === 'Recovery') regained += d.actual[i] - d.forecast[i]
        }
        const net = sf ? sa / sf - 1 : null
        const wk = (i: number) => fmtDate(d.weeks[i])
        const delay = d.delay_days as number | null
        const delayText = delay === null ? '–' : Math.abs(delay) < 1 ? 'On time' : `${Math.abs(Math.round(delay))} days ${delay > 0 ? 'late' : 'early'}`
        const series: Series[] = [
          { name: 'Orders received', values: d.actual, tone: 1 },
          ...(noBase ? [] : [{ name: `Baseline made ${wk(d.cut - 1)}`, values: d.forecast, tone: 2 as const }]),
          ...(noBase ? [] : [{ name: 'Shock weeks (more than 25% under)', values: d.actual.map((v: any, i: number) => (ph[i] === 'Shock' ? v : null)), tone: 6 as const }]),
          ...(noBase ? [] : [{ name: 'Recovery weeks (more than 10% over)', values: d.actual.map((v: any, i: number) => (ph[i] === 'Recovery' ? v : null)), tone: 3 as const }]),
        ]
        const rainSeries: Series[] = [{ name: 'Rain (mm)', values: d.rain, tone: 1 }, { name: 'Usual rain for the week (mm)', values: d.expected_rain, tone: 3 }]
        const t1 = seriesTable('Week starting', d.weeks.map(fmtDate), series.slice(0, noBase ? 1 : 2), fmtN)
        const t2 = seriesTable('Week starting', d.weeks.map(fmtDate), rainSeries, (v) => v.toFixed(0))
        const cols: Col<any>[] = [
          { header: 'Week starting', cell: (r) => fmtDate(r.w), sort: (r) => r.w },
          { header: 'Orders (units)', num: true, cell: (r) => (r.a == null ? '–' : fmtN(r.a)), sort: (r) => r.a },
          { header: 'Baseline (units)', num: true, cell: (r) => (r.f == null ? '–' : fmtN(r.f)), sort: (r) => r.f },
          { header: 'Against baseline (%)', num: true, cell: (r) => (r.v == null ? '–' : fmtSigned(r.v, 0)), sort: (r) => r.v },
          { header: 'Rain (mm)', num: true, cell: (r) => (r.r == null ? '–' : r.r.toFixed(0)), sort: (r) => r.r },
          { header: 'Phase', cell: (r) => r.p || '–', sort: (r) => r.p },
        ]
        const rows = d.weeks.map((w: string, i: number) => ({ w, a: d.actual[i], f: d.forecast[i], v: dev[i], r: d.rain[i], p: ph[i] }))
        const regions = Object.entries(d.delay_by_region as Record<string, number>)
        return (
          <>
            <div className="row-03">
              <Dropdown id="wx-year" size="md" titleText="Monsoon" label="Monsoon" items={years} itemToString={(y: number | null) => (y ? `Monsoon ${y}` : '')}
                selectedItem={year} onChange={({ selectedItem }: any) => selectedItem && setYear(selectedItem)} />
            </div>
            <StatRow items={[
              { label: 'Monsoon arrival', value: delayText, sublabel: regions.length > 1 ? regions.map(([r, v]) => `${r} ${v > 0 ? '+' : ''}${Math.round(v)}d`).join(', ') : 'Against the normal onset date' },
              { label: 'Worst week against baseline (%)', value: worst < 0 ? '–' : fmtSigned(dev[worst] as number, 0), sublabel: worst < 0 ? '' : `Week of ${wk(worst)}` },
              { label: 'Weeks in shock', value: noBase ? '–' : String(nShock), sublabel: 'More than 25% under the baseline' },
              { label: 'Recovery spillover (%)', value: peak < 0 ? '–' : fmtSigned(dev[peak] as number, 0), sublabel: peak < 0 ? 'No rebound above baseline' : `Peak week of ${wk(peak)}, ${plural(nRec, 'week')} above` },
              { label: `Net over ${n - d.cut} weeks (%)`, value: net === null ? '–' : fmtSigned(net, 1), sublabel: `Lost ${fmtN(lost)} units, regained ${fmtN(regained)}` },
            ]} />
            <ChartCard title={`Orders against the baseline, monsoon ${year}`} subtitle="Weekly orders received"
              label="Weekly orders received against the baseline made before the monsoon"
              chart={<TrendChart x={d.weeks} series={series} kind="week" yTitle="Orders received (units per week)" markers={[{ i: d.cut - 1, label: 'Baseline made' }]} label="Weekly orders against the pre-monsoon baseline" />}
              headers={t1.headers} rows={t1.rows}
              note={noBase ? 'There is no earlier year to build a baseline from, so only orders and rain are shown.' : `The baseline carries last year's orders for each week forward, scaled by how this year ran in the ${d.base_weeks} weeks before ${wk(d.cut - 1)}. It does not know about the rain that followed, so a weather shock shows as the gap. ${d.incomplete ? 'The season is not over, so later weeks are missing.' : ''}`} />
            <ChartCard title="Rain behind it" subtitle="Weekly rainfall"
              label="Weekly rain against the usual for that week"
              chart={<TrendChart x={d.weeks} series={rainSeries} kind="week" yTitle="Rain (mm per week)" label="Weekly rain against the usual rain for the week" />}
              headers={t2.headers} rows={t2.rows}
              note="Usual rain is the average for the same week in the other years. Arrival is the monsoon-onset delay recorded for each region, averaged over the regions selected." />
            <DataCard id="wxw" title="Week by week" description="Every week of the season, with its phase" cols={cols} rows={rows} itemsLabel="weeks" rowKey={(r) => r.w} />
          </>
        )
      }}
    </ViewShell>
  )
}

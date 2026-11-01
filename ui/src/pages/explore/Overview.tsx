/* eslint-disable @typescript-eslint/no-explicit-any */
import { fmtDate, fmtN, fmtPct, fmtSigned, monthLong } from '../../lib/format'
import { queryOf, type Filters, type Options } from '../../lib/filters'
import { useView } from '../../lib/useView'
import BarsChart from '../../charts/BarsChart'
import TrendChart from '../../charts/TrendChart'
import { seriesTable } from '../../charts/kit'
import { ChartCard } from '../../ui/ChartCard'
import { Delta, StatRow } from '../../ui/StatRow'
import { Findings } from '../../ui/Findings'
import { ViewShell } from '../../ui/ViewShell'

const PER: Record<string, string> = { last12: 'last 12 months', last24: 'last 24 months', train: 'training period (to Sep 2025)', test: 'test period (Oct 2025 on)' }

export default function Overview({ f, opts, onClear }: { f: Filters; opts: Options; onClear: () => void }) {
  const q = useView<any>('eda', 'overview', queryOf(f, opts))
  const active = [f.family.length ? `Family: ${f.family.join(', ')}` : '', f.region.length ? `Region: ${f.region.join(', ')}` : '', f.channel.length ? `Channel: ${f.channel.join(', ')}` : '', PER[f.period] ? `Period: ${PER[f.period]}` : ''].filter(Boolean)
  return (
    <ViewShell query={q} errorTitle="Could not load the overview" onClear={onClear}>
      {(d) => {
        const k = d.kpis
        const win = k.yoy_win ? `${monthLong(k.yoy_win[2])} to ${monthLong(k.yoy_win[3])} vs the 12 months before` : ''
        const ms: string[] = d.monthly.map((m: any) => m.m)
        const monthly = [{ name: 'Orders received', values: d.monthly.map((m: any) => m.orders), tone: 1 as const }, { name: 'Sales invoiced', values: d.monthly.map((m: any) => m.sales), tone: 2 as const }]
        const t = seriesTable('Month', ms.map(monthLong), monthly, (n) => String(Math.round(n)))
        const share = (key: 'family' | 'channel' | 'region', title: string, head: string) => {
          const items = d[key].map((x: any) => ({ label: x.k, value: x.v }))
          return (
            <ChartCard title={title} subtitle={`Units of ${k.measure_label.toLowerCase()}`} label={`${k.measure_label} by ${head.toLowerCase()}`}
              headers={[head, 'Units', 'Share (%)']} rows={d[key].map((x: any) => [x.k, Math.round(x.v), fmtPct(x.v / k.volume, 1)])}
              chart={<BarsChart items={items} horizontal yTitle={`${k.measure_label} (units)`} fmt={(n) => fmtN(n)} label={`${k.measure_label} by ${head.toLowerCase()}`} />} />
          )
        }
        return (
          <>
            {active.length > 0 && <p className="supporting">Filtered to {active.join(' · ')}. The figures below cover only this selection.</p>}
            <StatRow items={[
              { label: 'Ordered (units, orders received)', value: fmtN(k.orders) },
              { label: 'Invoiced (units, sales done)', value: fmtN(k.invoiced), sublabel: `${k.fill_rate === null ? '–' : fmtPct(k.fill_rate, 1)} of orders` },
              { label: 'Ordered but not invoiced (units)', value: fmtN(k.unserved) },
              ...(k.yoy_win ? [{ label: `Orders, ${win}`, value: <Delta value={k.yoy_orders} text={fmtSigned(k.yoy_orders, 1)} /> }] : []),
              ...(k.yoy_win ? [{ label: `Sales invoiced, ${win}`, value: <Delta value={k.yoy_sales} text={fmtSigned(k.yoy_sales, 1)} /> }] : []),
              { label: 'Weeks of data', value: k.weeks, sublabel: `${fmtDate(k.date_from)} to ${fmtDate(k.date_to)}` },
            ]} />
            <Findings items={d.findings} title="What the data says" />
            <ChartCard title="Monthly orders and sales" subtitle="Units, complete months only" label="Monthly orders received and sales invoiced"
              headers={t.headers} rows={t.rows}
              chart={<TrendChart x={ms} series={monthly} yTitle="Units" yFmt={(n) => fmtN(n)} label="Monthly orders received and sales invoiced" />} />
            <div className="grid">
              {share('family', 'By family', 'Family')}
              {share('channel', 'By channel', 'Channel')}
              {share('region', 'By region', 'Region')}
            </div>
          </>
        )
      }}
    </ViewShell>
  )
}

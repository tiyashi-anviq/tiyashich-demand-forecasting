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

export default function Overview({ f, opts, onClear }: { f: Filters; opts: Options; onClear: () => void }) {
  const q = useView<any>('eda', 'overview', queryOf(f, opts))
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
            <StatRow items={[
              { label: 'Orders Received', value: fmtN(k.orders), sublabel: 'Total units ordered' },
              { label: 'Sales Invoiced', value: fmtN(k.invoiced), sublabel: k.fill_rate !== null ? `${fmtPct(k.fill_rate, 1)} fill rate` : 'Fulfilled orders' },
              { label: 'Unfulfilled Orders', value: fmtN(k.unserved), sublabel: 'Ordered but not invoiced' },
              ...(k.yoy_win ? [{ label: `YoY Orders Change`, sublabel: win, value: <Delta value={k.yoy_orders} text={fmtSigned(k.yoy_orders, 1)} /> }] : []),
              ...(k.yoy_win ? [{ label: `YoY Sales Change`, sublabel: win, value: <Delta value={k.yoy_sales} text={fmtSigned(k.yoy_sales, 1)} /> }] : []),
              { label: 'Data Coverage', value: k.weeks, sublabel: `${fmtDate(k.date_from)} to ${fmtDate(k.date_to)}` },
            ]} />
            <Findings items={d.findings} title="What the data says" />
            <ChartCard title="Monthly Trends" subtitle="Orders received vs sales invoiced (complete months only)" label="Monthly volume trends"
              headers={t.headers} rows={t.rows}
              chart={<TrendChart x={ms} series={monthly} yTitle="Units" yFmt={(n) => fmtN(n)} label="Monthly volume trends" />} />
            <div className="grid">
              {share('family', 'Volume by Family', 'Family')}
              {share('channel', 'Volume by Channel', 'Channel')}
              {share('region', 'Volume by Region', 'Region')}
            </div>
          </>
        )
      }}
    </ViewShell>
  )
}

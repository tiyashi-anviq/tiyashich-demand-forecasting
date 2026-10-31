/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Dropdown } from '@reiq/ui/carbon'
import { fmtN, fmtSigned } from '../../lib/format'
import { queryOf, type Filters, type Options } from '../../lib/filters'
import { useView } from '../../lib/useView'
import BarsChart from '../../charts/BarsChart'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { StatRow } from '../../ui/StatRow'
import { ViewShell } from '../../ui/ViewShell'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Seasonal({ f, opts, onClear }: { f: Filters; opts: Options; onClear: () => void }) {
  const [pick, setPick] = useState<string | null>(null)
  const q = useView<any>('weather', 'seasonal', queryOf(f, opts, {}, false))
  return (
    <ViewShell query={q} errorTitle="Could not load the seasonal view" onClear={onClear}>
      {(d) => {
        const seasons: any[] = d.seasons
        const cur = seasons.find((s) => s.k === (pick ?? d.current))!
        const k = cur.k as string
        const pct = (i: number | null) => (i === null || i === undefined ? null : i - 1)
        const top = [...d.products].filter((p: any) => p.index[k] !== null).sort((a: any, b: any) => b.index[k] - a.index[k])[0]
        const big = [...d.products].filter((p: any) => p.per_week[k] !== null).sort((a: any, b: any) => b.per_week[k] - a.per_week[k])[0]
        const above = d.products.filter((p: any) => (p.index[k] ?? 0) > 1).length
        const cols = (name: string): Col<any>[] => [
          { header: name, cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
          ...(name === 'Product' ? [{ header: 'Family', cell: (r: any) => r.family ?? '', sort: (r: any) => String(r.family ?? '').toLowerCase() } as Col<any>] : []),
          { header: `${cur.label} (units per week)`, num: true, cell: (r) => (r.per_week[k] === null ? '–' : fmtN(r.per_week[k], 0)), sort: (r) => r.per_week[k] },
          { header: `${cur.label} against own average (%)`, num: true, cell: (r) => (r.index[k] === null ? '–' : fmtSigned(pct(r.index[k]) as number, 0)), sort: (r) => r.index[k] },
          ...seasons.filter((s) => s.k !== k).map((s) => ({ header: `${s.label} (%)`, num: true, cell: (r: any) => (r.index[s.k] === null ? '–' : fmtSigned(pct(r.index[s.k]) as number, 0)), sort: (r: any) => r.index[s.k] } as Col<any>)),
        ]
        const bars = d.families.map((r: any) => ({ label: r.name, value: r.index[k] - 1 })).filter((b: any) => isFinite(b.value))
        const mon = Object.entries(d.months).map(([m, v]: any) => ({ label: MONTHS[+m - 1], value: v }))
        return (
          <>
            <div className="row-03">
              <Dropdown id="sea" size="md" titleText="Season" label="Season" items={seasons} itemToString={(s: any) => (s ? `${s.label} (${s.text})` : '')}
                selectedItem={cur} onChange={({ selectedItem }: any) => selectedItem && setPick(selectedItem.k)} />
            </div>
            <StatRow items={[
              { label: 'Biggest seasonal rise (%)', value: top ? fmtSigned(pct(top.index[k]) as number, 0) : '–', sublabel: top ? top.name : '' },
              { label: 'Most units per week', value: big ? fmtN(big.per_week[k], 0) : '–', sublabel: big ? big.name : '' },
              { label: 'Products above their average', value: `${above} of ${d.products.length}`, sublabel: `In ${cur.label.toLowerCase()}, among the 40 biggest` },
              { label: 'All products, per week (units)', value: fmtN(d.all_per_week, 0), sublabel: 'Average across every week' },
            ]} />
            <ChartCard title={`Family demand in ${cur.label.toLowerCase()}, against each family's own average`} subtitle={cur.text}
              label="Each family's weekly orders in the season against its all-year average"
              chart={<BarsChart items={bars} horizontal yTitle="Against own average (%)" fmt={(v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`} label="Seasonal rise or fall by family" />}
              headers={['Family', 'Against own average (%)']} rows={bars.map((b: any) => [b.label, fmtSigned(b.value, 0)])}
              note="Above zero means the family sells more per week in this season than it does across the year." />
            <ChartCard title="All products, month by month" subtitle="Average units per week"
              label="Average weekly orders in each calendar month"
              chart={<BarsChart items={mon} yTitle="Orders (units per week)" label="Average weekly orders by calendar month" />}
              headers={['Month', 'Units per week']} rows={mon.map((m: any) => [m.label, fmtN(m.value, 0)])} />
            <DataCard id="sf" title="By family" description="Weekly orders in each season against the family's own average" cols={cols('Family')} rows={d.families} itemsLabel="families" rowKey={(r) => r.name} defaultSort={{ col: 2, dir: 'desc' }} />
            <DataCard id="sp" title="By product" description="The 40 biggest products" cols={cols('Product')} rows={d.products} itemsLabel="products" rowKey={(r) => r.sku} defaultSort={{ col: 3, dir: 'desc' }} />
          </>
        )
      }}
    </ViewShell>
  )
}

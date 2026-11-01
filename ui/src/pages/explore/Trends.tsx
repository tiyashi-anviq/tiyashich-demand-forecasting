/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { ContentSwitcher, Switch } from '@reiq/ui/carbon'
import { fmtN, fmtPct, fmtSigned, monthLong } from '../../lib/format'
import { queryOf, type Filters, type Options } from '../../lib/filters'
import { useView } from '../../lib/useView'
import BarsChart from '../../charts/BarsChart'
import HeatChart from '../../charts/HeatChart'
import TrendChart from '../../charts/TrendChart'
import { seriesTable } from '../../charts/kit'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { Delta } from '../../ui/StatRow'
import { Findings } from '../../ui/Findings'
import { MiniBar } from '../../ui/MiniBar'
import { ViewShell } from '../../ui/ViewShell'

const BY = ['family', 'region', 'channel', 'total'] as const
const BY_LABEL = ['Family', 'Region', 'Channel', 'Total']

export default function Trends({ f, opts, onClear }: { f: Filters; opts: Options; onClear: () => void }) {
  const [by, setBy] = useState<(typeof BY)[number]>('family')
  const q = useView<any>('eda', 'trend', queryOf(f, opts, { by }))
  return (
    <ViewShell query={q} errorTitle="Could not load trends" onClear={onClear}>
      {(d) => {
        const ms: string[] = d.months
        const markers = (d.festivals as any[]).filter((x) => /diwali|durga/i.test(x.group) || /diwali|durga/i.test(x.name))
          .map((x) => ({ i: ms.indexOf(x.date.slice(0, 7)), label: /durga/i.test(x.group + x.name) ? 'Durga Puja' : 'Diwali' })).filter((v) => v.i >= 0)
        const series = d.series.map((s: any, k: number) => ({ name: s.name, values: s.values, tone: ((k % 8) + 1) as any }))
        const t = seriesTable('Month', ms.map(monthLong), series, (n) => String(Math.round(n)))
        const dc = d.decomposition
        const parts = [
          { name: 'Observed', values: dc.observed, tone: 1 as const }, { name: 'Trend', values: dc.trend, tone: 3 as const },
        ]
        const dt = seriesTable('Month', ms.map(monthLong), [...parts, { name: 'Seasonal factor', values: dc.seasonal }, { name: 'Remainder factor', values: dc.remainder }], (n) => String(Math.round(n * 100) / 100))
        const sCols: Col<any>[] = [
          { header: 'Family', cell: (s) => s.family, sort: (s) => String(s.family).toLowerCase() },
          { header: 'Seasonal strength (0 to 1)', cell: (s) => <MiniBar value={s.seasonal ?? 0} text={s.seasonal?.toFixed(2) ?? '–'} />, sort: (s) => s.seasonal },
          { header: 'Trend strength (0 to 1)', cell: (s) => <MiniBar value={s.trend ?? 0} text={s.trend?.toFixed(2) ?? '–'} />, sort: (s) => s.trend },
          { header: 'Peak month', cell: (s) => s.peak },
          { header: 'Trough month', cell: (s) => s.trough },
          { header: 'Swing (%)', num: true, cell: (s) => fmtPct(s.swing), sort: (s) => s.swing },
          { header: 'Last 12 months (%)', num: true, cell: (s) => <Delta value={s.growth} text={fmtSigned(s.growth, 1)} />, sort: (s) => s.growth },
        ]
        return (
          <>
            <Findings items={d.findings} title="What the data says" />
            <ContentSwitcher size="sm" selectedIndex={BY.indexOf(by)} onChange={({ index = 0 }) => setBy(BY[index])}>
              {BY_LABEL.map((l) => <Switch key={l} name={l} text={l} />)}
            </ContentSwitcher>
            <ChartCard title="Monthly Volume Trends" subtitle="Diwali and Durga Puja marked. Log scale when needed for readability." label="Monthly trends"
              headers={t.headers} rows={t.rows}
              chart={<TrendChart autoLog x={ms} series={series} yTitle="Units per month" yFmt={(n) => fmtN(n)} markers={markers} label="Monthly trends" />} />
            <div className="grid">
              <ChartCard title="Trend Component" subtitle="Long-run level underlying monthly variation" label="Trend analysis"
                headers={dt.headers} rows={dt.rows}
                chart={<TrendChart x={ms} series={parts} yTitle="Units per month" yFmt={(n) => fmtN(n)} label="Trend analysis" />} />
              <ChartCard title="Seasonal Pattern" subtitle="1.00 is typical. Remainder shows unexplained variation." label="Seasonality"
                headers={dt.headers} rows={dt.rows}
                chart={<TrendChart x={ms} series={[{ name: 'Seasonal factor', values: dc.seasonal, tone: 1 }, { name: 'Remainder factor', values: dc.remainder, tone: 5 }]} yTitle="Factor (1.00 is typical)" yFmt={(n) => n.toFixed(2)} zero={false} label="Seasonality" />} />
              <ChartCard title="Seasonal Strength by Month" subtitle="Above 1.00 = stronger than typical" label="Seasonal heatmap"
                headers={['Family', ...d.months_labels]} rows={d.heatmap.map((h: any) => [h.family, ...h.index.map((v: number) => v.toFixed(2))])}
                chart={<HeatChart rows={d.heatmap.map((h: any) => h.family)} cols={d.months_labels} values={d.heatmap.map((h: any) => h.index)} diverging softDiverging domain={[0.5, 1.5]} fmt={(n) => n.toFixed(2)} legendTitle="Index" legendTicks={Array.from({ length: 11 }, (_, i) => Number((0.5 + i * 0.1).toFixed(1)))} label="Seasonal heatmap" />} />
              <ChartCard title="Annual Pattern" subtitle="Deviation from typical month" label="Annual seasonality"
                headers={['Month', 'Factor']} rows={d.seasonal_profile.map((m: any) => [m.m, m.v.toFixed(2)])}
                chart={<BarsChart items={d.seasonal_profile.map((m: any) => ({ label: m.m, value: m.v - 1, tone: m.v >= 1 ? 1 : 2 }))} yTitle="vs Typical (%)" xTitle="Month" fmt={(n) => fmtSigned(n, 0)} label="Annual seasonality" />} />
            </div>
            <DataCard id="strengths" title="Trend & Seasonality Metrics" description="Strength: 0 (none) to 1 (dominant)"
              cols={sCols} rows={d.strengths} itemsLabel="Families per page" rowKey={(s) => s.family} />
          </>
        )
      }}
    </ViewShell>
  )
}

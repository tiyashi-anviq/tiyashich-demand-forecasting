/* eslint-disable @typescript-eslint/no-explicit-any */
import { fmtDate, fmtN, fmtPct, monthLong } from '../../lib/format'
import { queryOf, type Filters, type Options } from '../../lib/filters'
import { useView } from '../../lib/useView'
import BarsChart from '../../charts/BarsChart'
import StackedChart from '../../charts/StackedChart'
import TrendChart from '../../charts/TrendChart'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { Findings } from '../../ui/Findings'
import { ViewShell } from '../../ui/ViewShell'

/** Keep a long curve readable: at most about 20 evenly spaced points, always including the last. */
function thin<T>(rows: T[], max = 20): T[] {
  if (rows.length <= max) return rows
  const step = Math.ceil(rows.length / max)
  return rows.filter((_, i) => i % step === 0 || i === rows.length - 1)
}

export default function Distribution({ f, opts, onClear }: { f: Filters; opts: Options; onClear: () => void }) {
  const q = useView<any>('eda', 'distribution', queryOf(f, opts))
  return (
    <ViewShell query={q} errorTitle="Could not load the distribution view" onClear={onClear}>
      {(d) => {
        const curve = thin<any>(d.pareto.curve)
        const fr = d.fill_rate
        const spikeCols: Col<any>[] = [
          { header: 'Week', cell: (o) => fmtDate(o.date), sort: (o) => o.date },
          { header: 'Family', cell: (o) => o.family, sort: (o) => String(o.family).toLowerCase() },
          { header: 'Region', cell: (o) => o.region, sort: (o) => String(o.region).toLowerCase() },
          { header: 'Channel', cell: (o) => o.channel, sort: (o) => String(o.channel).toLowerCase() },
          { header: 'SKU', cell: (o) => o.sku, sort: (o) => String(o.sku).toLowerCase() },
          { header: 'Units', num: true, cell: (o) => fmtN(o.qty), sort: (o) => o.qty },
          { header: 'Times the usual', num: true, cell: (o) => `${o.mult.toFixed(1)}×`, sort: (o) => o.mult },
        ]
        const abc = Object.entries(d.pareto.classes).map(([k, v]: any) => ({ k, count: v.count, share: v.share }))
        const abcCols: Col<any>[] = [
          { header: 'Class', cell: (r) => r.k }, { header: 'SKUs', num: true, cell: (r) => r.count },
          { header: 'Share of units (%)', num: true, cell: (r) => fmtPct(r.share, 1) },
        ]
        return (
          <>
            <Findings items={d.findings} title="What the data says" />
            <div className="grid">
              <ChartCard title="How big is a typical week?" subtitle={`Weekly values per series, on a log scale. The median is ${fmtN(d.median, 0)} units.`} label="Weekly values per series, grouped by size"
                headers={['From (units)', 'To (units)', 'Weekly values']} rows={d.histogram.map((h: any) => [fmtN(h.lo, 0), fmtN(h.hi, 0), h.n])}
                chart={<BarsChart items={d.histogram.map((h: any) => ({ label: `${fmtN(h.lo, 0)} to ${fmtN(h.hi, 0)}`, value: Math.max(1, h.n) }))} yTitle="Weekly values (count, log scale)" xTitle="Units in a week" log fmt={(n) => fmtN(n, 0)} label="Weekly values per series, grouped by size" />} />
              <ChartCard title="A few SKUs carry the volume" subtitle={`Cumulative share of units by SKU rank, ${d.pareto.skus} SKUs`} label="Cumulative share of units by SKU rank"
                headers={['SKU rank', 'Cumulative share (%)']} rows={d.pareto.curve.map((c: any) => [c.rank, fmtPct(c.share, 1)])}
                chart={<TrendChart kind="labels" x={curve.map((c) => String(c.rank))} series={[{ name: 'Cumulative share', values: curve.map((c) => c.share), tone: 1 }]} yTitle="Cumulative share of units (%)" yFmt={(n) => `${Math.round(n * 100)}%`} label="Cumulative share of units by SKU rank" pointsAlways />}
                note={abc.map((r) => `${r.k}: ${r.count} SKUs, ${fmtPct(r.share, 0)} of units`).join('. ') + '.'} />
              <ChartCard title="Channel mix over time" subtitle="Share of units by quarter" label="Channel share of units by quarter"
                headers={['Quarter', ...d.channel_mix.channels]} rows={d.channel_mix.quarters.map((q: string, i: number) => [q, ...d.channel_mix.share[i].map((v: number) => fmtPct(v, 1))])}
                chart={<StackedChart share labels={d.channel_mix.quarters.map((q: string) => q.replace(/^20/, ''))} xTitle="Quarter"
                  series={d.channel_mix.channels.map((c: string, k: number) => ({ name: c, values: d.channel_mix.share.map((r: number[]) => r[k]) }))} yTitle="Share of units (%)" label="Channel share of units by quarter" />} />
              <ChartCard title="Orders turned into invoices" subtitle="Fill rate by family: invoiced as a share of ordered" label="Fill rate by family"
                headers={['Family', 'Fill rate (%)']} rows={fr.by_family.map((x: any) => [x.family, fmtPct(x.v, 1)])}
                chart={<BarsChart horizontal items={fr.by_family.map((x: any) => ({ label: x.family, value: x.v, tone: x.v < 0.97 ? 2 : 1 }))} yTitle="Fill rate (%)" fmt={(n) => fmtPct(n, 0)} domain={[0, 1]} label="Fill rate by family" />} />
              <ChartCard title="Fill rate by month" subtitle="Share of ordered units that were invoiced, against the 90% floor" label="Fill rate by month"
                headers={['Month', 'Fill rate (%)']} rows={fr.months.map((m: string, i: number) => [monthLong(m), fmtPct(fr.values[i], 1)])}
                chart={<TrendChart x={fr.months} series={[{ name: 'Fill rate', values: fr.values, tone: 1 }, { name: 'Floor (90%)', values: fr.months.map(() => 0.9), tone: 2 }]} yTitle="Fill rate (%)" yFmt={(n) => fmtPct(n, 0)} zero={false} label="Fill rate by month" />} />
              <ChartCard title="Spikes by family" subtitle="Share of weekly values flagged as one-off bulk or project orders" label="Flagged spikes by family"
                headers={['Family', 'Weeks flagged', 'Share (%)']} rows={d.outliers_by_family.map((o: any) => [o.family, o.count, fmtPct(o.share, 2)])}
                chart={<BarsChart horizontal items={d.outliers_by_family.map((o: any) => ({ label: o.family, value: o.share }))} yTitle="Share of weekly values (%)" fmt={(n) => fmtPct(n, 1)} label="Flagged spikes by family" />} />
              <DataCard id="classes" title="ABC classes" description="SKUs grouped by their share of units" cols={abcCols} rows={abc} itemsLabel="Classes per page" rowKey={(r) => r.k} />
            </div>
            <DataCard id="spikes" title="The biggest spikes" description="Weeks far above that series' usual level. Marked in the data, not removed."
              cols={spikeCols} rows={d.top_outliers} itemsLabel="Spikes per page" rowKey={(o, i) => `${o.date}-${o.sku}-${i}`} defaultSort={{ col: 6, dir: 'desc' }} />
          </>
        )
      }}
    </ViewShell>
  )
}

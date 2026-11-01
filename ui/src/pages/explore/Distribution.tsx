/* eslint-disable @typescript-eslint/no-explicit-any */
import { Tile } from '@reiq/ui/carbon'
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
        const totalValues = d.histogram.reduce((sum: number, h: any) => sum + h.n, 0)
        const lowVol = d.histogram.filter((h: any) => h.hi <= 100).reduce((sum: number, h: any) => sum + h.n, 0)
        const medVol = d.histogram.filter((h: any) => h.hi > 100 && h.hi <= 5000).reduce((sum: number, h: any) => sum + h.n, 0)
        const highVol = d.histogram.filter((h: any) => h.hi > 5000).reduce((sum: number, h: any) => sum + h.n, 0)
        
        return (
          <>
            <Findings items={d.findings} title="What the data says" />
            
            {/* Distribution Summary Card */}
            <Tile className="card">
              <h3 className="card-title">Weekly Sales Distribution</h3>
              <div className="kpi-grid">
                <div className="distribution-kpi">
                  <span className="kpi-label">Median Week</span>
                  <span className="kpi-value">{fmtN(d.median, 0)}</span>
                  <span className="kpi-sub">units per week</span>
                </div>
                <div className="distribution-kpi">
                  <span className="kpi-label">Low Volume</span>
                  <span className="kpi-value">{fmtPct(lowVol / totalValues, 0)}</span>
                  <span className="kpi-sub">under 100 units</span>
                </div>
                <div className="distribution-kpi">
                  <span className="kpi-label">Typical Range</span>
                  <span className="kpi-value">{fmtPct(medVol / totalValues, 0)}</span>
                  <span className="kpi-sub">100-5k units</span>
                </div>
                <div className="distribution-kpi">
                  <span className="kpi-label">High Volume</span>
                  <span className="kpi-value">{fmtPct(highVol / totalValues, 0)}</span>
                  <span className="kpi-sub">over 5k units</span>
                </div>
              </div>
              <p className="supporting" style={{ marginTop: 'var(--cds-spacing-04)' }}>
                The histogram below uses color to show volume ranges: 
                low (under 100), typical (100-5k), high (5k-10k), and extreme (over 10k).
              </p>
            </Tile>

            <div className="grid">
              <ChartCard title="Weekly Sales Volume" subtitle="Distribution of positive sales values across series-weeks (log scale for readability)" label="Weekly distribution"
                headers={['From (units/week)', 'To (units/week)', 'Series-weeks (count)']} rows={d.histogram.map((h: any) => [fmtN(h.lo, 0), fmtN(h.hi, 0), h.n])}
                chart={<BarsChart items={d.histogram.map((h: any) => {
                  // Simplify labels and color-code by volume range
                  const label = h.lo < 1000 ? fmtN(h.lo, 0) : `${fmtN(h.lo / 1000, 0)}k`
                  // Color coding: low (gray), typical (blue), high (teal), extreme (purple)
                  let tone: 1 | 2 | 3 | 8 = 1
                  if (h.hi <= 100) tone = 8  // Low volume - gray
                  else if (h.hi <= 5000) tone = 1  // Typical - blue
                  else if (h.hi <= 10000) tone = 3  // High - teal
                  else tone = 2  // Extreme - orange
                  return { label, value: Math.max(1, h.n), tone }
                })} yTitle="Series-weeks (count)" xTitle="Units per week" log fmt={(n) => fmtN(n, 0)} label="Weekly distribution" />}
                note={`Color-coded: Gray (under 100), Blue (100-5k), Teal (5k-10k), Orange (over 10k). Median: ${fmtN(d.median, 0)} units. Most weeks (${fmtPct(medVol / totalValues, 0)}) are typical.`} />
              <ChartCard title="SKU Concentration (80/20 Rule)" subtitle={`Pareto analysis of ${d.pareto.skus} SKUs`} label="Pareto curve"
                headers={['SKU rank', 'Cumulative share (%)']} rows={d.pareto.curve.map((c: any) => [c.rank, fmtPct(c.share, 1)])}
                chart={<TrendChart kind="labels" x={curve.map((c) => String(c.rank))} series={[{ name: 'Cumulative share', values: curve.map((c) => c.share), tone: 1 }]} xTitle="SKU rank" yTitle="Share (%)" yFmt={(n) => `${Math.round(n * 100)}%`} label="Pareto curve" pointsAlways />}
                note={`ABC Classification: ${abc.map((r) => `${r.k} (${r.count} SKUs = ${fmtPct(r.share, 0)} volume)`).join(', ')}`} />
              <ChartCard title="Channel Evolution" subtitle="Quarterly unit share by channel" label="Channel mix"
                headers={['Quarter', ...d.channel_mix.channels]} rows={d.channel_mix.quarters.map((q: string, i: number) => [q, ...d.channel_mix.share[i].map((v: number) => fmtPct(v, 1))])}
                chart={<StackedChart share labels={d.channel_mix.quarters.map((q: string) => q.replace(/^20/, ''))} xTitle="Quarter"
                  series={d.channel_mix.channels.map((c: string, k: number) => ({ name: c, values: d.channel_mix.share.map((r: number[]) => r[k]) }))} yTitle="Share (%)" label="Channel mix" />} />
              <ChartCard title="Fill Rate by Family" subtitle="Orders fulfilled (invoiced/ordered)" label="Fill rate"
                headers={['Family', 'Fill rate (%)']} rows={fr.by_family.map((x: any) => [x.family, fmtPct(x.v, 1)])}
                chart={<BarsChart horizontal items={fr.by_family.map((x: any) => ({ label: x.family, value: x.v, tone: x.v < 0.97 ? 2 : 1 }))} yTitle="Rate (%)" xTitle="Family" fmt={(n) => fmtPct(n, 0)} domain={[0, 1]} label="Fill rate" />} />
              <ChartCard title="Monthly Fill Rate" subtitle="vs 90% target" label="Fill trend"
                headers={['Month', 'Fill rate (%)']} rows={fr.months.map((m: string, i: number) => [monthLong(m), fmtPct(fr.values[i], 1)])}
                chart={<TrendChart x={fr.months} series={[{ name: 'Fill rate', values: fr.values, tone: 1 }, { name: 'Target', values: fr.months.map(() => 0.9), tone: 2 }]} yTitle="Rate (%)" yFmt={(n) => fmtPct(n, 0)} zero={false} label="Fill trend" />} />
              <ChartCard title="Outlier Detection" subtitle="Flagged bulk/project orders" label="Outliers"
                headers={['Family', 'Weeks flagged', 'Share (%)']} rows={d.outliers_by_family.map((o: any) => [o.family, o.count, fmtPct(o.share, 2)])}
                chart={<BarsChart horizontal items={d.outliers_by_family.map((o: any) => ({ label: o.family, value: o.share }))} yTitle="Share (%)" xTitle="Family" fmt={(n) => fmtPct(n, 1)} label="Outliers" />} />
              <DataCard id="classes" title="ABC Classification" description="SKU segmentation by volume" cols={abcCols} rows={abc} itemsLabel="Classes per page" rowKey={(r) => r.k} />
            </div>
            <DataCard id="spikes" title="Major Outliers" description="Weeks with unusual spikes (flagged, not removed)"
              cols={spikeCols} rows={d.top_outliers} itemsLabel="Spikes per page" rowKey={(o, i) => `${o.date}-${o.sku}-${i}`} defaultSort={{ col: 6, dir: 'desc' }} />
          </>
        )
      }}
    </ViewShell>
  )
}

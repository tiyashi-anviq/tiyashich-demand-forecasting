/* eslint-disable @typescript-eslint/no-explicit-any */
import { Tag } from '@reiq/ui/carbon'
import { fmtN, fmtPct } from '../../lib/format'
import { queryOf, type Filters, type Options } from '../../lib/filters'
import { useView } from '../../lib/useView'
import BarsChart from '../../charts/BarsChart'
import HeatChart from '../../charts/HeatChart'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { Findings } from '../../ui/Findings'
import { MiniBar } from '../../ui/MiniBar'
import { ViewShell } from '../../ui/ViewShell'

const FIX_LABELS: Record<string, string> = {
  duplicates_removed: 'Repeated rows removed', blanks_filled: 'Blank cells filled', locations_resolved: 'Place names matched',
  outliers_flagged: 'Spikes marked', outliers_capped: 'Spikes capped', demand_estimated: 'Stockout weeks estimated', promo_weeks: 'Promotion weeks separated',
  labels_standardised: 'Labels standardised', negatives_zeroed: 'Negative values set to zero',
}
const GROUP_LABELS: Record<string, string> = { calendar: 'Calendar and festivals', weather: 'Weather', price: 'Price and promotion', commercial: 'Downstream and market', macro: 'Commodity and macro' }

const counts = (title: string, sub: string, items: any[], head: string, unit: string, trim: (k: string) => string = (k) => k) => (
  <ChartCard title={title} subtitle={sub} label={title} headers={[head, unit]} rows={items.map((h) => [h.k, h.v])}
    chart={<BarsChart items={items.map((h) => ({ label: trim(h.k), value: h.v }))} yTitle={unit} xTitle={head} fmt={(n) => String(Math.round(n))} label={title} />} />
)

export default function Profile({ f, opts, onClear }: { f: Filters; opts: Options; onClear: () => void }) {
  const q = useView<any>('eda', 'profile', queryOf(f, opts))
  return (
    <ViewShell query={q} errorTitle="Could not load the data profile" onClear={onClear}>
      {(d) => {
        const tot = d.coverage.volume.flat().reduce((a: number, b: number) => a + b, 0) || 1
        const covCols: Col<any>[] = [
          { header: 'Covariate', cell: (c) => c.label, sort: (c) => String(c.label).toLowerCase() },
          { header: 'Group', cell: (c) => <Tag size="sm" type="gray">{GROUP_LABELS[c.group] ?? c.group}</Tag>, sort: (c) => String(c.group) },
          { header: 'Coverage (%)', cell: (c) => <MiniBar value={c.coverage} text={fmtPct(c.coverage)} />, sort: (c) => c.coverage },
          { header: 'Available', cell: (c) => (c.first ? `${c.first.slice(0, 7)} to ${c.last.slice(0, 7)}` : 'No data') },
        ]
        const cleanCols: Col<any>[] = [
          { header: 'Family', cell: (c) => c.family, sort: (c) => String(c.family).toLowerCase() },
          { header: 'Invoiced (units)', num: true, cell: (c) => fmtN(c.invoiced), sort: (c) => c.invoiced },
          { header: 'Corrected (units)', num: true, cell: (c) => fmtN(c.corrected), sort: (c) => c.corrected },
          { header: 'Uplift (%)', num: true, cell: (c) => fmtPct(c.lift, 2), sort: (c) => c.lift },
          { header: 'Stockout weeks', num: true, cell: (c) => c.stockout_weeks.toLocaleString('en-IN'), sort: (c) => c.stockout_weeks },
        ]
        const fixes = Object.entries(d.fixes).filter(([k, v]) => FIX_LABELS[k] && (v as number) > 0).map(([k, v]) => ({ label: FIX_LABELS[k], n: v as number }))
        const fixCols: Col<any>[] = [{ header: 'What cleaning did', cell: (r) => r.label }, { header: 'Count', num: true, cell: (r) => r.n.toLocaleString('en-IN'), sort: (r) => r.n }]
        return (
          <>
            <Findings items={d.findings} title="What the data says" />
            <div className="grid">
              <ChartCard title="Volume Distribution" subtitle="Units by family and region" label="Volume heatmap"
                headers={['Family', ...d.coverage.regions]} rows={d.coverage.families.map((fm: string, i: number) => [fm, ...d.coverage.volume[i].map((v: number) => fmtN(v))])}
                chart={<HeatChart rows={d.coverage.families} cols={d.coverage.regions} values={d.coverage.volume.map((r: number[]) => r.map((v) => v / tot))} rowTitle="Family" columnTitle="Region" fmt={(n) => fmtPct(n, 1)} label="Volume heatmap" legendTitle="Share of total volume (%)" legendTicks={[0, 0.25, 0.5, 0.75, 1]} />} />
              {counts('History Length', 'Series by weeks of data', d.history, 'Weeks of history', 'Series', (k) => k.replace(' weeks', '').replace('Under ', '<'))}
              {counts('Zero Sales Weeks', "Series by share of weeks with no sales", d.zeros, 'Weeks with no sales (%)', 'Series')}
              {counts('Series Start Dates', 'When products began selling', d.starts, 'Quarter', 'New series', (k) => k.replace(/^20/, ''))}
            </div>
            <DataCard id="covariates" title="What we have to explain demand" description="Every covariate in the data, and how much of the history it covers"
              cols={covCols} rows={d.covariates} itemsLabel="Covariates per page" rowKey={(c) => c.id} />
            <div className="grid">
              <DataCard id="cleaning" title="What cleaning changed" description="Stockout correction by family, at depot level"
                cols={cleanCols} rows={d.cleaning} itemsLabel="Families per page" rowKey={(c) => c.family} />
              {fixes.length > 0 && <DataCard id="fixes" title="Fixes applied" description="Counted across all tables" cols={fixCols} rows={fixes} itemsLabel="Fixes per page" rowKey={(r) => r.label} />}
            </div>
          </>
        )
      }}
    </ViewShell>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Button, Modal, Tag, Tile } from '@reiq/ui/carbon'
import { fmtN, fmtPct } from '../../lib/format'
import { queryOf, type Filters, type Options } from '../../lib/filters'
import { useView } from '../../lib/useView'
import BarsChart from '../../charts/BarsChart'
import StackedChart from '../../charts/StackedChart'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { Findings } from '../../ui/Findings'
import { ViewShell } from '../../ui/ViewShell'

const SEGS = ['smooth', 'erratic', 'intermittent', 'lumpy'] as const
const SEG_TONE = { smooth: 1, erratic: 4, intermittent: 3, lumpy: 2 } as const
const SEG_TAG: Record<string, any> = { smooth: 'blue', erratic: 'warm-gray', intermittent: 'teal', lumpy: 'red' }

const tally = (rows: any[], k: string) => {
  const m = new Map<string, number>()
  rows.forEach((r) => m.set(r[k], (m.get(r[k]) || 0) + 1))
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function SeriesView({ seg, d, onClose }: { seg: any; d: any; onClose: () => void }) {
  const rows = d.series.filter((r: any) => r.seg === seg.id)
  const sku = tally(rows, 'sku'), reg = tally(rows, 'region'), ch = tally(rows, 'channel')
  const short = rows.filter((r: any) => r.weeks < 52).length
  const cols: Col<any>[] = [
    { header: 'SKU', cell: (r) => r.sku, sort: (r) => String(r.sku) },
    { header: 'Region', cell: (r) => r.region, sort: (r) => String(r.region) },
    { header: 'Channel', cell: (r) => r.channel, sort: (r) => String(r.channel) },
    { header: 'Family', cell: (r) => r.fam, sort: (r) => String(r.fam) },
    { header: 'Units', num: true, cell: (r) => fmtN(r.vol), sort: (r) => r.vol },
    { header: 'First sale', cell: (r) => r.first, sort: (r) => String(r.first) },
    { header: 'Weeks of history', num: true, cell: (r) => (r.weeks < 52 ? `${r.weeks}, under a year` : r.weeks), sort: (r) => r.weeks },
    { header: 'Weeks between sales', num: true, cell: (r) => r.adi.toFixed(2), sort: (r) => r.adi },
    { header: 'Variability', num: true, cell: (r) => r.cv2.toFixed(2), sort: (r) => r.cv2 },
  ]
  return (
    <Modal open passiveModal size="lg" modalHeading={`${seg.label} series: ${rows.length.toLocaleString('en-IN')}`} onRequestClose={onClose}>
      <div className="stack-05">
        <p className="supporting">A series is one SKU sold in one region through one channel. Under the current filters, {rows.length.toLocaleString('en-IN')} of them are {seg.label.toLowerCase()}: {sku.length} SKU{sku.length === 1 ? '' : 's'} across {reg.length} region{reg.length === 1 ? '' : 's'} and {ch.length} channel{ch.length === 1 ? '' : 's'}.{short ? ` ${short} have under a year of history.` : ''} A series counts here if it sold in at least one week.</p>
        <DataCard id="seg" title="Series" cols={cols} rows={rows} itemsLabel="Series per page" rowKey={(r) => String(r.key)} defaultSort={{ col: 4, dir: 'desc' }} />
      </div>
    </Modal>
  )
}

export default function Segments({ f, opts, onClear }: { f: Filters; opts: Options; onClear: () => void }) {
  const q = useView<any>('eda', 'segments', queryOf(f, opts))
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ViewShell query={q} errorTitle="Could not load forecastability" onClear={onClear}>
      {(d) => {
        const famCols: Col<any>[] = [
          { header: 'Family', cell: (b) => b.family, sort: (b) => String(b.family).toLowerCase() },
          { header: 'Months', num: true, cell: (b) => b.months },
          { header: 'Total error (%)', num: true, cell: (b) => fmtPct(b.wape, 1), sort: (b) => b.wape },
          { header: 'Under-forecast (%)', num: true, cell: (b) => fmtPct(b.under, 1), sort: (b) => b.under },
          { header: 'Over-forecast (%)', num: true, cell: (b) => fmtPct(b.over, 1), sort: (b) => b.over },
        ]
        const modelRows = [...d.summary.map((s: any) => ({ tag: s.label, type: SEG_TAG[s.id], what: s.model })),
          { tag: 'Short history', type: 'gray', what: `${d.short_history.toLocaleString('en-IN')} series under a year: borrow the pattern of similar products` }]
        const modelCols: Col<any>[] = [
          { header: 'Type', cell: (r) => <Tag size="sm" type={r.type}>{r.tag}</Tag> },
          { header: 'Suggested approach', cell: (r) => r.what },
        ]
        return (
          <>
            <Findings items={d.findings} title="What the data says" />
            <div className="grid seg-grid">
              {d.summary.map((s: any) => (
                <Tile className="card stack-02" key={s.id}>
                  <div className="row-03">
                    <Tag size="sm" type={SEG_TAG[s.id]}>{s.label}</Tag>
                    <span className="footnote">{s.rule}</span>
                  </div>
                  <div className="row-03">
                    <span className="kpi-value">{s.count.toLocaleString('en-IN')}</span>
                    <span className="kpi-sub">series · {fmtPct(s.volume_share, 1)} of volume</span>
                  </div>
                  {s.count > 0 && (
                    <div>
                      <Button kind="ghost" size="sm" onClick={() => setOpen(s.id)}>
                        View {s.count.toLocaleString('en-IN')} {s.label.toLowerCase()}
                      </Button>
                    </div>
                  )}
                </Tile>
              ))}
            </div>
            {open && <SeriesView seg={d.summary.find((x: any) => x.id === open)} d={d} onClose={() => setOpen(null)} />}

            <div className="grid">
              <div className="span-all">
                <ChartCard title="Forecastability Mix by Family" subtitle="Share of each family's series in each forecastability group. Compare the mix, not family size." label="Forecastability mix by family"
                  headers={['Family', ...SEGS.map((k) => k[0].toUpperCase() + k.slice(1))]} rows={d.by_family.map((r: any) => [r.family, ...SEGS.map((k) => r[k])])}
                  chart={<StackedChart horizontal share barThickness={16} labels={d.by_family.map((r: any) => r.family)} xTitle="Family" yTitle="Share of series (%)"
                    series={SEGS.map((k) => ({ name: k[0].toUpperCase() + k.slice(1), values: d.by_family.map((r: any) => r[k]), tone: SEG_TONE[k] }))} label="Forecastability mix by family" />}
                  note="Each family totals 100%. Switch to Table for exact series counts. Smooth series are easiest to forecast; intermittent and lumpy series may need aggregation or manual review." />
              </div>
              {d.baseline.length ? (
                <ChartCard title="Naive Forecast Baseline" subtitle="Error using last year's value as forecast (test months)" label="Baseline forecast error by family"
                  headers={['Family', 'Months', 'Total error (%)', 'Under (%)', 'Over (%)']} rows={d.baseline.map((b: any) => [b.family, b.months, fmtPct(b.wape, 1), fmtPct(b.under, 1), fmtPct(b.over, 1)])}
                  chart={<BarsChart horizontal items={d.baseline.map((b: any) => ({ label: b.family, value: b.wape }))} yTitle="Error (%)" fmt={(n) => fmtPct(n, 0)} label="Baseline forecast error by family" />}
                  note={d.baseline_series ? `Overall baseline error: ${fmtPct(d.baseline_series.wape, 1)} (${d.baseline_series.months} test months). Any model should beat this naive approach.` : undefined} />
              ) : (
                <DataCard id="baseline" title="Naive Forecast Baseline" description="Needs at least three test months in the selected period." cols={famCols} rows={[]} itemsLabel="Families per page" rowKey={(b) => b.family} />
              )}
              <DataCard id="models" title="Recommended Forecast Strategy" description="Model approach by series type" cols={modelCols} rows={modelRows} itemsLabel="Types per page" rowKey={(r) => r.tag} />
            </div>
          </>
        )
      }}
    </ViewShell>
  )
}

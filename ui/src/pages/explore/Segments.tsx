/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Button, Modal, Tag, Tile } from '@reiq/ui/carbon'
import { fmtN, fmtPct } from '../../lib/format'
import { queryOf, type Filters, type Options } from '../../lib/filters'
import { useView } from '../../lib/useView'
import BarsChart from '../../charts/BarsChart'
import BubbleScatter from '../../charts/BubbleScatter'
import StackedChart from '../../charts/StackedChart'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { Findings } from '../../ui/Findings'
import { ViewShell } from '../../ui/ViewShell'

const SEGS = ['smooth', 'erratic', 'intermittent', 'lumpy'] as const
const SEG_TONE = { smooth: 1, erratic: 4, intermittent: 3, lumpy: 2 } as const
const SEG_TAG: Record<string, any> = { smooth: 'blue', erratic: 'warm-gray', intermittent: 'teal', lumpy: 'red' }
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

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
        const pts: any[] = d.points
        const xMax = Math.min(8, Math.max(2, ...pts.map((p) => p.adi)) * 1.05)
        const yMax = Math.min(3, Math.max(1, ...pts.map((p) => p.cv2)) * 1.05)
        // when every series sells almost every week, the 'weeks between sales' axis is one stripe: spread the dots by variability and volume instead
        const flat = pts.length > 0 && Math.max(...pts.map((p) => p.adi)) < 1.32
        const vols = pts.map((p) => Math.max(1, p.vol))
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
                  <div className="row-03"><Tag size="sm" type={SEG_TAG[s.id]}>{s.label}</Tag><span className="footnote">{s.rule}</span></div>
                  <div className="row-03"><span className="kpi-value">{s.count.toLocaleString('en-IN')}</span><span className="kpi-sub">series, {fmtPct(s.volume_share, 1)} of volume</span></div>
                  <p className="supporting">{s.model}</p>
                  {s.count ? <div><Button kind="ghost" size="sm" onClick={() => setOpen(s.id)}>{`Show the ${s.count.toLocaleString('en-IN')} ${s.label.toLowerCase()} series`}</Button></div> : null}
                </Tile>
              ))}
            </div>
            {open && <SeriesView seg={d.summary.find((x: any) => x.id === open)} d={d} onClose={() => setOpen(null)} />}
            <div className="grid">
              {flat ? (
                <ChartCard title="How steady is each series?" subtitle="The biggest series. Each dot is one series: how much its weekly sales swing, against how much it sells."
                  label="Variability of sale size against units sold, one dot per series"
                  headers={['Series', 'Variability', 'Type', 'Units']} rows={pts.map((p) => [String(p.key).replace(/\|/g, ' · '), p.cv2.toFixed(2), cap(p.seg), Math.round(p.vol)])}
                  chart={<BubbleScatter dots={pts.map((p) => ({ group: cap(p.seg), x: p.cv2, y: Math.max(1, p.vol), r: 1 }))} tones={Object.fromEntries(SEGS.map((s) => [cap(s), SEG_TONE[s]]))}
                    xTitle="Variability of sale size" yTitle="Units sold (log scale)" xLine={0.49} yLine={null} xMax={yMax} yMax={Math.max(...vols) * 1.5} yMin={Math.max(1, Math.min(...vols) / 1.5)} yLog rRange={[3, 4]} label="Variability of sale size against units sold, one dot per series" />}
                  note="Every series here sells in almost every week, so the weeks-between-sales measure does not separate them and is left out. The line at 0.49 is the standard cut-off: to its left sales are steady, to its right they swing." />
              ) : (
              <ChartCard title="How regular is each series?" subtitle="The biggest series. Each dot is one series; bigger dots sell more."
                label="Weeks between sales against variability, one dot per series"
                headers={['Series', 'Weeks between sales', 'Variability', 'Type', 'Units']} rows={pts.map((p) => [String(p.key).replace(/\|/g, ' · '), p.adi.toFixed(2), p.cv2.toFixed(2), cap(p.seg), Math.round(p.vol)])}
                chart={<BubbleScatter dots={pts.map((p) => ({ group: cap(p.seg), x: p.adi, y: p.cv2, r: p.vol }))} tones={Object.fromEntries(SEGS.map((s) => [cap(s), SEG_TONE[s]]))}
                  xTitle="Weeks between sales" yTitle="Variability of sale size" xLine={1.32} yLine={0.49} xMax={xMax} yMax={yMax} label="Weeks between sales against variability, one dot per series" />}
                note="The lines are the standard cut-offs: 1.32 weeks between sales and 0.49 variability." />
              
              )}
              <ChartCard title="Mix by family" subtitle="Number of series of each type" label="Series of each type, by family"
                headers={['Family', ...SEGS.map(cap)]} rows={d.by_family.map((r: any) => [r.family, ...SEGS.map((k) => r[k])])}
                chart={<StackedChart labels={d.by_family.map((r: any) => r.family.split(' ')[0])} xTitle="Family" yTitle="Series (count)" fmt={(n) => String(Math.round(n))}
                  series={SEGS.map((k) => ({ name: cap(k), values: d.by_family.map((r: any) => r[k]), tone: SEG_TONE[k] }))} label="Series of each type, by family" />} />
              {d.baseline.length ? (
                <ChartCard title="The number to beat" subtitle="Error if last year's number were the forecast, months since Oct 2025" label="Error if last year's number were the forecast, by family"
                  headers={['Family', 'Months', 'Total error (%)', 'Under (%)', 'Over (%)']} rows={d.baseline.map((b: any) => [b.family, b.months, fmtPct(b.wape, 1), fmtPct(b.under, 1), fmtPct(b.over, 1)])}
                  chart={<BarsChart horizontal items={d.baseline.map((b: any) => ({ label: b.family, value: b.wape }))} yTitle="Error (%)" fmt={(n) => fmtPct(n, 0)} label="Error if last year's number were the forecast, by family" />}
                  note={d.baseline_series ? `Counting each region, SKU and channel on its own, last year's number misses by ${fmtPct(d.baseline_series.wape, 1)} over ${d.baseline_series.months} months. A real model should do better than this.` : undefined} />
              ) : (
                <DataCard id="baseline" title="The number to beat" description="Needs at least three test months in the selected period." cols={famCols} rows={[]} itemsLabel="Families per page" rowKey={(b) => b.family} />
              )}
              <DataCard id="models" title="What this means for the models" description="Suggested approach for each type" cols={modelCols} rows={modelRows} itemsLabel="Types per page" rowKey={(r) => r.tag} />
            </div>
          </>
        )
      }}
    </ViewShell>
  )
}

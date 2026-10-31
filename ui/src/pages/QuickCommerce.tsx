/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ModulePageHeader } from '@reiq/ui'
import { ContentSwitcher, Dropdown, Switch } from '@reiq/ui/carbon'
import { MODULE } from '../App'
import { getJson } from '../lib/http'
import { useBuild } from '../lib/useView'
import { fmtDate, fmtN, fmtPct, fmtSigned } from '../lib/format'
import { useView } from '../lib/useView'
import TrendChart from '../charts/TrendChart'
import { seriesTable, type Series } from '../charts/kit'
import { ChartCard } from '../ui/ChartCard'
import { DataCard, type Col } from '../ui/DataCard'
import { StatRow } from '../ui/StatRow'
import { NeedsData } from '../ui/NeedsData'
import { ViewShell } from '../ui/ViewShell'

const ALL = 'All'
const SPLITS = ['Category', 'Depot', 'Partner'] as const
const WINDOWS = [{ id: '13', label: '13 weeks' }, { id: '26', label: '26 weeks' }, { id: 'all', label: 'All' }]
const sum = (a: (number | null)[]) => a.reduce<number>((s, v) => s + (v ?? 0), 0)

export default function QuickCommerce() {
  const build = useBuild('eda')
  const [depot, setDepot] = useState(ALL), [cat, setCat] = useState(ALL), [partner, setPartner] = useState(ALL)
  const [by, setBy] = useState<(typeof SPLITS)[number]>('Category')
  const [win, setWin] = useState('26'), [buf, setBuf] = useState('2')
  const opts = useQuery({ queryKey: ['qc', 'options'], queryFn: () => getJson<any>('/api/quick-commerce/options'), enabled: build.data?.state === 'ready', staleTime: Infinity })
  const qs = new URLSearchParams()
  if (depot !== ALL) qs.set('depot', depot)
  if (cat !== ALL) qs.set('category', cat)
  if (partner !== ALL) qs.set('partner', partner)
  const q = useView<any>('quick-commerce', 'view', qs.toString(), opts.isSuccess)
  const pick = (id: string, label: string, items: string[], v: string, set: (s: string) => void) => (
    <Dropdown id={id} size="md" titleText={label} label={label} items={[ALL, ...items]} itemToString={(i: string | null) => i ?? ''} selectedItem={v} onChange={({ selectedItem }: any) => selectedItem && set(selectedItem)} />
  )
  return (
    <>
      <ModulePageHeader moduleLabel={MODULE} title="Quick commerce and OTIF"
        description="What quick-commerce partners ask for against what they actually sell, how well we deliver it, and what to ship instead. Synthetic data."
        toolbar={opts.data ? (
          <div className="row-03">
            {pick('qc-d', 'Depot', opts.data.depots, depot, setDepot)}
            {pick('qc-c', 'Category', opts.data.categories, cat, setCat)}
            {pick('qc-p', 'Partner', opts.data.partners, partner, setPartner)}
          </div>
        ) : undefined} />
      <NeedsData base="eda" building={{ what: 'prepare your data', how: 'Joining sales with partner and weather data takes about 15 seconds the first time and is saved afterwards.' }}>
        <ViewShell query={q} errorTitle="Could not load quick commerce" emptyTitle="No quick-commerce orders for this selection" emptyMessage="Pick another depot, category or partner." onClear={() => { setDepot(ALL); setCat(ALL); setPartner(ALL) }}>
          {(d) => {
            const n = d.weeks.length
            const lo = win === 'all' ? 0 : Math.max(0, n - +win)
            const idx = Array.from({ length: n - lo }, (_, i) => i + lo)
            const at = (a: any[]) => idx.map((i) => a[i])
            const po = sum(at(d.ordered)), cf = sum(at(d.confirmed)), so = sum(at(d.sellout))
            const rp = d.replay[buf]
            const cw = idx.filter((i) => rp.rec[i] !== null)
            const rec = sum(cw.map((i) => rp.rec[i])), reqW = sum(cw.map((i) => d.ordered[i])), lost = sum(cw.map((i) => rp.lost[i])), soW = sum(cw.map((i) => d.sellout[i]))
            const so4 = sum(d.sellout.slice(-4)) / 4, stock = d.stock[n - 1] ?? 0
            const cover = so4 ? stock / so4 : 0
            let peak = 0
            idx.forEach((i) => { if (d.sellout[i] > 0) peak = Math.max(peak, d.ordered[i] / d.sellout[i]) })
            const ot = d.otif ? idx.map((i) => d.otif.otif[i]).filter((v: any) => v != null) : []
            const otifAvg = ot.length ? ot.reduce((s: number, v: number) => s + v, 0) / ot.length : null
            const x = idx.map((i) => d.weeks[i])
            const series: Series[] = [
              { name: 'Requested by partners', values: at(d.ordered), tone: 5 },
              { name: 'Confirmed to partners', values: at(d.confirmed), tone: 3 },
              { name: 'Real need (partner sell-out)', values: at(d.sellout), tone: 1 },
              { name: `Recommended shipment (${buf} wk buffer)`, values: at(rp.rec), tone: 6 },
            ]
            const t1 = seriesTable('Week starting', x.map(fmtDate), series, fmtN)
            const dr: Series[] = d.otif ? [
              { name: 'Fill rate (units)', values: at(d.otif.fill), tone: 2 }, { name: 'OTIF (orders)', values: at(d.otif.otif), tone: 1 }, { name: 'On time', values: at(d.otif.on_time), tone: 3 },
            ] : []
            const t2 = seriesTable('Week starting', x.map(fmtDate), dr, (v) => fmtPct(v, 1))
            const mk = (name: string): Col<any>[] => [
              { header: name, cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
              { header: 'Requested (units)', num: true, cell: (r) => fmtN(r.po), sort: (r) => r.po },
              { header: 'Real need (units)', num: true, cell: (r) => fmtN(r.sellout), sort: (r) => r.sellout },
              { header: 'Over-order multiple (×)', num: true, cell: (r) => (r.sellout ? (r.po / r.sellout).toFixed(2) : '–'), sort: (r) => (r.sellout ? r.po / r.sellout : null) },
              { header: 'Fulfilment (%)', num: true, cell: (r) => fmtPct(r.po ? r.confirmed / r.po : null, 1), sort: (r) => (r.po ? r.confirmed / r.po : null) },
              { header: 'Stock built up at partner (units)', num: true, cell: (r) => fmtN(r.stock), sort: (r) => r.stock },
              { header: 'Cover now (weeks)', num: true, cell: (r) => (r.last.so ? (r.stock / r.last.so).toFixed(1) : '–'), sort: (r) => (r.last.so ? r.stock / r.last.so : null) },
            ]
            return (
              <>
                <div className="row-03">
                  <ContentSwitcher size="md" selectedIndex={WINDOWS.findIndex((w) => w.id === win)} onChange={(e: any) => setWin(WINDOWS[e.index].id)}>
                    {WINDOWS.map((w) => <Switch key={w.id} name={w.id} text={w.label} />)}
                  </ContentSwitcher>
                  <Dropdown id="qc-b" size="md" titleText="Buffer stock at partner" label="Buffer" items={['1', '2', '3']} itemToString={(i: string | null) => (i ? `${i} week${i === '1' ? '' : 's'}` : '')} selectedItem={buf} onChange={({ selectedItem }: any) => selectedItem && setBuf(selectedItem)} />
                </div>
                <StatRow items={[
                  { label: 'Fulfilment (%)', value: fmtPct(po ? cf / po : null, 1), sublabel: `Confirmed ${fmtN(cf)} of ${fmtN(po)} requested units` },
                  { label: 'OTIF (%)', value: otifAvg === null ? '–' : fmtPct(otifAvg, 1), sublabel: 'Orders on time and in full, all channels for these categories' },
                  { label: 'Over-order multiple (×)', value: so ? (po / so).toFixed(1) : '–', sublabel: `Peak week ${peak.toFixed(1)}×` },
                  { label: 'Partner stock cover', value: `${cover.toFixed(1)} wk`, sublabel: `${fmtN(stock)} units confirmed but not yet sold, since the first order` },
                  { label: 'Shipped against real need (%)', value: reqW ? fmtSigned(rec / reqW - 1, 0) : '–', sublabel: `Recommended ${fmtN(rec)} against ${fmtN(reqW)} requested` },
                ]} />
                <ChartCard title="Requested against real need" subtitle="Weekly units, quick commerce"
                  label="Weekly quick-commerce units requested, confirmed, sold and recommended"
                  chart={<TrendChart x={x} series={series} kind="week" yTitle="Units per week" label="Weekly quick-commerce orders, confirmations, sell-out and recommended shipment" dotRadius={2} />}
                  headers={t1.headers} rows={t1.rows}
                  note={`Partners asked for ${so ? (po / so).toFixed(1) : '–'}× what they sold to shoppers, and we confirmed ${fmtPct(po ? cf / po : null, 0)} of it. The gap does not disappear: it builds up as stock at the partner. Shipping only the recent sell-out plus ${buf} week${buf === '1' ? '' : 's'} of cover would have missed ${lost > 0 ? `${fmtN(lost)} units` : 'nothing'} of the ${fmtN(soW)} sold since ${cw.length ? fmtDate(d.weeks[cw[0]]) : '–'}. The recommendation uses the average of the last four weeks' sell-out as the forecast.`} />
                {d.otif ? (
                  <ChartCard title="Delivery performance" subtitle="Weekly rates, all channels"
                    label="Weekly fill rate, on-time rate and OTIF"
                    chart={<TrendChart x={x} series={dr} kind="week" yTitle="Share of orders" yFmt={(v) => fmtPct(v, 0)} zero={false} label="Weekly fill rate, on-time rate and OTIF" dotRadius={2} />}
                    headers={t2.headers} rows={t2.rows}
                    note="The service table covers every channel, so these rates are for the product families selected, not for quick commerce alone. Fulfilment counts units; OTIF counts whole order lines, which is why it is lower." />
                ) : null}
                <ContentSwitcher size="sm" selectedIndex={SPLITS.indexOf(by)} onChange={({ index = 0 }) => setBy(SPLITS[index])}>
                  {SPLITS.map((x) => <Switch key={x} name={x} text={`By ${x.toLowerCase()}`} />)}
                </ContentSwitcher>
                <DataCard id="qcs" title={`Requested against real need, by ${by.toLowerCase()}`} description="Over all weeks since the first order: what partners requested, what they really needed and the stock built up at partners"
                  cols={mk(by)} rows={by === 'Category' ? d.by_category : by === 'Depot' ? d.by_depot : d.by_partner} itemsLabel="rows" rowKey={(r) => r.name} defaultSort={{ col: 3, dir: 'desc' }} defaultOpen />
              </>
            )
          }}
        </ViewShell>
      </NeedsData>
    </>
  )
}

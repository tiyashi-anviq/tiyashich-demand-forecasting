/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ModulePageHeader } from '@reiq/ui'
import { ContentSwitcher, Dropdown, Switch } from '@reiq/ui/carbon'
import { MODULE } from '../App'
import { getJson } from '../lib/http'
import { useBuild } from '../lib/useView'
import { fmtDate, fmtN, fmtPct, fmtSigned, monthLong } from '../lib/format'
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

/** The main model's monthly forecasts for the quick-commerce (dark store) channel: what it said one, two and three months ahead, against what was ordered. */
function ChannelForecast({ family, region }: { family: string | null; region: string | null }) {
  const qs = new URLSearchParams({ channel: 'DARK' })
  if (family) qs.set('family', family)
  if (region) qs.set('region', region)
  const q = useView<any>('forecast', 'vintages', qs.toString())
  const d = q.data
  if (!d || d.empty || !d.horizons) return null
  const past: string[] = d.months, open: string[] = [...(d.latest?.months ?? [])].sort()
  const x = [...past, ...open].map((m) => monthLong(m))
  const pad = (v: number[], at: Record<number, number | null | undefined> = {}) => [...v, ...open.map((_, i) => at[i] ?? null)] as (number | null)[]
  const ah = (h: string, i: number) => d.horizons[h]?.ahead?.[i]
  const series: Series[] = [
    { name: 'Orders received (actual)', values: pad(d.actual), tone: 1 },
    { name: 'M1 forecast (1 month ahead)', values: pad(d.horizons.M1.forecast, { 0: ah('M1', 0) }), tone: 2 },
    { name: 'M2 forecast (2 months ahead)', values: pad(d.horizons.M2.forecast, { 1: ah('M2', 1) }), tone: 5 },
    { name: 'M3 forecast (3 months ahead)', values: pad(d.horizons.M3.forecast, { 2: ah('M3', 2) }), tone: 3 },
  ]
  const t = seriesTable('Month', x, series, fmtN)
  return (
    <ChartCard title="Monthly forecast for the quick-commerce channel" subtitle={`Dark stores and quick commerce${family ? `, ${family}` : ', all categories'}${region ? `, ${region} region` : ''}. M1, M2 and M3 are the forecasts made one, two and three months before each month.`}
      label="Quick-commerce channel: orders received against M1, M2 and M3 forecasts" headers={t.headers} rows={t.rows}
      chart={<TrendChart kind="labels" x={x} series={series} yTitle="Units per month" yFmt={(n) => fmtN(n)} zero={false} pointsAlways label="Quick-commerce channel: orders received against M1, M2 and M3 forecasts" />}
      note="The last three points are the months still open: October is the M1 forecast, November the M2 and December the M3. The category filter narrows it to that product family and the depot filter to that depot's region. Partners are not in the main sales data, so the partner filter does not apply here." />
  )
}

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
        description="What quick-commerce partners ask for against what they actually sell, how well we deliver it, and what to ship instead."
        toolbar={opts.data ? (
          <div className="filter-bar" role="group" aria-label="Filters">
            {pick('qc-d', 'Depot', opts.data.depots, depot, setDepot)}
            {pick('qc-c', 'Category', opts.data.categories, cat, setCat)}
            {pick('qc-p', 'Partner', opts.data.partners, partner, setPartner)}
            <Dropdown
              id="qc-window"
              size="md"
              titleText="Time period"
              label="Time period"
              items={WINDOWS}
              itemToString={(item: (typeof WINDOWS)[number] | null) => item?.label ?? ''}
              selectedItem={WINDOWS.find((window) => window.id === win) ?? WINDOWS[1]}
              onChange={({ selectedItem }: any) => selectedItem && setWin(selectedItem.id)}
            />
          </div>
        ) : undefined} />
      <NeedsData base="eda" building={{ what: 'prepare your data', how: 'Joining sales with partner and weather data takes about 15 seconds the first time and is saved afterwards.' }}>
        <ViewShell query={q} errorTitle="Could not load quick commerce" emptyTitle="No quick-commerce orders for this selection" emptyMessage="Pick another depot, category, partner or time period." onClear={() => { setDepot(ALL); setCat(ALL); setPartner(ALL); setWin('26') }}>
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
                  <Dropdown id="qc-b" size="md" titleText="Buffer stock at partner" label="Buffer" items={['1', '2', '3']} itemToString={(i: string | null) => (i ? `${i} week${i === '1' ? '' : 's'}` : '')} selectedItem={buf} onChange={({ selectedItem }: any) => selectedItem && setBuf(selectedItem)} />
                </div>
                <StatRow items={[
                  { label: 'Fulfilment', value: fmtPct(po ? cf / po : null, 1), sublabel: `Confirmed ${fmtN(cf)} of ${fmtN(po)} requested units`, info: 'The share of partner-requested units we confirmed. For example, if partners request 100 units and we confirm 98, fulfilment is 98%. This measures units, not whether orders arrived on time.' },
                  { label: 'OTIF', value: otifAvg === null ? '–' : fmtPct(otifAvg, 1), sublabel: 'Orders on time and in full, all channels for these categories', info: 'The share of order lines delivered both on time and in full. For example, if 81 out of 100 order lines meet both conditions, OTIF is 81%. This measure covers all channels for the selected categories, not just quick commerce.' },
                  { label: 'Over-order (×)', value: so ? (po / so).toFixed(1) : '–', sublabel: `Peak week ${peak.toFixed(1)}×`, info: 'Partner-requested units divided by units sold to shoppers. For example, 120 units requested and 100 sold is 1.2×, meaning requests were 20% above sell-out. The sublabel shows the highest weekly multiple.' },
                  { label: 'Stock cover', value: `${cover.toFixed(1)} wk`, sublabel: `${fmtN(stock)} units confirmed but not yet sold, since the first order`, info: 'Estimated weeks the accumulated unsold stock could cover at the average sell-out of the latest four weeks. For example, 2,000 unsold units and 100 sold per week gives 20 weeks of cover. It is an estimate based on recent sell-out.' },
                  { label: 'Recommendation', value: reqW ? fmtSigned(rec / reqW - 1, 0) : '–', sublabel: `Recommended ${fmtN(rec)} against ${fmtN(reqW)} requested`, info: 'Compares the recommended shipment with partner requests over the selected weeks. For example, a recommendation of 90 units against 100 requested is −10%, so the recommendation is 10% below the request. The recommendation uses recent sell-out plus the selected buffer; it is not the shipment already made.' },
                ]} />
                <ChartCard title="Requested against real need" subtitle="Weekly units, quick commerce"
                  label="Weekly quick-commerce units requested, confirmed, sold and recommended"
                  chart={<TrendChart x={x} series={series} kind="week" yTitle="Units per week" label="Weekly quick-commerce orders, confirmations, sell-out and recommended shipment" dotRadius={2} />}
                  headers={t1.headers} rows={t1.rows}
                  note={`Partners asked for ${so ? (po / so).toFixed(1) : '–'}× what they sold to shoppers, and we confirmed ${fmtPct(po ? cf / po : null, 0)} of it. The gap does not disappear: it builds up as stock at the partner. Shipping only the recent sell-out plus ${buf} week${buf === '1' ? '' : 's'} of cover would have missed ${lost > 0 ? `${fmtN(lost)} units` : 'nothing'} of the ${fmtN(soW)} sold since ${cw.length ? fmtDate(d.weeks[cw[0]]) : '–'}. The recommendation uses the average of the last four weeks' sell-out as the forecast.`} />
                <ChannelForecast family={cat !== ALL ? cat : null} region={depot !== ALL ? opts.data?.depot_region?.[depot] ?? null : null} />
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

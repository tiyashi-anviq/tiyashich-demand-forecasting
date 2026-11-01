/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { ModulePageHeader } from '@reiq/ui'
import { Dropdown, Tag, Tile } from '@reiq/ui/carbon'
import { MODULE } from '../App'
import { useBuild, useView } from '../lib/useView'
import { G } from '../lib/glossary'
import { fmtN, monthLong } from '../lib/format'
import TrendChart from '../charts/TrendChart'
import { seriesTable } from '../charts/kit'
import { ChartCard } from '../ui/ChartCard'
import { DataCard, type Col } from '../ui/DataCard'
import { StatRow } from '../ui/StatRow'
import { NeedsData } from '../ui/NeedsData'
import { ViewShell } from '../ui/ViewShell'

const inr = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `₹${fmtN(n)}`)
const ALL = 'All'
const tone = (v: string) => (v === 'Cut the buffer' ? 'red' : v === 'MOQ sets the floor' ? 'warm-gray' : 'green')

function Hdr({ embedded, toolbar, ...rest }: { embedded?: boolean; toolbar?: React.ReactNode; moduleLabel: string; title: string; description: string }) {
  return embedded ? <>{toolbar}</> : <ModulePageHeader {...rest} toolbar={toolbar} />
}

/** MOQ economics on raw materials: how much of each request is the need, how much the minimum order forces, how much is buffer, and what holding the extra costs. */
export default function MoqEconomics({ embedded }: { embedded?: boolean }) {
  const build = useBuild('eda')
  const [month, setMonth] = useState<string | null>(null), [basis, setBasis] = useState(ALL), [open, setOpen] = useState<string | null>(null)
  const qs = new URLSearchParams()
  if (month) qs.set('month', month)
  if (basis !== ALL) qs.set('basis', basis)
  const q = useView<any>('supply', 'rm-moq', qs.toString(), build.data?.state === 'ready')
  return (
    <>
      <Hdr embedded={embedded} moduleLabel={MODULE} title="MOQ economics"
        description="Raw-material requests against what the plant needs: the units a minimum order forces, the buffer supply chain adds on top, and what holding the extra costs."
        toolbar={q.data ? (
          <div className="row-03">
            <Dropdown id="mq-m" size="md" titleText="Required month" label="Month" items={q.data.months} itemToString={(m: string | null) => (m ? monthLong(m) : '')} selectedItem={q.data.month} onChange={({ selectedItem }: any) => selectedItem && setMonth(selectedItem)} />
            <Dropdown id="mq-b" size="md" titleText="Why it was requested" label="Basis" items={[{ id: ALL, label: 'All requests' }, ...q.data.bases]} itemToString={(i: any) => i?.label ?? ''}
              selectedItem={basis === ALL ? { id: ALL, label: 'All requests' } : q.data.bases.find((b: any) => b.id === basis)} onChange={({ selectedItem }: any) => selectedItem && setBasis(selectedItem.id)} />
          </div>
        ) : undefined} />
      <NeedsData base="eda" building={{ what: 'prepare your data', how: 'Joining sales with the other tables takes about 15 seconds the first time and is saved afterwards.' }}>
        <ViewShell query={q} errorTitle="Could not load MOQ economics" emptyTitle="No raw-material requests" emptyMessage="Pick another month or basis." onClear={() => setBasis(ALL)}>
          {(d) => {
            const t = d.totals
            const sel = d.rows.find((r: any) => r.sku === open)
            const cols: Col<any>[] = [
              { header: 'Raw material', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
              { header: 'Verdict', cell: (r) => <Tag type={tone(r.verdict)} size="md">{r.verdict}</Tag>, sort: (r) => r.verdict },
              { header: 'Need (units)', num: true, cell: (r) => fmtN(r.need), sort: (r) => r.need },
              { header: 'Requested (units)', num: true, cell: (r) => fmtN(r.requested), sort: (r) => r.requested },
              { header: 'MOQ (units)', num: true, cell: (r) => fmtN(r.moq), sort: (r) => r.moq },
              { header: 'Forced by MOQ (units)', num: true, cell: (r) => fmtN(r.by_moq), sort: (r) => r.by_moq },
              { header: 'Buffer added (units)', num: true, cell: (r) => fmtN(r.buffer), sort: (r) => r.buffer },
              { header: 'Cost of holding the extra (₹)', num: true, cell: (r) => inr(r.hold_above), sort: (r) => r.hold_above },
            ]
            const tr: Col<any>[] = [
              { header: 'Month', cell: (r) => monthLong(r.month), sort: (r) => r.month },
              { header: 'Requests', num: true, cell: (r) => String(r.requests), sort: (r) => r.requests },
              { header: 'Extra forced by MOQ (₹)', num: true, cell: (r) => inr(r.value_moq), sort: (r) => r.value_moq },
              { header: 'Buffer added (₹)', num: true, cell: (r) => inr(r.value_buffer), sort: (r) => r.value_buffer },
              { header: 'Holding cost of both (₹)', num: true, cell: (r) => inr(r.hold_moq + r.hold_buffer), sort: (r) => r.hold_moq + r.hold_buffer },
            ]
            const terms: Col<any>[] = [
              { header: 'Supplier', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
              { header: 'Code', cell: (r) => r.supplier },
              { header: 'Materials', num: true, cell: (r) => r.items, sort: (r) => r.items },
              { header: 'Extra forced by MOQ (₹)', num: true, cell: (r) => inr(r.by_moq), sort: (r) => r.by_moq },
              { header: 'Holding cost of that (₹)', num: true, cell: (r) => inr(r.hold_moq), sort: (r) => r.hold_moq },
            ]
            const x: string[] = d.trend.map((r: any) => r.month)
            const series = [
              { name: 'Extra forced by MOQ', values: d.trend.map((r: any) => r.value_moq), tone: 1 as const },
              { name: 'Buffer added', values: d.trend.map((r: any) => r.value_buffer), tone: 2 as const },
            ]
            const tbl = seriesTable('Month', x.map(monthLong), series, (n) => String(Math.round(n)))
            return (
              <>
                <StatRow items={[
                  { label: 'Requests checked', value: String(t.requests), sublabel: `${monthLong(d.month)}, raw materials` },
                  { label: 'Units above the need (₹ value)', info: G.need + ' Anything requested above it is either forced by the minimum order or a buffer.', value: inr(t.value_above), sublabel: `${t.moq_bound} forced by a minimum order, ${t.buffered} with a buffer on top` },
                  { label: 'Cost of holding the extra (₹)', info: G.holding, value: inr(t.hold_above), sublabel: 'Until the extra units are used up. Est.' },
                  { label: 'Avoidable if the buffer is cut (₹)', info: G.buffer, value: inr(t.hold_buffer), sublabel: 'Holding cost of the buffer only. The MOQ part cannot be avoided without a lower MOQ.' },
                ]} />
                <DataCard id="mqr" title="Requests against the need" info={G.moq} description="Select a raw material's name to see the working" cols={cols} rows={d.rows} itemsLabel="requests" rowKey={(r) => r.sku}
                  onRow={(r) => setOpen(r.sku === open ? null : r.sku)} selected={(r) => r.sku === open} defaultSort={{ col: 7, dir: 'desc' }}
                  note="Need is what the plant must buy to reach its target cover. The least that can be ordered is the need lifted to the minimum order and rounded up to the pack size. Anything above that is buffer. Holding cost is the units' value times the yearly holding rate, for the days they take to be used." />
                {sel ? (
                  <Tile className="card">
                    <h3 className="card-heading">Working: {sel.name}</h3>
                    <p className="supporting">
                      The plant needs {fmtN(sel.need)} {sel.uom} to reach its target cover and {sel.name} has a minimum order of {fmtN(sel.moq)} {sel.uom}, so the least that can be ordered is {fmtN(sel.floor)}.
                      {` ${fmtN(sel.requested)} ${sel.uom} were requested (${sel.basis.toLowerCase()}), ${fmtN(sel.above)} above the need: ${fmtN(sel.by_moq)} because of the minimum order and ${fmtN(sel.buffer)} as buffer.`}
                      {` At ₹${fmtN(sel.price)} a ${sel.uom} and ${sel.hold_pct * 100}% a year to hold, the extra costs ${inr(sel.hold_above)}${sel.buffer > 0 ? `; ordering ${fmtN(sel.floor)} instead would avoid ${inr(sel.hold_buffer)} of it` : ''}. The economic order quantity for this material is ${fmtN(sel.eoq)} ${sel.uom}, at ₹${fmtN(sel.order_cost)} per order.`}
                    </p>
                  </Tile>
                ) : null}
                <ChartCard title="Extra ordered above the need, by month" subtitle="Value in ₹ of units forced by the minimum order and of the buffer added on top"
                  label="Value of raw material ordered above the need each month, split into minimum-order and buffer" headers={tbl.headers} rows={tbl.rows}
                  chart={<TrendChart x={x} series={series} yTitle="Value above the need (₹)" yFmt={(n) => fmtN(n)} zero label="Raw material ordered above the need, by month" />}
                  note="Both parts are measured against the plant's need for the month. Est." />
                <DataCard id="mqm" title="By month" description="Every month's requests, all materials" cols={tr} rows={d.trend} itemsLabel="months" rowKey={(r) => r.month} defaultSort={{ col: 0, dir: 'desc' }} />
                <DataCard id="mqt" title="Minimum orders to renegotiate" description="Suppliers whose minimum order forces the most extra this month" cols={terms} rows={d.terms} itemsLabel="suppliers" rowKey={(r) => r.supplier} defaultSort={{ col: 3, dir: 'desc' }} />
              </>
            )
          }}
        </ViewShell>
      </NeedsData>
    </>
  )
}

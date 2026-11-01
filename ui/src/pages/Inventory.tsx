/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { ModulePageHeader } from '@reiq/ui'
import { ComboBox, Dropdown, NumberInput, Tag, Tile } from '@reiq/ui/carbon'
import { MODULE } from '../App'
import { useBuild, useView } from '../lib/useView'
import type { Filters } from '../lib/filters'
import { fmtDate, fmtN, fmtPct } from '../lib/format'
import { DataCard, type Col } from '../ui/DataCard'
import { Delta, StatRow } from '../ui/StatRow'
import { Info } from '../ui/Info'
import { NeedsData } from '../ui/NeedsData'
import { ViewShell } from '../ui/ViewShell'

const ALL = 'All'
const STATUS = ['All flagged', 'Short', 'Over-stocked', 'OK']

/** What the suggested transfers would save in production, for a production time you can change. */
function ProductionEffect({ sim }: { sim: { required: number; from_transfers: number; share: number; transit_days: number; by_product: any[] } }) {
  const [days, setDays] = useState(5)
  const withT = days * (1 - sim.share)
  const saved = days - withT
  const delivery = Math.max(withT, sim.transit_days)
  const dDelivery = delivery - days
  const pCols: Col<any>[] = [
    { header: 'Product', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
    { header: 'Units required (units)', num: true, cell: (r) => fmtN(r.required), sort: (r) => r.required },
    { header: 'Covered by transfers (units)', num: true, cell: (r) => fmtN(r.covered), sort: (r) => r.covered },
    { header: 'Share covered', num: true, cell: (r) => fmtPct(r.share, 0), sort: (r) => r.share },
    { header: 'Line time saved (days, Est.)', num: true, cell: (r) => <Delta value={days * r.share} text={`−${(days * r.share).toFixed(1)}`} />, sort: (r) => r.share },
  ]
  return (
    <>
    <Tile className="card">
      <h3 className="card-heading card-title-row">Effect on production planning<Info text="A what-if estimate of how transfers change production time and when all required stock is ready. For example, transferring 17% of the need reduces a 19-day run to about 15.7 production days; setup time is not included." label="About Effect on production planning" /></h3>
      <p className="footnote">If the whole requirement took the production time below, how much the suggested transfers would take off it. Est.</p>
      <NumberInput id="iv-days" size="md" label="Production time for the whole requirement (days)" hideSteppers min={1} step={1} value={days}
        onChange={(_e: unknown, { value }: { value: number | string }) => setDays(Math.max(1, Number(value) || 1))} />
      <StatRow items={[
        { label: 'Units required (units)', info: 'Total units needed for the selected short products. For example, if three products need 30,000, 40,000 and 20,000 units, the requirement is 90,000 units.', value: fmtN(sim.required), sublabel: `${fmtN(sim.from_transfers)} units already sit in over-stocked depots` },
        { label: 'Covered by transfers', info: 'The share of required units that can be supplied by moving stock from over-stocked depots. For example, transferring 16,000 of 92,000 required units covers about 17%, leaving the rest for production or other supply.', value: fmtPct(sim.share, 0), sublabel: 'Share of the requirement that needs no production' },
        { label: 'Production time (days)', info: 'Estimated production time after subtracting the units covered by transfers, assuming production time scales directly with units. For example, if transfers cover 17% of a 19-day run, estimated production time falls to about 15.7 days. Setup and changeover time are not included.', value: withT.toFixed(1), sublabel: `Down from ${days}` },
        { label: 'Line time saved (days)', info: 'Estimated production-line time avoided because transferred units do not need to be made. For example, 17% of a 19-day production run is about 3.3 days saved. Actual savings may be lower because setup and changeover are not included.', value: <Delta value={saved} text={`−${saved.toFixed(1)}`} />, sublabel: 'Raw material and line hours fall by the same share' },
        { label: 'Full cover reached (days)', info: 'Estimated days until both the transfer stock has arrived and the remaining units have been produced. It is the longer of transfer transit time and estimated production time. For example, if production takes 15.7 days and transfers take 7 days, full cover is reached in 15.7 days.', value: delivery.toFixed(1), sublabel: `${dDelivery >= 0 ? '+' : '−'}${Math.abs(dDelivery).toFixed(1)} vs ${days}, as transfers take about ${sim.transit_days.toFixed(0)} days` },
      ]} />
      <p className="footnote">Assumes production time scales with units, so setup and changeover time are not counted and the real saving is somewhat lower. The transferred stock moves while the rest is made, so full cover arrives when the slower of the two is done.</p>
    </Tile>
    <DataCard id="ivp" title="Production effect by product" info="Shows the transferable share of each product's requirement and the estimated line time saved. For example, if 20% of a product's need is transferred, about 20% of its assumed production time is saved." description="Each short product: how much of what it needs is already sitting in over-stocked depots" cols={pCols} rows={sim.by_product} itemsLabel="products" rowKey={(r) => r.sku} defaultSort={{ col: 1, dir: 'desc' }}
      note="Days saved use the production time above, scaled by each product's share. A product's real run time depends on its line and run size, which are not in the data." />
    </>
  )
}

const tone = (s: string) => (s === 'Short' ? 'red' : s === 'Over-stocked' ? 'purple' : 'green')

export default function Inventory({ embedded = false, f }: { embedded?: boolean; f?: Filters }) {
  const build = useBuild('eda')
  const [depot, setDepot] = useState(ALL), [fam, setFam] = useState(ALL), [prod, setProd] = useState<string | null>(null), [st, setSt] = useState('All flagged')
  const qs = new URLSearchParams()
  if (depot !== ALL) qs.set('depot', depot)
  if (f) { if (f.family.length) qs.set('family', f.family.join('~')); if (f.product.length) qs.set('product', f.product.join('~')); if (f.region.length) qs.set('region', f.region.join('~')) } else { if (fam !== ALL) qs.set('family', fam); if (prod) qs.set('product', prod) }
  if (st !== 'All flagged') qs.set('status', st)
  const q = useView<any>('inventory', 'view', qs.toString(), build.data?.state === 'ready')
  const o = q.data?.options
  const dn = (id: string) => o?.depots.find((d: any) => d.id === id)?.name ?? id
  const toolbar = o ? (
          <div className="row-03">
            <Dropdown id="iv-d" size="md" titleText="Depot" label="Depot" items={[ALL, ...o.depots.map((d: any) => d.id)]} itemToString={(i: string | null) => (i && i !== ALL ? `${i} · ${dn(i)}` : i ?? '')} selectedItem={depot} onChange={({ selectedItem }: any) => selectedItem && setDepot(selectedItem)} />
            {!f && (<><Dropdown id="iv-f" size="md" titleText="Product family" label="Family" items={[ALL, ...o.families]} itemToString={(i: string | null) => i ?? ''} selectedItem={fam} onChange={({ selectedItem }: any) => selectedItem && setFam(selectedItem)} />
            <ComboBox id="iv-p" size="md" titleText="Product" placeholder="All products" items={o.products.map((x: any) => ({ id: x.id, label: `${x.id} · ${x.name}` }))} itemToString={(i: any) => i?.label ?? ''}
              shouldFilterItem={({ item, inputValue }: any) => !inputValue || item.label.toLowerCase().includes(inputValue.toLowerCase())}
              selectedItem={prod ? { id: prod, label: `${prod} · ${o.products.find((x: any) => x.id === prod)?.name ?? ''}` } : null} onChange={({ selectedItem }: any) => setProd(selectedItem ? selectedItem.id : null)} /></>)}
          </div>
        ) : undefined
  return (
    <>
      {!embedded && (
        <ModulePageHeader moduleLabel={MODULE} title="Inventory and transfers"
          description="Stock at each depot against how fast it sells. Short and over-stocked items are flagged, with the depot-to-depot transfers and supplier orders that would balance them."
          toolbar={toolbar} />
      )}
      {embedded && toolbar ? <div className="stack-03">{toolbar}</div> : null}
      <NeedsData base="eda" building={{ what: 'prepare your data', how: 'Joining sales with the other tables takes about 15 seconds the first time and is saved afterwards.' }}>
        <ViewShell query={q} errorTitle="Could not load inventory" emptyTitle="No stock for this selection" onClear={() => { setDepot(ALL); setFam(ALL); setProd(null) }}>
          {(d) => {
            const depCols: Col<any>[] = [
              { header: 'Depot', cell: (r) => `${r.depot} · ${r.name}`, sort: (r) => r.depot },
              { header: 'Short (products)', num: true, cell: (r) => String(r.short), sort: (r) => r.short },
              { header: 'Over-stocked (products)', num: true, cell: (r) => String(r.over), sort: (r) => r.over },
              { header: 'In range (products)', num: true, cell: (r) => String(r.ok), sort: (r) => r.ok },
            ]
            const rowCols: Col<any>[] = [
              { header: 'Product', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
              { header: 'Depot', cell: (r) => r.depot, sort: (r) => r.depot },
              { header: 'Status', cell: (r) => <Tag type={tone(r.state)} size="md">{r.state}</Tag>, sort: (r) => r.state },
              { header: 'Stock (units)', num: true, cell: (r) => fmtN(r.stock), sort: (r) => r.stock },
              { header: 'Sells per week (units)', num: true, cell: (r) => fmtN(r.rate), sort: (r) => r.rate },
              { header: 'Cover (days)', num: true, cell: (r) => r.cover.toFixed(0), sort: (r) => r.cover },
              { header: 'Target cover (days)', num: true, cell: (r) => r.target },
              { header: 'Gap to target (units)', num: true, cell: (r) => (r.gap ? fmtN(r.gap) : '–'), sort: (r) => r.gap },
            ]
            const mvCols: Col<any>[] = [
              { header: 'Product', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
              { header: 'From', cell: (r) => r.source, sort: (r) => r.source },
              { header: 'To', cell: (r) => r.target, sort: (r) => r.target },
              { header: 'Units', num: true, cell: (r) => fmtN(r.qty), sort: (r) => r.qty },
              { header: 'Usual transit (weeks)', num: true, cell: (r) => r.weeks.toFixed(0), sort: (r) => r.weeks },
              { header: 'Same region', cell: (r) => (r.same_region ? 'Yes' : 'No'), sort: (r) => (r.same_region ? 1 : 0) },
            ]
            const orCols: Col<any>[] = [
              { header: 'Product', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
              { header: 'Depot', cell: (r) => r.depot, sort: (r) => r.depot },
              { header: 'Cover now (days)', num: true, cell: (r) => r.cover.toFixed(0), sort: (r) => r.cover },
              { header: 'Units still needed', num: true, cell: (r) => fmtN(r.qty), sort: (r) => r.qty },
            ]
            const nmCols: Col<any>[] = [
              { header: 'Family', cell: (r) => r.family },
              { header: 'Target cover (days)', num: true, cell: (r) => `${r.tmin}–${r.tmax}` },
              { header: 'Short below (days)', num: true, cell: (r) => String(r.short) },
              { header: 'Over-stocked above (days)', num: true, cell: (r) => String(r.over) },
              { header: 'Safety stock (% of target cover)', num: true, cell: (r) => String(r.safety) },
            ]
            return (
              <>
                <StatRow items={[
                  { label: 'Depot-products checked', info: 'Count of product-at-depot combinations included in this view. For example, 100 products checked across 10 depots is 1,000 depot-products.', value: d.checked.toLocaleString('en-IN'), sublabel: `Stock at the end of the week of ${fmtDate(d.asof)}` },
                  { label: 'Short', info: 'Product-at-depot combinations whose stock cover is below the family short threshold. For example, a battery with 5 days of stock is short if its family limit is 7 days.', value: d.short.toLocaleString('en-IN'), sublabel: 'Cover below the family norm' },
                  { label: 'Over-stocked', info: 'Product-at-depot combinations whose stock cover is above the family over-stock threshold. For example, 40 days of stock is over-stocked if the family limit is 30 days.', value: d.over.toLocaleString('en-IN'), sublabel: 'Cover above the family norm' },
                  { label: 'Transfers suggested', info: 'Number of proposed product-and-route stock transfers. For example, moving one product from Depot A to Depot B counts as one suggested transfer.', value: d.moves.length.toLocaleString('en-IN'), sublabel: `${fmtN(d.moved)} units moved between depots` },
                  { label: 'Left for supplier orders', info: 'Short product-and-depot combinations that available surplus stock cannot cover. For example, if 500 units are short and other depots have only 300 surplus, 200 units remain for supplier orders.', value: d.orders.length.toLocaleString('en-IN'), sublabel: 'Short, with no spare stock elsewhere' },
                ]} />
                <DataCard id="ivd" title="Depots" info="Counts each depot's products by stock status. For example, a depot with 12 short, 4 over-stocked, and 30 in-range products has 46 products assessed." description="For each depot, the number of its products with too little stock, too much stock, or about the right amount. Each product is judged by how many days of sales its stock covers, against the limits for its family (see Norms)" cols={depCols} rows={d.depots} itemsLabel="depots" rowKey={(r) => r.depot} defaultSort={{ col: 1, dir: 'desc' }} />
                <div className="row-03">
                  <Dropdown id="iv-s" size="md" titleText="Show" label="Show" items={STATUS} itemToString={(i: string | null) => i ?? ''} selectedItem={st} onChange={({ selectedItem }: any) => selectedItem && setSt(selectedItem)} />
                </div>
                <DataCard id="ivr" title="Which products are flagged" info="Shows stock and sales-rate context for each product at each depot. For example, 400 units selling at 100 per week provide about 28 days of cover." description="Stock against how fast it sells, at each depot" cols={rowCols} rows={d.rows} itemsLabel="depot-products" rowKey={(r) => `${r.depot}|${r.sku}`} defaultSort={{ col: 7, dir: 'desc' }}
                  note="Cover is stock divided by the average of the last four weeks' invoiced sales at that depot." />
                <DataCard id="ivm" title="Suggested transfers" info="Moves available surplus to a depot that is short, prioritizing the same region and then the faster usual route. For example, 500 surplus units can be sent from an over-stocked depot to cover 500 units of a nearby depot's gap." description="From over-stocked depots to short ones, the same region first and then the shortest usual transit" cols={mvCols} rows={d.moves} itemsLabel="transfers" rowKey={(r) => `${r.sku}|${r.source}|${r.target}`} defaultSort={{ col: 3, dir: 'desc' }}
                  note="A transfer takes only stock above the family's target maximum and fills only up to its target minimum. The usual transit time is the median of past transfers on the same route." />
                <ProductionEffect sim={d.sim} />
                <DataCard id="ivo" title="Left for supplier orders" info="Lists demand still uncovered after suggested depot transfers. For example, a 1,000-unit shortage with 700 units of transferable surplus leaves 300 units for supplier orders." description="Shortfall that no depot has spare stock to cover" cols={orCols} rows={d.orders} itemsLabel="shortfalls" rowKey={(r) => `${r.sku}|${r.depot}`} defaultSort={{ col: 3, dir: 'desc' }} />
                <DataCard id="ivn" title="Norms" info="Family-specific thresholds used to classify stock as short or over-stocked. For example, if a family's target is 14–28 days, the short and over-stock limits are applied around that cover range." description="The cover targets and flag limits used above" cols={nmCols} rows={fam === ALL ? d.norms : d.norms.filter((n: any) => n.family === fam)} itemsLabel="families" rowKey={(r) => r.family} />
              </>
            )
          }}
        </ViewShell>
      </NeedsData>
    </>
  )
}

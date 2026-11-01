/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Filters } from '../../lib/filters'
import { Link } from 'react-router-dom'
import { Dropdown, Tag, Tile } from '@reiq/ui/carbon'
import { getJson } from '../../lib/http'
import { fmtN, monthLong } from '../../lib/format'
import { G } from '../../lib/glossary'
import TrendChart from '../../charts/TrendChart'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { Findings } from '../../ui/Findings'
import { StatRow } from '../../ui/StatRow'
import { ViewShell } from '../../ui/ViewShell'

const ALL = 'All'
const inr = (n: number) => `₹${fmtN(n)}`
const ST: Record<string, 'green' | 'red' | 'warm-gray'> = { 'Within norm': 'green', Short: 'red', 'Over-stocked': 'warm-gray' }

function Pick({ id, title, items, value, onChange, toStr, allLabel }: { id: string; title: string; items: string[]; value: string; onChange: (v: string | null) => void; toStr?: (v: string) => string; allLabel?: string }) {
  const all = [ALL, ...items]
  return <Dropdown id={id} size="md" titleText={title} label={title} items={all} itemToString={(i: string | null) => (i ? (i === ALL ? allLabel ?? i : toStr ? toStr(i) : i) : '')} selectedItem={all.includes(value) ? value : ALL} onChange={({ selectedItem }: any) => onChange(selectedItem)} />
}

/** A section header that sits between card groups on the supply page. */
function Section({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="row-between">
      <div className="card-heading">
        <span className="card-title">{title}</span>
        {subtitle && <span className="footnote">{subtitle}</span>}
      </div>
    </div>
  )
}

/** The coming month (the one after the last actuals) as one chain: demand forecast, inventory check, production plan, raw material procurement, then manufacturing by plant. */
export default function Plan3({ f }: { f: Filters }) {
  const [plant, setPlant] = useState(ALL)
  const [fl, setFl] = useState<Record<string, string>>({})
  const setF = (k: string) => (v: string | null) => setFl((c) => ({ ...c, [k]: v ?? ALL }))
  const q = useQuery({ queryKey: ['plan3'], queryFn: () => getJson<any>('/api/supply/plan3'), staleTime: 60_000 })
  return (
    <div className="stack-05">
      <ViewShell query={q} errorTitle="Could not build the three-month plan">
        {(d: any) => {
          const m = d.months as string[]
          const F = (k: string) => fl[k] ?? ALL
          const uniq = (a: any[]) => [...new Set(a)].sort() as string[]
          // the plan covers the first month after the last actuals; the later months are only worked out to size the stock target and the carry
          const sel = m[0]
          const mi = 0
          const shown: [string, number][] = [[m[0], 0]]
          const mo0 = monthLong(m[0])
          // the filters at the top narrow the product-based views; a region's part of a product is its share of that product's recent orders
          const filtered = f.family.length > 0 || f.product.length > 0 || f.region.length > 0 || f.channel.length > 0 || F('gc') !== ALL
          const scoped: any[] = (d.products as any[]).filter((r) => (!f.family.length || f.family.includes(r.family)) && (!f.product.length || f.product.includes(r.sku)) && (!f.channel.length || f.channel.includes(r.channel ?? '')) && (F('gc') === ALL || r.sub === F('gc'))).map((r) => {
            const k = f.region.length === 0 ? 1 : f.region.reduce((a: number, g: string) => a + (r.reg?.[g] ?? 0), 0)
            return k === 1 ? r : { ...r, prod: r.prod.map((x: number) => x * k), demand: r.demand.map((x: number) => x * k), close: r.close.map((x: number) => x * k), need: r.need.map((x: number) => x * k), nxt: r.nxt.map((x: number) => x * k) }
          })
          const famAgg: Record<string, any> = {}
          scoped.forEach((r) => {
            const a = (famAgg[r.family] ??= { family: r.family, month: m[0], demand: 0, need: 0, possible: 0, closing: 0, nxt: 0, lo: r.lo, hi: r.hi })
            a.demand += r.demand[0]; a.need += r.need[0]; a.possible += r.prod[0]; a.closing += r.close[0]; a.nxt += r.nxt[0]
          })
          const famRows = Object.values(famAgg).sort((x: any, y: any) => x.family.localeCompare(y.family)).map((a: any) => {
            const cover = a.nxt > 0 ? a.closing / a.nxt : null
            return { ...a, cover, status: cover === null ? null : cover < a.lo ? 'Short' : cover > a.hi ? 'Over-stocked' : 'Within norm' }
          })
          const dem0 = filtered ? famRows.reduce((a: number, r: any) => a + r.demand, 0) : d.flow.demand[0]
          const made0 = filtered ? famRows.reduce((a: number, r: any) => a + r.possible, 0) : d.flow.prod_ok[0]
          const unmet0 = (d.lines as any[]).reduce((a, l) => a + l.backlog[0], 0)
          const buy0 = (d.materials as any[]).filter((r) => r.month === m[0]).reduce((a, r) => a + r.buy_value, 0)
          const risk0 = new Set((d.materials as any[]).filter((r) => r.month === m[0] && r.at_risk).map((r) => r.rm)).size
          const full0 = (d.plants as any[]).filter((r) => r.util[0] >= 0.999).length
          const abbr = (mo: string) => monthLong(mo).slice(0, 3)
          const notes: { tone: string; text: string }[] = []
          notes.push(unmet0 > 0
            ? { tone: 'watch', text: `${full0} plant-lines run at full capacity in ${mo0}, and the other plants have no room left to take the overflow, so ${fmtN(unmet0)} units are not made and move to the next month. Add shifts, build stock early or buy in.` }
            : { tone: 'good', text: full0 > 0 ? `${full0} plant-lines run full in ${mo0}, but the other plants take the overflow, so everything needed is made.` : `Every plant can make what ${mo0} needs.` })
          notes.push(risk0 > 0
            ? { tone: 'watch', text: `${risk0} raw material${risk0 > 1 ? 's start' : ' starts'} ${mo0} with less stock than the vendor's lead time. Place those orders at the start of the month, ahead of the plan freeze.` }
            : { tone: 'good', text: `Raw-material stock covers the vendors' lead times for ${mo0}.` })
          const bad = famRows.filter((f: any) => f.status && f.status !== 'Within norm').length
          notes.push(bad ? { tone: 'watch', text: `${bad} product families end ${mo0} outside the stock norm (short or over-stocked). See the inventory check.` } : { tone: 'good', text: `Finished-goods stock stays within the norm for every family at the end of ${mo0}.` })

          // 2. inventory check
          const famF = famRows.filter((r: any) => (F('fs') === ALL || r.status === F('fs')))
          const fcols: Col<any>[] = [
            { header: 'Product family', cell: (r) => r.family, sort: (r) => r.family },
            { header: 'Month', cell: (r) => monthLong(r.month), sort: (r) => r.month },
            { header: 'Demand (units)', num: true, cell: (r) => fmtN(r.demand), sort: (r) => r.demand },
            { header: 'Closing stock (units)', num: true, cell: (r) => fmtN(r.closing), sort: (r) => r.closing },
            { header: 'Cover at month end (days)', num: true, cell: (r) => (r.cover === null ? '–' : r.cover.toFixed(0)), sort: (r) => r.cover },
            { header: 'Against the norm', cell: (r) => (r.status ? <Tag type={ST[r.status]} size="md">{r.status}</Tag> : '–'), sort: (r) => r.status },
          ]
          // 3. production plan by product
          const prodF = scoped.filter((r) => F('pl') === ALL || r.line === F('pl'))
          const sumA = (a: number[]) => a.reduce((x, y) => x + y, 0)
          const agreedFams = new Set<string>(d.agreed_families ?? [])
          const pcols: Col<any>[] = [
            { header: 'Product', cell: (r) => `${r.name} (${r.sku})`, sort: (r) => String(r.name).toLowerCase() },
            { header: 'Family', cell: (r) => r.family, sort: (r) => r.family },
            { header: 'Channel', cell: (r) => r.channel ?? '–', sort: (r) => r.channel ?? '' },
            { header: 'Demand source', cell: (r) => agreedFams.has(r.family) ? <Tag type="green" size="sm">Challenge final</Tag> : <Tag type="gray" size="sm">Model forecast</Tag>, sort: (r) => agreedFams.has(r.family) ? 1 : 0 },
            { header: 'Made on', cell: (r) => (r.line === 'Bought in' ? <Tag type="warm-gray" size="sm">Bought in</Tag> : r.line), sort: (r) => r.line },
            ...shown.map(([mo, i]): Col<any> => ({ header: `${abbr(mo)} make (units)`, num: true, cell: (r) => fmtN(r.prod[i]), sort: (r) => r.prod[i] })),
            mi < 0
              ? { header: '3-month demand (units)', num: true, cell: (r) => fmtN(sumA(r.demand)), sort: (r) => sumA(r.demand) }
              : { header: `${abbr(sel)} demand (units)`, num: true, cell: (r) => fmtN(r.demand[mi]), sort: (r) => r.demand[mi] },
            mi < 0
              ? { header: `${abbr(m[m.length - 1])} closing stock (units)`, num: true, cell: (r) => fmtN(r.close[m.length - 1]), sort: (r) => r.close[m.length - 1] }
              : { header: `${abbr(sel)} closing stock (units)`, num: true, cell: (r) => fmtN(r.close[mi]), sort: (r) => r.close[mi] },
          ]
          // 5. manufacturing: carry from month to month, and by plant
          const cfRows = (d.lines as any[]).flatMap((l) => shown.map(([mo, i]) => ({ line: l.line, month: mo, fresh: l.fresh[i], carryIn: l.carry_in[i], total: l.required[i], cap: l.rated, made: l.possible[i], carry: l.backlog[i] })))
          const cfCols: Col<any>[] = [
            { header: 'Line', cell: (r) => r.line, sort: (r) => r.line },
            { header: 'Month', cell: (r) => monthLong(r.month), sort: (r) => r.month },
            { header: 'New need (units)', num: true, cell: (r) => fmtN(r.fresh), sort: (r) => r.fresh },
            { header: 'Carried in from last month (units)', num: true, cell: (r) => fmtN(r.carryIn), sort: (r) => r.carryIn },
            { header: 'Total to make (units)', num: true, cell: (r) => fmtN(r.total), sort: (r) => r.total },
            { header: 'Capacity (units)', num: true, cell: (r) => fmtN(r.cap), sort: (r) => r.cap },
            { header: 'Made (units)', num: true, cell: (r) => fmtN(r.made), sort: (r) => r.made },
            { header: 'Carried to next month (units)', num: true, cell: (r) => fmtN(r.carry), sort: (r) => r.carry },
          ]
          const pl: any[] = d.plants
          const pnames: string[] = d.plant_names
          const psum = pnames.filter((pn) => plant === ALL || pn === plant).flatMap((pn) => shown.map(([mo, i]) => {
            const g = pl.filter((x) => x.plant === pn)
            const sm = (k: string) => g.reduce((a, x) => a + x[k][i], 0)
            return { plant: pn, state: g[0]?.state ?? '', month: mo, capacity: g.reduce((a, x) => a + x.capacity, 0), own: sm('own'), made: sm('made'), take: sm('take'), sent: sm('sent') }
          }))
          const scols: Col<any>[] = [
            { header: 'Plant', cell: (r) => r.plant, sort: (r) => r.plant },
            { header: 'State', cell: (r) => r.state, sort: (r) => r.state },
            { header: 'Month', cell: (r) => monthLong(r.month), sort: (r) => r.month },
            { header: 'Capacity (units)', num: true, cell: (r) => fmtN(r.capacity), sort: (r) => r.capacity },
            { header: 'Orders from its regions (units)', num: true, cell: (r) => fmtN(r.own), sort: (r) => r.own },
            { header: 'Passed to other plants (units)', num: true, cell: (r) => fmtN(r.sent), sort: (r) => r.sent },
            { header: 'Taken from other plants (units)', num: true, cell: (r) => fmtN(r.take), sort: (r) => r.take },
            { header: 'Made (units)', num: true, cell: (r) => fmtN(r.made), sort: (r) => r.made },
            { header: 'Use (%)', num: true, cell: (r) => (r.capacity ? ((r.made / r.capacity) * 100).toFixed(0) : '–'), sort: (r) => (r.capacity ? r.made / r.capacity : 0) },
          ]
          const names = ['Demand', 'Needed', 'Possible', 'Closing stock']
          const keys = ['demand', 'need', 'possible', 'close']
          const famList = famRows.map((r: any) => r.family)
          const fv = (f: string, k: string) => (famRows.find((r: any) => r.family === f) as any)[{ demand: 'demand', need: 'need', possible: 'possible', close: 'closing' }[k] as string]
          return (
            <>
              {/* KPI stat row */}
              <StatRow items={[
                { label: `Demand, ${mo0} (units)`, info: 'Demand the plan is built on: M1 model forecast per SKU, summed across selected filters.', value: fmtN(dem0), sublabel: `${famList.length} families · ${d.flow.demand[0] > 0 ? Math.round(dem0 / d.flow.demand[0] * 100) : 0}% of network total` },
                { label: 'Units the plants can make', info: 'What the five plants can make within their rated capacity, after plants with room take on what full plants cannot make.', value: fmtN(made0), sublabel: `${fmtN(unmet0)} units unmet at the end of ${mo0}` },
                { label: 'Raw materials to buy (₹)', info: 'Purchases that bring each material back to its target cover, rounded up to the minimum order and pack size.', value: inr(buy0), sublabel: `${risk0} materials at lead-time risk. Est.` },
                { label: 'Plant-lines at full capacity', info: G.utilisation, value: String(full0), sublabel: `Counted by plant and line in ${mo0}. Est.` },
              ]} />
              <Findings title="What the plan shows" items={notes} />
              <div className="row-03 filter-row pin-row">
                <Pick id="p3-gc" title="Category" items={uniq(d.products.map((r: any) => r.sub).filter(Boolean))} value={F('gc')} onChange={setF('gc')} />
                <Pick id="p3-plant" title="Plant (manufacturing)" items={pnames} value={plant} onChange={(v) => setPlant(v ?? ALL)} allLabel="All plants" />
              </div>
              {filtered ? <p className="footnote">The filters at the top and the category narrow the demand, inventory and product views. A region's part of a product is its share of that product's recent orders. The manufacturing, plant and raw-material sections stay network-wide, because plants and lines serve every region.</p> : null}

              {/* Section 1: Demand forecast and stock by family */}
              <Section title="Demand forecast and stock by family" subtitle={`For ${mo0}: demand forecast, what must be made or bought to meet it and to rebuild stock, what the plants can make, and the stock left at month end, by product family.`} />
              <ChartCard title="Demand forecast and stock by family" info={`For ${mo0}: the demand forecast, what must be made or bought to meet it and to rebuild stock, what the plants can make, and the stock left at month end, by product family.`} subtitle={`Stock counted at ${d.stock_week} and rolled to 1 ${mo0} using recent sales`}
                chart={<TrendChart kind="labels" zero x={famList} series={keys.map((k, i) => ({ name: names[i], values: famList.map((f) => fv(f, k)) }))} yTitle="Units" label={`Demand, production and stock in ${mo0}, by family`} />}
                headers={['Family', ...names]} rows={famList.map((f) => [f, ...keys.map((k) => fmtN(fv(f, k)))])} label={`Demand, production and stock in ${mo0}, by family`}
                note="Needed = demand + a third of the gap to the target stock cover − stock at the start; the stock gap is closed over three months, not in one. Est." />

              {/* Section 2: Inventory check */}
              <Section title="Inventory check: finished-goods stock by family" subtitle="Closing stock and days of cover against the family's stock norm: short below the lower flag, over-stocked above the upper flag." />
              <div className="row-03 filter-row">
                <Pick id="p3-fs" title="Against the norm" items={['Short', 'Within norm', 'Over-stocked']} value={F('fs')} onChange={setF('fs')} />
              </div>
              <DataCard id="p3s" title="Inventory check: finished-goods stock by family" info="Closing stock and days of cover against the family's stock norm: short below the lower flag, over-stocked above the upper flag." description="Stock after production, by family and month" cols={fcols} rows={famF} itemsLabel="rows" rowKey={(r) => r.family + r.month} defaultSort={{ col: 4, dir: 'asc' }}
                note="Norms come from the inventory norms table. Est." />

              {/* Section 3: Production plan by product */}
              <Section title="Production plan by product" subtitle="What each product must be made, or bought if it has no bill of materials, in each month, against its demand." />
              <div className="row-03 filter-row">
                <Pick id="p3-pl" title="Made on" items={uniq(d.products.map((r: any) => r.line))} value={F('pl')} onChange={setF('pl')} />
              </div>
              <DataCard id="p3p" title="Production plan by product" info="What each product must be made, or bought if it has no bill of materials, in each month, against its demand." description="Units to make or buy by product and month" cols={pcols} rows={prodF} itemsLabel="products" rowKey={(r) => r.sku} defaultSort={{ col: 3, dir: 'desc' }}
                note="Within each line the quantity is cut back in proportion when the line is full. Est." />

              {/* Section 4: Raw material procurement */}
              <Section title="Raw material procurement" subtitle={`The need, stock, lead time and purchase for each material, and the check on a typed order quantity.`} />
              <Tile className="card">
                <h3 className="card-heading">Raw material procurement</h3>
                <p className="supporting">{fmtN(risk0)} raw materials start {mo0} with less stock than the vendor's lead time, and the plan buys {inr(buy0)} of raw material. The need, stock, lead time and purchase for each material, and the check on a typed order quantity, are on the <Link to="/procurement">Procurement</Link> page. Est.</p>
              </Tile>

              {/* Section 5: Manufacturing carry */}
              <Section title="Manufacturing: what carries from month to month" subtitle="For each line type and month: the new need, plus what could not be made last month, against the capacity of all its plants." />
              <DataCard id="p3cf" title="Manufacturing: what carries from month to month" info="For each line type and month: the new need, plus what could not be made last month, against the capacity of all its plants. What is not made moves to the next month's need. Total to make = new need + carried in. Carried to next month = total to make − made." description="New need, carry-in, capacity, output and carry-out by line type and month" cols={cfCols} rows={cfRows} itemsLabel="rows" rowKey={(r) => r.line + r.month} defaultSort={{ col: 0, dir: 'asc' }}
                note="The last month's carry-out is what is still unmet at the end of the plan. New need includes rebuilding stock toward its target. Est." />

              {/* Section 6: Production by plant */}
              <Section title="Manufacturing: production by plant" subtitle="Each plant first takes the orders of the regions it serves, up to its capacity. What a full plant cannot make goes to plants with room, in proportion to that room." />
              <DataCard id="p3pl" title="Manufacturing: production by plant" info="Each plant first takes the orders of the regions it serves, up to its capacity. What a full plant cannot make goes to plants with room, in proportion to that room. Only when every plant is full is demand unmet, and it moves to the next month." description="Capacity, orders, overflow and output for each plant and month" cols={scols} rows={psum} itemsLabel="rows" rowKey={(r) => r.plant + r.month} defaultSort={{ col: 2, dir: 'asc' }}
                note="The split of each line type across the five plants, and which plants serve which region, are illustrative assumptions: the data has no plant column. Replace them with the real plant capacities and supply map. Est." />
            </>
          )
        }}
      </ViewShell>
    </div>
  )
}
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Filters } from '../../lib/filters'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dropdown, NumberInput, Tag } from '@reiq/ui/carbon'
import { NumField } from '../../ui/NumField'
import { getJson } from '../../lib/http'
import { fmtN, fmtPct, monthLong } from '../../lib/format'
import { G } from '../../lib/glossary'
import { DataCard, type Col } from '../../ui/DataCard'
import { Findings } from '../../ui/Findings'
import { StatRow } from '../../ui/StatRow'
import { ViewShell } from '../../ui/ViewShell'

const inr = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `₹${fmtN(n)}`)
const AUTO = 'Auto'
const AUTO_R = 'All regions'
const day = (n: number | null | undefined) => (n === null || n === undefined ? 'Not reached' : `Day ${Math.round(n)}`)

/** A vendor stops delivering a raw material, a fallback vendor steps in, and what that does to production, OTIF and the plan. */
export default function Disruption({ f }: { f: Filters }) {
  // the page filters decide the product and region; the scenario works on one of each, so more than one selected means all
  const product: string | null = f.product.length === 1 ? f.product[0] : null
  const region = f.region.length === 1 ? f.region[0] : AUTO_R
  const [plant, setPlant] = useState('All plants')
  const opts = useQuery({ queryKey: ['dis', 'options', product], queryFn: () => getJson<any>(`/api/supply/disruption-options${product ? `?product=${encodeURIComponent(product)}` : ''}`), staleTime: Infinity, placeholderData: (p: any) => p })
  const [vendor, setVendor] = useState<string | null>(null), [fb, setFb] = useState(AUTO), [month, setMonth] = useState<string | null>(null)
  const [weeks, setWeeks] = useState(6), [short, setShort] = useState(100), [bcap, setBcap] = useState(60), [lag, setLag] = useState(2), [cover, setCover] = useState<number | null>(null)
  const [base, setBase] = useState(80), [push, setPush] = useState(90), [maint, setMaint] = useState(2)
  const o = opts.data
  const v = o?.vendors?.find((x: any) => x.id === vendor)?.id ?? o?.vendors?.find((x: any) => x.roles.includes('Primary'))?.id ?? o?.vendors?.[0]?.id
  const qs = new URLSearchParams({ weeks: String(weeks), shortfall: String(short / 100), b_cap: String(bcap / 100), lag: String(lag), base_util: String(base / 100), push_util: String(push / 100), maint_days: String(maint) })
  if (v) qs.set('vendor', v)
  if (product) qs.set('product', product)
  if (region !== AUTO_R) qs.set('region', region)
  if (plant !== 'All plants') qs.set('plant', plant)
  if (month) qs.set('month', month)
  if (fb !== AUTO) qs.set('fallback', fb)
  if (cover !== null) qs.set('cover', String(cover))
  const q = useQuery({ queryKey: ['dis', 'scenario', qs.toString()], queryFn: () => getJson<any>(`/api/supply/disruption?${qs}`), enabled: !!v, placeholderData: (p: any) => p })
  const vname = (id: string) => o?.vendors?.find((x: any) => x.id === id)?.name ?? id
  const mcols: Col<any>[] = [
    { header: 'Raw material', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
    { header: 'Need this month', num: true, cell: (r) => `${fmtN(r.need)} ${r.uom}`, sort: (r) => r.need },
    { header: 'Share from this vendor (%)', num: true, cell: (r) => (r.share * 100).toFixed(0), sort: (r) => r.share },
    { header: 'Stock cover at the start (days)', num: true, cell: (r) => (r.cover_days === null ? '–' : r.cover_days.toFixed(0)), sort: (r) => r.cover_days },
    { header: 'Stock runs out', num: true, cell: (r) => day(r.runs_out_day), sort: (r) => r.runs_out_day },
    { header: 'Fallback vendor', cell: (r) => (r.fallback ? `${r.fallback_name} (+${(r.premium * 100).toFixed(0)}%)` : <Tag type="red" size="sm">No fallback</Tag>), sort: (r) => String(r.fallback ?? '') },
    { header: 'First delivery from fallback', num: true, cell: (r) => (r.first_delivery === null ? '–' : `Day ${Math.round(r.first_delivery)}`), sort: (r) => r.first_delivery },
    { header: 'Supplied by fallback', num: true, cell: (r) => `${fmtN(r.b_units)} ${r.uom}`, sort: (r) => r.b_units },
    { header: 'Still short', num: true, cell: (r) => (r.shortage > 0 ? `${fmtN(r.shortage)} ${r.uom} (${fmtPct(r.shortage_pct, 0)})` : 'None'), sort: (r) => r.shortage },
    { header: 'Extra cost of the fallback (₹)', num: true, cell: (r) => inr(r.extra_cost), sort: (r) => r.extra_cost },
  ]
  const lcols = (d: any): Col<any>[] => [
    { header: 'Production line', cell: (r) => r.line, sort: (r) => String(r.line).toLowerCase() },
    { header: 'Plan for the month (units)', num: true, cell: (r) => fmtN(r.plan), sort: (r) => r.plan },
    { header: 'Output lost (units)', num: true, cell: (r) => fmtN(r.lost), sort: (r) => r.lost },
    { header: 'Output lost (%)', num: true, cell: (r) => fmtPct(r.lost_pct, 0), sort: (r) => r.lost_pct },
    { header: 'Days the line stands idle', num: true, cell: (r) => r.idle_days.toFixed(1), sort: (r) => r.idle_days },
    { header: `Extra output a month at ${d.push_util * 100}% instead of ${d.base_util * 100}% (units)`, num: true, cell: (r) => fmtN(r.extra_per_month), sort: (r) => r.extra_per_month },
    { header: 'Weeks to win back the loss', num: true, cell: (r) => (r.lost === 0 ? '–' : r.recover_weeks === null ? 'Not possible' : r.recover_weeks.toFixed(1)), sort: (r) => r.recover_weeks },
    { header: 'Maintenance in the idle days (days)', num: true, cell: (r) => (r.lost === 0 ? '–' : `${r.maint_in_idle.toFixed(1)} of ${d.maint_days}`), sort: (r) => r.maint_in_idle },
    { header: 'Maintenance taken from capacity (days)', num: true, cell: (r) => (r.lost === 0 ? '–' : r.maint_from_capacity.toFixed(1)), sort: (r) => r.maint_from_capacity },
  ]
  const tl: Col<any>[] = [{ header: 'Date', cell: (r) => r.when, sort: (r) => r.when }, { header: 'What happens', cell: (r) => r.event }]
  return (
    <div className="stack-05">
      {o ? (
        <>
          <div className="row-03">
            <Dropdown id="ds-pl" size="md" titleText="Plant" label="Plant" items={['All plants', ...(o.plants ?? [])]} selectedItem={plant} onChange={({ selectedItem }: any) => selectedItem && setPlant(selectedItem)} />
          </div>
          <div className="row-03">
            <Dropdown id="ds-v" size="md" titleText="Vendor that fails" label="Vendor" items={o.vendors} itemToString={(i: any) => (i ? `${i.name} (${i.id})` : '')}
              selectedItem={o.vendors.find((x: any) => x.id === v) ?? null} onChange={({ selectedItem }: any) => { if (selectedItem) { setVendor(selectedItem.id); setFb(AUTO) } }} />
            <Dropdown id="ds-f" size="md" titleText="Fallback vendor" label="Fallback" items={[AUTO, ...o.vendors.filter((x: any) => x.id !== v).map((x: any) => x.id)]} itemToString={(i: string | null) => (i && i !== AUTO ? `${vname(i)} (${i})` : 'Auto, from the sourcing map')}
              selectedItem={fb} onChange={({ selectedItem }: any) => selectedItem && setFb(selectedItem)} />
            <Dropdown id="ds-m" size="md" titleText="Month affected" label="Month" items={o.months} itemToString={(m: string | null) => (m ? monthLong(m) : '')} selectedItem={month ?? q.data?.month ?? o.months[0]} onChange={({ selectedItem }: any) => selectedItem && setMonth(selectedItem)} />
            <NumField id="ds-w" label="Weeks without supply" min={1} max={8} step={1} value={weeks} onChange={setWeeks} />
            <NumField id="ds-s" label="Share not delivered (%)" min={0} max={100} step={5} value={short} onChange={setShort} />
          </div>
          <div className="row-03">
            <NumField id="ds-b" label="Fallback can cover (% of the lost volume)" min={0} max={100} step={5} value={bcap} onChange={setBcap} />
            <NumField id="ds-l" label="Days to switch to the fallback" min={0} max={30} step={1} value={lag} onChange={setLag} />
            <NumField id="ds-u0" label="Line utilisation now (%)" min={40} max={100} step={5} value={base} onChange={setBase} />
            <NumField id="ds-u1" label="Line utilisation to recover (%)" min={40} max={100} step={5} value={push} onChange={setPush} />
            <NumField id="ds-mt" label="Maintenance stop (days)" min={0} max={10} step={0.5} value={maint} onChange={setMaint} />
            <NumberInput id="ds-c" size="md" allowEmpty label="Stock cover at the start (days)" helperText={cover === null ? 'From the stock data' : undefined} hideSteppers min={0} max={120} step={1} value={cover ?? ''}
              onChange={(_e: unknown, { value }: { value: number | string }) => setCover(value === '' ? null : Math.max(0, +value))} />
          </div>
        </>
      ) : null}
      <ViewShell query={q} errorTitle="Could not run the scenario">
        {(d) => {
          if (d.error) return <p className="supporting">{d.error}</p>
          const T = d.totals
          const worst = [...d.lines].sort((a: any, b: any) => b.lost_pct - a.lost_pct)[0]
          const notes: { tone: string; text: string }[] = []
          if (T.shortage_materials === 0) notes.push({ tone: 'good', text: `Stock and the fallback cover the ${d.weeks}-week outage, so no line stops. Delivery from ${d.vendor_name} still fails, which pulls its on-time and in-full figure down.` })
          else notes.push({ tone: 'watch', text: `${T.shortage_materials} of ${T.materials} material${T.materials > 1 ? 's run' : ' runs'} short. ${worst.line} loses ${fmtPct(worst.lost_pct, 0)} of its plan and stands idle about ${worst.idle_days.toFixed(0)} days.` })
          if (T.no_fallback.length) notes.push({ tone: 'watch', text: `No fallback vendor exists for ${T.no_fallback.join(', ')}, so those materials stay short until the vendor is back.` })
          if (worst.lost > 0) {
            notes.push(worst.recover_weeks !== null && worst.recover_weeks <= 12
              ? { tone: 'good', text: `Running at ${d.push_util * 100}% instead of ${d.base_util * 100}% adds ${fmtPct((d.push_util - d.base_util) / d.base_util, 1)} output a month, so ${worst.line} wins back its loss in about ${worst.recover_weeks.toFixed(0)} weeks.` }
              : { tone: 'watch', text: `Even at ${d.push_util * 100}% utilisation it takes ${worst.recover_weeks === null ? 'longer than a year' : `about ${worst.recover_weeks.toFixed(0)} weeks`} to win back what ${worst.line} lost. Plan on the loss as permanent for this cycle, or use extra shifts.` })
            if (d.maint_days > 0) notes.push({ tone: 'note', text: `Schedule the ${d.maint_days}-day maintenance stop inside the ${worst.idle_days.toFixed(0)} idle days. The line is stopped anyway, so the stop costs no extra output.` })
          }
          return (
            <>
              <StatRow items={[
                { label: 'Output lost (units)', info: 'Units the lines cannot make because a raw material ran out. A product stops when its scarcest material runs out, so one short material can stop several products.', value: fmtN(T.lost), sublabel: `${fmtPct(T.plan ? T.lost / T.plan : 0, 1)} of the ${monthLong(d.month)} plan` },
                { label: 'Sales value at risk (₹)', info: 'The lost units at their selling price (MRP). It is the orders at risk, not profit. ' + G.est, value: inr(T.revenue), sublabel: 'Lost units at their selling price. Est.' },
                { label: `Raw-material OTIF, ${d.vendor_name}`, info: G.otif + ' Here the vendor\'s last-12-month figure is cut by the share not delivered and the weeks without supply.', value: T.otif1 === null ? '–' : fmtPct(T.otif1, 0), sublabel: T.otif0 === null ? '' : `Down from ${fmtPct(T.otif0, 0)} over the last 12 months` },
                { label: 'Extra cost of the fallback (₹)', info: G.fallback, value: inr(T.extra_cost), sublabel: 'The price premium on what it supplies. Est.' },
              ]} />
              <Findings title="What the scenario shows" items={notes} />
              {d.product ? (
                <DataCard id="dsc" title="From the product's demand to its vendors" info="The forecast for this product, turned into raw material through its bill of materials, and who supplies each material and how much. The failing vendor is marked." description={`${fmtN(d.demand)} units forecast for ${monthLong(d.month)}, and the raw material and vendor behind them`}
                  cols={[
                    { header: 'Raw material', cell: (r: any) => r.name, sort: (r: any) => String(r.name).toLowerCase() },
                    { header: 'Needed (units)', num: true, cell: (r: any) => `${fmtN(r.need)} ${r.uom}`, sort: (r: any) => r.need },
                    { header: 'Vendor', cell: (r: any) => `${r.vendor_name} (${r.vendor})`, sort: (r: any) => r.vendor },
                    { header: 'Role', cell: (r: any) => r.role, sort: (r: any) => r.role },
                    { header: 'Share (%)', num: true, cell: (r: any) => (r.share * 100).toFixed(0), sort: (r: any) => r.share },
                    { header: 'Supplied by this vendor (units)', num: true, cell: (r: any) => fmtN(r.supplied), sort: (r: any) => r.supplied },
                    { header: 'Lead time (days)', num: true, cell: (r: any) => r.lead.toFixed(0), sort: (r: any) => r.lead },
                    { header: 'In this scenario', cell: (r: any) => (r.failing ? <Tag type="red" size="sm">Fails</Tag> : <Tag type="green" size="sm">Delivers</Tag>), sort: (r: any) => String(r.failing) },
                  ] as Col<any>[]} rows={d.chain} itemsLabel="rows" rowKey={(r: any) => r.rm + r.vendor} />
              ) : null}
              <DataCard id="dsm" title="Raw materials hit" info="Each material this vendor supplies: how long stock lasts once deliveries stop, when the fallback vendor's first delivery lands, and what is still short." description={`What ${d.vendor_name} supplies, how long stock lasts and what the fallback vendor makes up`} cols={mcols} rows={d.materials} itemsLabel="materials" rowKey={(r) => r.rm}
                note="The month's need is the demand forecast turned into raw material through the bill of materials. Stock is drawn down by the volume the vendor does not deliver; the fallback starts after the days to switch plus its lead time. Est." />
              {d.by_plant && d.by_plant.length ? (
                <DataCard id="dsp" title="Where the loss lands, by plant" info="Each plant's part of every line type's plan, and the share of it lost when the vendor fails. Raw-material stock is held centrally and shared out in proportion to each plant's output, so every plant loses the same share of its plan." description="Plan, output lost and sales value at risk for each plant and line type"
                  cols={[
                    { header: 'Plant', cell: (r: any) => r.plant, sort: (r: any) => r.plant },
                    { header: 'Line', cell: (r: any) => r.line, sort: (r: any) => r.line },
                    { header: 'Share of the line', num: true, cell: (r: any) => `${(r.share * 100).toFixed(0)}%`, sort: (r: any) => r.share },
                    { header: 'Plan for the month (units)', num: true, cell: (r: any) => fmtN(r.plan), sort: (r: any) => r.plan },
                    { header: 'Output lost (units)', num: true, cell: (r: any) => fmtN(r.lost), sort: (r: any) => r.lost },
                    { header: 'Output lost (%)', num: true, cell: (r: any) => `${(r.lost_pct * 100).toFixed(1)}%`, sort: (r: any) => r.lost_pct },
                    { header: 'Days the line stands idle', num: true, cell: (r: any) => r.idle_days.toFixed(1), sort: (r: any) => r.idle_days },
                    { header: 'Sales value at risk (₹)', num: true, cell: (r: any) => `₹${fmtN(r.revenue)}`, sort: (r: any) => r.revenue },
                  ]} rows={d.by_plant} itemsLabel="plant lines" rowKey={(r: any) => r.plant + r.line} defaultSort={{ col: 4, dir: 'desc' }}
                  note="Each plant's share of a line comes from the plan for the month. The split of each line across plants is an illustrative assumption. Pick one plant above to see a failure that hits only that plant." />
              ) : null}
              <DataCard id="dsl" title="Production plan and winning back the time" info={G.utilisation + ' Winning back time = the share of the plan lost, divided by the extra share a month the higher utilisation adds.'} description="A product stops when its scarcest material runs out. The extra output is what the line gains by running at the higher utilisation." cols={lcols(d)} rows={d.lines} itemsLabel="lines" rowKey={(r) => r.line}
                defaultSort={{ col: 3, dir: 'desc' }}
                note={"Lines here are line types for the whole company, with all plants added together; the plant-by-plant view is in the Plant filter above. Recovery is the lost share of the plan divided by the extra share the higher utilisation adds each month. It needs headroom: the line cannot run above 100%. Last month the data shows these lines at " + d.lines.map((l: any) => `${(l.util_now * 100).toFixed(0)}%`).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).join(", ") + ". Est."} />
              <DataCard id="dst" title="Timeline" info="The planning dates the client wants: demand confirmed by the 20th (the 22nd at the latest), the production plan frozen on the 24th with room to move up or down, and purchase requests following from it. The failure and fallback dates are the scenario above." description="The planning dates for the month, and when the failure, the fallback and the recovery fall against them" cols={tl} rows={d.timeline} itemsLabel="steps" rowKey={(r) => r.when + r.event} />
            </>
          )
        }}
      </ViewShell>
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ComboBox, ContentSwitcher, MultiSelect, Switch } from '@reiq/ui/carbon'
import { getJson } from '../../lib/http'
import { fmtDate, fmtN, fmtPct, fmtSigned } from '../../lib/format'
import TrendChart from '../../charts/TrendChart'
import { seriesTable, type Series } from '../../charts/kit'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { Findings } from '../../ui/Findings'
import { StatRow } from '../../ui/StatRow'

const VIEWS = [{ id: 'all', label: 'All weeks' }, { id: 'around', label: 'Around the switch' }]

export default function RepackCase({ d }: { d: any }) {
  const dflt = d.repack
  const [view, setView] = useState('around')
  const [oldSkus, setOld] = useState<string[] | null>(null), [newSku, setNew] = useState<string | null>(null)
  const prods = useQuery({ queryKey: ['np', 'products'], queryFn: () => getJson<any[]>('/api/new-products/products'), staleTime: Infinity })
  const items: any[] = prods.data ?? []
  const oldSel = oldSkus ?? (dflt ? [dflt.old] : []), newSel = newSku ?? (dflt ? dflt.new : null)
  const custom = oldSkus !== null || newSku !== null
  const mapped = useQuery({ queryKey: ['np', 'switch', oldSel.join('~'), newSel], queryFn: () => getJson<any>(`/api/new-products/switch?old=${encodeURIComponent(oldSel.join('~'))}&new=${encodeURIComponent(newSel ?? '')}`),
    enabled: custom && oldSel.length > 0 && !!newSel, placeholderData: (p: any) => p })
  const r = custom ? mapped.data : dflt
  const label = (p: any) => (p ? `${p.name} (${p.sku})` : '')
  const picker = (
    <div className="row-03">
      <MultiSelect id="rp-old" size="md" titleText="Old product names" label={oldSel.length ? `${oldSel.length} selected` : 'Pick the old products'} items={items}
        itemToString={label} selectedItems={items.filter((p) => oldSel.includes(p.sku))} onChange={({ selectedItems }: any) => setOld(selectedItems.map((p: any) => p.sku))} />
      <ComboBox id="rp-new" size="md" titleText="New product name" placeholder="Pick the new product" items={items} itemToString={label}
        selectedItem={items.find((p) => p.sku === newSel) ?? null} onChange={({ selectedItem }: any) => setNew(selectedItem ? selectedItem.sku : null)} />
    </div>
  )
  if (!r || r.error) return <div className="stack-05">{picker}<p className="supporting">{r?.error ?? (custom ? 'Pick at least one old product and the new product to see the switch.' : 'No repackaged-SKU table was loaded.')}</p></div>
  const lo = view === 'all' ? 0 : Math.max(0, (r.first_new ?? 0) - 26)
  const idx = Array.from({ length: r.weeks.length - lo }, (_, i) => i + lo)
  const at = (a: any[]) => idx.map((i) => a[i])
  const x = at(r.weeks)
  const series: Series[] = [
    { name: 'Both together', values: at(r.combined), tone: 1 },
    { name: `Old product ${r.old}`, values: at(r.old_qty).map((v: number) => (v > 0 ? v : null)), tone: 5 },
    { name: `New product ${r.new}`, values: at(r.new_qty).map((v: number) => (v > 0 ? v : null)), tone: 2 },
  ]
  const t = seriesTable('Week starting', x.map(fmtDate), series, fmtN)
  const cols: Col<any>[] = [
    { header: 'Week starting', cell: (a) => fmtDate(a.w), sort: (a) => a.w },
    { header: 'Phase', cell: (a) => a.p, sort: (a) => a.p },
    { header: 'Old product (units)', num: true, cell: (a) => fmtN(a.o), sort: (a) => a.o },
    { header: 'New product (units)', num: true, cell: (a) => fmtN(a.n), sort: (a) => a.n },
    { header: 'Both (units)', num: true, cell: (a) => fmtN(a.c), sort: (a) => a.c },
  ]
  const rows = idx.map((i) => ({ w: r.weeks[i], p: r.phase[i], o: r.old_qty[i], n: r.new_qty[i], c: r.combined[i] }))
  return (
    <div className="stack-05">
      {picker}
      <StatRow items={[
        { label: 'Switch', value: `${r.old} to ${r.new}`, sublabel: `${r.old_name ?? ''} replaced by ${r.new_name ?? ''}` },
        { label: 'Old product discontinued', value: r.old_still_selling ? 'Still selling' : r.old_discontinued ? fmtDate(r.old_discontinued) : '–', sublabel: r.old_last_sale ? `Last sold the week of ${fmtDate(r.old_last_sale)}. Estimated from sales, as the data has no discontinuation date` : 'The old product has no sales' },
        { label: 'New product launched', value: r.new_launch ? fmtDate(r.new_launch) : '–', sublabel: r.new_launch_src === 'SKU master' ? `From the SKU master. First sale the week of ${r.new_first_sale ? fmtDate(r.new_first_sale) : '–'}` : 'Estimated from the first week it sold' },
        { label: r.gap_weeks !== null && r.gap_weeks > 0 ? 'Gap between the two (weeks)' : 'Overlap of the two (weeks)', value: r.gap_weeks === null ? '–' : String(Math.abs(r.gap_weeks)), sublabel: r.gap_weeks === null ? '' : r.gap_weeks > 0 ? 'Nothing was selling in between' : 'Both were on sale together' },
      ]} />
      <StatRow items={[
        { label: 'First sales of the new product', value: r.first_new === null ? '–' : fmtDate(r.weeks[r.first_new]), sublabel: `${r.transition_weeks} weeks of transition` },
        { label: 'Weekly sales before the switch (units)', value: fmtN(r.before_avg), sublabel: 'Old product, last 13 weeks' },
        { label: 'Weekly sales now (units)', value: fmtN(r.after_avg), sublabel: r.carry ? `${fmtSigned(r.carry - 1, 0)} against before the switch` : 'New product, last 13 weeks' },
      ]} />
      <Findings title="What the switch shows" items={[
        ...(r.carry ? [{ tone: r.carry >= 1 ? 'good' : 'watch', text: `The new product settled at ${fmtN(r.after_avg)} units a week, ${fmtPct(Math.abs(r.carry - 1), 0)} ${r.carry >= 1 ? 'above' : 'below'} the old product's last 13 weeks (${fmtN(r.before_avg)}). The forecast for the new product ID can therefore start from the old product's history, adjusted for this step.` }] : []),
      ]} />
      <ChartCard title="Old and new product, week by week" subtitle={custom ? "Orders received" : "Invoiced units"}
        toolbar={<ContentSwitcher size="md" selectedIndex={VIEWS.findIndex((v) => v.id === view)} onChange={(e: any) => setView(VIEWS[e.index].id)}>{VIEWS.map((v) => <Switch key={v.id} name={v.id} text={v.label} />)}</ContentSwitcher>}
        label="Weekly invoiced units of the old product, the new product, and both together"
        chart={<TrendChart x={x} series={series} kind="week" yTitle="Invoiced (units per week)" label="Old and new product, week by week" dotRadius={2} />}
        headers={t.headers} rows={t.rows}
        note="The switch is the first week the new product sells. The weeks where both sell are the transition, when the new product ramps up while the old one's stock runs out." />
      <DataCard id="rpw" title="Week by week" description="Invoiced units with the phase" cols={cols} rows={rows} itemsLabel="weeks" rowKey={(a) => a.w} defaultSort={{ col: 0, dir: 'desc' }} />
    </div>
  )
}

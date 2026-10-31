import { Reset } from '@carbon/icons-react'
import { Button, Dropdown, MultiSelect } from '@reiq/ui/carbon'
import type { Filters, Options } from '../lib/filters'

export const PERIODS = [
  { id: 'all', label: 'All history' }, { id: 'last12', label: 'Last 12 months' }, { id: 'last24', label: 'Last 24 months' },
  { id: 'train', label: 'Training period (to Sep 2025)' }, { id: 'test', label: 'Test period (Oct 2025 on)' },
]

/** The page's filters, for the header toolbar. `period` and `measure` are off on screens that do not use them. */
export function FilterBar({ f, set, reset, dirty, opts, period = false, measure = false, measureLocked = false, channel = true }: {
  f: Filters; set: (p: Partial<Filters>) => void; reset: () => void; dirty: boolean; opts: Options
  period?: boolean; measure?: boolean; measureLocked?: boolean; channel?: boolean
}) {
  const multi = (key: 'family' | 'region' | 'channel', title: string, all: string) => (
    <MultiSelect id={`flt-${key}`} size="md" titleText={title} label={f[key].length ? `${f[key].length} selected` : all} items={opts[key]}
      itemToString={(i: string) => i} selectedItems={f[key]} onChange={({ selectedItems }: { selectedItems: string[] }) => set({ [key]: selectedItems })} />
  )
  const measures = opts.measures ?? []
  return (
    <div className="filter-bar" role="group" aria-label="Filters">
      {multi('family', 'Product family', 'All families')}
      {multi('region', 'Region', 'All regions')}
      {channel && multi('channel', 'Channel', 'All channels')}
      {opts.product && (
        <MultiSelect id="flt-product" size="md" titleText="Product" label={f.product.length ? `${f.product.length} selected` : 'All products'} items={opts.product}
          itemToString={(i: { id: string; label: string }) => i?.label ?? ''} selectedItems={opts.product.filter((p) => f.product.includes(p.id))}
          onChange={({ selectedItems }: { selectedItems: { id: string }[] }) => set({ product: selectedItems.map((p) => p.id) })} />
      )}
      {period && (
        <Dropdown id="flt-period" size="md" titleText="Period" label="Period" items={PERIODS} itemToString={(i) => i?.label ?? ''}
          selectedItem={PERIODS.find((p) => p.id === f.period)} onChange={({ selectedItem }) => selectedItem && set({ period: selectedItem.id })} />
      )}
      {measure && measures.length > 0 && (
        <Dropdown id="flt-measure" size="md" titleText="Measure" label={measureLocked ? 'Orders and invoiced' : 'Measure'} items={measures} itemToString={(i) => i?.label ?? ''}
          disabled={measureLocked} selectedItem={measureLocked ? null : measures.find((m) => m.id === f.measure)}
          onChange={({ selectedItem }) => selectedItem && set({ measure: selectedItem.id })} />
      )}
      <Button kind="ghost" size="md" renderIcon={Reset} disabled={!dirty} onClick={reset}>Reset filters</Button>
    </div>
  )
}

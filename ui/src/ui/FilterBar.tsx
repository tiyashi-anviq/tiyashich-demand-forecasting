import { Reset } from '@carbon/icons-react'
import { Button, Dropdown, MultiSelect, Tag } from '@reiq/ui/carbon'
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
      itemToString={(i: string) => i} selectedItems={f[key]} onChange={({ selectedItems }: { selectedItems: string[] }) => {
        if (key !== 'family') {
          set({ [key]: selectedItems })
        } else {
          // Single atomic update: filter products to match selected families
          const validFamilies = new Set(selectedItems)
          const validProducts = f.product.filter((pid) => {
            const prod = (opts.product ?? []).find(p => p.id === pid)
            // Keep product if: no families selected OR product has no family OR product's family is selected
            return !validFamilies.size || !prod?.family || validFamilies.has(prod.family)
          })
          set({ family: selectedItems, product: validProducts })
        }
      }} />
  )
  // with families chosen only their products are offered; with none chosen every product can be picked
  const products = (opts.product ?? []).filter((p) => !f.family.length || !p.family || f.family.includes(p.family))
  const measures = opts.measures ?? []
  
  // Count active filters
  const activeCount = [
    f.family.length > 0 ? 1 : 0,
    f.region.length > 0 ? 1 : 0,
    channel && f.channel.length > 0 ? 1 : 0,
    f.product.length > 0 ? 1 : 0,
    period && f.period !== 'all' ? 1 : 0,
    measure && !measureLocked && f.measure !== 'orders' ? 1 : 0,
  ].reduce((a, b) => a + b, 0)
  
  return (
    <div className="filter-bar" role="group" aria-label="Filters">
      {activeCount > 0 && (
        <Tag type="blue" size="md" title={`${activeCount} filter${activeCount === 1 ? '' : 's'} applied`}>
          {activeCount} active
        </Tag>
      )}
      {multi('region', 'Region', 'All regions')}
      {channel && multi('channel', 'Channel', 'All channels')}
      {multi('family', 'Product family', 'All families')}
      {opts.product && (
        <MultiSelect id="flt-product" size="md" titleText="Product" label={f.product.length ? `${f.product.length} selected` : f.family.length ? 'All products in these families' : 'All products'} items={products}
          itemToString={(i: { id: string; label: string }) => i?.label ?? ''} selectedItems={products.filter((p) => f.product.includes(p.id))}
          onChange={({ selectedItems }: { selectedItems: { id: string }[] }) => set({ product: selectedItems.map((p) => p.id) })} />
      )}
      {period && (
        <Dropdown id="flt-period" size="md" titleText="Period" label="Period" items={PERIODS} itemToString={(i) => i?.label ?? ''}
          selectedItem={PERIODS.find((p) => p.id === f.period)} onChange={({ selectedItem }) => selectedItem && set({ period: selectedItem.id })} />
      )}
      {measure && measures.length > 0 && (
        <Dropdown id="flt-measure" size="md" titleText="Measure" label={measureLocked ? 'Orders and invoiced' : 'Measure'} items={measures} itemToString={(i) => i?.label ?? ''}
          disabled={measureLocked} selectedItem={measureLocked ? measures.find((m) => m.id === 'orders') || measures[0] : measures.find((m) => m.id === f.measure)}
          onChange={({ selectedItem }) => selectedItem && !measureLocked && set({ measure: selectedItem.id })} />
      )}
      <Button kind="ghost" size="md" renderIcon={Reset} disabled={!dirty} onClick={reset}>Reset filters</Button>
    </div>
  )
}

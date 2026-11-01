/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiErrorNotification } from '@reiq/ui'
import { Button, Dropdown, InlineNotification, Tag, Tile } from '@reiq/ui/carbon'
import { getJson } from '../../lib/http'
import { fmtInt, fmtSigned } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'
import { Delta, StatRow } from '../../ui/StatRow'
import type { Options } from '../../lib/filters'

const gap = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined && b ? a / b - 1 : null)
const ALL = '__all'

function statusOf(r: any): { label: string; type: 'gray' | 'blue' | 'teal' | 'green' } {
  if (r.status === 'agreed') return { label: 'Agreed', type: 'green' }
  if (r.turn === 'regional') return { label: 'With the Regional Head', type: 'blue' }
  return { label: 'With the S&D Head', type: 'teal' }
}

/** The Regional Heads' product-level numbers, filtered by region, channel, family and product so the S&D Head
 *  can look at one slice at a time instead of the whole book at once. Every row opens the negotiation. */
export function RegionalSubmissions({ month, role, region, unit, units, options, stamp, onOpen }: {
  month: string
  role: 'regional' | 'sd' | 'bu'
  region: string | null
  unit: { bu: string; name: string } | null
  units: { bu: string; name: string }[]
  options: Options
  stamp: number
  onOpen: (family: string, region: string) => void
}) {
  // The view decides the filters: a Regional Head is always scoped to their own region, a channel head to their own channel,
  // so the fixed part is shown as context instead of a dropdown that cannot be changed.
  const isRegional = role === 'regional'
  const isBu = role === 'bu'
  const fixedRegion = isRegional ? region : null
  const fixedBu = isBu ? unit?.bu ?? null : null
  const [reg, setReg] = useState<string | null>(isRegional ? region : null)
  const [bu, setBu] = useState<string | null>(isBu ? unit?.bu ?? null : null)
  const [family, setFamily] = useState<string | null>(null)
  const [product, setProduct] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const showMore = more || !!product || !!status

  const products = useMemo(
    () => (options.product ?? []).filter((p) => !family || p.family === family),
    [options.product, family],
  )
  const prodLabel = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.label])), [products])
  const buLabel = useMemo(() => Object.fromEntries(units.map((u) => [u.bu, u.name])), [units])

  const useReg = fixedRegion ?? reg
  const useBu = fixedBu ?? bu
  const anyFilter = !!(!isRegional && reg) || !!(!isBu && bu) || !!family || !!product || !!status

  const qs = new URLSearchParams({ month })
  if (useReg) qs.set('region', useReg)
  if (useBu) qs.set('bu', useBu)
  if (family) qs.set('family', family)
  if (product) qs.set('product', product)
  if (status) qs.set('status', status)

  const q = useQuery({
    queryKey: ['challenge-submissions', month, useReg, useBu, family, product, status, stamp],
    queryFn: () => getJson<any>(`/api/challenge/submissions?${qs.toString()}`),
    staleTime: 0,
  })

  // What is waiting for the S&D Head: every region that has a number on the table and whose turn it is to answer.
  // This is independent of the filters below, so the queue is the same whichever slice is open.
  const queue = useQuery({
    queryKey: ['challenge-queue', month, stamp],
    queryFn: () => getJson<any>(`/api/challenge/submissions?month=${month}`),
    enabled: role === 'sd',
    staleTime: 0,
  })
  const pending = useMemo(() => {
    const rows: any[] = queue.data?.rows ?? []
    const map = new Map<string, { head: string; region: string; family: string; bus: Set<string>; units: number }>()
    for (const r of rows) {
      // Only real Regional Head submissions: the demo's opening numbers are simulated and have no submitted_at.
      if (r.status !== 'negotiating' || r.turn !== 'sd' || !(r.submitted_at > 0)) continue
      const k = `${r.family}|${r.region}`
      const g = map.get(k) ?? { head: r.submitted_by, region: r.region, family: r.family, bus: new Set<string>(), units: 0 }
      g.bus.add(r.bu)
      g.units += r.submitted
      map.set(k, g)
    }
    return [...map.values()].sort((a, b) => a.region.localeCompare(b.region) || a.family.localeCompare(b.family))
  }, [queue.data])

  // Clicking a submission applies it to the filters, so the table opens on exactly the slice in the notification.
  const focusOn = (g: { region: string; family: string; bus: Set<string> }) => {
    setReg(g.region)
    setBu(g.bus.size === 1 ? [...g.bus][0] : null)
    setFamily(g.family)
    setProduct(null)
    setStatus(null)
    setMore(false)
  }

  const rows: any[] = q.data?.rows ?? []
  const submittedT = rows.reduce((a: number, r: any) => a + r.submitted, 0)
  const currentT = rows.reduce((a: number, r: any) => a + r.current, 0)
  const agreedRegions = new Set(rows.filter((r: any) => r.status === 'agreed').map((r: any) => `${r.family}|${r.region}`)).size
  const allRegions = new Set(rows.map((r: any) => `${r.family}|${r.region}`)).size

  const cols: Col<any>[] = [
    {
      header: 'Action',
      cell: (r) => (
        <Button kind="ghost" size="sm" onClick={() => onOpen(r.family, r.region)}>
          {r.status === 'negotiating' && r.turn === 'sd' ? 'Propose another number' : 'Open'}
        </Button>
      ),
    },
    { header: 'Region', cell: (r) => r.region, sort: (r) => r.region },
    { header: 'Family', cell: (r) => r.family, sort: (r) => r.family },
    { header: 'Channel', cell: (r) => (r.channel_name && r.channel_name !== r.channel ? `${r.channel_name} (${r.channel})` : r.channel), sort: (r) => r.channel },
    {
      header: 'Product',
      cell: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.description || r.sku}</div>
          <div className="footnote">{r.sku}</div>
        </div>
      ),
      sort: (r) => r.description || r.sku,
    },
    { header: 'Model (units)', num: true, cell: (r) => fmtInt(r.model), sort: (r) => r.model },
    { header: 'Regional submission (units)', num: true, cell: (r) => fmtInt(r.submitted), sort: (r) => r.submitted },
    { header: 'On the table now (units)', num: true, cell: (r) => fmtInt(r.current), sort: (r) => r.current },
    {
      header: 'Since the submission (units)',
      num: true,
      cell: (r) => (r.changed === 0 ? '–' : <span className={r.changed > 0 ? 'delta up' : 'delta down'}>{`${r.changed > 0 ? '+' : '−'}${fmtInt(Math.abs(r.changed))}`}</span>),
      sort: (r) => r.changed,
    },
    { header: 'Against the model (%)', num: true, cell: (r) => <Delta value={gap(r.current, r.model)} text={fmtSigned(gap(r.current, r.model), 1)} />, sort: (r) => gap(r.current, r.model) },
    { header: 'Status', cell: (r) => { const s = statusOf(r); return <Tag size="sm" type={s.type}>{s.label}</Tag> }, sort: (r) => statusOf(r).label },
  ]

  const reset = () => {
    setReg(null)
    setBu(null)
    setFamily(null)
    setProduct(null)
    setStatus(null)
    setMore(false)
  }
  const toggleMore = () => {
    if (showMore) {
      setMore(false)
      setProduct(null)
      setStatus(null)
    } else {
      setMore(true)
    }
  }

  return (
    <div className="stack-05">
      {role === 'sd' ? (
        pending.length ? (
          <div className="stack-03">
            {pending.map((g) => {
              const busNames = [...g.bus].map((b) => buLabel[b] ?? b).join(', ')
              return (
                <div
                  key={`${g.region}|${g.family}`}
                  role="button"
                  tabIndex={0}
                  className="notice-click"
                  aria-label={`Show ${g.region} ${g.family} submissions`}
                  onClick={() => focusOn(g)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      focusOn(g)
                    }
                  }}
                >
                  <InlineNotification
                    kind="info"
                    lowContrast
                    hideCloseButton
                    title={`${g.head} submitted ${g.family}`}
                    subtitle={`${busNames} — ${fmtInt(g.units)} units. Click to filter the table to this submission.`}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <InlineNotification
            kind="success"
            lowContrast
            hideCloseButton
            title="Nothing is waiting for you."
            subtitle="Every Regional Head submission has been answered. You can still open a region from the list below."
          />
        )
      ) : null}

      <Tile className="card stack-05">
        <div className="card-heading">
          <h3 className="card-title">Regional Head submissions</h3>
          <p className="footnote">
            The numbers each Regional Head put on the table, product by product.
            {isRegional ? ` This view is fixed to ${region}.` : isBu ? ` This view is fixed to ${unit?.name ?? 'your channel'}.` : ' Narrow it by region, channel and family; product and status are under More filters.'}
            {' '}Select a row to open that region's negotiation.
          </p>
        </div>
        <div className="challenge-bar">
          {isRegional ? (
            <div className="filter-fixed">
              <span className="cds--label">Region</span>
              <Tag size="md" type="blue">{region}</Tag>
            </div>
          ) : (
            <Dropdown
              id="sub-region"
              size="md"
              titleText="Region"
              label="Region"
              items={[ALL, ...(options.region ?? [])]}
              itemToString={(i: string | null) => (i === ALL ? 'All regions' : i ?? '')}
              selectedItem={reg ?? ALL}
              onChange={({ selectedItem }) => setReg(selectedItem === ALL ? null : selectedItem)}
            />
          )}
          {isBu ? (
            <div className="filter-fixed">
              <span className="cds--label">Channel</span>
              <Tag size="md" type="purple">{unit?.name ?? fixedBu}</Tag>
            </div>
          ) : (
            <Dropdown
              id="sub-bu"
              size="md"
              titleText="Channel"
              label="Channel"
              items={[ALL, ...units.map((u) => u.bu)]}
              itemToString={(i: string | null) => (i === ALL ? 'All channels' : buLabel[i ?? ''] ?? i ?? '')}
              selectedItem={bu ?? ALL}
              onChange={({ selectedItem }) => setBu(selectedItem === ALL ? null : selectedItem)}
            />
          )}
          <Dropdown
            id="sub-family"
            size="md"
            titleText="Product family"
            label="Product family"
            items={[ALL, ...(options.family ?? [])]}
            itemToString={(i: string | null) => (i === ALL ? 'All families' : i ?? '')}
            selectedItem={family ?? ALL}
            onChange={({ selectedItem }) => { setFamily(selectedItem === ALL ? null : selectedItem); setProduct(null) }}
          />
          {showMore ? (
            <>
              <Dropdown
                id="sub-product"
                size="md"
                titleText="Product"
                label="Product"
                items={[ALL, ...products.map((p) => p.id)]}
                itemToString={(i: string | null) => (i === ALL ? 'All products' : prodLabel[i ?? ''] ?? i ?? '')}
                selectedItem={product ?? ALL}
                onChange={({ selectedItem }) => setProduct(selectedItem === ALL ? null : selectedItem)}
              />
              <Dropdown
                id="sub-status"
                size="md"
                titleText="Status"
                label="Status"
                items={[ALL, 'negotiating', 'agreed']}
                itemToString={(i: string | null) => (i === ALL ? 'All statuses' : i === 'agreed' ? 'Agreed' : i === 'negotiating' ? 'In negotiation' : i ?? '')}
                selectedItem={status ?? ALL}
                onChange={({ selectedItem }) => setStatus(selectedItem === ALL ? null : selectedItem)}
              />
            </>
          ) : null}
          <Button kind="ghost" size="md" onClick={toggleMore}>{showMore ? 'Fewer filters' : 'More filters'}</Button>
          {anyFilter ? <Button kind="ghost" size="md" onClick={reset}>Reset filters</Button> : null}
        </div>
      </Tile>

      {q.isError ? <ApiErrorNotification error={q.error} fallbackTitle="Could not load the regional submissions" /> : null}
      {q.isPending ? <p className="supporting">Loading the regional submissions...</p> : null}

      {!q.isPending && !q.isError && q.data ? (
        <>
          <StatRow items={[
            { label: 'Products in view', value: fmtInt(rows.length), sublabel: 'After the filters above' },
            { label: 'Submitted (units)', value: fmtInt(submittedT), sublabel: 'What the Regional Heads proposed' },
            { label: 'On the table now (units)', value: fmtInt(currentT), sublabel: 'After any S&D counters' },
            { label: 'Regions agreed', value: `${agreedRegions} of ${allRegions}`, sublabel: 'Region and family conversations settled' },
          ]} />
          {rows.length === 0 ? (
            <InlineNotification kind="info" lowContrast hideCloseButton title="No submissions match these filters."
              subtitle="Widen the region, channel, family or product filter, or clear the status filter." />
          ) : (
            <DataCard
              id="regional-submissions"
              title="Regional Head submissions"
              description="One row per product. Select Propose another number to open the negotiation, change the SKU numbers, give a reason and send the counter-offer."
              cols={cols}
              rows={rows}
              itemsLabel="Products per page"
              rowKey={(r) => `${r.family}|${r.region}|${r.channel}|${r.sku}`}
              defaultSort={{ col: 1, dir: 'asc' }}
            />
          )}
        </>
      ) : null}
    </div>
  )
}

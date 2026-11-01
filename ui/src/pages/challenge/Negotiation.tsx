/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Dropdown, InlineNotification, Tag, Tile } from '@reiq/ui/carbon'
import { fmtN, fmtSigned } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'
import { StatRow } from '../../ui/StatRow'
import type { Role } from './Regions'
import { BuPanel, RegionsSection } from './Regions'

const gap = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined && b ? a / b - 1 : null)

function defaultFamily(items: any[], role: Role, region: string | null, unit: { bu: string } | null): string | null {
  if (role === 'bu' && unit) {
    const waiting = items.find((i) => i.bus.some((b: any) => b.bu === unit.bu && b.status === 'negotiating' && b.turn === 'bu'))
    const mine = items.find((i) => i.bus.some((b: any) => b.bu === unit.bu))
    return waiting?.family ?? mine?.family ?? items[0]?.family ?? null
  }
  if (role === 'regional' && region) {
    const waiting = items.find((i) => i.regional.some((r: any) => r.region === region && r.status === 'negotiating' && r.turn === 'regional'))
    const mine = items.find((i) => i.regional.some((r: any) => r.region === region))
    return waiting?.family ?? mine?.family ?? items[0]?.family ?? null
  }
  if (role === 'sd') {
    const waiting = items.find((i) => i.regional.some((r: any) => r.status === 'negotiating' && r.turn === 'sd'))
    return waiting?.family ?? items[0]?.family ?? null
  }
  return items[0]?.family ?? null
}

/** The one conversation per product, seen from whichever side is looking. The three levels are sequential: the S&D
 *  Head settles each region with its Regional Head first, then the channel heads settle the consolidated number. */
export function Negotiation({ month, items, role, region, unit, initialFamily, initialRegion, productFilter, stamp, onDone }: {
  month: string
  items: any[]
  role: Role
  region: string | null
  unit: { bu: string; name: string } | null
  initialFamily: string | null
  initialRegion: string | null
  productFilter?: string | null
  stamp: number
  onDone: (c: any) => void
}) {
  const families = items.map((i) => i.family)
  const startFamily = initialFamily && families.includes(initialFamily)
    ? initialFamily
    : defaultFamily(items, role, region, unit)
  const [family, setFamily] = useState<string | null>(startFamily)
  const [regionPick, setRegionPick] = useState<string | null>(initialRegion ?? (role === 'regional' ? region : null))
  const [buPick, setBuPick] = useState<string | null>(role === 'bu' ? unit?.bu ?? null : null)

  const it = items.find((i) => i.family === family) ?? items[0]
  if (!it) return <p className="supporting">No product families are in this month's challenge.</p>

  const show = (f: string | null) => {
    setFamily(f)
    setRegionPick(role === 'regional' ? region : null)
    setBuPick(role === 'bu' ? unit?.bu ?? null : null)
  }

  const sdWaiting = it.regional.filter((r: any) => r.status === 'negotiating' && r.turn === 'sd').length
  const regionalWaiting = it.regional.filter((r: any) => r.status === 'negotiating' && r.turn === 'regional').length
  const buWaiting = it.bus.filter((b: any) => b.status === 'negotiating' && b.turn === 'bu').length
  const stage = it.agreed !== null ? 'agreed' : it.consolidated !== null ? 'units' : 'regions'
  const now = it.agreed ?? (it.consolidated !== null ? it.bus.reduce((a: number, b: any) => a + (b.agreed ?? b.proposal ?? 0), 0) : it.regional_total)

  const regionCols: Col<any>[] = [
    { header: 'Region', cell: (r) => r.region, sort: (r) => r.region },
    { header: 'Model (units)', num: true, cell: (r) => fmtN(r.model), sort: (r) => r.model },
    { header: 'On the table now (units)', num: true, cell: (r) => fmtN(r.qty), sort: (r) => r.qty },
    { header: 'Against the model (%)', num: true, cell: (r) => <span className={gap(r.qty, r.model) !== null && gap(r.qty, r.model)! >= 0 ? 'delta up' : 'delta down'}>{fmtSigned(gap(r.qty, r.model), 1)}</span> },
    { header: 'Status', cell: (r) => <Tag size="sm" type={r.status === 'agreed' ? 'green' : r.turn === 'regional' ? 'blue' : 'teal'}>{r.status === 'agreed' ? 'Agreed' : r.turn === 'regional' ? 'With the Regional Head' : 'With the S&D Head'}</Tag> },
  ]

  const buCols: Col<any>[] = [
    { header: 'Channel', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
    { header: 'Head', cell: (r) => r.head },
    { header: 'Model (units)', num: true, cell: (r) => fmtN(r.model), sort: (r) => r.model },
    { header: 'Same month last year (units)', num: true, cell: (r) => fmtN(r.last_year), sort: (r) => r.last_year },
    { header: 'Current number (units)', num: true, cell: (r) => ((r.agreed ?? r.proposal) === null ? '–' : fmtN(r.agreed ?? r.proposal)), sort: (r) => r.agreed ?? r.proposal ?? 0 },
    { header: 'Against the model (%)', num: true, cell: (r) => { const g = gap(r.agreed ?? r.proposal, r.model); return g === null ? '–' : <span className={g >= 0 ? 'delta up' : 'delta down'}>{fmtSigned(g, 1)}</span> } },
    { header: 'Status', cell: (r) => <Tag size="sm" type={r.status === 'agreed' ? 'green' : r.status === 'negotiating' ? 'teal' : 'gray'}>{r.status === 'agreed' ? 'Agreed' : r.status === 'negotiating' ? (r.turn === 'bu' ? 'With the channel head' : 'With the S&D Head') : 'Not started'}</Tag> },
  ]

  const bus = role === 'bu' && unit ? it.bus.filter((b: any) => b.bu === unit.bu) : it.bus
  const chosen = bus.find((b: any) => b.bu === buPick) ?? bus[0]

  return (
    <div className="stack-05">
      <Tile className="card stack-05">
        <div className="card-heading">
          <h3 className="card-title">Negotiation: {it.family}</h3>
          <p className="footnote">
            Model {fmtN(it.model)} units • Regional Heads {fmtN(it.regional_total)} • On the table now {fmtN(now)} ({fmtSigned(gap(now, it.model), 1)} against the model).
            Each region is agreed first; the channel heads then agree the consolidated number.
          </p>
        </div>
        <div className="challenge-bar">
          <Dropdown
            id="neg-family"
            size="md"
            titleText="Product family"
            label="Product family"
            items={families}
            itemToString={(i: string | null) => i ?? ''}
            selectedItem={it.family}
            onChange={({ selectedItem }) => selectedItem && show(selectedItem)}
          />
          {role === 'sd' ? <Tag size="sm" type="teal">S&D Head</Tag> : null}
          {role === 'regional' && region ? <Tag size="sm" type="blue">{region} Regional Head</Tag> : null}
          {role === 'bu' && unit ? <Tag size="sm" type="purple">{unit.name}</Tag> : null}
        </div>
        <StatRow items={[
          { label: 'Regional Heads', value: `${it.n_regions_agreed} of ${it.n_regions}`, sublabel: stage === 'regions' ? `${sdWaiting} waiting for the S&D Head` : 'All regions agreed' },
          { label: 'S&D Head', value: stage === 'regions' ? `${sdWaiting} to answer` : 'Region numbers settled', sublabel: stage === 'regions' ? `${regionalWaiting} waiting for a Regional Head` : 'Mediating the channels' },
          { label: 'Channel heads', value: it.consolidated === null ? 'Not started' : `${it.n_agreed} of ${it.bus.length}`, sublabel: it.consolidated === null ? 'Starts once every region agrees' : `${buWaiting} waiting for a channel head` },
          { label: 'Final value (units)', value: it.agreed === null ? '–' : fmtN(it.agreed), sublabel: it.agreed === null ? 'Not agreed by all three yet' : 'All three levels agreed' },
        ]} />
      </Tile>

      <InlineNotification
        kind={stage === 'agreed' ? 'success' : stage === 'regions' ? 'info' : 'warning'}
        lowContrast
        hideCloseButton
        title={stage === 'agreed' ? 'All three levels have agreed this family.' : stage === 'regions' ? 'Step 1 of 2: the regions agree with the S&D Head.' : 'Step 2 of 2: the channels agree with the S&D Head.'}
        subtitle={stage === 'agreed'
          ? 'The numbers are in the Final values tab and are what Supply and Procurement plan on.'
          : stage === 'regions'
            ? 'Each Regional Head submits product by product. The S&D Head accepts, counters or makes the final call. Once every region agrees, the family goes to the channel heads (BU heads).'
            : 'The regional numbers are locked. Each channel head (BU head) now accepts or counters the consolidated number with the S&D Head. When every channel agrees, the family becomes final.'}
      />

      {stage === 'regions' ? (
        role === 'bu' ? (
          <>
            <InlineNotification kind="info" lowContrast hideCloseButton title="Waiting for the regions to finish."
              subtitle="This family reaches the channels once every region has agreed its numbers with the S&D Head. These are the regions it is waiting on." />
            <DataCard id="neg-regions-readonly" title="Where the regions stand" description="Read-only for the channel head" cols={regionCols}
              rows={it.regional} itemsLabel="Regions per page" rowKey={(r: any) => r.region} />
          </>
        ) : (
          <RegionsSection it={it} role={role} pick={role === 'regional' ? region : regionPick} onPick={setRegionPick} productFilter={productFilter} stamp={stamp} onDone={onDone} />
        )
      ) : (
        <>
          {role === 'regional' ? (
            <RegionsSection it={it} role={role} pick={region} onPick={() => {}} productFilter={productFilter} stamp={stamp} onDone={onDone} />
          ) : (
            <>
              <DataCard id="neg-bus" title="Channels" description={role === 'bu' ? 'Your channel for this family' : 'One conversation per channel. Select a row to open it'}
                cols={buCols} rows={bus} itemsLabel="Units per page" rowKey={(r: any) => r.bu}
                onRow={(r: any) => setBuPick(r.bu)} selected={(r: any) => r.bu === chosen?.bu} />
              {chosen ? <BuPanel key={`${month}|${it.family}|${chosen.bu}|${role}`} it={it} b={chosen} role={role} stamp={stamp} onDone={onDone} /> : null}
            </>
          )}
        </>
      )}
    </div>
  )
}

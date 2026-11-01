/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiErrorNotification } from '@reiq/ui'
import { Button, Dropdown, InlineNotification, Tag, Tile } from '@reiq/ui/carbon'
import { getJson } from '../../lib/http'
import { fmtInt, fmtN, fmtSigned } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'
import { Delta, StatRow } from '../../ui/StatRow'

const gap = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined && b ? a / b - 1 : null)

const monthLabel = (m: string, shift = 0) => {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1 + shift, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** The numbers agreed by the Regional Head, the S&D Head and the BU Heads. Shows final vs model comparison and the
 *  negotiation history. These are the numbers the Supply and production plan and Procurement pick up. */
export function FinalNumbers({ month, stamp, role, region, unit }: {
  month: string
  stamp: number
  role: 'regional' | 'sd' | 'bu'
  region: string | null
  unit: { bu: string; name: string } | null
}) {
  const q = useQuery({ queryKey: ['challenge-final', month, stamp], queryFn: () => getJson<any>(`/api/challenge/final?month=${month}`), staleTime: 0 })
  const activity = useQuery({ queryKey: ['challenge-activity', stamp], queryFn: () => getJson<any[]>('/api/challenge/activity'), staleTime: 0 })
  const cycle = useQuery({ queryKey: ['challenge'], queryFn: () => getJson<any>('/api/challenge/cycle'), staleTime: 60_000 })
  const isRegional = role === 'regional'
  const isBu = role === 'bu'
  const fixedRegion = isRegional ? region : null
  const fixedBu = isBu ? unit?.bu ?? null : null
  const [fam, setFam] = useState<string | null>(null)
  const [reg, setReg] = useState<string | null>(isRegional ? region : null)
  const [bu, setBu] = useState<string | null>(isBu ? unit?.bu ?? null : null)
  const [prod, setProd] = useState<string | null>(null)
  if (q.isError) return <ApiErrorNotification error={q.error} fallbackTitle="Could not load the final values" />
  const d = q.data
  if (!d) return <p className="supporting">Loading the final values...</p>
  const useReg = fixedRegion ?? reg
  const useBu = fixedBu ?? bu
  const roleLines = d.lines.filter((l: any) =>
    (!fixedRegion || l.region === fixedRegion) && (!fixedBu || l.bu === fixedBu))
  const regions = [...new Set<string>(roleLines.map((l: any) => l.region))]
  const bus = [...new Map<string, string>(roleLines.map((l: any) => [l.bu, l.bu_name])).entries()]
  const families = [...new Set<string>(roleLines.map((l: any) => l.family))]
  const products = fam 
    ? [...new Set<string>(roleLines.filter((l: any) => l.family === fam).map((l: any) => l.sku))]
    : []
  const lines = roleLines.filter((l: any) =>
    (!fam || l.family === fam) && (!useReg || l.region === useReg) && (!useBu || l.bu === useBu) && (!prod || l.sku === prod))
  const scopedFamilies = new Set<string>(roleLines.map((l: any) => l.family))
  const done = d.families.filter((f: any) => f.status === 'agreed' && scopedFamilies.has(f.family))
  const anyFilter = !!(!isRegional && reg) || !!(!isBu && bu) || !!fam || !!prod
  const reset = () => { setFam(null); setReg(null); setBu(null); setProd(null) }
  const scopeTotal = roleLines.reduce((a: number, l: any) => a + l.qty, 0)
  const famCols: Col<any>[] = [
    { header: 'Family', cell: (r) => r.family, sort: (r) => r.family },
    { header: 'Model (units)', num: true, cell: (r) => fmtN(r.model), sort: (r) => r.model },
    { header: 'Final value (units)', num: true, cell: (r) => (r.final === null ? '–' : fmtN(r.final)), sort: (r) => r.final ?? 0 },
    { header: 'Against the model (%)', num: true, cell: (r) => (r.final === null ? '–' : <Delta value={gap(r.final, r.model)} text={fmtSigned(gap(r.final, r.model), 1)} />) },
    { header: 'Status', cell: (r) => <Tag size="sm" type={r.status === 'agreed' ? 'green' : r.status === 'negotiating' ? 'teal' : 'gray'}>{r.status === 'agreed' ? 'Final — all three agreed' : r.status === 'negotiating' ? `${r.n_agreed} of ${r.n_units} units agreed` : 'Collecting regions'}</Tag> },
  ]
  const lineCols: Col<any>[] = [
    { header: 'Family', cell: (r) => r.family, sort: (r) => r.family },
    { header: 'Region', cell: (r) => r.region, sort: (r) => r.region },
    { header: 'Business unit', cell: (r) => r.bu_name, sort: (r) => r.bu_name },
    { header: 'Channel', cell: (r) => (r.channel_name && r.channel_name !== r.channel ? `${r.channel_name} (${r.channel})` : r.channel), sort: (r) => r.channel },
    { header: 'SKU', cell: (r) => r.sku, sort: (r) => r.sku },
    { header: 'Description', cell: (r) => r.description || '–' },
    { header: 'Model (units)', num: true, cell: (r) => fmtInt(r.model), sort: (r) => r.model },
    { header: 'Same month last year (units)', num: true, cell: (r) => fmtInt(r.last_year), sort: (r) => r.last_year },
    { header: 'Final value (units)', num: true, cell: (r) => fmtInt(r.qty), sort: (r) => r.qty },
    { header: 'Against the model (%)', num: true, cell: (r) => <Delta value={gap(r.qty, r.model)} text={fmtSigned(gap(r.qty, r.model), 1)} /> },
    { header: 'Agreed by', cell: (r) => r.agreed_by || '–' },
  ]

  // Aggregate stats from the cycle data for this month
  const cycleItems: any[] = cycle.data?.items?.filter((i: any) => i.month === month) ?? []
  const cycleStats = cycleItems.reduce((acc: any, it: any) => ({
    model: acc.model + it.model,
    lastYear: acc.lastYear + it.last_year,
    lastMonth: acc.lastMonth + it.last_month,
    // Only count fully agreed families (all three levels agreed)
    agreed: acc.agreed + (it.status === 'agreed' ? (it.agreed ?? 0) : 0),
  }), { model: 0, lastYear: 0, lastMonth: 0, agreed: 0 })
  
  // Count families that are fully agreed (all three levels)
  const fullyAgreedCount = cycleItems.filter((i: any) => i.status === 'agreed').length

  const activityRows = activity.data ?? []
  const activityCols: Col<any>[] = [
    { header: 'When', cell: (r) => new Date(r.at * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), sort: (r) => r.at },
    { header: 'Month', cell: (r) => r.month, sort: (r) => r.month },
    { header: 'Family', cell: (r) => r.family, sort: (r) => r.family },
    { header: 'Business unit', cell: (r) => r.bu ?? '–' },
    { header: 'Who', cell: (r) => r.who },
    { header: 'What', cell: (r) => r.what },
    { header: 'Number (units)', num: true, cell: (r) => fmtInt(r.qty), sort: (r) => r.qty },
    { header: 'Reason or note', cell: (r) => r.reason || '–' },
  ]

  const thisLabel = monthLabel(month)
  const lyLabel = monthLabel(month, -12)
  const prevLabel = monthLabel(month, -1)

  return (
    <div className="stack-05">
      {/* 1. DEMAND AT A GLANCE */}
      <Tile className="card">
        <h3 className="card-title">Demand at a glance</h3>
        <p className="footnote">
          {anyFilter ? (
            <>
              {useReg || 'All regions'}
              {useBu ? ` · ${useBu}` : ''}
              {fam ? ` · ${fam}` : ' · All families'}
            </>
          ) : `Final values · ${thisLabel}`}
        </p>
        <StatRow items={anyFilter ? [
          { label: 'Final agreed (units)', value: fmtN(lines.reduce((a: number, l: any) => a + l.qty, 0)) },
          { label: 'Model forecast (units)', value: fmtN(lines.reduce((a: number, l: any) => a + l.model, 0)) },
          { label: 'Same month last year (units)', value: fmtN(lines.reduce((a: number, l: any) => a + l.last_year, 0)) },
        ] : [
          { label: 'Final agreed demand (units)', value: fmtN(cycleStats.agreed), sublabel: `${fullyAgreedCount} of ${d.families.length} families fully agreed by all three levels` },
          { label: 'Model forecast (units)', value: fmtN(cycleStats.model), sublabel: `${thisLabel} · Starting point` },
          { label: 'Same month last year (units)', value: fmtN(cycleStats.lastYear), sublabel: lyLabel },
          { label: 'Last month (units)', value: fmtN(cycleStats.lastMonth), sublabel: `${prevLabel} actuals` },
        ]} />
      </Tile>

      {/* 2. NOTIFICATION/UPDATES with embedded filters and table */}
      {d.lines.length > 0 && (
        <Tile className="card stack-03">
          <div 
            style={{ cursor: 'pointer' }}
            onClick={() => {
              // Auto-populate filters based on agreed products
              const agreedRegions = [...new Set<string>(d.lines.map((l: any) => l.region))]
              const agreedBUs = [...new Set<string>(d.lines.map((l: any) => l.bu))]
              const agreedFamilies = [...new Set<string>(d.lines.map((l: any) => l.family))]
              
              if (!isRegional && agreedRegions.length === 1) setReg(agreedRegions[0])
              if (!isBu && agreedBUs.length === 1) setBu(agreedBUs[0])
              if (agreedFamilies.length === 1) setFam(agreedFamilies[0])
              setProd(null)
            }}
          >
            <h3 className="card-title">Available now →</h3>
            <p className="footnote">
              {fmtInt(scopeTotal)} units · {d.lines.length} product{d.lines.length === 1 ? '' : 's'} across {scopedFamilies.size} famil{scopedFamilies.size === 1 ? 'y' : 'ies'}
            </p>
            <p className="supporting">
              BU heads have agreed these numbers. Click to apply filters. They are available for Supply and Procurement to use immediately, even while other BUs are still reviewing.
            </p>
          </div>
          
          {/* Filters inside the Available now card */}
          <div className="challenge-bar">
            {isRegional ? (
              <div className="filter-fixed">
                <span className="cds--label">Region</span>
                <Tag size="md" type="blue">{region}</Tag>
              </div>
            ) : (
              <Dropdown id="fin-r" size="md" titleText="Region" label="Region" items={['All regions', ...regions]} itemToString={(i: string | null) => i ?? ''} selectedItem={reg ?? 'All regions'} onChange={({ selectedItem }) => setReg(selectedItem === 'All regions' ? null : selectedItem)} />
            )}
            {isBu ? (
              <div className="filter-fixed">
                <span className="cds--label">Business unit</span>
                <Tag size="md" type="purple">{unit?.bu ?? fixedBu}</Tag>
              </div>
            ) : (
              <Dropdown id="fin-b" size="md" titleText="Business unit" label="Business unit" items={['All business units', ...bus.map(([id]) => id)]} itemToString={(i: string | null) => i ?? ''} selectedItem={bu ?? 'All business units'} onChange={({ selectedItem }) => setBu(selectedItem === 'All business units' ? null : selectedItem)} />
            )}
            <Dropdown id="fin-f" size="md" titleText="Product family" label="Product family" items={['All families', ...families]} itemToString={(i: string | null) => i ?? ''} selectedItem={fam ?? 'All families'} onChange={({ selectedItem }) => setFam(selectedItem === 'All families' ? null : selectedItem)} />
            <Dropdown id="fin-p" size="md" titleText="Product" label="Product" items={['All products', ...products]} itemToString={(i: string | null) => i ?? ''} selectedItem={prod ?? 'All products'} onChange={({ selectedItem }) => setProd(selectedItem === 'All products' ? null : selectedItem)} disabled={!fam} />
            {anyFilter ? <Button kind="ghost" size="md" onClick={reset}>Reset filters</Button> : null}
          </div>
          
          <DataCard 
            id="available-now-table" 
            title="Agreed products" 
            description="Products with quantities agreed by BU heads, ready for Supply and Procurement"
            cols={[
              { header: 'Region', cell: (r: any) => r.region, sort: (r: any) => r.region },
              { header: 'Business Unit', cell: (r: any) => r.bu, sort: (r: any) => r.bu },
              { header: 'Family', cell: (r: any) => r.family, sort: (r: any) => r.family },
              { header: 'Product', cell: (r: any) => `${r.sku} · ${r.description}`, sort: (r: any) => r.sku },
              { header: 'Agreed (units)', num: true, cell: (r: any) => fmtInt(r.qty), sort: (r: any) => r.qty },
              { header: 'vs Model', num: true, cell: (r: any) => <Delta value={gap(r.qty, r.model)} text={fmtSigned(gap(r.qty, r.model), 1)} /> },
              { header: 'Agreed by', cell: (r: any) => r.agreed_by || '–' },
            ]} 
            rows={lines} 
            itemsLabel="Products per page" 
            rowKey={(r: any) => r.key}
            defaultSort={{ col: 4, dir: 'desc' }}
          />
        </Tile>
      )}

      <InlineNotification kind={done.length > 0 || d.lines.length > 0 ? 'success' : 'info'} lowContrast hideCloseButton
        title={d.lines.length > 0
          ? `${d.lines.length} products ready for handoff`
          : 'No products ready yet'}
        subtitle={d.lines.length > 0
          ? 'These products were agreed by Regional Head, S&D Head, and BU Head. They are confirmed at all three levels and ready for Supply and Procurement.'
          : 'Products appear here once Regional Head submits, S&D Head accepts, and BU Head agrees.'} />

      {d.lines.length > 0 && (
        <Tile className="card">
          <h3 className="card-title">Hand-off to Supply and Procurement</h3>
          <p className="supporting">
            <strong>{fmtInt(scopeTotal)} units</strong> across <strong>{d.lines.length} products</strong> in <strong>{scopedFamilies.size} famil{scopedFamilies.size === 1 ? 'y' : 'ies'}</strong> are ready to plan on.
          </p>
          <p className="supporting">
            These products have been confirmed by all three levels (Regional Head → S&D Head → BU Head) for specific Region × BU × Family combinations. They are final and ready for planning.
          </p>
          {done.length > 0 && (
            <p className="supporting">
              <strong>Note:</strong> {done.length} famil{done.length === 1 ? 'y is' : 'ies are'} fully agreed across all regions and BUs.
            </p>
          )}
          <p className="supporting">
            <Link to="/inventory">Open the supply and production plan</Link>
            {' · '}
            <Link to="/procurement">Open Procurement</Link>
          </p>
        </Tile>
      )}

      <DataCard id="fin-fam" title="Families" description="Where each family stands and whether its value is final" cols={famCols} rows={d.families} itemsLabel="Families per page" rowKey={(r) => r.family} />

      {d.lines.length > 0 && (
        <DataCard id="fin-lines" title="Final values by product" description="Products agreed by BU heads and ready for Supply and Procurement. Includes partial agreements where some BUs have agreed." cols={lineCols} rows={lines} itemsLabel="Lines per page" rowKey={(r) => `${r.family}|${r.key}`} defaultSort={{ col: 8, dir: 'desc' }} />
      )}

      {activityRows.length > 0 && (
        <DataCard
          id="negotiations-history"
          title="Negotiation history"
          description="Every submission, counter-offer and agreement, newest first. The audit trail behind the final values."
          cols={activityCols}
          rows={activityRows}
          itemsLabel="Entries per page"
          rowKey={(r, i) => `${r.at}|${i}`}
          defaultSort={{ col: 0, dir: 'desc' }}
        />
      )}
    </div>
  )
}

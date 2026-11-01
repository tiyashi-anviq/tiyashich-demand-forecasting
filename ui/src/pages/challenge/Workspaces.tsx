/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useToast } from '@reiq/ui'
import { Button, Dropdown, InlineNotification, Tag, Tile } from '@reiq/ui/carbon'
import { getJson, sendJson } from '../../lib/http'
import { fmtInt, fmtN, fmtSigned } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'
import { StatRow } from '../../ui/StatRow'
import { Negotiation } from './Negotiation'

const ALL_PRODUCTS = '__all_products'

const unitsLabel = (qty: number | null | undefined) => (qty === null || qty === undefined ? '–' : `${fmtInt(qty)} units`)

const monthLabel = (m: string, shift = 0) => {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1 + shift, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function stageOf(it: any): { label: string; type: 'gray' | 'blue' | 'teal' | 'green' } {
  if (it.status === 'agreed') return { label: 'Agreed — final', type: 'green' }
  if (it.consolidated === null) return { label: 'Collecting regions', type: 'gray' }
  if (it.bus.some((b: any) => b.status === 'negotiating' && b.turn === 'sd')) return { label: 'With the S&D Head', type: 'teal' }
  return { label: 'With the BU heads', type: 'blue' }
}

/** Step 2: what the S&D Head acts on. One queue of everything waiting for an answer — a Regional Head's submission
 *  or a BU Head's counter — and one row per family to open the conversation or send it to the units. */
export function SDWorkspace({ cycle, month, options, onDone }: {
  cycle: any
  month: string
  options: any
  stamp: number
  onDone: (c: any) => void
}) {
  const { showToast } = useToast()
  const [fReg, setFReg] = useState<string | null>(null)
  const [fBu, setFBu] = useState<string | null>(null)
  const [fFam, setFFam] = useState<string | null>(null)
  const [fProd, setFProd] = useState<string | null>(null)
  const items: any[] = cycle.items.filter((i: any) => i.month === month)
  
  // Get product options filtered by selected family (matching Regional Head logic)
  const allProductOpts = options?.product ?? []
  const productOpts = fFam && allProductOpts.length > 0
    ? allProductOpts.filter((p: any) => p.family === fFam)
    : allProductOpts
  const products = productOpts.map((p: any) => p.id).filter(Boolean)

  // The filters the S&D Head works with: a region, a business unit, or a product family narrows the queue.
  const rows = items.filter((it: any) => {
    if (fFam && it.family !== fFam) return false
    if (fBu && !(it.bus ?? []).some((b: any) => b.bu === fBu)) return false
    if (fReg && !(it.regional ?? []).some((r: any) => r.region === fReg)) return false
    return true
  })

  const send = useMutation({
    mutationFn: (family: string) => sendJson<any>('/api/challenge/consolidate', 'POST', { month, family }),
    onSuccess: (c, family) => {
      showToast('success', `✓ ${family} sent to the BU heads`, 'Open the BU Unit tab to agree it with each unit.')
      onDone(c)
    },
    onError: (e: any) => showToast('error', 'Could not send it to the BU heads', e?.message ?? 'Please try again.'),
  })

  // Removed the separate view - now negotiation shows inline below filters

  // Aggregate stats respecting Region, BU, and Family filters
  const stats = items.reduce((acc, it) => {
    // Filter by family
    if (fFam && it.family !== fFam) return acc
    
    // Filter by region - sum only the matching region's data
    if (fReg) {
      const reg = (it.regional ?? []).find((r: any) => r.region === fReg)
      if (!reg) return acc
      
      // Filter by BU within the region
      if (fBu && reg.bus) {
        const busData = reg.bus.find((b: any) => b.bu === fBu)
        if (!busData) return acc
        return {
          model: acc.model + busData.model,
          lastYear: acc.lastYear + busData.last_year,
          lastMonth: acc.lastMonth + (busData.last_month ?? 0),
          current: acc.current + (busData.model ?? 0), // Use model as placeholder for current
        }
      }
      
      return {
        model: acc.model + reg.model,
        lastYear: acc.lastYear + reg.last_year,
        lastMonth: acc.lastMonth + (reg.last_month ?? 0),
        current: acc.current + (reg.qty ?? reg.model),
      }
    }
    
    // Filter by BU across all regions
    if (fBu) {
      const buTotal = (it.regional ?? []).reduce((sum: number, reg: any) => {
        const busData = reg.bus?.find((b: any) => b.bu === fBu)
        return sum + (busData?.model ?? 0)
      }, 0)
      const buLastYear = (it.regional ?? []).reduce((sum: number, reg: any) => {
        const busData = reg.bus?.find((b: any) => b.bu === fBu)
        return sum + (busData?.last_year ?? 0)
      }, 0)
      const buLastMonth = (it.regional ?? []).reduce((sum: number, reg: any) => {
        const busData = reg.bus?.find((b: any) => b.bu === fBu)
        return sum + (busData?.last_month ?? 0)
      }, 0)
      return {
        model: acc.model + buTotal,
        lastYear: acc.lastYear + buLastYear,
        lastMonth: acc.lastMonth + buLastMonth,
        current: acc.current + buTotal,
      }
    }
    
    // No filters or only family filter - use full item totals
    return {
      model: acc.model + it.model,
      lastYear: acc.lastYear + it.last_year,
      lastMonth: acc.lastMonth + it.last_month,
      current: acc.current + (it.consolidated ?? it.regional_total),
    }
  }, { model: 0, lastYear: 0, lastMonth: 0, current: 0 })

  const waiting = [
    ...items.flatMap((it: any) => it.regional
      .filter((r: any) => !r.simulated && r.status === 'negotiating' && r.turn === 'sd')
      .map((r: any) => ({ 
        key: `r|${it.family}|${r.region}`, 
        family: it.family, 
        region: r.region,
        bus: r.bus || [],
        who: `${r.region} Regional Head`, 
        what: 'submitted', 
        qty: r.qty 
      }))),
    ...items.flatMap((it: any) => it.bus
      .filter((b: any) => b.status === 'negotiating' && b.turn === 'sd')
      .map((b: any) => ({ 
        key: `b|${it.family}|${b.bu}`, 
        family: it.family, 
        bu: b.bu,
        who: b.head, 
        what: 'countered', 
        qty: b.proposal 
      }))),
  ]

  const cols: Col<any>[] = [
    { header: 'Product family', cell: (r) => r.family, sort: (r) => r.family },
    { header: 'Step', cell: (r) => (r.consolidated === null ? 'Regions' : 'Business units'), sort: (r) => (r.consolidated === null ? 0 : 1) },
    { header: 'On the table (units)', num: true, cell: (r) => fmtInt(r.consolidated ?? r.regional_total), sort: (r) => r.consolidated ?? r.regional_total },
    { header: 'Status', cell: (r) => { const s = stageOf(r); return <Tag size="sm" type={s.type}>{s.label}</Tag> }, sort: (r) => stageOf(r).label },
    {
      header: 'Action',
      cell: (r) => (
        <div className="row-03">
          {r.consolidated === null && r.regional.some((x: any) => !x.simulated) ? (
            <Button kind="primary" size="sm" disabled={send.isPending} onClick={() => send.mutate(r.family)}>
              Send to BU heads
            </Button>
          ) : null}
        </div>
      ),
    },
  ]

  const thisLabel = monthLabel(month)
  const lyLabel = monthLabel(month, -12)
  const prevLabel = monthLabel(month, -1)

  return (
    <div className="stack-05">
      <Tile className="card">
        <h3 className="card-title">Demand at a glance</h3>
        <p className="footnote">
          {fReg || fBu || fFam ? (
            <>
              {fReg ? fReg : 'All regions'}
              {fBu ? ` · ${fBu}` : ''}
              {fFam ? ` · ${fFam}` : ' · All families'}
            </>
          ) : 'All families and regions'} · {thisLabel}
        </p>
        <StatRow items={[
          { label: 'Forecast demand (units)', value: fmtN(stats.model), sublabel: `${thisLabel} · Model forecast` },
          { label: 'Same month last year (units)', value: fmtN(stats.lastYear), sublabel: lyLabel },
          { label: 'Last month (units)', value: fmtN(stats.lastMonth), sublabel: `${prevLabel} actuals` },
        ]} />
      </Tile>

      {waiting.length ? (
        <Tile className="card stack-03">
          <h3 className="card-title">Waiting for you</h3>
          {waiting.map((w) => (
            <div key={w.key} className="row-03" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong>{w.who}</strong>
                <span className="footnote"> {w.what} {w.family} — {unitsLabel(w.qty)}</span>
              </div>
              <Button kind="primary" size="sm" onClick={async () => {
                setFFam(w.family)
                setFReg(w.region || null)
                
                // Fetch to get exactly which BUs and products were submitted
                if (w.region && w.family) {
                  try {
                    const response = await fetch(`/api/challenge/region/lines?month=${month}&family=${w.family}&region=${w.region}`)
                    const data = await response.json()
                    
                    // Use the submitted_bus and submitted_skus arrays from backend
                    const submittedBUs = data.submitted_bus || []
                    const submittedSKUs = data.submitted_skus || []
                    
                    setFBu(submittedBUs.length === 1 ? submittedBUs[0] : null)
                    setFProd(submittedSKUs.length === 1 ? submittedSKUs[0] : null)
                  } catch (err) {
                    setFBu(null)
                    setFProd(null)
                  }
                } else {
                  setFBu(w.bu || null)
                  setFProd(null)
                }
              }}>Review →</Button>
            </div>
          ))}
        </Tile>
      ) : (
        <InlineNotification
          kind="success"
          lowContrast
          hideCloseButton
          title="Nothing is waiting for you."
          subtitle="When a Regional Head submits a number, or a BU Head counters, it appears here."
        />
      )}

      <div className="challenge-bar">
        <Dropdown
          id="sd-f-reg"
          size="md"
          titleText="Region"
          label="Region"
          items={cycle.regions ?? []}
          itemToString={(i: string | null) => i ?? ''}
          selectedItem={fReg}
          onChange={({ selectedItem }) => setFReg(selectedItem)}
        />
        <Dropdown
          id="sd-f-bu"
          size="md"
          titleText="Business unit"
          label="Business unit"
          items={cycle.units?.map((u: any) => u.bu) ?? []}
          itemToString={(i: string | null) => i ?? ''}
          selectedItem={fBu}
          onChange={({ selectedItem }) => setFBu(selectedItem)}
        />
        <Dropdown
          id="sd-f-family"
          size="md"
          titleText="Product family"
          label="Product family"
          items={cycle.families ?? []}
          itemToString={(i: string | null) => i ?? ''}
          selectedItem={fFam}
          onChange={({ selectedItem }) => setFFam(selectedItem)}
        />
        <Dropdown
          id="sd-f-product"
          size="md"
          titleText="Product"
          label="Product"
          items={[ALL_PRODUCTS, ...products]}
          itemToString={(i: string | null) => {
            if (!i || i === ALL_PRODUCTS) return 'All products'
            const opt = productOpts.find((p: any) => p.id === i)
            return opt ? opt.label : i
          }}
          selectedItem={fProd ?? ALL_PRODUCTS}
          onChange={({ selectedItem }) => setFProd(selectedItem === ALL_PRODUCTS ? null : selectedItem)}
        />
        {fReg || fBu || fFam || fProd ? <Button kind="ghost" size="md" onClick={() => { setFReg(null); setFBu(null); setFFam(null); setFProd(null) }}>Reset filters</Button> : null}
      </div>

      <DataCard
        id="sd-families"
        title="Product families"
        description="Open a family to agree the numbers. Send to BU heads moves it on to the business unit conversation."
        cols={cols}
        rows={rows}
        itemsLabel="Families per page"
        rowKey={(r) => r.family}
        defaultSort={{ col: 0, dir: 'asc' }}
      />

      {/* Show submitted products details when family and region are selected */}
      {fFam && fReg && <SubmittedProductsTable month={month} family={fFam} region={fReg} buFilter={fBu} productFilter={fProd} />}
    </div>
  )
}

/** Show the breakdown of submitted products for S&D review with editing capability */
function SubmittedProductsTable({ month, family, region, buFilter, productFilter }: {
  month: string
  family: string
  region: string
  buFilter: string | null
  productFilter: string | null
}) {
  const { showToast } = useToast()
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  
  const q = useQuery({
    queryKey: ['submitted-products', month, family, region],
    queryFn: () => getJson<any>(`/api/challenge/region/lines?month=${month}&family=${family}&region=${region}`),
    staleTime: 0,
  })

  const respond = useMutation({
    mutationFn: (body: any) => sendJson<any>('/api/challenge/region/respond', 'POST', { month, family, region, ...body }),
    onSuccess: (_c, vars) => {
      const action = vars.action === 'counter' ? 'countered' : 'accepted'
      showToast('success', `✓ ${region} - ${family} ${action}!`, reason || 'Forwarding to BU heads')
      q.refetch()
      setDraft({})
      setReason('')
    },
    onError: (error: any) => {
      showToast('error', 'Action failed', error?.message || 'Please try again.')
    },
  })

  if (q.isPending) return <p className="supporting">Loading submitted products...</p>
  if (q.isError || !q.data) return null

  const allRows = q.data.rows || []
  const submittedRows = allRows.filter((r: any) => r.submitted > 0)
  
  // Apply filters
  const filteredRows = submittedRows.filter((r: any) => {
    if (buFilter && r.bu !== buFilter) return false
    if (productFilter && r.sku !== productFilter) return false
    return true
  })

  if (filteredRows.length === 0) return null

  const val = (r: any) => {
    const key = `${r.channel}|${r.sku}`
    return draft[key] !== undefined ? draft[key] : r.submitted
  }
  
  const setValue = (r: any, value: number) => {
    const key = `${r.channel}|${r.sku}`
    setDraft({ ...draft, [key]: value })
  }

  const changed = submittedRows.filter((r: any) => val(r) !== r.submitted).length
  const total = filteredRows.reduce((sum: number, r: any) => sum + val(r), 0)

  const cols: Col<any>[] = [
    { header: 'Business Unit', cell: (r) => r.bu, sort: (r) => r.bu },
    { header: 'Channel', cell: (r) => r.channel, sort: (r) => r.channel },
    { header: 'Product', cell: (r) => `${r.sku} · ${r.description}`, sort: (r) => r.sku },
    { header: 'Regional (units)', num: true, cell: (r) => fmtInt(r.submitted), sort: (r) => r.submitted },
    { 
      header: 'Your number (units)', 
      num: true, 
      cell: (r) => (
        <input
          type="number"
          style={{ width: '100px', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
          value={val(r)}
          onChange={(e) => setValue(r, parseFloat(e.target.value) || 0)}
          min={0}
        />
      ), 
      sort: (r) => val(r) 
    },
    { header: 'vs Model', num: true, cell: (r) => {
      const pct = r.model ? ((val(r) / r.model - 1) * 100) : 0
      return fmtSigned(pct, 1)
    }, sort: (r) => r.model ? (val(r) / r.model) : 0 },
  ]

  const handleAccept = () => {
    const lines = Object.fromEntries(
      submittedRows.map((r: any) => [`${r.channel}|${r.sku}`, val(r)])
    )
    respond.mutate({
      role: 'sd',
      action: changed > 0 ? 'counter' : 'accept',
      lines,
      reason: reason.trim() || (changed > 0 ? 'S&D Head counter-offer' : 'Accepted'),
    })
  }

  return (
    <Tile className="card stack-05">
      <h3 className="card-title">Submitted Products</h3>
      <p className="footnote">{region} · {family} · {fmtInt(total)} total units · {changed} product{changed === 1 ? '' : 's'} changed</p>
      <DataCard
        id="submitted-products"
        title=""
        description=""
        cols={cols}
        rows={filteredRows}
        itemsLabel="Products per page"
        rowKey={(r) => `${r.bu}|${r.channel}|${r.sku}`}
        defaultSort={{ col: 3, dir: 'desc' }}
      />
      
      <div className="stack-03">
        <input
          type="text"
          placeholder="Reason for changes (optional)"
          style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="row-03">
          <Button kind="primary" size="md" onClick={handleAccept} disabled={respond.isPending}>
            {changed > 0 ? 'Counter to Regional' : 'Accept & Send to BU'}
          </Button>
          {changed > 0 && (
            <Button kind="ghost" size="md" onClick={() => { setDraft({}); setReason('') }}>
              Reset changes
            </Button>
          )}
        </div>
      </div>
    </Tile>
  )
}

/** Step 3: one BU Head's view. Their own families, whether it is their turn, and the conversation with the S&D Head. */
export function BUWorkspace({ cycle, month, unit, options, stamp, onDone, onBuChange }: {
  cycle: any
  month: string
  unit: { bu: string; name: string; head: string; channels: string[] }
  options: any
  stamp: number
  onDone: (c: any) => void
  onBuChange?: (bu: string) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [fReg, setFReg] = useState<string | null>(null)
  const [fFam, setFFam] = useState<string | null>(null)
  const [fProd, setFProd] = useState<string | null>(null)
  const items: any[] = cycle.items.filter((i: any) => i.month === month)
  
  // Get product options filtered by selected family
  const allProductOpts = options?.product ?? []
  const productOpts = fFam && allProductOpts.length > 0
    ? allProductOpts.filter((p: any) => p.family === fFam)
    : allProductOpts
  const products = productOpts.map((p: any) => p.id).filter(Boolean)
  const regions = cycle.regions ?? []
  const families = [...new Set(items.map((i: any) => i.family))]

  if (open) {
    return (
      <div className="stack-05">
        <Button kind="ghost" size="md" onClick={() => setOpen(null)}>← Back to {unit.name}</Button>
        <Negotiation
          key={`bu|${unit.bu}|${open}`}
          month={month}
          items={items}
          role="bu"
          region={null}
          unit={unit}
          initialFamily={open}
          initialRegion={null}
          stamp={stamp}
          onDone={onDone}
        />
      </div>
    )
  }

  const rows = items
    .map((it: any) => ({ ...it, mine: it.bus.find((b: any) => b.bu === unit.bu) }))
    .filter((it: any) => it.mine)

  const waiting = rows.filter((it: any) => it.mine.status === 'negotiating' && it.mine.turn === 'bu')

  // Aggregate stats for this unit's families
  const stats = rows.reduce((acc, it) => ({
    model: acc.model + it.mine.model,
    lastYear: acc.lastYear + it.mine.last_year,
    lastMonth: acc.lastMonth + (it.mine.last_month || 0),
    current: acc.current + (it.mine.agreed ?? it.mine.proposal ?? 0),
  }), { model: 0, lastYear: 0, lastMonth: 0, current: 0 })

  const statusOf = (it: any): { label: string; type: 'gray' | 'blue' | 'teal' | 'green' } => {
    if (it.consolidated === null) return { label: 'Not sent yet', type: 'gray' }
    if (it.mine.status === 'agreed') return { label: 'Agreed', type: 'green' }
    if (it.mine.turn === 'bu') return { label: 'Your turn', type: 'blue' }
    return { label: 'With the S&D Head', type: 'teal' }
  }

  const cols: Col<any>[] = [
    { header: 'Product family', cell: (r) => r.family, sort: (r) => r.family },
    { header: 'Model (units)', num: true, cell: (r) => fmtInt(r.mine.model), sort: (r) => r.mine.model },
    { header: 'Proposed (units)', num: true, cell: (r) => (r.mine.proposal === null ? '–' : fmtInt(r.mine.proposal)), sort: (r) => r.mine.proposal ?? 0 },
    { header: 'Status', cell: (r) => { const s = statusOf(r); return <Tag size="sm" type={s.type}>{s.label}</Tag> }, sort: (r) => statusOf(r).label },
    {
      header: 'Action',
      cell: (r) => (r.consolidated === null ? '–' : <Button kind="ghost" size="sm" onClick={() => setOpen(r.family)}>Open</Button>),
    },
  ]

  const thisLabel = monthLabel(month)
  const lyLabel = monthLabel(month, -12)
  const prevLabel = monthLabel(month, -1)

  return (
    <div className="stack-05">
      <Tile className="card">
        <h3 className="card-title">Demand at a glance</h3>
        <p className="footnote">{unit.name} · {thisLabel}</p>
        <StatRow items={[
          { label: 'Forecast demand (units)', value: fmtN(stats.model), sublabel: `${thisLabel} · Model forecast` },
          { label: 'Same month last year (units)', value: fmtN(stats.lastYear), sublabel: lyLabel },
          { label: 'Last month (units)', value: fmtN(stats.lastMonth), sublabel: `${prevLabel} actuals` },
        ]} />
      </Tile>

      {waiting.length ? (
        <Tile className="card stack-03">
          <h3 className="card-title">Waiting for you</h3>
          {waiting.map((w: any) => (
            <div key={w.family} className="row-03" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong>S&D Head</strong>
                <span className="footnote"> sent {w.family} — {unitsLabel(w.mine.proposal)}</span>
              </div>
              <Button kind="primary" size="sm" onClick={() => setOpen(w.family)}>Review →</Button>
            </div>
          ))}
        </Tile>
      ) : (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Nothing is waiting for you."
          subtitle="A family appears here once the S&D Head sends it to the business units."
        />
      )}

      <div className="challenge-bar">
        <Dropdown
          id="bu-f-reg"
          size="md"
          titleText="Region"
          label="Region"
          items={regions}
          itemToString={(i: string | null) => i ?? ''}
          selectedItem={fReg}
          onChange={({ selectedItem }) => setFReg(selectedItem)}
        />
        <Dropdown
          id="bu-f-bu"
          size="md"
          titleText="Business unit"
          label="Business unit"
          items={cycle.units?.map((u: any) => u.bu) ?? []}
          itemToString={(i: string | null) => i ?? ''}
          selectedItem={unit.bu}
          onChange={({ selectedItem }) => selectedItem && onBuChange?.(selectedItem)}
        />
        <Dropdown
          id="bu-f-family"
          size="md"
          titleText="Product family"
          label="Product family"
          items={families}
          itemToString={(i: string | null) => i ?? ''}
          selectedItem={fFam}
          onChange={({ selectedItem }) => setFFam(selectedItem)}
        />
        <Dropdown
          id="bu-f-product"
          size="md"
          titleText="Product"
          label="Product"
          items={[ALL_PRODUCTS, ...products]}
          itemToString={(i: string | null) => {
            if (!i || i === ALL_PRODUCTS) return 'All products'
            const opt = productOpts.find((p: any) => p.id === i)
            return opt ? opt.label : i
          }}
          selectedItem={fProd ?? ALL_PRODUCTS}
          onChange={({ selectedItem }) => setFProd(selectedItem === ALL_PRODUCTS ? null : selectedItem)}
        />
        {fReg || fFam || fProd ? <Button kind="ghost" size="md" onClick={() => { setFReg(null); setFFam(null); setFProd(null) }}>Reset filters</Button> : null}
      </div>

      {(fReg || fFam || fProd) && (
        <Tile className="card">
          <h3 className="card-title">Demand at a glance</h3>
          <p className="footnote">
            {[fReg, unit.bu, fFam].filter(Boolean).join(' · ') || 'All'}
          </p>
          <StatRow items={[
            { label: 'Waiting for you (units)', value: fmtInt(waiting.filter((w: any) => (!fFam || w.family === fFam)).reduce((sum: number, w: any) => sum + (w.mine?.proposal ?? 0), 0)) },
            { label: 'Total families', value: rows.filter((r: any) => (!fFam || r.family === fFam)).length.toString() },
          ]} />
        </Tile>
      )}

      <DataCard
        id="bu-families"
        title={`${unit.name}: product families`}
        description={`${unit.head}. Channels: ${unit.channels.join(', ')}.`}
        cols={cols}
        rows={rows}
        itemsLabel="Families per page"
        rowKey={(r) => r.family}
        defaultSort={{ col: 0, dir: 'asc' }}
      />
    </div>
  )
}

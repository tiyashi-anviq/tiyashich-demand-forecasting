/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiErrorNotification, PendingLabel, useToast } from '@reiq/ui'
import { Button, Dropdown, InlineNotification, NumberInput, TextInput, Tile } from '@reiq/ui/carbon'
import { getJson, sendJson } from '../../lib/http'
import { fmtInt, fmtN, fmtSigned } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'
import { Delta, StatRow } from '../../ui/StatRow'
import type { Options } from '../../lib/filters'

const gap = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined && b ? a / b - 1 : null)
const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)))
const ALL_PRODUCTS = '__all_products'

/** The Regional Head's own screen: pick the product family, put a number on every product, and submit it to the S&D
 *  Head. Once the S&D Head responds, the same table is where the counter is accepted or answered. */
export function RegionalInput({ month, region, regions, onRegion, units, items, options, onDone, stamp }: {
  month: string
  region: string
  regions: string[]
  onRegion: (region: string) => void
  units: { bu: string; name: string; channels: string[] }[]
  items: any[]
  options: Options
  onDone: (c: any) => void
  stamp: number
}) {
  const { showToast } = useToast()
  const [bu, setBu] = useState<string | null>(units.length === 1 ? units[0].bu : null)
  const [family, setFamily] = useState<string | null>(null)
  const [product, setProduct] = useState<string | null>(null)
  const [counterFamilyToReview, setCounterFamilyToReview] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')

  // Load the whole family so filtered edits can leave every other channel and SKU unchanged.
  const q = useQuery({
    queryKey: ['regional-products', month, region, family, stamp],
    queryFn: () => getJson<any>(`/api/challenge/region/lines?month=${month}&family=${family}&region=${region}`),
    enabled: !!family,
    staleTime: 0,
  })

  useEffect(() => {
    if (!counterFamilyToReview || family !== counterFamilyToReview || q.data?.family !== counterFamilyToReview) return
    const changedRows = (q.data.rows ?? []).filter((row: any) => row.is_submitted && Number(row.qty) !== Number(row.submitted))
    const channels = [...new Set<string>(changedRows.map((row: any) => row.bu).filter((value: unknown): value is string => typeof value === 'string'))]
    const products = [...new Set<string>(changedRows.map((row: any) => row.sku).filter((value: unknown): value is string => typeof value === 'string'))]
    setBu(channels.length === 1 ? channels[0] : null)
    setProduct(products.length === 1 ? products[0] : null)
    setCounterFamilyToReview(null)
  }, [counterFamilyToReview, family, q.data])

  const post = useMutation({
    mutationFn: (body: any) => sendJson<any>('/api/challenge/region/respond', 'POST', { month, family, region, ...body }),
    onSuccess: (c, vars) => {
        const total = vars.action === 'accept'
          ? (q.data?.rows ?? []).filter((row: any) => row.is_submitted).reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0)
        : Object.values(vars.lines || {}).reduce((sum: number, qty: any) => sum + Number(qty || 0), 0)
      const done = vars.action === 'accept' ? 'accepted' : 'submitted'
      showToast('success', `✓ Forecast ${done}!`, `${region} - ${family}: ${fmtInt(total)} units`)
      onDone(c)
      setDraft({})
      setReason('')
      if (vars.action === 'accept') {
        setFamily(null)
        setProduct(null)
        setCounterFamilyToReview(null)
      }
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.detail || error?.message || 'Could not submit forecast. Please try again.'
      showToast('error', 'Submission failed', msg)
    },
  })

  const allFamilies = [...new Set((options.product ?? []).map((p) => p.family).filter(Boolean))] as string[]
  const finalizedFamilies = new Set(items.flatMap((item) => {
    const submission = item.regional?.find((entry: any) => entry.region === region)
    return submission?.status === 'agreed' ? [item.family] : []
  }))
  const sentFamilies = new Set(items.filter((item) => item.consolidated !== null).map((item) => item.family))
  const families = allFamilies.filter((itemFamily) => !finalizedFamilies.has(itemFamily) && !sentFamilies.has(itemFamily))
  useEffect(() => {
    if (family && (finalizedFamilies.has(family) || sentFamilies.has(family))) {
      setFamily(null)
      setProduct(null)
      setDraft({})
      setReason('')
      setCounterFamilyToReview(null)
    }
  }, [family, items, region])
  const buName = units.find((u) => u.bu === bu)?.name ?? ''

  const d = q.data
  const allRows: any[] = d?.rows ?? []
  const rows = allRows.filter((r) => (!bu || r.bu === bu) && (!product || r.sku === product))
  const productOpts = [...new Map<string, string>(allRows.map((r) => [r.sku, `${r.sku} · ${r.description || r.sku}`])).entries()]
    .map(([id, label]) => ({ id, label }))
  const isAgreed = d?.status === 'agreed'
  const turn = d?.turn as 'sd' | 'regional' | null | undefined
  const canEdit = !isAgreed && (turn === 'sd' || turn === 'regional')

  const val = (r: any) => {
    const key = `${r.channel}|${r.sku}`
    return draft[key] !== undefined ? draft[key] : r.qty
  }
  const setValue = (r: any, value: number) => setDraft({ ...draft, [`${r.channel}|${r.sku}`]: value })

  // Only validate the rows being edited (partial submission allowed)
  const rowsToSubmit = allRows.filter((r: any) => (!bu || r.bu === bu) && (!product || r.sku === product))
  const changed = rowsToSubmit.filter((r: any) => val(r) !== r.qty).length
  const incomplete = rowsToSubmit.filter((r: any) => !Number.isFinite(val(r)) || val(r) < 0).length
  const submittedRows = allRows.filter((row) => row.is_submitted)
  const regionFamilyTotal = submittedRows.reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0)

  // The glance card sums the cycle data for whatever the three filters select: region always, then channel
  // and family when they are chosen. It reads from the cycle so it is filled in before a family is opened.
  // September is the last month with actuals, so October is the M1 forecast the card starts from.
  const monthLabel = (m: string, shift = 0) => {
    const [y, mo] = m.split('-').map(Number)
    return new Date(Date.UTC(y, mo - 1 + shift, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  const thisLabel = monthLabel(month)
  const lyLabel = monthLabel(month, -12)
  const prevLabel = monthLabel(month, -1)
  const countered = items.flatMap((it) => {
    const submission = it.regional?.find((r: any) => r.region === region)
    if (submission?.status !== 'negotiating' || submission.turn !== 'regional') return []
    const rounds = submission.rounds ?? []
    const lastRound = rounds[rounds.length - 1]
    if (lastRound?.by !== 'S&D Head' || lastRound.action !== 'counter') return []
    return [{
      family: it.family,
      qty: submission.qty,
      changed: lastRound.changed ?? 0,
      delta: typeof submission.submitted_qty === 'number' ? submission.qty - submission.submitted_qty : null,
      reason: lastRound.reason,
    }]
  })
  const selectedCounter = countered.find((item) => item.family === family)
  const selectedCounterTotal = selectedCounter && d
    ? regionFamilyTotal
    : selectedCounter?.qty
  const glanceRows = rows.reduce((a, r) => ({
    model: a.model + r.model,
    last_year: a.last_year + r.last_year,
    last_month: a.last_month + (r.last_month ?? 0),
  }), { model: 0, last_year: 0, last_month: 0 })
  // When family is selected, sum the filtered rows (includes BU and Product filters)
  // When family is not selected, sum from cycle items filtered by region, BU (via bus array), and family
  const glance = family && allRows.length ? glanceRows : items.reduce((a, it) => {
    if (family && it.family !== family) return a
    const reg = (it.regional ?? []).find((r: any) => r.region === region)
    if (!reg) return a
    // If BU filter is set, only include BUs that match
    if (bu && reg.bus) {
      const busData = reg.bus.find((b: any) => b.bu === bu)
      if (busData) {
        return { 
          model: a.model + busData.model, 
          last_year: a.last_year + busData.last_year, 
          last_month: a.last_month + (busData.last_month ?? 0) 
        }
      }
      return a
    }
    return { model: a.model + reg.model, last_year: a.last_year + reg.last_year, last_month: a.last_month + (reg.last_month ?? 0) }
  }, { model: 0, last_year: 0, last_month: 0 })

  const cols: Col<any>[] = [
    { header: 'Channel', cell: (r) => {
      const name = units.find((u) => u.bu === r.bu)?.name ?? r.channel
      return name === r.channel ? name : `${name} (${r.channel})`
    }, sort: (r) => r.channel },
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
    { header: 'Model forecast (units)', num: true, cell: (r) => fmtInt(r.model), sort: (r) => r.model },
    { header: 'Same month last year (units)', num: true, cell: (r) => fmtInt(r.last_year), sort: (r) => r.last_year },
    { header: 'Last month (units)', num: true, cell: (r) => fmtInt(r.last_month), sort: (r) => r.last_month },
    {
      header: 'Your number (units)',
      num: true,
      cell: (r) => (
        <NumberInput
          id={`input-${r.sku}-${r.channel}`}
          size="sm"
          hideLabel
          label={`${r.sku} units`}
          hideSteppers
          min={0}
          value={val(r)}
          onChange={(_e: unknown, { value }: { value: number | string }) => setValue(r, num(value))}
          disabled={!canEdit}
        />
      ),
    },
    {
      header: 'Against the model (%)',
      num: true,
      cell: (r) => {
        const diff = gap(val(r), r.model)
        return diff === null ? '–' : <Delta value={diff} text={fmtSigned(diff, 1)} />
      },
    },
  ]

  // The API speaks accept / counter / final / revise / propose. Regional uses 'propose' for initial submissions.
  // An empty submitted-line set means this is the initial forecast, regardless of seeded values.
  const isInitialSubmission = (d?.submitted_lines ?? 0) === 0
  const action: 'accept' | 'counter' | 'revise' | 'propose' = 
    isInitialSubmission ? 'propose' : 
    turn === 'regional' ? (changed > 0 ? 'counter' : 'accept') : 'propose'
  const canSubmit = !!d && !isAgreed && canEdit && incomplete === 0 && (
    isInitialSubmission ? true : // Allow submission without changes for initial
    turn === 'regional' ? (changed === 0 || reason.trim().length > 0) : (changed > 0 && reason.trim().length > 0)
  )
  const buttonText = 
    isInitialSubmission ? 'Submit forecast' :
    turn === 'regional' ? (changed > 0 ? 'Send counter-offer' : `Accept ${fmtInt(regionFamilyTotal)} units`) : 'Submit revised number'

  return (
    <div className="stack-05">
      <Tile className="card stack-05">
        <div className="card-heading">
          <h3 className="card-title">Demand at a glance</h3>
          <p className="footnote">
            {region}
            {bu ? ` · ${buName}` : ''}
            {family ? ` · ${family}` : ' · all product families'}
            {product ? ` · ${product}` : ''}
            {` · ${thisLabel}`}
          </p>
        </div>
        <StatRow items={[
          { label: 'Forecast demand (units)', value: fmtN(glance.model), sublabel: `${thisLabel} · M1 forecast` },
          { label: 'Same month last year (units)', value: fmtN(glance.last_year), sublabel: lyLabel },
          { label: 'Last month (units)', value: fmtN(glance.last_month), sublabel: `${prevLabel} actuals` },
        ]} />
      </Tile>

      {countered.length > 0 && (
        <Tile className="card stack-03">
          <h3 className="card-title">S&D Head responses waiting for you</h3>
          {countered.map((item) => (
            <div key={item.family} className="row-between">
              <div>
                <strong>{item.family}</strong>
                <p className="footnote">
                  Countered at {fmtInt(item.qty)} units across {region} (all channels)
                  {item.delta !== null ? `; ${item.changed} product line${item.changed === 1 ? '' : 's'} changed the total ${item.delta < 0 ? 'down' : 'up'} by ${fmtInt(Math.abs(item.delta))} units` : ''}
                  {item.reason ? `: ${item.reason}` : '.'}
                </p>
              </div>
              <Button kind="primary" size="sm" onClick={() => {
                setFamily(item.family)
                setCounterFamilyToReview(item.family)
                setDraft({})
                setReason('')
              }}>
                Review and respond
              </Button>
            </div>
          ))}
        </Tile>
      )}

      <div className="challenge-bar">
        <Dropdown
          id="reg-region"
          size="md"
          titleText="Region"
          label="Region"
          items={regions}
          itemToString={(i: string | null) => i ?? ''}
          selectedItem={region}
          onChange={({ selectedItem }) => {
            if (!selectedItem) return
            setDraft({})
            setReason('')
            setCounterFamilyToReview(null)
            onRegion(selectedItem)
          }}
        />
        <Dropdown
          id="reg-bu"
          size="md"
          titleText="Channel"
          label="Channel"
          items={units.map((u) => u.bu)}
          itemToString={(i: string | null) => units.find((u) => u.bu === i)?.name ?? i ?? ''}
          selectedItem={bu}
          onChange={({ selectedItem }) => { setBu(selectedItem); setProduct(null); setDraft({}); setReason(''); setCounterFamilyToReview(null) }}
        />
        <Dropdown
          id="reg-family"
          size="md"
          titleText="Product family"
          label="Product family"
          items={families}
          itemToString={(i: string | null) => i ?? ''}
          selectedItem={family}
          onChange={({ selectedItem }) => { setFamily(selectedItem); setProduct(null); setDraft({}); setReason(''); setCounterFamilyToReview(null) }}
        />
        <Dropdown
          id="reg-product"
          size="md"
          titleText="Product"
          label="Product"
          items={[ALL_PRODUCTS, ...productOpts.map((p) => p.id)]}
          itemToString={(i: string | null) => (i === ALL_PRODUCTS ? 'All products' : productOpts.find((p) => p.id === i)?.label ?? i ?? '')}
          selectedItem={product ?? ALL_PRODUCTS}
          disabled={!family}
          onChange={({ selectedItem }) => {
            setProduct(selectedItem === ALL_PRODUCTS ? null : selectedItem ?? null)
            setDraft({})
            setReason('')
          }}
        />
      </div>

      {!family ? (
        <InlineNotification
          kind={allFamilies.length > 0 && families.length === 0 ? 'success' : 'info'}
          lowContrast
          hideCloseButton
          title={allFamilies.length > 0 && families.length === 0 ? 'All product families are finalized for this region.' : 'Choose a product family to enter numbers.'}
          subtitle={allFamilies.length > 0 && families.length === 0
            ? 'Finalized regional numbers are locked and move to the BU heads once every region has agreed.'
            : 'The card above follows the region, channel and family filters. The product table opens once a family is chosen.'}
        />
      ) : q.isPending ? (
        <p className="supporting">Loading products for {region}{bu ? ` - ${buName}` : ''} - {family}...</p>
      ) : q.isError ? (
        <ApiErrorNotification error={q.error} fallbackTitle="Could not load products" />
      ) : !d ? null : rows.length === 0 ? (
        <InlineNotification kind="info" lowContrast hideCloseButton title={`No ${family} products in ${region}.`}
          subtitle="Choose another product family." />
      ) : (
        <>
          <InlineNotification
            kind={isAgreed ? 'success' : turn === 'regional' ? 'warning' : 'info'}
            lowContrast
            hideCloseButton
            title={isAgreed ? `Agreed at ${fmtInt(d.total)} units.` : turn === 'regional' ? 'The S&D Head has responded. Review and update your numbers.' : 'Your number is with the S&D Head.'}
            subtitle={isAgreed
              ? d.agreed_by || 'Every line is agreed.'
              : turn === 'regional'
                ? `The submitted ${region}, ${family} total is ${fmtInt(selectedCounterTotal ?? d.total)} units across ${d.submitted_lines} product lines. The S&D counter changed ${selectedCounter?.changed ?? 0} product line${selectedCounter?.changed === 1 ? '' : 's'}${selectedCounter?.delta !== null && selectedCounter?.delta !== undefined ? `, moving the total ${selectedCounter.delta < 0 ? 'down' : 'up'} by ${fmtInt(Math.abs(selectedCounter.delta))} units` : ''}. Current filters show ${fmtInt(rows.reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0))} units across ${rows.length} line${rows.length === 1 ? '' : 's'}${buName ? ` in ${buName}` : ''}. Accepting finalizes the submitted regional total. ${selectedCounter?.reason ? `Their reason: ${selectedCounter.reason}` : ''}`
                : `You can still revise your own number before the S&D Head responds. ${d.submitted_reason ? `Your note: ${d.submitted_reason}` : ''}`}
          />

          <DataCard
            id="regional-products"
            title="Products"
            description={isAgreed ? 'This forecast has been agreed and locked.' : product ? 'One product selected. Enter its number, or choose All products to see the family.' : 'The model is the starting point. Put your number against every product.'}
            cols={cols}
            rows={rows}
            itemsLabel="Products per page"
            rowKey={(r) => `${r.sku}|${r.channel}`}
            defaultOpen
          />

          {!isAgreed ? (
            <Tile className="card stack-05">
              <h4 className="card-title">Your numbers</h4>

              <TextInput
                id="reason-input"
                size="md"
                labelText="Reason for the number"
                helperText={changed > 0 ? 'Required when you change a number.' : 'Optional when you accept the number on the table.'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                invalid={changed > 0 && !reason.trim()}
                invalidText="Please give a reason for the change."
              />

              {incomplete > 0 ? (
                <p className="supporting" style={{ color: 'var(--cds-support-error)' }}>
                  ⚠️ {incomplete} product{incomplete === 1 ? ' has' : 's have'} an invalid number. Every product needs a number of zero or more.
                </p>
              ) : null}

              <div className="row-03">
                <Button
                  kind="primary"
                  size="md"
                  onClick={() => post.mutate({
                    role: 'regional',
                    action,
                    lines: Object.fromEntries(
                      rowsToSubmit.map((r: any) => [`${r.channel}|${r.sku}`, val(r)])
                    ),
                    reason: reason.trim(),
                  })}
                  disabled={!canSubmit || post.isPending}
                >
                  <PendingLabel pending={post.isPending} idle={buttonText} busy="Submitting..." />
                </Button>
                {changed > 0 ? (
                  <Button kind="secondary" size="md" onClick={() => { setDraft({}); setReason('') }}>Reset changes</Button>
                ) : null}
              </div>
              <p className="footnote">
                Submitting sends {rowsToSubmit.length} product line{rowsToSubmit.length === 1 ? '' : 's'} for {family} in {region}.
                Other channel and SKU lines keep their current numbers, and no other region is changed. Once every region agrees with the S&D Head, the agreed regional numbers move to the BU heads.
              </p>
            </Tile>
          ) : null}
        </>
      )}
      {post.isError ? <ApiErrorNotification error={post.error} fallbackTitle="Could not submit the number" /> : null}
    </div>
  )
}

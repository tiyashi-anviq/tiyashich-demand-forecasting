/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiErrorNotification, PendingLabel, useToast } from '@reiq/ui'
import { Button, ContentSwitcher, InlineNotification, NumberInput, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tag, TextInput, Tile } from '@reiq/ui/carbon'
import { getJson, sendJson } from '../../lib/http'
import { fmtInt, fmtN, fmtSigned } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'
import { Delta, StatRow } from '../../ui/StatRow'

export type Role = 'regional' | 'sd' | 'bu'
const gap = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined && b ? a / b - 1 : null)
const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)))
const ACTION: Record<string, string> = { propose: 'Proposed', counter: 'Countered', accept: 'Accepted', final: 'Final call', reopen: 'Reopened', revise: 'Revised' }

export const regionStatus = (r: any): { label: string; type: 'gray' | 'blue' | 'teal' | 'green' } =>
  r.status === 'agreed' ? { label: 'Agreed', type: 'green' } : { label: r.turn === 'sd' ? 'With the S&D Head' : 'With the Regional Head', type: 'teal' }

/** One region's numbers for one family, SKU by SKU, and the conversation between the S&D Head and that region's head. */
export function RegionPanel({ month, family, region, role, locked, stamp, onDone }: { month: string; family: string; region: string; role: Role; locked: boolean; stamp: number; onDone: (c: any) => void }) {
  const { showToast } = useToast()
  const q = useQuery({ queryKey: ['region-lines', month, family, region, stamp], queryFn: () => getJson<any>(`/api/challenge/region/lines?month=${month}&family=${family}&region=${region}`), staleTime: 0 })
  const cycle = useQuery({ queryKey: ['challenge'], queryFn: () => getJson<any>('/api/challenge/cycle'), staleTime: 60_000 })
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [scaleTo, setScaleTo] = useState<number | undefined>(undefined)
  const [reason, setReason] = useState('')
  const post = useMutation({
    mutationFn: (v: { path: string; body: any; done: string }) => sendJson<any>(`/api/challenge/${v.path}`, 'POST', { month, family, region, ...v.body }),
    onSuccess: (c, v) => { onDone(c); setDraft({}); setReason(''); setScaleTo(undefined); showToast('success', v.done) },
  })
  const d = q.data
  const entry = cycle.data?.items.find((i: any) => i.month === month && i.family === family)?.regional.find((x: any) => x.region === region)
  if (q.isPending || !d || !entry) return <p className="supporting">Loading {region}...</p>
  if (q.isError) return <ApiErrorNotification error={q.error} fallbackTitle="Could not load these numbers" />
  const my = role === 'sd' ? 'sd' : 'regional'
  const mine = !locked && d.status === 'negotiating' && (d.turn === my || (role === 'regional' && d.turn === 'sd'))
  const turnMine = !locked && d.status === 'negotiating' && d.turn === my
  const val = (r: any) => draft[r.sku] ?? r.qty
  const total = d.rows.reduce((a: number, r: any) => a + val(r), 0)
  const changed = d.rows.filter((r: any) => val(r) !== r.qty).length
  const modelT = d.rows.reduce((a: number, r: any) => a + r.model, 0)
  const lyT = d.rows.reduce((a: number, r: any) => a + r.last_year, 0)
  const run = (path: string, body: any, done: string) => post.mutate({ path, body, done })
  const rounds = entry.rounds.map((r: any, i: number) => ({ ...r, n: i + 1 }))
  const roundCols: Col<any>[] = [
    { header: 'Round', cell: (r) => r.n },
    { header: 'By', cell: (r) => r.by },
    { header: 'Action', cell: (r) => ACTION[r.action] ?? r.action },
    { header: 'Total (units)', num: true, cell: (r) => fmtInt(r.qty) },
    { header: 'SKUs changed', num: true, cell: (r) => (r.changed === null || r.changed === undefined ? '–' : r.changed) },
    { header: 'Reason', cell: (r) => r.reason },
  ]
  const scale = () => {
    if (!scaleTo || !d.total) return
    const k = scaleTo / d.total
    setDraft(Object.fromEntries(d.rows.map((r: any) => [r.sku, Math.round(r.qty * k)])))
  }
  const send = (action: 'counter' | 'final' | 'revise', done: string) => run('region/respond', { role: my, action, lines: Object.fromEntries(d.rows.map((r: any) => [r.sku, val(r)])), reason }, done)
  const canEdit = mine
  return (
    <Tile className="card stack-05">
      <span className="card-heading">
        <span className="card-title">{region}: {family}, SKU by SKU</span>
        <span className="footnote">Model {fmtN(modelT)} units, last year {fmtN(lyT)}. Number on the table {fmtN(d.total)}, {fmtSigned(gap(d.total, modelT), 1)} against the model. {d.simulated ? 'The Regional Head\'s first number is simulated.' : ''}</span>
      </span>
      <StatRow items={[
        { label: 'Number on the table (units)', value: fmtN(d.total), sublabel: d.status === 'agreed' ? 'Agreed' : d.turn === 'sd' ? 'With the S&D Head' : 'With the Regional Head' },
        { label: 'Against the model', value: <Delta value={gap(d.total, modelT)} text={fmtSigned(gap(d.total, modelT), 1)} />, sublabel: `Model ${fmtN(modelT)}` },
        { label: 'Against last year', value: <Delta value={gap(d.total, lyT)} text={fmtSigned(gap(d.total, lyT), 1)} />, sublabel: `Same month, ${fmtN(lyT)}` },
        { label: 'SKUs', value: d.rows.length, sublabel: 'In this family and region' },
      ]} />
      {rounds.length > 0 && <DataCard id={`rr-${region}`} title="Back and forth so far" description={`Every round between the S&D Head and the ${region} Regional Head, with the reason given`} cols={roundCols} rows={rounds} itemsLabel="Rounds per page" rowKey={(r) => String(r.n)} />}
      <div className="table-scroll thin-scroll">
        <Table size="md" aria-label={`${region} ${family} by SKU`}>
          <TableHead><TableRow>
            <TableHeader>SKU</TableHeader><TableHeader>Description</TableHeader>
            <TableHeader className="cell-num">Model (units)</TableHeader><TableHeader className="cell-num">Same month last year (units)</TableHeader>
            <TableHeader className="cell-num">On the table (units)</TableHeader>
            {canEdit && <TableHeader>Your number (units)</TableHeader>}
            <TableHeader className="cell-num">Against the model (%)</TableHeader><TableHeader className="cell-num">Against last year (%)</TableHeader>
          </TableRow></TableHead>
          <TableBody>
            {d.rows.map((r: any) => (
              <TableRow key={r.sku}>
                <TableCell>{r.sku}</TableCell><TableCell>{r.description || '–'}</TableCell>
                <TableCell className="cell-num">{fmtInt(r.model)}</TableCell><TableCell className="cell-num">{fmtInt(r.last_year)}</TableCell>
                <TableCell className="cell-num">{fmtInt(r.qty)}</TableCell>
                {canEdit && <TableCell><NumberInput id={`n-${region}-${r.sku}`} size="sm" hideLabel label={`${r.sku} units`} hideSteppers min={0} step={1000} value={val(r)}
                  onChange={(_e: unknown, { value }: { value: number | string }) => setDraft({ ...draft, [r.sku]: num(value) })} /></TableCell>}
                <TableCell className="cell-num"><Delta value={gap(val(r), r.model)} text={fmtSigned(gap(val(r), r.model), 1)} /></TableCell>
                <TableCell className="cell-num">{r.last_year ? <Delta value={gap(val(r), r.last_year)} text={fmtSigned(gap(val(r), r.last_year), 1)} /> : '–'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {d.status === 'agreed' ? (
        <div className="stack-03">
          <InlineNotification kind="success" lowContrast hideCloseButton title={`Agreed at ${fmtInt(d.total)} units.`} subtitle={`${entry.agreed_by}. ${locked ? 'This family has gone to the business units, so the regional numbers are locked.' : 'It goes to the business units once every region has agreed.'}`} />
          {role === 'sd' && !locked && <div><Button kind="tertiary" size="md" onClick={() => run('region/reopen', {}, 'Reopened')}>Reopen this region</Button></div>}
        </div>
      ) : locked ? null : mine ? (
        <div className="stack-03">
          <p className="supporting">{turnMine ? (role === 'sd' ? `The ${region} Regional Head proposes ${fmtInt(d.total)} units.` : `The S&D Head proposes ${fmtInt(d.total)} units.`) : 'You can still revise your own number before the S&D Head responds.'} Change any SKU, or scale all of them to a total, and give the reason.</p>
          <div className="row-03">
            <NumberInput id={`scale-${region}`} size="md" label="Scale every SKU to a total (units)" hideSteppers min={0} step={10000} value={scaleTo ?? d.total}
              onChange={(_e: unknown, { value }: { value: number | string }) => setScaleTo(num(value))} />
            <Button kind="ghost" size="md" onClick={scale}>Spread across SKUs</Button>
          </div>
          <TextInput id={`reason-${region}`} size="md" labelText="Reason" helperText="Needed for a counter-offer, a revision or a final call." value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="supporting">Your numbers add up to {fmtInt(total)} units ({changed} SKU{changed === 1 ? '' : 's'} changed), {fmtSigned(gap(total, modelT), 1)} against the model.</p>
          <div className="row-03">
            {turnMine && <Button kind="primary" size="md" onClick={() => run('region/respond', { role: my, action: 'accept' }, `Accepted at ${fmtInt(d.total)} units`)}>Accept {fmtInt(d.total)} units</Button>}
            {turnMine
              ? <Button kind="secondary" size="md" disabled={!reason.trim() || !changed} onClick={() => send('counter', 'Counter-offer sent')}>Send counter-offer</Button>
              : <Button kind="secondary" size="md" disabled={!reason.trim() || !changed} onClick={() => send('revise', 'Number revised')}>Revise my number</Button>}
            {role === 'sd' && <Button kind="danger--tertiary" size="md" disabled={!reason.trim() || !changed} onClick={() => send('final', 'Final call made')}>Make the final call</Button>}
          </div>
        </div>
      ) : (
        <InlineNotification kind="info" lowContrast hideCloseButton title={`Waiting for ${d.turn === 'sd' ? 'the S&D Head' : `the ${region} Regional Head`}.`}
          subtitle={`${fmtInt(d.total)} units is on the table. Switch "Viewing as" to ${d.turn === 'sd' ? 'S&D Head' : 'Regional Head and pick this region'} to respond.${role === 'sd' ? ' As S&D Head you can also make the final call.' : ''}`} />
      )}
      {post.isError ? <ApiErrorNotification error={post.error} fallbackTitle="Could not record that" /> : null}
      {post.isPending ? <PendingLabel pending idle="" busy="Saving..." /> : null}
    </Tile>
  )
}

/** The regions of one family: where each conversation stands, and the panel for the one picked. */
export function RegionsSection({ it, role, pick, onPick, stamp, onDone }: { it: any; role: Role; pick: string | null; onPick: (r: string) => void; stamp: number; onDone: (c: any) => void }) {
  const locked = it.consolidated !== null
  const regs = it.regional
  const chosen = regs.find((r: any) => r.region === pick) ?? regs[0]
  const cols: Col<any>[] = [
    { header: 'Region', cell: (r) => r.region, sort: (r) => r.region },
    { header: 'SKUs', num: true, cell: (r) => r.skus },
    { header: 'Model (units)', num: true, cell: (r) => fmtN(r.model), sort: (r) => r.model },
    { header: 'Same month last year (units)', num: true, cell: (r) => fmtN(r.last_year), sort: (r) => r.last_year },
    { header: 'On the table (units)', num: true, cell: (r) => fmtN(r.qty), sort: (r) => r.qty },
    { header: 'Against the model (%)', num: true, cell: (r) => <Delta value={gap(r.qty, r.model)} text={fmtSigned(gap(r.qty, r.model), 1)} />, sort: (r) => gap(r.qty, r.model) },
    { header: 'Rounds', num: true, cell: (r) => r.rounds.length, sort: (r) => r.rounds.length },
    { header: 'Status', cell: (r) => { const s = regionStatus(r); return <Tag size="sm" type={s.type}>{s.label}</Tag> } },
  ]
  return (
    <div className="stack-05">
      <InlineNotification kind={locked ? 'success' : 'info'} lowContrast hideCloseButton title={locked ? 'Every region has agreed.' : `${it.n_regions_agreed} of ${it.n_regions} regions have agreed.`}
        subtitle={locked ? `The family total of ${fmtInt(it.consolidated)} units has gone to the business units.` : 'The S&D Head and each Regional Head go back and forth, SKU by SKU, until the region agrees. When all regions have agreed, the family goes to the business units.'} />
      <DataCard id="regs" title="Regions" description={role === 'regional' ? 'Your region for this family' : 'One conversation per region. Select a row to open it'} cols={cols} rows={role === 'regional' ? regs.filter((r: any) => r.region === chosen?.region) : regs}
        itemsLabel="Regions per page" rowKey={(r) => r.region} onRow={(r) => onPick(r.region)} selected={(r) => r.region === chosen?.region} />
      {chosen ? <RegionPanel key={`${it.month}|${it.family}|${chosen.region}|${role}`} month={it.month} family={it.family} region={chosen.region} role={role} locked={locked} stamp={stamp} onDone={onDone} /> : null}
    </div>
  )
}

/** What goes to which region and depot: the regions' SKU numbers split across their depots by recent dispatches. */
export function AllocationSection({ month, family, stamp }: { month: string; family: string; stamp: number }) {
  const q = useQuery({ queryKey: ['allocation', month, family, stamp], queryFn: () => getJson<any>(`/api/challenge/allocation?month=${month}&family=${family}`), staleTime: 0 })
  const [view, setView] = useState<'depot' | 'sku'>('depot')
  const d = q.data
  if (q.isPending || !d) return <p className="supporting">Loading the allocation...</p>
  if (q.isError) return <ApiErrorNotification error={q.error} fallbackTitle="Could not load the allocation" />
  const total = d.regions.reduce((a: number, r: any) => a + r.total, 0)
  const agreed = d.regions.filter((r: any) => r.agreed).length
  const depCols: Col<any>[] = [
    { header: 'Region', cell: (r) => r.region, sort: (r) => r.region },
    { header: 'Depot', cell: (r) => r.depot, sort: (r) => r.depot },
    { header: 'City', cell: (r) => r.city },
    { header: 'Units', num: true, cell: (r) => fmtInt(r.qty), sort: (r) => r.qty },
    { header: 'Share of the region (%)', num: true, cell: (r) => { const t = d.regions.find((x: any) => x.region === r.region)?.total || 1; return `${((r.qty / t) * 100).toFixed(1)}` }, sort: (r) => r.qty },
  ]
  const regCols: Col<any>[] = [
    { header: 'Region', cell: (r) => r.region },
    { header: 'Units', num: true, cell: (r) => fmtInt(r.total), sort: (r) => r.total },
    { header: 'Share of the family (%)', num: true, cell: (r) => ((r.total / (total || 1)) * 100).toFixed(1) },
    { header: 'Depots', num: true, cell: (r) => d.depots.filter((x: any) => x.region === r.region).length },
    { header: 'Status', cell: (r) => <Tag size="sm" type={r.agreed ? 'green' : 'teal'}>{r.agreed ? 'Agreed' : 'Not agreed yet'}</Tag> },
  ]
  // the SKU view: one row per SKU and depot, so a depot's picking list is a filter away
  const skuCols: Col<any>[] = [
    { header: 'Region', cell: (r) => r.region, sort: (r) => r.region },
    { header: 'Depot', cell: (r) => r.depot, sort: (r) => r.depot },
    { header: 'SKU', cell: (r) => r.sku, sort: (r) => r.sku },
    { header: 'Description', cell: (r) => r.description || '–' },
    { header: 'Units', num: true, cell: (r) => fmtInt(r.qty), sort: (r) => r.qty },
  ]
  return (
    <div className="stack-05">
      <StatRow items={[
        { label: 'Family total (units)', value: fmtN(total), sublabel: `${agreed} of ${d.regions.length} regions agreed` },
        { label: 'Regions', value: d.regions.length, sublabel: 'Each with its own SKU numbers' },
        { label: 'Depots', value: d.depots.length, sublabel: 'Across the regions' },
        { label: 'SKU and depot lines', value: fmtInt(d.cells.length), sublabel: 'What each depot is sent' },
      ]} />
      <DataCard id="alr" title="Region by region" description={`Where the ${family} number goes. Agreed, or the latest on the table for regions still talking`} cols={regCols} rows={d.regions} itemsLabel="Regions per page" rowKey={(r) => r.region} />
      <ContentSwitcher size="sm" selectedIndex={view === 'depot' ? 0 : 1} onChange={({ index = 0 }) => setView(index === 0 ? 'depot' : 'sku')}>
        <Switch name="depot" text="By depot" /><Switch name="sku" text="By SKU and depot" />
      </ContentSwitcher>
      {view === 'depot'
        ? <DataCard id="ald" title="Region to depot" description="Each region's number split across its depots by the depot's share of that SKU's dispatches over the last 13 weeks" cols={depCols} rows={d.depots} itemsLabel="Depots per page" rowKey={(r) => `${r.region}|${r.depot}`} defaultSort={{ col: 3, dir: 'desc' }} />
        : <DataCard id="als" title="SKU to depot" description="Every SKU, for every depot, ready to be sent as the replenishment plan" cols={skuCols} rows={d.cells} itemsLabel="Lines per page" rowKey={(r) => `${r.region}|${r.depot}|${r.sku}`} defaultSort={{ col: 4, dir: 'desc' }} />}
      <p className="footnote">Depot shares come from the inventory file's invoiced units, so a depot that has been dispatching more of a SKU gets more of it. The split is a plan to confirm, not a commitment, and it moves as the regional numbers change.</p>
    </div>
  )
}

/** A business unit's slice of the family number, SKU by SKU, in the unit's own SKU mix. */
export function BuLines({ month, family, bu, stamp }: { month: string; family: string; bu: string; stamp: number }) {
  const q = useQuery({ queryKey: ['bu-lines', month, family, bu, stamp], queryFn: () => getJson<any>(`/api/challenge/bu/lines?month=${month}&family=${family}&bu=${bu}`), staleTime: 0 })
  if (!q.data) return null
  const cols: Col<any>[] = [
    { header: 'SKU', cell: (r) => r.sku, sort: (r) => r.sku },
    { header: 'Description', cell: (r) => r.description || '–' },
    { header: 'Share of the unit (%)', num: true, cell: (r) => (r.share * 100).toFixed(1), sort: (r) => r.share },
    { header: 'Model (units)', num: true, cell: (r) => fmtInt(r.model), sort: (r) => r.model },
    { header: 'Same month last year (units)', num: true, cell: (r) => fmtInt(r.last_year), sort: (r) => r.last_year },
    { header: 'Number on the table (units)', num: true, cell: (r) => (r.qty === null ? '–' : fmtInt(r.qty)), sort: (r) => r.qty },
    { header: 'Against the model (%)', num: true, cell: (r) => { const g = gap(r.qty, r.model); return <Delta value={g} text={fmtSigned(g, 1)} /> } },
  ]
  return <DataCard id={`bul-${bu}`} title="SKU by SKU" description="The unit's number in its own SKU mix from the model. A counter-offer on the unit's total moves every SKU in proportion" cols={cols} rows={q.data.rows} itemsLabel="SKUs per page" rowKey={(r) => r.sku} defaultSort={{ col: 3, dir: 'desc' }} />
}

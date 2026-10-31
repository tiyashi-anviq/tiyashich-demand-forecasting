/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiErrorNotification, ModulePageHeader, PageSection, PendingLabel, useToast } from '@reiq/ui'
import { Button, ContentSwitcher, Dropdown, InlineNotification, NumberInput, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tag, TextInput, Tile } from '@reiq/ui/carbon'
import { MODULE } from '../App'
import { getJson, sendJson } from '../lib/http'
import { fmtInt, fmtN, fmtSigned } from '../lib/format'
import { DataCard, type Col } from '../ui/DataCard'
import { Delta, StatRow } from '../ui/StatRow'
import { NeedsData } from '../ui/NeedsData'
import { Evidence } from './challenge/Evidence'

const ROLES = [{ id: 'regional', label: 'Regional Head' }, { id: 'sd', label: 'S&D Head' }, { id: 'bu', label: 'BU Heads' }] as const
type Role = (typeof ROLES)[number]['id']

const gap = (a: number | null | undefined, b: number | null | undefined) => (a && b ? a / b - 1 : null)
const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)))

function statusOf(r: any): { label: string; type: 'gray' | 'blue' | 'teal' | 'green' } {
  if (r.status === 'agreed') return { label: 'Agreed', type: 'green' }
  if (r.status === 'negotiating') return { label: `${r.n_agreed} of ${r.bus.length} units agreed`, type: 'teal' }
  return { label: 'Collecting regions', type: 'gray' }
}
const buStatus = (b: any): { label: string; type: 'gray' | 'blue' | 'teal' | 'green' } =>
  b.status === 'agreed' ? { label: 'Agreed', type: 'green' } : b.status === 'negotiating' ? { label: b.turn === 'bu' ? 'With the BU Head' : 'With the S&D Head', type: 'teal' } : { label: 'Not started', type: 'gray' }
const familyNow = (r: any) => r.agreed ?? (r.consolidated !== null ? r.bus.reduce((a: number, b: any) => a + (b.agreed ?? b.proposal ?? 0), 0) : r.regional_total)

/** Regional Head: set the number for each family in one region. */
function RegionalPanel({ items, region, month, onDone }: { items: any[]; region: string; month: string; onDone: (c: any) => void }) {
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const { showToast } = useToast()
  const rows = items.map((it) => ({ it, cell: it.regional.find((x: any) => x.region === region) })).filter((x) => x.cell)
  const save = useMutation({
    mutationFn: () => sendJson<any>('/api/challenge/regional', 'POST', { month, region, quantities: Object.fromEntries(rows.map(({ it, cell }) => [it.family, draft[it.family] ?? cell.qty])), note }),
    onSuccess: (c) => { onDone(c); setDraft({}); showToast('success', `${region} numbers submitted`, 'The S&D Head can now consolidate them.') },
  })
  const total = rows.reduce((a, { it, cell }) => a + (draft[it.family] ?? cell.qty), 0)
  const modelTotal = rows.reduce((a, { cell }) => a + cell.model, 0)
  return (
    <Tile className="card stack-05">
      <span className="card-heading">
        <span className="card-title">{region}: your numbers for the month</span>
        <span className="footnote">Set the units you expect each family to order in {region}. A family is locked once the S&amp;D Head has sent it to the BU Heads. Numbers shown as simulated are placeholders until you submit.</span>
      </span>
      <div className="table-scroll thin-scroll">
        <Table size="md" aria-label={`${region} numbers by family`}>
          <TableHead><TableRow>
            <TableHeader>Family</TableHeader><TableHeader className="cell-num">Model (units)</TableHeader><TableHeader className="cell-num">Same month last year (units)</TableHeader>
            <TableHeader>Your number (units)</TableHeader><TableHeader className="cell-num">Against the model (%)</TableHeader><TableHeader>Status</TableHeader>
          </TableRow></TableHead>
          <TableBody>
            {rows.map(({ it, cell }) => {
              const locked = it.status !== 'collecting'
              const v = draft[it.family] ?? cell.qty
              return (
                <TableRow key={it.family}>
                  <TableCell>{it.family}</TableCell>
                  <TableCell className="cell-num">{fmtInt(cell.model)}</TableCell>
                  <TableCell className="cell-num">{cell.last_year === null ? '–' : fmtInt(cell.last_year)}</TableCell>
                  <TableCell>
                    <NumberInput id={`q-${it.family}`} size="sm" hideLabel label={`${it.family} units`} hideSteppers min={0} step={1000} value={v} disabled={locked}
                      onChange={(_e: unknown, { value }: { value: number | string }) => setDraft({ ...draft, [it.family]: num(value) })} />
                  </TableCell>
                  <TableCell className="cell-num"><Delta value={gap(v, cell.model)} text={fmtSigned(gap(v, cell.model), 1)} /></TableCell>
                  <TableCell>{locked ? <Tag size="sm" type="teal">Locked</Tag> : cell.simulated && draft[it.family] === undefined ? <Tag size="sm" type="gray">Simulated</Tag> : <Tag size="sm" type="blue">Submitted</Tag>}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <TextInput id="reg-note" size="md" labelText="Note for the S&D Head (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row-between">
        <span className="supporting">Total {fmtInt(total)} units, {fmtSigned(gap(total, modelTotal), 1)} against the model.</span>
        <Button kind="primary" size="md" disabled={rows.every(({ it }) => it.status !== 'collecting')} onClick={() => save.mutate()}>
          <PendingLabel pending={save.isPending} idle={`Submit ${region} numbers`} busy="Submitting..." />
        </Button>
      </div>
      {save.isError ? <ApiErrorNotification error={save.error} fallbackTitle="Could not submit these numbers" /> : null}
    </Tile>
  )
}

/** One business unit's conversation about one family and month: the rounds so far, and what this role can do now. */
function BuPanel({ it, b, role, onDone }: { it: any; b: any; role: Role; onDone: (c: any) => void }) {
  const { showToast } = useToast()
  const [qty, setQty] = useState<number | undefined>(undefined)
  const [reason, setReason] = useState('')
  const post = useMutation({
    mutationFn: (v: { path: string; body: any; done: string }) => sendJson<any>(`/api/challenge/${v.path}`, 'POST', { month: it.month, family: it.family, bu: b.bu, ...v.body }),
    onSuccess: (c, v) => { onDone(c); setQty(undefined); setReason(''); showToast('success', v.done) },
  })
  const run = (path: string, body: any, done: string) => post.mutate({ path, body, done })
  const my = role === 'sd' ? 'sd' : 'bu'
  const turnMine = b.status === 'negotiating' && b.turn === my
  const roundCols: Col<any>[] = [
    { header: 'Round', cell: (r) => r.n },
    { header: 'By', cell: (r) => r.by },
    { header: 'Action', cell: (r) => ({ propose: 'Proposed', counter: 'Countered', accept: 'Accepted', final: 'Final call', reopen: 'Reopened' } as any)[r.action] ?? r.action },
    { header: 'Number (units)', num: true, cell: (r) => fmtInt(r.qty) },
    { header: 'Reason', cell: (r) => r.reason },
  ]
  const rounds = b.rounds.map((r: any, i: number) => ({ ...r, n: i + 1 }))
  const current = b.agreed ?? b.proposal
  const other = b.turn === 'bu' ? `the ${b.name} head` : 'the S&D Head'
  return (
    <Tile className="card stack-05">
      <span className="card-heading">
        <span className="card-title">{b.name}: {it.family}, {it.month}</span>
        <span className="footnote">{b.head}. Model {fmtN(b.model)} units, last year {fmtN(b.last_year)}. Current number {fmtN(current)}, {fmtSigned(gap(current, b.model), 1)} against the model. Channels: {b.channels.join(', ')}.</span>
      </span>
      {rounds.length > 0 && <DataCard id={`rounds-${b.bu}`} title="Negotiation so far" description={`Every round with ${b.head}, with the reason given`} cols={roundCols} rows={rounds} itemsLabel="Rounds per page" rowKey={(r) => String(r.n)} />}
      {b.status === 'agreed' ? (
        <div className="stack-03">
          <InlineNotification kind="success" lowContrast hideCloseButton title={`Agreed at ${fmtInt(b.agreed)} units.`} subtitle={`${b.agreed_by}. This is now the sales team's forecast for ${b.name}, ${it.family}, ${it.month}.`} />
          {role === 'sd' && <div><Button kind="tertiary" size="md" onClick={() => run('reopen', {}, 'Number reopened')}>Reopen this conversation</Button></div>}
        </div>
      ) : turnMine ? (
        <div className="stack-03">
          <p className="supporting">{role === 'bu' ? 'The S&D Head proposes' : `${b.head} counters with`} {fmtInt(b.proposal)} units. Accept it, or counter with a number and a reason.</p>
          <div><Button kind="primary" size="md" onClick={() => run('respond', { role: my, action: 'accept' }, `Accepted at ${fmtInt(b.proposal)} units`)}>Accept {fmtInt(b.proposal)} units</Button></div>
          <NumberInput id={`ctr-${b.bu}`} size="md" label="Your number (units)" hideSteppers min={0} step={1000} value={qty ?? b.proposal}
            onChange={(_e: unknown, { value }: { value: number | string }) => setQty(num(value))} />
          <TextInput id={`why-${b.bu}`} size="md" labelText="Reason" helperText="Needed for a counter-offer or a final call." value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="row-03">
            <Button kind="secondary" size="md" disabled={!reason.trim() || qty === undefined || qty === b.proposal}
              onClick={() => run('respond', { role: my, action: 'counter', qty, reason }, 'Counter-offer sent')}>Send counter-offer</Button>
            {role === 'sd' && <Button kind="danger--tertiary" size="md" disabled={!reason.trim() || qty === undefined}
              onClick={() => run('respond', { role: 'sd', action: 'final', qty, reason }, 'Final call made')}>Make the final call</Button>}
          </div>
        </div>
      ) : (
        <InlineNotification kind="info" lowContrast hideCloseButton title={`Waiting for ${other}.`}
          subtitle={`${fmtInt(b.proposal)} units is on the table. ${b.turn === 'bu' ? 'Switch "Viewing as" to BU Head and pick this unit to respond.' : 'Switch "Viewing as" to S&D Head to respond.'}${role === 'sd' ? ' As S&D Head you can also make the final call.' : ''}`} />
      )}
      {post.isError ? <ApiErrorNotification error={post.error} fallbackTitle="Could not record that" /> : null}
    </Tile>
  )
}


/** Everything that has happened in the cycle, newest first, optionally narrowed to one family and month. */
function ActivityCard({ stamp, month, family, title }: { stamp: number; month?: string; family?: string; title: string }) {
  const q = useQuery({ queryKey: ['challenge-activity', stamp], queryFn: () => getJson<any[]>('/api/challenge/activity'), staleTime: 0 })
  const rows = (q.data ?? []).filter((r) => (!month || r.month === month) && (!family || r.family === family))
  const cols: Col<any>[] = [
    { header: 'When', cell: (r) => new Date(r.at * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), sort: (r) => r.at },
    { header: 'Month', cell: (r) => r.month, sort: (r) => r.month },
    { header: 'Family', cell: (r) => r.family, sort: (r) => r.family },
    { header: 'Business unit', cell: (r) => r.bu ?? '–' },
    { header: 'Who', cell: (r) => r.who },
    { header: 'What', cell: (r) => r.what },
    { header: 'Number (units)', num: true, cell: (r) => fmtInt(r.qty), sort: (r) => r.qty },
    { header: 'Reason or note', cell: (r) => r.reason || '–' },
  ]
  if (q.isError) return <ApiErrorNotification error={q.error} fallbackTitle="Could not load the activity" />
  return <DataCard id={`act${family ? 'f' : ''}`} title={title} description={rows.length ? 'Newest first, with the reason given each time' : 'Nothing has been submitted or discussed yet'} cols={cols} rows={rows} itemsLabel="Entries per page" rowKey={(r, i) => `${r.at}|${i}`} defaultSort={{ col: 0, dir: 'desc' }} />
}

const SECTIONS = [{ id: 'regions', label: 'Regional numbers' }, { id: 'units', label: 'Business units' }, { id: 'evidence', label: 'Evidence' }] as const
type Section = (typeof SECTIONS)[number]['id']

function FamilyPanel({ it, role, buPick, onPick, onDone, section, onSection, regionFilter }: { it: any; role: Role; buPick: string | null; onPick: (bu: string) => void; onDone: (c: any) => void; section: Section; onSection: (s: Section) => void; regionFilter: string | null }) {
  const { showToast } = useToast()
  const [qty, setQty] = useState<number | undefined>(undefined)
  const send = useMutation({
    mutationFn: (q: number | null) => sendJson<any>('/api/challenge/consolidate', 'POST', { month: it.month, family: it.family, qty: q }),
    onSuccess: (c) => { onDone(c); setQty(undefined); showToast('success', 'Sent to the business units', `${it.family} is now being discussed with each unit.`) },
  })
  const regCols: Col<any>[] = [
    { header: 'Region', cell: (r) => r.region },
    { header: 'Model (units)', num: true, cell: (r) => fmtInt(r.model) },
    { header: 'Same month last year (units)', num: true, cell: (r) => (r.last_year === null ? '–' : fmtInt(r.last_year)) },
    { header: 'Regional Head number (units)', num: true, cell: (r) => (r.simulated ? `${fmtInt(r.qty)}, simulated` : fmtInt(r.qty)) },
    { header: 'Against the model (%)', num: true, cell: (r) => { const g = gap(r.qty, r.model); return <Delta value={g} text={fmtSigned(g, 1)} /> } },
    { header: 'Against last year (%)', num: true, cell: (r) => { const g = gap(r.qty, r.last_year); return <Delta value={g} text={fmtSigned(g, 1)} /> } },
    { header: 'Note to the S&D Head', cell: (r) => r.note || '–' },
  ]
  const buCols: Col<any>[] = [
    { header: 'Business unit', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
    { header: 'Head', cell: (r) => r.head },
    { header: 'Model (units)', num: true, cell: (r) => fmtN(r.model), sort: (r) => r.model },
    { header: 'Same month last year (units)', num: true, cell: (r) => fmtN(r.last_year), sort: (r) => r.last_year },
    { header: 'Current number (units)', num: true, cell: (r) => (r.agreed ?? r.proposal) === null ? '–' : fmtN(r.agreed ?? r.proposal), sort: (r) => r.agreed ?? r.proposal ?? 0 },
    { header: 'Against the model (%)', num: true, cell: (r) => { const g = gap(r.agreed ?? r.proposal, r.model); return g === null ? '–' : <Delta value={g} text={fmtSigned(g, 1)} /> } },
    { header: 'Status', cell: (r) => { const s = buStatus(r); return <Tag size="sm" type={s.type}>{s.label}</Tag> } },
  ]
  const consolidated = it.consolidated !== null
  const bus = it.bus
  const chosen = bus.find((b: any) => b.bu === buPick) ?? bus[0]
  const now = familyNow(it)
  return (
    <Tile className="card stack-05">
      <span className="card-heading">
        <span className="card-title">{it.family}: how the number is being settled</span>
        <span className="footnote">Model {fmtN(it.model)} units, last year {fmtN(it.last_year)}. Current number {fmtN(now)}, {fmtSigned(gap(now, it.model), 1)} against the model. The S&amp;D Head talks to each business unit separately, and the units' agreed numbers add up to the sales team's forecast.</span>
      </span>
      <ContentSwitcher size="md" selectedIndex={SECTIONS.findIndex((x) => x.id === section)} onChange={({ index = 0 }) => onSection(SECTIONS[index].id)}>
        {SECTIONS.map((x) => <Switch key={x.id} name={x.id} text={x.label} />)}
      </ContentSwitcher>
      {section === 'evidence' && <Evidence month={it.month} family={it.family} now={now} />}
      {section === 'regions' && (
        <>
      <DataCard id="reg" title="Regional numbers" description="What each Regional Head submitted" cols={regCols} rows={regionFilter ? it.regional.filter((x: any) => x.region === regionFilter) : it.regional} itemsLabel="Regions per page" rowKey={(r) => r.region} />
        </>
      )}
      {section === 'units' && (
        <>
      {!consolidated ? (
        role === 'sd' ? (
          <div className="stack-03">
            <p className="supporting">The regional numbers add up to {fmtInt(it.regional_total)} units. Send that to the business units, or change it first. Each unit starts with its share of the model for this family.</p>
            <NumberInput id="cons" size="md" label="Number to send (units)" hideSteppers min={0} step={1000} value={qty ?? it.regional_total}
              onChange={(_e: unknown, { value }: { value: number | string }) => setQty(num(value))} />
            <div><Button kind="primary" size="md" onClick={() => send.mutate(qty !== undefined && qty !== it.regional_total ? qty : null)}>
              <PendingLabel pending={send.isPending} idle="Consolidate and send to the business units" busy="Sending..." /></Button></div>
          </div>
        ) : <InlineNotification kind="info" lowContrast hideCloseButton title="Waiting for the S&D Head." subtitle="The number reaches the business units once the S&D Head has consolidated the regional numbers." />
      ) : (
        <>
          <DataCard id="bus" title="Business units" description={role === 'bu' ? 'Your unit for this family' : 'One conversation per unit. Select a row to open it'} cols={buCols}
            rows={role === 'bu' ? bus.filter((b: any) => b.bu === chosen?.bu) : bus} itemsLabel="Units per page" rowKey={(r) => r.bu} onRow={(r) => onPick(r.bu)} selected={(r) => r.bu === chosen?.bu} />
          {chosen ? <BuPanel key={`${it.month}|${it.family}|${chosen.bu}|${role}`} it={it} b={chosen} role={role} onDone={onDone} /> : null}
        </>
      )}
        </>
      )}
      {send.isError ? <ApiErrorNotification error={send.error} fallbackTitle="Could not send this number" /> : null}
    </Tile>
  )
}

export default function Challenge() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const q = useQuery({ queryKey: ['challenge'], queryFn: () => getJson<any>('/api/challenge/cycle'), staleTime: 0 })
  const role = (ROLES.find((r) => r.id === params.get('role'))?.id ?? 'sd') as Role
  const set = (patch: Record<string, string | null>) => setParams((cur) => { const n = new URLSearchParams(cur); Object.entries(patch).forEach(([k, v]) => (v === null ? n.delete(k) : n.set(k, v))); return n }, { replace: true })
  const d = q.data
  const month = d?.months[0]?.m  // the challenge is about the first month after the last actuals, October
  const region = d?.regions.includes(params.get('region')) ? params.get('region') : d?.regions[0]  // the Regional Head's own region
  const regPick: string | null = d?.regions.includes(params.get('region')) ? params.get('region') : null  // S&D and BU heads: one region, or all
  const sdUnit = d?.units.find((u: any) => u.bu === params.get('bu')) ?? null
  const unit = d?.units.find((u: any) => u.bu === params.get('bu')) ?? d?.units[0]
  const onDone = (c: any) => qc.setQueryData(['challenge'], c)
  const items: any[] = d ? d.items.filter((i: any) => i.month === month) : []
  const family = items.find((i) => i.family === params.get('family')) ?? items[0]
  const section = (SECTIONS.find((x) => x.id === params.get('section'))?.id ?? (role === 'bu' ? 'units' : 'regions')) as Section

  const toolbar = d ? (
    <div className="challenge-bar" role="group" aria-label="Who you are and which month">
      <div>
        <span className="cds--label">Viewing as</span>
        <ContentSwitcher size="md" selectedIndex={ROLES.findIndex((r) => r.id === role)} onChange={({ index = 0 }) => set({ role: ROLES[index].id })}>
          {ROLES.map((r) => <Switch key={r.id} name={r.id} text={r.label} />)}
        </ContentSwitcher>
      </div>
      {role === 'regional' && (
        <Dropdown id="reg" size="md" titleText="Region" label="Region" items={d.regions} itemToString={(i: string | null) => i ?? ''} selectedItem={region} onChange={({ selectedItem }) => selectedItem && set({ region: selectedItem })} />
      )}
      {role === 'sd' && (
        <>
          <Dropdown id="reg-f" size="md" titleText="Region" label="Region" items={['All regions', ...d.regions]} itemToString={(i: string | null) => i ?? ''} selectedItem={regPick ?? 'All regions'} onChange={({ selectedItem }) => set({ region: selectedItem === 'All regions' ? null : selectedItem })} />
          <Dropdown id="bu-f" size="md" titleText="Business unit" label="Business unit" items={[{ bu: '', name: 'All business units' }, ...d.units]} itemToString={(i: any) => i?.name ?? ''} selectedItem={sdUnit ?? { bu: '', name: 'All business units' }} onChange={({ selectedItem }) => set({ bu: selectedItem?.bu || null })} />
        </>
      )}
      {role === 'bu' && (
        <Dropdown id="reg-b" size="md" titleText="Region" label="Region" items={['All regions', ...d.regions]} itemToString={(i: string | null) => i ?? ''} selectedItem={regPick ?? 'All regions'} onChange={({ selectedItem }) => set({ region: selectedItem === 'All regions' ? null : selectedItem })} />
      )}
      {role === 'bu' && (
        <Dropdown id="bu" size="md" titleText="Business unit" label="Business unit" items={d.units} itemToString={(i: any) => i?.name ?? ''} selectedItem={unit} onChange={({ selectedItem }) => selectedItem && set({ bu: selectedItem.bu })} />
      )}
    </div>
  ) : undefined

  const agreedN = items.filter((i) => i.status === 'agreed').length
  const sum = (f: (i: any) => number) => items.reduce((a, i) => a + f(i), 0)
  const regDone = sum((i) => i.n_regions_agreed), regAll = sum((i) => i.n_regions)
  const sent = items.filter((i) => i.consolidated !== null).length
  const buDone = sum((i) => i.n_agreed), buAll = sum((i) => i.bus.length)
  const modelT = sum((i) => i.model)
  // a BU head only sees families their unit sells
  const unitFilter = role === 'bu' ? unit : role === 'sd' ? sdUnit : null
  const byUnit = unitFilter ? items.filter((i) => i.bus.some((b: any) => b.bu === unitFilter.bu)) : items
  // with a region chosen the table shows that region's part of each family
  const shown = regPick ? byUnit.map((i) => { const x = i.regional.find((r: any) => r.region === regPick); return x ? { ...i, model: x.model, last_year: x.last_year, regional_total: x.qty, agreed: null, consolidated: null } : null }).filter(Boolean) as any[] : byUnit

  const cols: Col<any>[] = [
    { header: 'Family', cell: (r) => r.family, sort: (r) => String(r.family).toLowerCase() },
    { header: 'Model (units)', num: true, cell: (r) => fmtN(r.model), sort: (r) => r.model },
    { header: 'Regional total (units)', num: true, cell: (r) => fmtN(r.regional_total), sort: (r) => r.regional_total },
    { header: 'Current number (units)', num: true, cell: (r) => fmtN(familyNow(r)), sort: (r) => familyNow(r) },
    { header: 'Against the model (%)', num: true, cell: (r) => { const g = gap(familyNow(r), r.model); return <Delta value={g} text={fmtSigned(g, 1)} /> }, sort: (r) => gap(familyNow(r), r.model) },
    { header: 'Status', cell: (r) => { const s = statusOf(r); return <Tag size="sm" type={s.type}>{s.label}</Tag> }, sort: (r) => statusOf(r).label },
  ]

  return (
    <>
      <ModulePageHeader moduleLabel={MODULE} title="Forecast challenge"
        description="Regional numbers go to the S&D Head, who talks to each business unit head in turn. What each unit agrees becomes the sales team's forecast. Simulated submissions."
        toolbar={toolbar} />
      <NeedsData base="forecast" building={{ what: 'build the forecasts', how: 'The challenge starts from the model forecast, so it waits for the forecasts to finish.' }}>
        {q.isPending ? null : q.isError ? <ApiErrorNotification error={q.error} fallbackTitle="Could not load the forecast challenge" onRetry={() => void q.refetch()} /> : (
          <div className="stack-05">
            <StatRow items={[
              { label: '1. Model forecast', info: 'The demand the model projects for the month, as shown on the Supply and production plan screen.', value: fmtN(modelT), sublabel: `${d.months[0].label}, units` },
              { label: '2. Regional heads send', info: 'Each Regional Head sends a number for every family. Simulated.', value: `${regDone} of ${regAll}`, sublabel: 'Regional numbers agreed' },
              { label: '3. S&D Head forwards', info: 'The S&D Head adds the regional numbers up and sends the total to the business unit heads.', value: `${sent} of ${items.length}`, sublabel: 'Families sent to the BU heads' },
              { label: '4. BU heads agree', info: 'Each business unit head accepts the number or counters it, and it goes back and forth until they agree.', value: `${buDone} of ${buAll}`, sublabel: 'Unit conversations agreed' },
              { label: '5. Final number', info: 'Agreed families are planned on their agreed number in the Supply and production plan and Procurement.', value: `${agreedN} of ${items.length}`, sublabel: <>Families final. <Link to="/supply">Open the plan</Link></> },
            ]} />
            {(
              <>
                <PageSection title={`${d.months.find((m: any) => m.m === month)?.label}`} note={role === 'regional'
                  ? `You are viewing as the Regional Head for ${region}. Set your numbers, then submit.`
                  : role === 'bu' ? `You are viewing as the head of ${unit?.name}. Select a family to see your unit's number and respond.`
                  : 'Select a family to see the evidence, the regional numbers and the conversation with each business unit.'}>
                  {role !== 'regional' && (
                    <DataCard id="fam" title="Families" description="Every family for the month and the step it has reached. Select one to open it" cols={cols} rows={shown}
                      itemsLabel="Families per page" rowKey={(r) => r.family} onRow={(r) => set({ family: r.family })} selected={(r) => r.family === family?.family} />
                  )}
                </PageSection>
                {role === 'regional' ? <RegionalPanel key={`${month}|${region}`} items={items} region={region} month={month} onDone={onDone} />
                  : family ? <FamilyPanel key={`${family.month}|${family.family}|${role}`} it={family} role={role} buPick={role === 'bu' ? unit?.bu ?? null : params.get('bu')} onPick={(bu) => set({ bu })} onDone={onDone}
                    section={section} onSection={(x) => set({ section: x })} regionFilter={regPick} /> : null}
              </>
            )}
            <ActivityCard stamp={q.dataUpdatedAt} month={month} title={`${d.months[0].label}: everything that has happened`} />
            <p className="footnote">All submissions are simulated placeholders. Numbers are units of orders received. Once every unit has agreed a family, the Supply and production plan and Procurement use that number.</p>
          </div>
        )}
      </NeedsData>
    </>
  )
}

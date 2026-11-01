/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiErrorNotification, ModulePageHeader, PageSection } from '@reiq/ui'
import { ContentSwitcher, Dropdown, InlineNotification, Switch, Tag, Tile } from '@reiq/ui/carbon'
import { MODULE } from '../App'
import { getJson } from '../lib/http'
import { fmtInt, fmtN, fmtSigned } from '../lib/format'
import { DataCard, type Col } from '../ui/DataCard'
import { Delta, StatRow } from '../ui/StatRow'
import { NeedsData } from '../ui/NeedsData'
import { Evidence } from './challenge/Evidence'
import { AllocationSection, BuPanel, RegionsSection } from './challenge/Regions'
import { FinalNumbers } from './challenge/Final'
import { LineFilter } from './challenge/LineGrid'
import type { Options } from '../lib/filters'
import { useView } from '../lib/useView'

const ROLES = [{ id: 'regional', label: 'Regional Head' }, { id: 'sd', label: 'S&D Head' }, { id: 'bu', label: 'BU Heads' }] as const
type Role = (typeof ROLES)[number]['id']

const gap = (a: number | null | undefined, b: number | null | undefined) => (a && b ? a / b - 1 : null)

function statusOf(r: any): { label: string; type: 'gray' | 'blue' | 'teal' | 'green' } {
  if (r.status === 'agreed') return { label: 'Agreed', type: 'green' }
  if (r.status === 'negotiating') return { label: `${r.n_agreed} of ${r.bus.length} units agreed`, type: 'teal' }
  return { label: 'Collecting regions', type: 'gray' }
}
const buStatus = (b: any): { label: string; type: 'gray' | 'blue' | 'teal' | 'green' } =>
  b.status === 'agreed' ? { label: 'Agreed', type: 'green' } : b.status === 'negotiating' ? { label: b.turn === 'bu' ? 'With the BU Head' : 'With the S&D Head', type: 'teal' } : { label: 'Not started', type: 'gray' }
const familyNow = (r: any) => r.agreed ?? (r.consolidated !== null ? r.bus.reduce((a: number, b: any) => a + (b.agreed ?? b.proposal ?? 0), 0) : r.regional_total)

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

const SECTIONS = [{ id: 'regions', label: 'Regions' }, { id: 'units', label: 'Business units' }, { id: 'depots', label: 'Depots' }, { id: 'evidence', label: 'Evidence' }] as const
type Section = (typeof SECTIONS)[number]['id']

function FamilyPanel({ it, role, regionPick, buPick, onRegion, onPick, onDone, section, onSection, stamp }: { it: any; role: Role; regionPick: string | null; buPick: string | null; onRegion: (r: string) => void; onPick: (bu: string) => void; onDone: (c: any) => void; section: Section; onSection: (s: Section) => void; stamp: number }) {
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
        <span className="footnote">Model {fmtN(it.model)} units, last year {fmtN(it.last_year)}. Current number {fmtN(now)}, {fmtSigned(gap(now, it.model), 1)} against the model. Every number is set region by region, channel by channel and SKU by SKU. Each Regional Head agrees theirs with the S&amp;D Head, then each business unit head agrees theirs.</span>
      </span>
      <ContentSwitcher size="md" selectedIndex={SECTIONS.findIndex((x) => x.id === section)} onChange={({ index = 0 }) => onSection(SECTIONS[index].id)}>
        {SECTIONS.map((x) => <Switch key={x.id} name={x.id} text={x.label} />)}
      </ContentSwitcher>
      {section === 'evidence' && <Evidence month={it.month} family={it.family} now={now} />}
      {section === 'regions' && <RegionsSection it={it} role={role} pick={regionPick} onPick={onRegion} stamp={stamp} onDone={onDone} />}
      {section === 'depots' && <AllocationSection month={it.month} family={it.family} stamp={stamp} />}
      {section === 'units' && (
        !consolidated ? (
          <InlineNotification kind="info" lowContrast hideCloseButton title="Waiting for the regions." subtitle={`The business units get their numbers once every region has agreed (${it.n_regions_agreed} of ${it.n_regions} so far). Open Regions to see where each one stands.`} />
        ) : (
          <>
            <DataCard id="bus" title="Business units" description={role === 'bu' ? 'Your unit for this family' : 'One conversation per unit. Select a row to open it'} cols={buCols}
              rows={role === 'bu' ? bus.filter((b: any) => b.bu === chosen?.bu) : bus} itemsLabel="Units per page" rowKey={(r) => r.bu} onRow={(r) => onPick(r.bu)} selected={(r) => r.bu === chosen?.bu} />
            {chosen ? <BuPanel key={`${it.month}|${it.family}|${chosen.bu}|${role}`} it={it} b={chosen} role={role} stamp={stamp} onDone={onDone} /> : null}
          </>
        )
      )}
    </Tile>
  )
}

export default function Challenge() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const q = useQuery({ queryKey: ['challenge'], queryFn: () => getJson<any>('/api/challenge/cycle'), staleTime: 0 })
  const role = (ROLES.find((r) => r.id === params.get('role'))?.id ?? 'regional') as Role
  const set = (patch: Record<string, string | null>) => setParams((cur) => { const n = new URLSearchParams(cur); Object.entries(patch).forEach(([k, v]) => (v === null ? n.delete(k) : n.set(k, v))); return n }, { replace: true })
  const d = q.data
  const fo = useQuery({ queryKey: ['forecast', 'options'], queryFn: () => getJson<Options>('/api/forecast/options'), staleTime: Infinity })
  const chPick = params.get('ch'), prodPick = params.get('prod')
  const month = d?.months[0]?.m  // the challenge is about the first month after the last actuals, October
  const region = d?.regions.includes(params.get('region')) ? params.get('region') : d?.regions[0]  // the Regional Head's own region
  const regPick: string | null = d?.regions.includes(params.get('region')) ? params.get('region') : null  // S&D and BU heads: one region, or all
  const sdUnit = d?.units.find((u: any) => u.bu === params.get('bu')) ?? null
  const unit = d?.units.find((u: any) => u.bu === params.get('bu')) ?? d?.units[0]
  const onDone = (c: any) => qc.setQueryData(['challenge'], c)
  const scope = new URLSearchParams()
  const scopeRegion = role === 'regional' ? region : regPick
  if (scopeRegion) scope.set('region', scopeRegion)
  if (chPick) scope.set('channel', chPick)
  if (params.get('ff')) scope.set('family', params.get('ff') as string)
  if (prodPick) scope.set('product', prodPick)
  const scoped = useView<any>('forecast', 'vintages', scope.toString(), !!d)
  const scopedM1: number | null = scoped.data?.horizons?.M1?.ahead?.[0] ?? null
  const lyA: number | null = scoped.data?.actual?.[0] ?? null  // October 2025
  const lmA: number | null = scoped.data?.actual ? scoped.data.actual[scoped.data.actual.length - 1] ?? null : null  // September 2026
  const items: any[] = d ? d.items.filter((i: any) => i.month === month) : []
  const ff: string | null = items.some((i) => i.family === params.get('ff')) ? params.get('ff') : null
  const family = items.find((i) => i.family === (ff ?? params.get('family'))) ?? items[0]
  const tab = params.get('tab') === 'final' ? 'final' : 'negotiate'
  const section = (SECTIONS.find((x) => x.id === params.get('section'))?.id ?? (role === 'bu' ? 'units' : 'regions')) as Section

  const toolbar = d ? (
    <div className="challenge-bar" role="group" aria-label="Who you are and which month">
      <div>
        <span className="cds--label">Viewing as</span>
        <ContentSwitcher size="md" selectedIndex={ROLES.findIndex((r) => r.id === role)} onChange={({ index = 0 }) => set({ role: ROLES[index].id })}>
          {ROLES.map((r) => <Switch key={r.id} name={r.id} text={r.label} />)}
        </ContentSwitcher>
      </div>
      <Dropdown id="f-reg" size="md" titleText="Region" label="Region" items={role === 'regional' ? d.regions : ['All regions', ...d.regions]} itemToString={(i: string | null) => i ?? ''}
        selectedItem={role === 'regional' ? region : regPick ?? 'All regions'} onChange={({ selectedItem }) => selectedItem && set({ region: selectedItem === 'All regions' ? null : selectedItem })} />
      <Dropdown id="f-ch" size="md" titleText="Channel" label="Channel" items={['All channels', ...(fo.data?.channel ?? [])]} itemToString={(i: string | null) => i ?? ''}
        selectedItem={chPick ?? 'All channels'} onChange={({ selectedItem }) => selectedItem && set({ ch: selectedItem === 'All channels' ? null : selectedItem })} />
      <Dropdown id="f-fam" size="md" titleText="Product family" label="Product family" items={['All families', ...[...new Set(d.items.map((i: any) => i.family))] as string[]]} itemToString={(i: string | null) => i ?? ''}
        selectedItem={ff ?? 'All families'} onChange={({ selectedItem }) => selectedItem && set({ ff: selectedItem === 'All families' ? null : selectedItem, prod: null })} />
      <Dropdown id="f-prod" size="md" titleText="Product" label="Product" items={[{ id: '', label: 'All products' }, ...(fo.data?.product ?? []).filter((p) => !ff || p.family === ff)]} itemToString={(i: { id: string; label: string } | null) => i?.label ?? ''}
        selectedItem={(fo.data?.product ?? []).find((p) => p.id === prodPick) ?? { id: '', label: 'All products' }} onChange={({ selectedItem }) => selectedItem && set({ prod: selectedItem.id || null })} />
      {role === 'sd' && (
        <Dropdown id="bu-f" size="md" titleText="Business unit" label="Business unit" items={[{ bu: '', name: 'All business units' }, ...d.units]} itemToString={(i: any) => i?.name ?? ''}
          selectedItem={sdUnit ?? { bu: '', name: 'All business units' }} onChange={({ selectedItem }) => selectedItem && set({ bu: selectedItem.bu || null })} />
      )}
      {role === 'bu' && (
        <Dropdown id="bu" size="md" titleText="Business unit" label="Business unit" items={d.units} itemToString={(i: any) => i?.name ?? ''} selectedItem={unit} onChange={({ selectedItem }) => selectedItem && set({ bu: selectedItem.bu })} />
      )}
    </div>
  ) : undefined

  // a BU head only sees families their unit sells
  const unitFilter = role === 'bu' ? unit : role === 'sd' ? sdUnit : null
  const byUnit = (unitFilter ? items.filter((i) => i.bus.some((b: any) => b.bu === unitFilter.bu)) : items).filter((i) => !ff || i.family === ff)
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
        description="Every number is set region by region, channel by channel and SKU by SKU. Each Regional Head agrees theirs with the S&D Head, then each business unit head does the same. What is agreed becomes the final forecast. Simulated submissions."
        toolbar={toolbar} />
      <NeedsData base="forecast" building={{ what: 'build the forecasts', how: 'The challenge starts from the model forecast, so it waits for the forecasts to finish.' }}>
        {q.isPending ? null : q.isError ? <ApiErrorNotification error={q.error} fallbackTitle="Could not load the forecast challenge" onRetry={() => void q.refetch()} /> : (
          <LineFilter.Provider value={{ channel: chPick, product: prodPick, missing: [!scopeRegion && 'a region', !chPick && 'a channel', !ff && 'a product family', !prodPick && 'a product'].filter(Boolean) as string[] }}><div className="stack-05">
            <ContentSwitcher size="md" selectedIndex={tab === 'final' ? 1 : 0} onChange={({ index = 0 }) => set({ tab: index === 1 ? 'final' : null })}>
              <Switch name="negotiate" text="Negotiation" /><Switch name="final" text="Final numbers" />
            </ContentSwitcher>
            {tab === 'final' ? <FinalNumbers month={month} stamp={q.dataUpdatedAt} /> : (
            <>
            <StatRow items={[
              { label: `${d.months[0].label} forecast (units)`, info: 'The demand the model projects for the month, as shown on the Supply and production plan screen.', value: scopedM1 === null ? '–' : fmtN(scopedM1), sublabel: scope.toString() !== '' ? 'For your selection' : 'All regions, channels and products' },
              { label: 'Same month last year, actual (units)', value: lyA === null ? '–' : fmtN(lyA), sublabel: <><Delta value={gap(scopedM1, lyA)} text={fmtSigned(gap(scopedM1, lyA), 1)} /> forecast against it</> },
              { label: 'Last month, actual (units)', value: lmA === null ? '–' : fmtN(lmA), sublabel: <><Delta value={gap(scopedM1, lmA)} text={fmtSigned(gap(scopedM1, lmA), 1)} /> forecast against it</> },
            ]} />
            {(
              <>
                <PageSection title={`${d.months.find((m: any) => m.m === month)?.label}`} note={role === 'regional'
                  ? `You are viewing as the Regional Head for ${region}. Select a family, then fill in every channel and SKU in your region.`
                  : role === 'bu' ? `You are viewing as the head of ${unit?.name}. Select a family to see your unit's number and respond.`
                  : 'Select a family to see the evidence, the regional numbers and the conversation with each business unit.'}>
                  {!ff && (
                    <DataCard id="fam" title="Families" description="Every family for the month and the step it has reached. Select one to open it" cols={cols} rows={shown}
                      itemsLabel="Families per page" rowKey={(r) => r.family} onRow={(r) => set({ family: r.family })} selected={(r) => r.family === family?.family} />
                  )}
                </PageSection>
                {family ? <FamilyPanel key={`${family.month}|${family.family}|${role}`} it={family} role={role} regionPick={role === 'regional' ? region : regPick} buPick={role === 'bu' ? unit?.bu ?? null : params.get('bu')} onRegion={(r) => set({ region: r })} onPick={(bu) => set({ bu })} onDone={onDone}
                    section={section} onSection={(x) => set({ section: x })} stamp={q.dataUpdatedAt} /> : null}
              </>
            )}
            <ActivityCard stamp={q.dataUpdatedAt} month={month} title={`${d.months[0].label}: everything that has happened`} />
            </>
            )}
            <p className="footnote">All submissions are simulated placeholders. Numbers are units of orders received. Once every unit has agreed a family, the Supply and production plan and Procurement use those numbers.</p>
          </div></LineFilter.Provider>
        )}
      </NeedsData>
    </>
  )
}

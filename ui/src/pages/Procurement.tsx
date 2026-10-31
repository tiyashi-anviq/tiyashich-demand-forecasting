/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ModulePageHeader } from '@reiq/ui'
import { Dropdown, NumberInput, Tag, Tile } from '@reiq/ui/carbon'
import { MODULE } from '../App'
import { getJson } from '../lib/http'
import { useBuild, useView } from '../lib/useView'
import { G } from '../lib/glossary'
import { fmtN, fmtSigned, monthLong } from '../lib/format'
import { DataCard, type Col } from '../ui/DataCard'
import { StatRow } from '../ui/StatRow'
import { NeedsData } from '../ui/NeedsData'
import { ViewShell } from '../ui/ViewShell'

const NAMES: Record<string, string> = { need: 'Over the plant need', last_year: 'Over last year', recent: 'Over recent use', cover: 'Too much cover' }
const NONE = 'No reason'
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : fmtSigned(v, 0))

function Hdr({ embedded, toolbar, ...rest }: { embedded?: boolean; toolbar?: React.ReactNode; moduleLabel: string; title: string; description: string }) {
  return embedded ? <>{toolbar}</> : <ModulePageHeader {...rest} toolbar={toolbar} />
}

export default function Procurement({ embedded }: { embedded?: boolean }) {
  const build = useBuild('eda')
  const [month, setMonth] = useState<string | null>(null), [show, setShow] = useState('Flagged')
  const [released, setReleased] = useState<Record<string, string>>({})
  const [trySku, setTrySku] = useState<string | null>(null), [tryQty, setTryQty] = useState(100000)
  const qs = new URLSearchParams()
  if (month) qs.set('month', month)
  const q = useView<any>('supply', 'rm-procure', qs.toString(), build.data?.state === 'ready')
  const m = q.data?.month
  const sku = trySku ?? q.data?.rows?.[0]?.sku
  const tq = useQuery({ queryKey: ['try', sku, m, tryQty], queryFn: () => getJson<any>(`/api/supply/rm-try?sku=${sku}&month=${m}&qty=${tryQty}`), enabled: !!sku && !!m, placeholderData: (p: any) => p })
  return (
    <>
      <Hdr embedded={embedded} moduleLabel={MODULE} title="Procurement challenge"
        description="Each raw-material request is checked against the plant's need, last year's use, recent use and stock cover. A request is flagged when it fails two or more checks. Synthetic data."
        toolbar={q.data ? (
          <div className="row-03">
            <Dropdown id="pc-m" size="md" titleText="Request month" label="Month" items={q.data.months} itemToString={(x: string | null) => (x ? monthLong(x) : '')} selectedItem={q.data.month} onChange={({ selectedItem }: any) => selectedItem && setMonth(selectedItem)} />
          </div>
        ) : undefined} />
      <NeedsData base="eda" building={{ what: 'prepare your data', how: 'Joining sales with the other tables takes about 15 seconds the first time and is saved afterwards.' }}>
        <ViewShell query={q} errorTitle="Could not load the requests" emptyTitle="No requests for this selection" onClear={() => setShow('All')}>
          {(d) => {
            const rel = (r: any) => released[r.id]
            const nFlag = d.rows.filter((r: any) => !r.passed).length, nRel = d.rows.filter((r: any) => !r.passed && rel(r)).length
            const rows = d.rows.filter((r: any) => (show === 'All' ? true : show === 'Held for a reason' ? !r.passed && !!rel(r) : !r.passed))
            const cols: Col<any>[] = [
              { header: 'Raw material', cell: (r) => (r.below_moq ? `${r.name} (below MOQ)` : r.name), sort: (r) => String(r.name).toLowerCase() },
              { header: 'Requested', num: true, cell: (r) => `${fmtN(r.requested)} ${r.uom}`, sort: (r) => r.requested },
              { header: 'Plant need (%)', num: true, cell: (r) => pct(r.vs.need), sort: (r) => r.vs.need },
              { header: 'Last year\'s use (%)', num: true, cell: (r) => pct(r.vs.last_year), sort: (r) => r.vs.last_year },
              { header: 'Recent use (%)', num: true, cell: (r) => pct(r.vs.recent), sort: (r) => r.vs.recent },
              { header: 'Cover at the start (days)', num: true, cell: (r) => (r.plan && r.plan.cover_start !== null ? r.plan.cover_start.toFixed(0) : '–'), sort: (r) => r.plan?.cover_start ?? null },
              { header: 'Lead time (days)', num: true, cell: (r) => (r.plan ? r.plan.lead.toFixed(0) : '–'), sort: (r) => r.plan?.lead ?? null },
              { header: 'Lead-time risk', cell: (r) => (r.plan ? (r.plan.at_risk ? <Tag type="red" size="sm">At risk</Tag> : <Tag type="green" size="sm">Covered</Tag>) : '–'), sort: (r) => (r.plan ? String(r.plan.at_risk) : '') },
              { header: 'Cover after (days)', num: true, cell: (r) => (r.cover === null ? '–' : `${r.cover.toFixed(0)} of ${r.target.toFixed(0)}`), sort: (r) => r.cover },
              { header: 'Order check', cell: (r) => (r.flags.length ? <Tag type="red" size="sm" title={r.flags.map((f: string) => NAMES[f]).join(', ')}>{r.flags.length} of 4 failed</Tag> : <Tag type="green" size="sm">None failed</Tag>), sort: (r) => r.flags.length },
              { header: 'Status', cell: (r) => (r.passed ? <Tag type="green" size="md">Passed</Tag> : rel(r) ? <Tag type="blue" size="md">Released</Tag> : <Tag type="red" size="md">Flagged</Tag>), sort: (r) => (r.passed ? 0 : rel(r) ? 1 : 2) },
              { header: 'Reason to release', cell: (r) => (r.passed ? '' : (
                <Dropdown id={`rs-${r.id}`} size="sm" titleText="" label="Reason" hideLabel items={[NONE, ...d.reasons]} itemToString={(i: string | null) => i ?? ''}
                  selectedItem={rel(r) ?? NONE} onChange={({ selectedItem }: any) => setReleased((x) => { const n = { ...x }; if (!selectedItem || selectedItem === NONE) delete n[r.id]; else n[r.id] = selectedItem; return n })} />)) },
            ]
            const rules = d.rules
            return (
              <>
                <StatRow items={[
                  { label: 'Requests checked', value: String(d.rows.length), sublabel: monthLong(d.month) },
                  { label: 'Passed', value: String(d.rows.length - nFlag), sublabel: 'Failed fewer than two checks' },
                  { label: 'Flagged', info: 'A request is flagged when it fails two or more of four checks: over the plant need, over last year\'s use, over recent use, or too much stock cover afterwards.', value: String(nFlag - nRel), sublabel: 'Failed two or more checks, still open' },
                  { label: 'Released with a reason', value: String(nRel), sublabel: 'Kept for this visit only' },
                ]} />
                <Tile className="card">
                  <h3 className="card-heading">Rules</h3>
                  <p className="supporting">A request fails a check when it runs more than {Math.round(rules.need * 100)}% over what the plant needs to reach its target cover, {Math.round(rules.last_year * 100)}% over the same month last year's use, {Math.round(rules.recent * 100)}% over the last three months' use, or when stock plus the request would cover more than {Math.round(rules.cover * 100)}% of the target cover days. Below-MOQ requests are marked but do not count as a failure.</p>
                </Tile>
                <div className="row-03">
                  <Dropdown id="pc-s" size="md" titleText="Show" label="Show" items={['Flagged', 'Held for a reason', 'All']} itemToString={(i: string | null) => i ?? ''} selectedItem={show} onChange={({ selectedItem }: any) => selectedItem && setShow(selectedItem)} />
                </div>
                <DataCard id="pcr" title="Raw-material requests" info={G.cover + ' Plant need: ' + G.need} description="Each request against the plant need, last year's use and recent use, as % over (+) or under (−). Hover a count to see which checks failed." cols={cols} rows={rows} itemsLabel="requests" rowKey={(r) => r.id} defaultSort={{ col: 6, dir: 'desc' }}
                  note="These months are closed, so the check shows what it would have said when each request was raised. Plant need is the units the plant must buy to reach its target cover. Last year's and recent use are what the plant consumed in those months." />
                <Tile className="card stack-03">
                  <h3 className="card-heading">Try a number</h3>
                  <div className="row-03">
                    <Dropdown id="try-s" size="md" titleText="Raw material" label="Raw material" items={d.rows.map((r: any) => r.sku)} itemToString={(s: string | null) => (s ? d.rows.find((r: any) => r.sku === s)?.name ?? s : '')} selectedItem={sku} onChange={({ selectedItem }: any) => selectedItem && setTrySku(selectedItem)} />
                    <NumberInput id="try-q" size="md" label="Quantity (units)" hideSteppers min={0} step={1000} value={tryQty} onChange={(_e: unknown, { value }: { value: number | string }) => setTryQty(Math.max(0, +value || 0))} />
                  </div>
                  {tq.data ? (
                    <p className="supporting">
                      {fmtN(tq.data.qty)} units of {tq.data.name}: {tq.data.passed ? 'passes' : 'is flagged'}.
                      {' '}Against the plant need {pct(tq.data.vs.need)}, last year's use {pct(tq.data.vs.last_year)}, recent use {pct(tq.data.vs.recent)}; cover after {tq.data.cover === null ? '–' : `${tq.data.cover.toFixed(0)} of ${tq.data.target.toFixed(0)} target days`}
                      {tq.data.flags.length ? `. Fails: ${tq.data.flags.map((f: string) => NAMES[f].toLowerCase()).join(', ')}.` : '. Fails nothing.'}
                    </p>
                  ) : null}
                </Tile>
              </>
            )
          }}
        </ViewShell>
      </NeedsData>
    </>
  )
}

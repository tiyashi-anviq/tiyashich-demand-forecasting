/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiErrorNotification } from '@reiq/ui'
import { Button, ContentSwitcher, Dropdown, InlineNotification, NumberInput, Switch, Tag, Tile } from '@reiq/ui/carbon'
import { getJson } from '../../lib/http'
import { fmtInt, fmtN, fmtPct, fmtSigned } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'
import { Delta, StatRow } from '../../ui/StatRow'

const REASONS = ['Trade scheme or promotion', 'Festival timing', 'New launch or wider distribution', 'Competitor or price move', 'Supply constraint', 'Known large order', 'Correction of an earlier number', 'Other']
const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)))
const gap = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined && b ? a / b - 1 : null)

type Rules = { model: number; ly: number; l3: number; need: number; min: number | null; max: number | null }
const DEFAULT: Rules = { model: 0.15, ly: 0.15, l3: 0.3, need: 2, min: null, max: null }
const pctItems = (vals: number[]) => vals.map((v) => ({ id: v, label: `${Math.round(v * 100)}%` }))

/** The checks on one number: against the model, last year allowing for the recent trend, and the last three months, plus stock cover on the family total. */
function check(row: any, v: number, familyTotal: number, stock: any, R: Rules, lead: number) {
  const dM = gap(v, row.model)
  const yoy = row.last3_ly ? row.last3 / row.last3_ly - 1 : null
  const dL = gap(v, row.last_year)
  const dL3 = gap(v, row.last3)
  const off = [
    dM !== null && Math.abs(dM) > R.model ? 'Model' : null,
    dL !== null && yoy !== null && Math.abs(dL - yoy) > R.ly ? 'Last year' : null,
    dL3 !== null && Math.abs(dL3) > R.l3 ? 'Last three months' : null,
  ].filter(Boolean) as string[]
  const min = R.min ?? stock?.norm_min ?? null
  const max = R.max ?? stock?.over_above ?? null
  const cover = lead === 1 && stock?.scale ? stock.closing / ((familyTotal * stock.scale) / 30) : null
  const low = cover !== null && min !== null && cover < min
  const high = cover !== null && max !== null && cover > max
  const refFlag = off.length >= R.need
  return { dM, dL, dL3, yoy, off, cover, low, high, refFlag, stkFlag: low || high, flagged: refFlag || low || high }
}

export function Checks({ month, lead, items, onOpen }: { month: string; lead: number; items: any[]; onOpen: (family: string, bu: string) => void }) {
  const q = useQuery({ queryKey: ['challenge-checks', month], queryFn: () => getJson<any>(`/api/challenge/checks?month=${month}`), staleTime: 60_000 })
  const [R, setR] = useState<Rules>(DEFAULT)
  const [show, setShow] = useState<'open' | 'flag' | 'all'>('open')
  const [released, setReleased] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [tryKey, setTryKey] = useState<string | null>(null)
  const [tryVal, setTryVal] = useState<number | undefined>(undefined)

  const data = q.data
  const current = (family: string, bu: string): number | null => {
    const it = items.find((i) => i.family === family)
    const b = it?.bus.find((x: any) => x.bu === bu)
    if (!it || !b) return null
    return b.agreed ?? b.proposal ?? Math.round(it.regional_total * b.share)
  }
  const familyTotal = (family: string) => (data?.rows ?? []).filter((r: any) => r.family === family).reduce((a: number, r: any) => a + (current(r.family, r.bu) ?? 0), 0)

  const rows = useMemo(() => {
    if (!data) return []
    return data.rows.map((r: any) => {
      const v = current(r.family, r.bu) ?? 0
      const it = items.find((i) => i.family === r.family)
      const b = it?.bus.find((x: any) => x.bu === r.bu)
      const key = `${r.family}|${r.bu}`
      return { ...r, key, v, status: b?.status ?? 'waiting', rounds: b?.rounds ?? [], ...check(r, v, familyTotal(r.family), data.stock[r.family], R, lead) }
    }).sort((a: any, b: any) => (Number(b.flagged) - Number(a.flagged)) || (b.off.length - a.off.length))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, items, R])

  if (q.isPending) return <p className="supporting">Loading the checks...</p>
  if (q.isError) return <ApiErrorNotification error={q.error} fallbackTitle="Could not load the checks" onRetry={() => void q.refetch()} />

  const state = (r: any) => (!r.flagged ? 'passed' : released[r.key] ? 'released' : 'open')
  const open = rows.filter((r: any) => state(r) === 'open')
  const rel = rows.filter((r: any) => state(r) === 'released')
  const passed = rows.filter((r: any) => state(r) === 'passed')
  const nFlag = open.length + rel.length
  const shown = show === 'open' ? open : show === 'flag' ? rows.filter((r: any) => r.flagged) : rows
  const stockFlagged = rows.filter((r: any) => r.stkFlag).length
  const refFlagged = rows.filter((r: any) => r.refFlag).length

  const whyOf = (r: any) => [
    ...r.off.map((o: string) => `${o}: ${fmtSigned(o === 'Model' ? r.dM : o === 'Last year' ? r.dL : r.dL3, 0)}`),
    ...(r.low ? [`Stock lasts ${r.cover.toFixed(0)} days, under ${(R.min ?? data.stock[r.family]?.norm_min)?.toFixed(0)}`] : []),
    ...(r.high ? [`Stock lasts ${r.cover.toFixed(0)} days, over ${(R.max ?? data.stock[r.family]?.over_above)?.toFixed(0)}`] : []),
  ]
  const dev = (v: number | null, limit: number, ref?: number | null) => (v === null ? '–' : <span className={Math.abs(ref !== undefined && ref !== null ? v - ref : v) > limit ? 'delta down' : ''}>{fmtSigned(v, 1)}</span>)

  const cols: Col<any>[] = [
    { header: 'Family', cell: (r) => r.family, sort: (r) => r.family },
    { header: 'Channel', cell: (r) => r.bu_name, sort: (r) => r.bu_name },
    { header: 'Number (units)', num: true, cell: (r) => fmtN(r.v), sort: (r) => r.v },
    { header: 'Against the model (%)', num: true, cell: (r) => dev(r.dM, R.model), sort: (r) => r.dM },
    { header: 'Against last year (%)', num: true, cell: (r) => dev(r.dL, R.ly, r.yoy), sort: (r) => r.dL },
    { header: 'Against the last three months (%)', num: true, cell: (r) => dev(r.dL3, R.l3), sort: (r) => r.dL3 },
    { header: 'Stock lasts (days)', num: true, cell: (r) => (r.cover === null ? '–' : <span className={r.stkFlag ? 'delta down' : ''}>{r.cover.toFixed(0)}</span>), sort: (r) => r.cover },
    { header: 'Why flagged', cell: (r) => (r.flagged ? whyOf(r).map((t: string) => <Tag key={t} size="sm" type="red">{t}</Tag>) : <span className="supporting">Nothing</span>) },
    { header: 'Reason', cell: (r) => {
      const s = state(r)
      if (s === 'passed') return '–'
      if (s === 'released') return released[r.key]
      return (
        <Dropdown id={`why-${r.key}`} size="sm" titleText="" hideLabel label="Choose a reason" items={REASONS} itemToString={(i: string | null) => i ?? ''} selectedItem={picked[r.key] ?? null}
          onChange={({ selectedItem }) => selectedItem && setPicked({ ...picked, [r.key]: selectedItem })} />
      )
    } },
    { header: 'Status', cell: (r) => {
      const s = state(r)
      if (s === 'passed') return <Tag size="sm" type="green">Passed</Tag>
      if (s === 'released') return <span><Tag size="sm" type="teal">Released</Tag> <Button kind="ghost" size="sm" onClick={() => { const n = { ...released }; delete n[r.key]; setReleased(n) }}>Hold</Button></span>
      return <Button kind="tertiary" size="sm" disabled={!picked[r.key]} onClick={() => setReleased({ ...released, [r.key]: picked[r.key] })}>Release</Button>
    } },
    { header: 'Conversation', cell: (r) => <Button kind="ghost" size="sm" onClick={() => onOpen(r.family, r.bu)}>{r.rounds.length ? `Open, ${r.rounds.length} round${r.rounds.length === 1 ? '' : 's'}` : 'Open'}</Button> },
  ]

  // try a number: any family and unit, see how it would be checked, and the range that passes
  const tkey = tryKey && rows.some((r: any) => r.key === tryKey) ? tryKey : rows[0]?.key
  const tr = rows.find((r: any) => r.key === tkey)
  const val = tryVal ?? tr?.v
  let tc: any = null
  let range: [number, number] | null = null
  if (tr && val !== undefined && isFinite(val)) {
    const famTotal = familyTotal(tr.family) - tr.v + val
    tc = check(tr, val, famTotal, data.stock[tr.family], R, lead)
    const lo: number[] = [tr.model * (1 - R.model), tr.last3 * (1 - R.l3)]
    const hi: number[] = [tr.model * (1 + R.model), tr.last3 * (1 + R.l3)]
    if (tr.last_year && tc.yoy !== null) { lo.push(tr.last_year * (1 + tc.yoy - R.ly)); hi.push(tr.last_year * (1 + tc.yoy + R.ly)) }
    // with "need" of three, a number passes if enough of the reference ranges contain it; show the span where every one does
    range = Math.max(...lo) <= Math.min(...hi) ? [Math.max(...lo), Math.min(...hi)] : null
  }

  return (
    <div className="stack-05">
      <StatRow items={[
        { label: 'Numbers checked', value: rows.length, sublabel: 'Family by channel, for the month' },
        { label: 'Passed', value: passed.length, sublabel: 'Broke no rule' },
        { label: 'Flagged', value: nFlag, sublabel: rows.length ? `${fmtPct(nFlag / rows.length, 0)} of the ${rows.length}. ${refFlagged} are far from a reference, ${stockFlagged} have a stock problem` : '' },
        { label: 'Released with a reason', value: rel.length, sublabel: `${open.length} of the ${nFlag} flagged still need a reason` },
      ]} />

      <Tile className="card stack-05">
        <span className="card-heading">
          <span className="card-title">Rules</span>
          <span className="footnote">The limits that decide when a number is held for a reason. Change one and the table updates.</span>
        </span>
        <div className="challenge-bar">
          <Dropdown id="r-model" size="md" titleText="Off the model by more than" label="Model" items={pctItems([0.1, 0.15, 0.2, 0.3])} itemToString={(i: any) => i?.label ?? ''} selectedItem={pctItems([R.model])[0]} onChange={({ selectedItem }) => selectedItem && setR({ ...R, model: selectedItem.id })} />
          <Dropdown id="r-ly" size="md" titleText="Off last year, after the trend, by more than" label="Last year" items={pctItems([0.1, 0.15, 0.25, 0.4])} itemToString={(i: any) => i?.label ?? ''} selectedItem={pctItems([R.ly])[0]} onChange={({ selectedItem }) => selectedItem && setR({ ...R, ly: selectedItem.id })} />
          <Dropdown id="r-l3" size="md" titleText="Off the last three months by more than" label="Last three months" items={pctItems([0.2, 0.3, 0.4, 0.5])} itemToString={(i: any) => i?.label ?? ''} selectedItem={pctItems([R.l3])[0]} onChange={({ selectedItem }) => selectedItem && setR({ ...R, l3: selectedItem.id })} />
          <Dropdown id="r-need" size="md" titleText="Flag when this many of the 3 are off" label="Number" items={[1, 2, 3]} itemToString={(i: number | null) => (i ? `${i} of 3` : '')} selectedItem={R.need} onChange={({ selectedItem }) => selectedItem && setR({ ...R, need: selectedItem })} />
          <Dropdown id="r-min" size="md" titleText="Stock lasts less than (days)" label="Minimum" items={['Norm', 20, 30, 40, 50]} itemToString={(i: any) => (i === 'Norm' ? 'The norm for the family' : i ? `${i} days` : '')} selectedItem={R.min ?? 'Norm'} onChange={({ selectedItem }) => selectedItem && setR({ ...R, min: selectedItem === 'Norm' ? null : (selectedItem as number) })} />
          <Dropdown id="r-max" size="md" titleText="Stock lasts more than (days)" label="Maximum" items={['Norm', 45, 60, 75, 90]} itemToString={(i: any) => (i === 'Norm' ? 'The overstock flag' : i ? `${i} days` : '')} selectedItem={R.max ?? 'Norm'} onChange={({ selectedItem }) => selectedItem && setR({ ...R, max: selectedItem === 'Norm' ? null : (selectedItem as number) })} />
        </div>
        <p className="footnote">The model, last year and the last three months are the three comparisons. For last year the check is against the same month a year ago moved by the recent year-on-year trend, so growth is not mistaken for a surprise. Stock cover is a separate check on next month only, since the stock held today says little about months further out: the family's stock on hand against the family number, using the norm unless you set a limit. Budget is not used here because the data holds no budget for these future months.</p>
      </Tile>

      <div className="stack-03">
        <ContentSwitcher size="sm" selectedIndex={['open', 'flag', 'all'].indexOf(show)} onChange={({ index = 0 }) => setShow((['open', 'flag', 'all'] as const)[index])}>
          <Switch name="open" text="Held for a reason" /><Switch name="flag" text="All flagged" /><Switch name="all" text="All" />
        </ContentSwitcher>
        <DataCard id="chk-q" title="Numbers checked" description={`${shown.length} shown. A flagged number is held until a reason is chosen and it is released. Decisions here are kept for this session only`} cols={cols} rows={shown}
          itemsLabel="Numbers per page" rowKey={(r) => r.key} defaultSort={{ col: 3, dir: 'desc' }}
          note="Red figures are outside their limit. The number is the current one in the conversation for the channel: agreed, or the latest proposal, or the channel's share of the regional total before it is sent. Regional submissions are simulated." />
      </div>

      <Tile className="card stack-05">
        <span className="card-heading">
          <span className="card-title">Try a number</span>
          <span className="footnote">Type a number for a family and channel to see how it would be checked, and which numbers would pass, before it goes into the conversation.</span>
        </span>
        <div className="challenge-bar">
          <Dropdown id="try-k" size="md" titleText="Family and channel" label="Choose" items={rows} itemToString={(i: any) => (i ? `${i.family}, ${i.bu_name}` : '')} selectedItem={tr ?? null} onChange={({ selectedItem }) => { if (selectedItem) { setTryKey(selectedItem.key); setTryVal(undefined) } }} />
          <NumberInput id="try-v" size="md" label="Number (units)" hideSteppers min={0} step={1000} value={val ?? 0} onChange={(_e: unknown, { value }: { value: number | string }) => setTryVal(num(value))} />
        </div>
        {tr && tc ? (
          <>
            <p className="supporting">{tr.family}, {tr.bu_name}: model {fmtN(tr.model)} units, same month last year {fmtN(tr.last_year)}, last three months {fmtN(tr.last3)} a month.</p>
            <StatRow items={[
              { label: 'Against the model', value: <Delta value={tc.dM} text={fmtSigned(tc.dM, 1)} />, sublabel: `Limit ${Math.round(R.model * 100)}%` },
              { label: 'Against last year, after the trend', value: <Delta value={tc.dL} text={fmtSigned(tc.dL, 1)} />, sublabel: tc.yoy === null ? 'No trend' : `Trend ${fmtSigned(tc.yoy, 0)}, limit ${Math.round(R.ly * 100)} points` },
              { label: 'Against the last three months', value: <Delta value={tc.dL3} text={fmtSigned(tc.dL3, 1)} />, sublabel: `Limit ${Math.round(R.l3 * 100)}%` },
              { label: 'Stock lasts (days)', value: tc.cover === null ? '–' : tc.cover.toFixed(0), sublabel: `Between ${(R.min ?? data.stock[tr.family]?.norm_min)?.toFixed(0) ?? '–'} and ${(R.max ?? data.stock[tr.family]?.over_above)?.toFixed(0) ?? '–'}` },
            ]} />
            {tc.flagged
              ? <InlineNotification kind="warning" lowContrast hideCloseButton title="Would be held." subtitle={`${whyOf({ ...tc, family: tr.family, dM: tc.dM, dL: tc.dL, dL3: tc.dL3 }).join('; ')}. A reason is needed before it is released.`} />
              : <InlineNotification kind="success" lowContrast hideCloseButton title="Passes every check." subtitle="It would move on without a reason." />}
            {range ? <p className="supporting">A number from {fmtInt(Math.round(range[0]))} to {fmtInt(Math.round(range[1]))} units is within every limit.</p> : <p className="supporting">No single number is within all three limits at once, so any number needs at least one check to be waived.</p>}
          </>
        ) : null}
      </Tile>
    </div>
  )
}

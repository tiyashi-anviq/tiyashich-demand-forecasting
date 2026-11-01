/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiErrorNotification } from '@reiq/ui'
import { Dropdown, InlineNotification, Tag } from '@reiq/ui/carbon'
import { getJson } from '../../lib/http'
import { fmtInt, fmtN, fmtSigned } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'
import { Delta, StatRow } from '../../ui/StatRow'

const gap = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined && b ? a / b - 1 : null)

/** The numbers decided once the negotiation is over, region by region, channel by channel, SKU by SKU. These are the numbers the
 *  Supply and production plan (production lines, stock transfers) and the depot allocation are checked against. */
export function FinalNumbers({ month, stamp }: { month: string; stamp: number }) {
  const q = useQuery({ queryKey: ['challenge-final', month, stamp], queryFn: () => getJson<any>(`/api/challenge/final?month=${month}`), staleTime: 0 })
  const [fam, setFam] = useState<string | null>(null)
  const [reg, setReg] = useState<string | null>(null)
  if (q.isError) return <ApiErrorNotification error={q.error} fallbackTitle="Could not load the final numbers" />
  const d = q.data
  if (!d) return <p className="supporting">Loading the final numbers...</p>
  const done = d.families.filter((f: any) => f.status === 'agreed')
  const regions = [...new Set<string>(d.lines.map((l: any) => l.region))]
  const lines = d.lines.filter((l: any) => (!fam || l.family === fam) && (!reg || l.region === reg))
  const total = d.lines.reduce((a: number, l: any) => a + l.qty, 0)
  const modelDone = done.reduce((a: number, f: any) => a + f.model, 0)
  const famCols: Col<any>[] = [
    { header: 'Family', cell: (r) => r.family, sort: (r) => r.family },
    { header: 'Model (units)', num: true, cell: (r) => fmtN(r.model), sort: (r) => r.model },
    { header: 'Final number (units)', num: true, cell: (r) => (r.final === null ? '–' : fmtN(r.final)), sort: (r) => r.final ?? 0 },
    { header: 'Against the model (%)', num: true, cell: (r) => (r.final === null ? '–' : <Delta value={gap(r.final, r.model)} text={fmtSigned(gap(r.final, r.model), 1)} />) },
    { header: 'Status', cell: (r) => <Tag size="sm" type={r.status === 'agreed' ? 'green' : r.status === 'negotiating' ? 'teal' : 'gray'}>{r.status === 'agreed' ? 'Final' : r.status === 'negotiating' ? `${r.n_agreed} of ${r.n_units} units agreed` : 'Collecting regions'}</Tag> },
  ]
  const lineCols: Col<any>[] = [
    { header: 'Family', cell: (r) => r.family, sort: (r) => r.family },
    { header: 'Region', cell: (r) => r.region, sort: (r) => r.region },
    { header: 'Channel', cell: (r) => r.channel_name && r.channel_name !== r.channel ? `${r.channel_name} (${r.channel})` : r.channel, sort: (r) => r.channel },
    { header: 'SKU', cell: (r) => r.sku, sort: (r) => r.sku },
    { header: 'Description', cell: (r) => r.description || '–' },
    { header: 'Model (units)', num: true, cell: (r) => fmtInt(r.model), sort: (r) => r.model },
    { header: 'Same month last year (units)', num: true, cell: (r) => fmtInt(r.last_year), sort: (r) => r.last_year },
    { header: 'Final number (units)', num: true, cell: (r) => fmtInt(r.qty), sort: (r) => r.qty },
    { header: 'Against the model (%)', num: true, cell: (r) => <Delta value={gap(r.qty, r.model)} text={fmtSigned(gap(r.qty, r.model), 1)} /> },
  ]
  return (
    <div className="stack-05">
      <InlineNotification kind={done.length ? 'success' : 'info'} lowContrast hideCloseButton
        title={done.length ? `${done.length} of ${d.families.length} families are final.` : 'No family is final yet.'}
        subtitle="A family appears below once every business unit has agreed it. The Supply and production plan checks the production lines and stock transfers against these numbers, and the Depots view splits them by depot." />
      <StatRow items={[
        { label: 'Final families', value: `${done.length} of ${d.families.length}`, sublabel: 'All units agreed' },
        { label: 'Final number (units)', value: fmtN(total), sublabel: 'Across the final families' },
        { label: 'Against the model', value: <Delta value={gap(total, modelDone)} text={fmtSigned(gap(total, modelDone), 1)} />, sublabel: `Model ${fmtN(modelDone)}` },
        { label: 'Lines', value: fmtInt(d.lines.length), sublabel: 'Region, channel and SKU' },
      ]} />
      <DataCard id="fin-fam" title="Families" description="Where each family stands" cols={famCols} rows={d.families} itemsLabel="Families per page" rowKey={(r) => r.family} />
      {d.lines.length > 0 && (
        <>
          <div className="challenge-bar">
            <Dropdown id="fin-f" size="md" titleText="Family" label="Family" items={['All families', ...done.map((f: any) => f.family)]} itemToString={(i: string | null) => i ?? ''} selectedItem={fam ?? 'All families'} onChange={({ selectedItem }) => setFam(selectedItem === 'All families' ? null : selectedItem)} />
            <Dropdown id="fin-r" size="md" titleText="Region" label="Region" items={['All regions', ...regions]} itemToString={(i: string | null) => i ?? ''} selectedItem={reg ?? 'All regions'} onChange={({ selectedItem }) => setReg(selectedItem === 'All regions' ? null : selectedItem)} />
          </div>
          <DataCard id="fin-lines" title="Final numbers, line by line" description="Every region, channel and SKU of the final families" cols={lineCols} rows={lines} itemsLabel="Lines per page" rowKey={(r) => `${r.family}|${r.key}`} defaultSort={{ col: 7, dir: 'desc' }} />
        </>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { ApiErrorNotification, PageSection } from '@reiq/ui'
import { Accordion, AccordionItem, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tag, Toggle } from '@reiq/ui/carbon'
import type { Batch, DataType, Group } from '../../types'
import { api } from '../../api'
import { fmtInt, fmtRows } from '../../lib/format'
import { StatRow } from '../../ui/StatRow'
import MappingDrawer from './MappingDrawer'

function GroupTable({ groups, onToggle, onReview }: { groups: Group[]; onToggle: (g: Group, on: boolean) => void; onReview: (id: string) => void }) {
  return (
    <div className="table-scroll thin-scroll column-mapping-scroll">
      <Table size="md" aria-label="Tables and how they matched" className="column-mapping-table">
        <TableHead>
          <TableRow>
            <TableHeader>Table</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Include</TableHeader>
            <TableHeader>Action</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.map((g) => (
            <TableRow key={g.id}>
              <TableCell>
                <div className="stack-03">
                  <span>{g.name}</span>
                  <span className="footnote">{g.sheet_names.length > 1 ? `${g.sheet_names.length} sheets, ` : ''}{fmtRows(g.rows)}, from {g.source_file}</span>
                  {g.include && !g.ok && <span className="footnote">Choose a column for {g.missing.join(', ')}.</span>}
                </div>
              </TableCell>
              <TableCell>
                {!g.include ? <Tag type="gray" size="sm">Left out</Tag> : g.ok ? <Tag type="green" size="sm">Matched</Tag> : <Tag type="red" size="sm">Needs a look</Tag>}
              </TableCell>
              <TableCell>
                <Toggle id={`inc-${g.id}`} size="sm" hideLabel labelText={`Include ${g.name}`} labelA="Left out" labelB="Included" toggled={g.include}
                  onToggle={(v: boolean) => onToggle(g, v)} />
              </TableCell>
              <TableCell><Button kind="ghost" size="sm" onClick={() => onReview(g.id)}>Review {g.name}</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function MapColumns({ batchId, batch, types, refresh, onInvalidate }: {
  batchId: string; batch: Batch; types: DataType[]; refresh: () => Promise<void>; onInvalidate: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  const byType = useMemo(() => {
    const m: Record<string, Group[]> = {}
    for (const g of batch.groups) (m[g.type] ??= []).push(g)
    return m
  }, [batch.groups])

  const used = types.filter((t) => t.key !== 'reference' && (byType[t.key]?.length ?? 0) > 0)
  const ignored = batch.groups.filter((g) => g.type === 'reference')
  const included = batch.groups.filter((g) => g.include && g.type !== 'reference')
  const needLook = included.filter((g) => !g.ok)
  const rowsIncluded = included.reduce((a, g) => a + g.rows, 0)

  async function toggle(g: Group, on: boolean) {
    setError(null)
    try { await api.editGroup(batchId, g.id, { include: on }); onInvalidate(); await refresh() } catch (e) { setError(e) }
  }
  const edGroup = batch.groups.find((g) => g.id === editing)

  return (
    <div className="stack-05">
      <PageSection title="Match your columns" note="Your tables are matched to the data the forecast needs. Open a group only if it says it needs a look, or if something is wrong.">
        <StatRow items={[
          { label: 'Tables included', value: included.length },
          { label: 'Rows in total', value: fmtInt(rowsIncluded) },
          { label: 'Need a look', value: needLook.length, sublabel: needLook.length ? 'Choose the missing columns' : 'Every included table is matched' },
        ]} />
      </PageSection>

      {error ? <ApiErrorNotification error={error} fallbackTitle="Could not change this table" /> : null}

      <Accordion>
        {used.map((t) => {
          const gs = byType[t.key].filter((g) => g.type !== 'reference')
          const bad = gs.filter((g) => g.include && !g.ok).length
          return (
            <AccordionItem key={t.key} open={t.core || bad > 0}
              title={<span className="row-03">{t.label}{t.core && <Tag type="blue" size="sm">Needed</Tag>}
                {bad > 0 ? <Tag type="red" size="sm">{`${bad} need a look`}</Tag> : <Tag type="green" size="sm">All matched</Tag>}
                <span className="footnote">{gs.length} table{gs.length === 1 ? '' : 's'}. {t.help}</span></span>}>
              <GroupTable groups={gs} onToggle={(g, on) => void toggle(g, on)} onReview={setEditing} />
            </AccordionItem>
          )
        })}
        {ignored.length > 0 && (
          <AccordionItem title={<span className="row-03">Not used by the forecast<span className="footnote">{ignored.length} table{ignored.length === 1 ? '' : 's'}: notes, dictionaries and scenario lists. Left out unless you change them.</span></span>}>
            <GroupTable groups={ignored} onToggle={(g, on) => void toggle(g, on)} onReview={setEditing} />
          </AccordionItem>
        )}
      </Accordion>

      {edGroup && (
        <MappingDrawer batchId={batchId} group={edGroup} types={types} onClose={() => setEditing(null)}
          onSaved={() => { onInvalidate(); void refresh() }} />
      )}
    </div>
  )
}

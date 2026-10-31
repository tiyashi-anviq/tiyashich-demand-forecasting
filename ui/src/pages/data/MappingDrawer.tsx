import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiErrorNotification, PendingLabel, SettingsDrawer } from '@reiq/ui'
import { Accordion, AccordionItem, Button, InlineLoading, Select, SelectItem, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tag } from '@reiq/ui/carbon'
import type { DataType, Group } from '../../types'
import { api } from '../../api'
import { fmtRows } from '../../lib/format'

/** Side panel where the user confirms what a table is and which of their columns fills each field. */
export default function MappingDrawer({ batchId, group, types, onClose, onSaved }: {
  batchId: string; group: Group; types: DataType[]; onClose: () => void; onSaved: () => void
}) {
  const [g, setG] = useState<Group>(group)
  const [mapping, setMapping] = useState<Record<string, string | null>>(group.mapping)
  const [saving, setSaving] = useState(false)
  const [busyType, setBusyType] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const preview = useQuery({ queryKey: ['preview', batchId, g.id], queryFn: () => api.preview(batchId, g.id), retry: false })

  useEffect(() => { setError(null) }, [g.id])

  const type = types.find((t) => t.key === g.type)!
  const required = type.fields.filter((f) => f.required)
  const optional = type.fields.filter((f) => !f.required)
  const colByName = Object.fromEntries(g.columns.map((c) => [c.name, c]))

  async function changeType(key: string) {
    setBusyType(true); setError(null)
    try {
      const r = await api.editGroup(batchId, g.id, { type: key })
      setG(r.group); setMapping(r.group.mapping)
    } catch (e) { setError(e) } finally { setBusyType(false) }
  }

  function choose(field: string, col: string) {
    setMapping((m) => {
      const next = { ...m }
      if (col) for (const k of Object.keys(next)) if (next[k] === col) next[k] = null // a column can only fill one field
      next[field] = col || null
      return next
    })
  }

  async function save() {
    setSaving(true); setError(null)
    try {
      await api.editGroup(batchId, g.id, { mapping })
      onSaved(); onClose()
    } catch (e) { setError(e); setSaving(false) }
  }

  const missing = required.filter((f) => !mapping[f.key]).map((f) => f.label)
  const mappedCols = new Set(Object.values(mapping).filter(Boolean) as string[])

  const field = (f: DataType['fields'][number]) => {
    const col = mapping[f.key]
    const eg = col ? colByName[col]?.samples?.join(', ') : ''
    return (
      <div className="mapping-field" key={f.key}>
        <Select id={`f-${f.key}`} size="md" labelText={f.required ? `${f.label} (needed)` : f.label}
          helperText={eg ? `${f.help} Example values: ${eg}` : f.help} value={col ?? ''} onChange={(e) => choose(f.key, e.target.value)}
          invalid={f.required && !col} invalidText="The forecast needs this. Pick a column.">
          <SelectItem value="" text={f.required ? 'Choose a column' : 'Not in my file'} />
          {g.columns.map((c) => <SelectItem key={c.name} value={c.name} text={c.name} />)}
        </Select>
      </div>
    )
  }

  return (
    <SettingsDrawer open title={g.name} onClose={onClose}
      subtitle={`${g.sheet_names.length > 1 ? `${g.sheet_names.length} sheets joined` : '1 sheet'}, ${fmtRows(g.rows)}, from ${g.source_file}`}
      footer={
        <>
          {missing.length > 0 && <span className="wizard-footer-note">Still needed: {missing.join(', ')}</span>}
          <Button kind="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button kind="primary" size="md" onClick={() => void save()} disabled={busyType}><PendingLabel pending={saving} idle="Save columns" busy="Saving columns..." /></Button>
        </>
      }>
      <div className="stack-05">
        {error ? <ApiErrorNotification error={error} fallbackTitle="Could not save these columns" /> : null}
        <Select id="dtype" size="md" labelText="What is this data?" helperText={type.help} value={g.type} disabled={busyType} onChange={(e) => void changeType(e.target.value)}>
          {types.map((t) => <SelectItem key={t.key} value={t.key} text={t.label} />)}
        </Select>
        {busyType && <InlineLoading description="Matching columns..." />}

        {type.fields.length === 0 ? (
          <p className="supporting">This table is kept for reference. The forecast does not use it, so there is nothing to match.</p>
        ) : (
          <>
            {required.length > 0 && <h3 className="card-title-sm">What the forecast needs</h3>}
            {required.map(field)}
            {optional.length > 0 && (
              <Accordion>
                <AccordionItem open={required.length === 0} title={required.length ? `More fields (${optional.length})` : `Fields (${optional.length})`}>
                  {optional.map(field)}
                </AccordionItem>
              </Accordion>
            )}
          </>
        )}

        <Accordion>
          <AccordionItem title="Sample rows">
            {preview.isPending ? <InlineLoading description="Loading sample rows..." />
              : preview.isError ? <ApiErrorNotification error={preview.error} fallbackTitle="Could not load sample rows" onRetry={() => void preview.refetch()} />
                : (
                  <div className="mapping-sample table-scroll thin-scroll">
                    <Table size="sm" aria-label="Sample rows">
                      <TableHead><TableRow>{preview.data.columns.map((c) => (
                        <TableHeader key={c}>{c}{mappedCols.has(c) ? <> <Tag type="green" size="sm">Matched</Tag></> : null}</TableHeader>
                      ))}</TableRow></TableHead>
                      <TableBody>{preview.data.rows.map((r, i) => (
                        <TableRow key={i}>{preview.data.columns.map((c) => <TableCell key={c}>{r[c] ?? ''}</TableCell>)}</TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                )}
          </AccordionItem>
        </Accordion>
      </div>
    </SettingsDrawer>
  )
}

import { useState } from 'react'
import { Document } from '@carbon/icons-react'
import { ApiErrorNotification, EmptyState, PageSection } from '@reiq/ui'
import { Button, ContentSwitcher, FileUploaderDropContainer, InlineLoading, InlineNotification, Switch, Tag, Tile } from '@reiq/ui/carbon'
import { Close } from '@carbon/icons-react'
import type { Batch, Source } from '../../types'
import { uploadFile } from '../../api'
import { fmtRows, fmtSize } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'

type Pending = { key: string; name: string; size: number; pct: number; error?: string }
type Row = {
  key: string; name: string; size: number; kind: 'uploading' | 'queued' | 'reading' | 'done' | 'error'
  pct?: number; contents: string; fid?: string; busy: boolean
}

const ACCEPT = ['.xlsx', '.xlsm', '.xls', '.csv']
const OK_EXT = /\.(xlsx|xlsm|xls|csv)$/i

export default function AddFiles({ batch, sources, ensureBatch, refresh, onRemove }: {
  batch: Batch | null
  sources: Source[]
  ensureBatch: () => Promise<string>
  refresh: (id?: string) => Promise<void>
  onRemove: (fid: string) => void
}) {
  const [pending, setPending] = useState<Pending[]>([])
  const [view, setView] = useState<'upload' | 'sources'>('upload')
  const [notice, setNotice] = useState<string | null>(null)
  const [startError, setStartError] = useState<unknown>(null)

  async function add(files: File[]) {
    setNotice(null); setStartError(null)
    const bad = files.filter((f) => !OK_EXT.test(f.name))
    if (bad.length) setNotice(`${bad.map((b) => b.name).join(', ')} ${bad.length > 1 ? 'are' : 'is'} not an Excel or CSV file, so ${bad.length > 1 ? 'they were' : 'it was'} skipped. Add an .xlsx, .xls or .csv file instead.`)
    const ok = files.filter((f) => OK_EXT.test(f.name))
    if (!ok.length) return
    let id: string
    try { id = await ensureBatch() } catch (e) { setStartError(e); return }
    const rows: Pending[] = ok.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, size: f.size, pct: 0 }))
    setPending((p) => [...p, ...rows])
    await Promise.all(ok.map(async (f, i) => {
      const key = rows[i].key
      try {
        await uploadFile(id, f, (pct) => setPending((p) => p.map((x) => (x.key === key ? { ...x, pct } : x))))
        await refresh(id)
        setPending((p) => p.filter((x) => x.key !== key))
      } catch (e) {
        setPending((p) => p.map((x) => (x.key === key ? { ...x, error: (e as Error).message } : x)))
      }
    }))
  }

  const rows: Row[] = [
    ...[...(batch?.files ?? [])].sort((x, y) => x.name.localeCompare(y.name)).map((f): Row => ({
      key: f.id, name: f.name, size: f.size, fid: f.id,
      kind: f.status === 'done' ? 'done' : f.status === 'error' ? 'error' : f.status === 'queued' ? 'queued' : 'reading',
      busy: f.status === 'queued' || f.status === 'reading',
      pct: Math.round((f.progress || 0) * 100),
      contents: f.status === 'done' ? `${f.sheets} sheet${f.sheets === 1 ? '' : 's'}, ${fmtRows(f.rows)}`
        : f.status === 'reading' ? (f.sheets_total ? `Reading sheet ${Math.min((f.sheets_done ?? 0) + 1, f.sheets_total)} of ${f.sheets_total}` : 'Reading')
          : f.status === 'error' ? (f.error ?? 'The file could not be read. Remove it and add it again.') : '',
    })),
    ...pending.map((p): Row => ({ key: p.key, name: p.name, size: p.size, kind: p.error ? 'error' : 'uploading', pct: p.pct, contents: p.error ?? '', busy: false })),
  ]

  const cols: Col<Row>[] = [
    { header: 'File', cell: (r) => <span className="row-03"><Document size={16} aria-hidden="true" />{r.name}</span>, sort: (r) => r.name.toLowerCase() },
    { header: 'Size', num: true, cell: (r) => fmtSize(r.size), sort: (r) => r.size },
    { header: 'Contents', cell: (r) => r.contents },
    { header: 'Status', cell: (r) =>
      r.kind === 'done' ? <Tag type="green" size="sm">Read</Tag>
        : r.kind === 'error' ? <Tag type="red" size="sm">Failed</Tag>
          : r.kind === 'queued' ? <InlineLoading description="Waiting" />
            : r.kind === 'reading' ? <InlineLoading description={`Reading ${r.pct ?? 0}%`} />
              : <InlineLoading description={`Uploading ${r.pct ?? 0}%`} /> },
    { header: 'Action', cell: (r) => (
      <Button kind="ghost" size="sm" hasIconOnly renderIcon={Close} iconDescription={`Remove ${r.name}`} disabled={r.busy}
        onClick={() => (r.fid ? onRemove(r.fid) : setPending((x) => x.filter((y) => y.key !== r.key)))} />
    ) },
  ]

  const groups = ['Internal systems', 'External signals']

  return (
    <div className="stack-05">
      <PageSection title="Add your files" note="Drop the workbooks you were given. Every sheet is read, so you can add them all at once.">
        <ContentSwitcher size="sm" selectedIndex={view === 'upload' ? 0 : 1} onChange={({ index }) => setView(index === 1 ? 'sources' : 'upload')}>
          <Switch name="upload" text="Upload files" />
          <Switch name="sources" text="Connected sources" />
        </ContentSwitcher>
      </PageSection>

      {view === 'upload' ? (
        <>
          <FileUploaderDropContainer id="data-files" multiple accept={ACCEPT} name="files"
            labelText="Drag files here, or select to browse"
            onAddFiles={(_e: unknown, { addedFiles }: { addedFiles: File[] }) => void add(addedFiles)} />
          <p className="footnote">Excel (.xlsx, .xls) or CSV. Several files at once, up to 600 MB each.</p>
          {notice && <InlineNotification kind="warning" lowContrast hideCloseButton title="Some files were skipped." subtitle={notice} />}
          {startError ? <ApiErrorNotification error={startError} fallbackTitle="Could not start adding files" /> : null}
          {rows.length > 0 && (
            <div aria-live="polite">
              <DataCard id="files" title="Files added" description={`${rows.length} file${rows.length === 1 ? '' : 's'} in this batch`}
                cols={cols} rows={rows} itemsLabel="Files per page" rowKey={(r) => r.key} />
            </div>
          )}
        </>
      ) : (
        <div className="stack-05">
          <InlineNotification kind="info" lowContrast hideCloseButton title="Live connections are not wired in this demo."
            subtitle="In production these systems feed data in directly. For now, export from them and add the file on the Upload files view." />
          {sources.length === 0 && <EmptyState inline icon={Document} title="No connectors are listed" message="Add the files by hand on the Upload files view." />}
          {groups.map((g) => (
            <PageSection key={g} title={g}>
              <div className="source-grid">
                {sources.filter((s) => s.group === g).map((s) => (
                  <Tile className="card" key={s.id}>
                    <h3 className="card-title-sm">{s.name}</h3>
                    <p className="supporting">{s.what}</p>
                    {s.mode === 'demo'
                      ? <Tag type="gray" size="sm">Demo connector, not connected</Tag>
                      : <Button kind="tertiary" size="sm" onClick={() => setView('upload')}>Add as a file</Button>}
                  </Tile>
                ))}
              </div>
            </PageSection>
          ))}
        </div>
      )}
    </div>
  )
}

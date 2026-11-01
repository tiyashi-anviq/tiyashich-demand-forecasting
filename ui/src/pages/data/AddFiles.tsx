import { Document } from '@carbon/icons-react'
import { EmptyState, PageSection } from '@reiq/ui'
import { Button, InlineLoading, Tag } from '@reiq/ui/carbon'
import { Close } from '@carbon/icons-react'
import type { Batch } from '../../types'
import { getFile, getSystem } from '../../lib/datasources.config'
import { fmtRows, fmtSize } from '../../lib/format'
import { DataCard, type Col } from '../../ui/DataCard'

type Row = {
  key: string; name: string; size: number | null; kind: 'queued' | 'reading' | 'done' | 'error' | 'linked'
  pct?: number; contents: string; fid?: string; datasourceId?: string; busy: boolean
}

type LinkedDatasource = { id: string; file_key: string; name: string; system_key: string }

export default function AddFiles({ batch, onRemove, linkedDatasources, onRemoveDatasource }: {
  batch: Batch | null
  onRemove: (fid: string, datasourceId?: string) => void
  linkedDatasources: LinkedDatasource[]
  onRemoveDatasource: (id: string) => void
}) {
  const uploadedNames = new Set((batch?.files ?? []).map((file) => file.name.toLowerCase()))
  const rows: Row[] = [
    ...linkedDatasources.filter((datasource) => !uploadedNames.has(`${datasource.file_key}.xlsx`.toLowerCase())).map((datasource): Row => ({
      key: datasource.id,
      name: getFile(datasource.file_key)?.name ?? datasource.name,
      size: null,
      kind: 'linked',
      contents: `Demo connection · ${getSystem(datasource.system_key)?.name ?? datasource.system_key}`,
      datasourceId: datasource.id,
      busy: false,
    })),
    ...[...(batch?.files ?? [])].sort((x, y) => x.name.localeCompare(y.name)).map((f): Row => ({
      key: f.id, name: f.name, size: f.size, fid: f.id,
      datasourceId: linkedDatasources.find((datasource) => `${datasource.file_key}.xlsx`.toLowerCase() === f.name.toLowerCase())?.id,
      kind: f.status === 'done' ? 'done' : f.status === 'error' ? 'error' : f.status === 'queued' ? 'queued' : 'reading',
      busy: f.status === 'queued' || f.status === 'reading',
      pct: Math.round((f.progress || 0) * 100),
      contents: f.status === 'done' ? `${f.sheets} sheet${f.sheets === 1 ? '' : 's'}, ${fmtRows(f.rows)}`
        : f.status === 'reading' ? (f.sheets_total ? `Reading sheet ${Math.min((f.sheets_done ?? 0) + 1, f.sheets_total)} of ${f.sheets_total}` : 'Reading')
          : f.status === 'error' ? (f.error ?? 'The file could not be read. Remove it and add it again.') : '',
    })),
  ]

  const cols: Col<Row>[] = [
    { header: 'File', cell: (r) => <span className="row-03"><Document size={16} aria-hidden="true" />{r.name}</span>, sort: (r) => r.name.toLowerCase() },
    { header: 'Size', num: true, cell: (r) => r.size === null ? '—' : fmtSize(r.size), sort: (r) => r.size },
    { header: 'Contents', cell: (r) => r.contents },
    { header: 'Status', cell: (r) =>
      r.kind === 'done' ? <Tag type="green" size="sm">Read</Tag>
        : r.kind === 'linked' ? <Tag type="green" size="sm">Linked</Tag>
        : r.kind === 'error' ? <Tag type="red" size="sm">Failed</Tag>
          : r.kind === 'queued' ? <InlineLoading description="Waiting" />
            : <InlineLoading description={`Reading ${r.pct ?? 0}%`} /> },
    { header: 'Action', cell: (r) => (
      <Button kind="ghost" size="sm" hasIconOnly renderIcon={Close} iconDescription={`Remove ${r.name}`} disabled={r.busy}
        onClick={() => {
          if (r.fid) onRemove(r.fid, r.datasourceId)
          else if (r.datasourceId) onRemoveDatasource(r.datasourceId)
        }} />
    ) },
  ]

  return (
    <div className="stack-05">
      <PageSection title="Files" note="Files linked from a datasource are read here and continue through the existing preprocessing flow.">
        {rows.length > 0 ? (
          <div aria-live="polite">
            <DataCard id="files" title="Linked files" description={`${rows.length} file${rows.length === 1 ? '' : 's'} in this batch`}
              cols={cols} rows={rows} itemsLabel="Files per page" rowKey={(r) => r.key} />
          </div>
        ) : (
          <EmptyState inline icon={Document} title="No files linked" message="Use Link Datasource to add workbooks for reading and preprocessing." />
        )}
      </PageSection>
    </div>
  )
}

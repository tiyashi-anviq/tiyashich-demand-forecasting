/** File list: shows files a system can supply, with Add/Remove buttons. */
import { useState } from 'react'
import { Button, Tile, Tag, InlineNotification } from '@reiq/ui/carbon'
import { ArrowLeft, Add, Move } from '@carbon/icons-react'
import { getSystem, getFile } from '../../../lib/datasources.config'

interface FileRowProps {
  file: { key: string; name: string; description: string; tables: { name: string; origin: string }[] }
  added: boolean
  onToggle: (fileKey: string) => void
}

function FileRow({ file, added, onToggle }: FileRowProps) {
  const manualTables = file.tables.filter((t) => t.origin === 'manual')
  return (
    <Tile className="card file-row">
      <div className="row-between">
        <div className="stack-02">
          <div className="card-title-row">
            <span className="card-title-sm">{file.name}</span>
            {manualTables.length > 0 && <Tag type="gray" size="sm" title="Manual / external tables">Manual</Tag>}
          </div>
          <p className="footnote">{file.description} · {file.tables.length} table{file.tables.length === 1 ? '' : 's'}</p>
        </div>
        <Button kind={added ? 'tertiary' : 'primary'} size="sm" onClick={() => onToggle(file.key)} renderIcon={added ? Move : Add}>
          {added ? 'Remove' : 'Add'}
        </Button>
      </div>
      {manualTables.length > 0 && (
        <p className="footnote" style={{ marginTop: '0.5rem' }}>
          Tables added manually / externally: {manualTables.map((t) => t.name).join(', ')}
        </p>
      )}
    </Tile>
  )
}

interface FileListProps {
  systemKey: string
  onBack: () => void
  onConfigure: (addedFiles: string[]) => void
}

export default function FileList({ systemKey, onBack, onConfigure }: FileListProps) {
  const [addedFiles, setAddedFiles] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const system = getSystem(systemKey)
  const files = system ? system.files.map((k) => getFile(k)).filter(Boolean) : []

  if (!system) {
    return (
      <div className="stack-05">
        <h2 className="card-title-sm">System not found</h2>
        <p className="footnote">The requested source system does not exist.</p>
        <Button kind="secondary" size="md" onClick={onBack}>Back</Button>
      </div>
    )
  }

  return (
    <div className="stack-05">
      <div className="row-between">
        <div className="card-heading">
          <span className="card-title-sm">{system.name}</span>
          <p className="footnote">Files {system.name} can supply</p>
        </div>
        <Button kind="ghost" size="md" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" style={{ marginRight: '0.25rem' }} />
          Back to platforms
        </Button>
      </div>
      {error && <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton onClose={() => setError(null)} />}

      <div className="stack-03">
        {files.map((file) => {
          if (!file) return null
          return (
            <FileRow key={file.key} file={file} added={addedFiles.has(file.key)} onToggle={(key) => {
              setAddedFiles((prev) => {
                const next = new Set(prev)
                if (next.has(key)) next.delete(key)
                else next.add(key)
                return next
              })
            }} />
          )
        })}
      </div>

      {addedFiles.size > 0 && (
        <div className="row-between" style={{ marginTop: '1rem' }}>
          <span className="footnote">{addedFiles.size} file{addedFiles.size > 1 ? 's' : ''} selected</span>
          <Button kind="primary" size="md" renderIcon={Add} onClick={() => onConfigure(Array.from(addedFiles))}>
            Configure connection
          </Button>
        </div>
      )}
    </div>
  )
}

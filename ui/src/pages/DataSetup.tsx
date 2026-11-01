import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiErrorNotification, ModulePageHeader, useToast, PageSection } from '@reiq/ui'
import { Button, Modal, Tile } from '@reiq/ui/carbon'
import { DataBase } from '@carbon/icons-react'
import { MODULE } from '../App'
import { api } from '../api'
import type { Batch } from '../types'
import { SystemPicker } from './components/datasources/SystemPicker'
import FileList from './components/datasources/FileList'
import ConnectionWizard from './components/datasources/ConnectionWizard'

function StatCard({ title, value, sublabel, Icon }: { title: string; value: React.ReactNode; sublabel?: string; Icon?: React.ElementType }) {
  const IconCmp = Icon
  return (
    <Tile className="card">
      <div className="card-heading">
        <div className="card-title-row">
          {IconCmp && <IconCmp size={16} aria-hidden="true" style={{ marginRight: '0.5rem' }} />}
          <span className="card-title-sm">{title}</span>
        </div>
        {sublabel && <p className="footnote">{sublabel}</p>}
      </div>
      <div className="stack-03" style={{ marginTop: '0.75rem' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--reiq-text-primary)' }}>{value}</span>
      </div>
    </Tile>
  )
}

/** Welcome hero card shown when no data is loaded yet. */
function WelcomeCard({ onLink }: { onLink: () => void }) {
  return (
    <Tile className="card">
      <div className="card-heading">
        <div className="card-title-row">
          <DataBase size={20} aria-hidden="true" style={{ marginRight: '0.5rem' }} />
          <span className="card-title-sm">No data sources linked yet</span>
        </div>
      </div>
      <div className="stack-03" style={{ marginTop: '0.75rem' }}>
        <p className="supporting">Link a source system to bring in sales, inventory, master and supply data. Downstream pages read from the resulting tables.</p>
        <div className="row-03">
          <Button kind="primary" size="md" onClick={onLink}>Link Datasource</Button>
        </div>
      </div>
    </Tile>
  )
}

/** Status summary card showing current batch state. */
function StatusCard({ batch }: { batch: Batch | null }) {
  const files = batch?.files ?? []
  const done = files.filter((f) => f.status === 'done').length
  const reading = files.filter((f) => f.status === 'queued' || f.status === 'reading').length
  const error = files.filter((f) => f.status === 'error').length
  const total = files.length

  return (
    <Tile className="card">
      <div className="card-heading">
        <div className="card-title-row">
          <DataBase size={16} aria-hidden="true" style={{ marginRight: '0.5rem' }} />
          <span className="card-title-sm">File status</span>
        </div>
      </div>
      <div className="stack-03" style={{ marginTop: '0.75rem' }}>
        <div className="grid g2">
          <StatCard title="Files" value={total} sublabel={done > 0 ? `${done} read` : 'None yet'} Icon={DataBase} />
          <StatCard title="Reading" value={reading || '–'} sublabel="Still being processed" />
          <StatCard title="Errors" value={error || '–'} sublabel={error > 0 ? 'Remove and re-add' : 'All clear'} />
        </div>
      </div>
    </Tile>
  )
}

export default function DataSetup() {
  const qc = useQueryClient()
  const go = useNavigate()
  const { showToast } = useToast()
  const schema = useQuery({ queryKey: ['schema'], queryFn: api.schema, staleTime: Infinity })
  const ws = useQuery({ queryKey: ['workspace'], queryFn: api.workspace, staleTime: 0 })
  const latest = useQuery({ queryKey: ['batch-latest'], queryFn: api.latestBatch, staleTime: 0 })

  const [batchId, setBatchId] = useState<string | null>(null)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [resetError, setResetError] = useState<unknown>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [datasourceMode, setDatasourceMode] = useState<'none' | 'system-picker' | 'file-list' | 'wizard'>('none')
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const adopted = useRef(false)

  // Pick up a batch that was started earlier, once, so a reload does not lose the user's work.
  useEffect(() => {
    if (adopted.current || !latest.data) return
    adopted.current = true
    const id = latest.data.id
    if (id) { setBatchId(id); void api.batch(id).then(setBatch).catch(() => undefined) }
  }, [latest.data])

  const refresh = useCallback(async (id?: string) => {
    const use = id ?? batchId
    if (!use) return
    setBatch(await api.batch(use))
  }, [batchId])

  // Keep polling while any file is still being read.
  const reading = batch?.files.some((f) => f.status === 'queued' || f.status === 'reading') ?? false
  useEffect(() => {
    if (!reading) return
    const t = setInterval(() => void refresh(), 1000)
    return () => clearInterval(t)
  }, [reading, refresh])

  async function replace() {
    setConfirmReplace(false); setResetError(null)
    try {
      await api.resetWorkspace()
      setBatch(null); setBatchId(null); setReplacing(true)
      await qc.invalidateQueries({ queryKey: ['workspace'] })
      showToast('success', 'Data removed', 'Add the new files to load them.')
    } catch (e) { setResetError(e) }
  }

  const loaded = !!ws.data?.loaded && !replacing

  const header = (
    <ModulePageHeader moduleLabel={MODULE} title="Data setup"
      description={loaded ? 'Your data is loaded and ready for Explore and Forecasts.' : 'Link a source system to bring in sales, inventory, master and supply data.'}
      actions={loaded ? (
        <>
          <Button kind="tertiary" size="md" onClick={() => setConfirmReplace(true)}>Replace data</Button>
          <Button kind="primary" size="md" onClick={() => go('/explore')}>Explore your data</Button>
        </>
      ) : undefined} />
  )

  if (schema.isPending || ws.isPending || latest.isPending) {
    return <>{header}<div role="status" aria-busy="true" aria-label="Loading data setup"><span style={{ fontSize: '14px', color: 'var(--reiq-text-secondary)' }}>Loading data setup…</span></div></>
  }
  const fatal = schema.error ?? ws.error ?? latest.error
  if (fatal) {
    return <>{header}<ApiErrorNotification error={fatal} fallbackTitle="Could not open data setup" onRetry={() => { void schema.refetch(); void ws.refetch(); void latest.refetch() }} /></>
  }

  return (
    <>
      {header}
      <div className="stack-05">
        {resetError ? <ApiErrorNotification error={resetError} fallbackTitle="That did not work" /> : null}

        {/* Home screen when no data loaded yet */}
        {!loaded && !batch?.files?.length && datasourceMode === 'none' && (
          <div className="grid">
            <WelcomeCard onLink={() => setDatasourceMode('system-picker')} />
            {batch && <StatusCard batch={batch} />}
          </div>
        )}

        {/* Status bar when files exist but not loaded */}
        {!loaded && batch?.files?.length && datasourceMode === 'none' && (
          <div className="stack-03">
            <StatusCard batch={batch} />
          </div>
        )}

        {/* Datasource system picker */}
        {datasourceMode === 'system-picker' && (
          <SystemPicker onClose={() => setDatasourceMode('none')} onSelectSystem={(key: string) => {
            setSelectedSystem(key)
            setDatasourceMode('file-list')
          }} />
        )}

        {/* Datasource file list */}
        {datasourceMode === 'file-list' && selectedSystem && (
          <div className="stack-05">
            <div className="row-between">
              <Button kind="ghost" size="md" onClick={() => setDatasourceMode('system-picker')}>
                Back to platforms
              </Button>
            </div>
            <FileList systemKey={selectedSystem} onBack={() => setDatasourceMode('system-picker')} onConfigure={(addedFiles: string[]) => {
              setSelectedFiles(addedFiles)
              setDatasourceMode('wizard')
            }} />
          </div>
        )}

        {/* Datasource connection wizard */}
        {datasourceMode === 'wizard' && selectedSystem && (
          <div className="stack-05">
            <div className="row-between">
              <Button kind="ghost" size="md" onClick={() => setDatasourceMode('file-list')}>
                Back to files
              </Button>
            </div>
            <ConnectionWizard onClose={() => setDatasourceMode('none')} onComplete={() => {
              setDatasourceMode('none')
              setSelectedSystem(null)
              setSelectedFiles([])
            }} systemKey={selectedSystem} selectedFiles={selectedFiles} />
          </div>
        )}

        {loaded && ws.data ? (
          <div className="stack-05">
            <PageSection title="Loaded and ready for forecasting">
              <div className="grid g2">
                <StatCard title="Tables" value={ws.data.tables?.length ?? 0} />
                <StatCard title="Rows" value={ws.data.tables?.reduce((a, t) => a + (t.rows ?? 0), 0) ?? 0} />
              </div>
            </PageSection>
            <div className="row-03">
              <Button kind="primary" size="md" onClick={() => go('/explore')}>Explore your data</Button>
            </div>
          </div>
        ) : null}
      </div>

      <Modal open={confirmReplace} danger size="sm" modalHeading="Replace the loaded data?" primaryButtonText="Replace data" secondaryButtonText="Cancel"
        onRequestClose={() => setConfirmReplace(false)} onRequestSubmit={() => void replace()} onSecondarySubmit={() => setConfirmReplace(false)}>
        <p>This removes the loaded data, the Explore views and the forecasts built from it. Your original files are not changed.</p>
      </Modal>
    </>
  )
}

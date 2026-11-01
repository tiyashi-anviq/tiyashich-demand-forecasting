import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiErrorNotification, ModulePageHeader, useToast } from '@reiq/ui'
import { Button, InlineNotification, Modal, Tile } from '@reiq/ui/carbon'
import { DataBase } from '@carbon/icons-react'
import { MODULE } from '../App'
import { api } from '../api'
import { getFile } from '../lib/datasources.config'
import type { Batch, ConfirmState, Quality, Workspace } from '../types'
import { SystemPicker } from './components/datasources/SystemPicker'
import FileList from './components/datasources/FileList'
import AddFiles from './data/AddFiles'
import MapColumns from './data/MapColumns'
import CheckQuality from './data/CheckQuality'
import LoadStep from './data/LoadStep'
import Done from './data/Done'

function StatCard({ title, value, sublabel, Icon, onClick }: { title: string; value: React.ReactNode; sublabel?: string; Icon?: React.ElementType; onClick?: () => void }) {
  const IconCmp = Icon
  return (
    <Tile className="card" role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      } : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}>
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

/** Welcome card for datasource linking and the upload preprocessing flow. */
function WelcomeCard({ onLink }: { onLink: () => void }) {
  return (
    <Tile className="card">
      <div className="card-heading">
        <div className="card-title-row">
          <DataBase size={20} aria-hidden="true" style={{ marginRight: '0.5rem' }} />
          <span className="card-title-sm">Data sources</span>
        </div>
      </div>
      <div className="stack-03" style={{ marginTop: '0.75rem' }}>
        <p className="supporting">Link a source system to bring in sales, inventory, master and supply data.</p>
        <div className="row-03">
          <Button kind="primary" size="md" onClick={onLink}>Link Datasource</Button>
        </div>
      </div>
    </Tile>
  )
}

/** Status summary card showing current batch state. */
function StatusCard({ batch, linkedFiles, onManageFiles }: { batch: Batch | null; linkedFiles: { file_key: string; name: string }[]; onManageFiles: () => void }) {
  const files = batch?.files ?? []
  const done = files.filter((f) => f.status === 'done').length
  const reading = files.filter((f) => f.status === 'queued' || f.status === 'reading').length
  const error = files.filter((f) => f.status === 'error').length
  const linkedByKey = new Map(linkedFiles.map((file) => [file.file_key, file]))
  const linked = Array.from(linkedByKey.values())
  const uploadedNames = new Set(files.map((file) => file.name.toLowerCase()))
  const total = files.length + linked.filter((file) => !uploadedNames.has(`${file.file_key}.xlsx`.toLowerCase())).length

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
          <StatCard title="Files" value={total}
            sublabel={linked.length ? `${linked.length} linked` : done > 0 ? `${done} read` : 'None yet'}
            Icon={DataBase} onClick={onManageFiles} />
          <StatCard title="Reading" value={reading || '–'} sublabel="Still being processed" />
          <StatCard title="Errors" value={error || '–'} sublabel={error > 0 ? 'Remove and re-add' : 'All clear'} />
        </div>
        {linked.length > 0 && (
          <div className="stack-02" aria-label="Linked files">
            {linked.map((file) => (
              <span className="footnote" key={file.file_key}>{getFile(file.file_key)?.name ?? file.name}</span>
            ))}
          </div>
        )}
        <Button kind="tertiary" size="sm" onClick={onManageFiles}>Manage files</Button>
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
  const linkedDatasources = useQuery({
    queryKey: ['datasources'],
    queryFn: async () => {
      const response = await fetch('/api/datasources/')
      if (!response.ok) throw new Error('Could not load linked datasources')
      return response.json() as Promise<{ datasources: { id: string; file_key: string; name: string; system_key: string }[] }>
    },
  })

  const [batchId, setBatchId] = useState<string | null>(null)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [resetError, setResetError] = useState<unknown>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [datasourceMode, setDatasourceMode] = useState<'none' | 'system-picker' | 'file-list' | 'files'>('none')
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null)
  const [linkingDatasource, setLinkingDatasource] = useState(false)
  const [datasourceError, setDatasourceError] = useState<string | null>(null)
  const [datasourceSuccess, setDatasourceSuccess] = useState<string | null>(null)
  const [datasourceReadFiles, setDatasourceReadFiles] = useState<string[]>([])
  const [quality, setQuality] = useState<Quality | null>(null)
  const [decisions, setDecisions] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [preprocessError, setPreprocessError] = useState<unknown>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [processedWorkspace, setProcessedWorkspace] = useState<Workspace | null>(null)
  const [processStep, setProcessStep] = useState<'files' | 'quality' | 'load' | 'done'>('files')
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

  const ensureBatch = useCallback(async () => {
    if (batchId) return batchId
    const { id } = await api.createBatch()
    setBatchId(id)
    return id
  }, [batchId])

  async function removeFile(fileId: string, datasourceId?: string) {
    if (!batchId) return
    setPreprocessError(null)
    try {
      await api.removeFile(batchId, fileId)
      if (datasourceId) {
        const response = await fetch(`/api/datasources/${datasourceId}`, { method: 'DELETE' })
        if (!response.ok) throw new Error('Could not remove linked datasource')
        await qc.invalidateQueries({ queryKey: ['datasources'] })
      }
      await refresh()
      setQuality(null)
    } catch (error) {
      setPreprocessError(error)
    }
  }

  async function removeDatasource(datasourceId: string) {
    setPreprocessError(null)
    try {
      const response = await fetch(`/api/datasources/${datasourceId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not remove linked datasource')
      await qc.invalidateQueries({ queryKey: ['datasources'] })
    } catch (error) {
      setPreprocessError(error)
    }
  }

  async function loadCleanedData() {
    if (!batchId) return
    setLoadError(null)
    setConfirmState({ status: 'running', progress: 0, message: 'Starting' })
    try {
      await api.confirm(batchId, decisions)
      for (;;) {
        const state = await api.confirmState(batchId)
        setConfirmState(state)
        if (state.status === 'error') throw new Error(state.message || 'Loading stopped before it finished.')
        if (state.status === 'done') break
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      const workspace = await api.workspace()
      setProcessedWorkspace(workspace)
      await qc.invalidateQueries({ queryKey: ['workspace'] })
      setProcessStep('done')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Loading stopped before it finished.'
      setLoadError(message)
      setConfirmState({ status: 'error', message })
    }
  }

  async function configureDatasource(selections: { fileKey: string; systemKey: string }[]) {
    setLinkingDatasource(true)
    setDatasourceError(null)
    setDatasourceSuccess(null)
    try {
      const uploadBatchId = await ensureBatch()
      for (const { fileKey, systemKey } of selections) {
        if (!getFile(fileKey)?.systems.includes(systemKey)) {
          throw new Error(`The selected platform cannot provide ${fileKey}`)
        }
        const response = await fetch('/api/datasources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_key: fileKey, system_key: systemKey, connection: {} }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.detail || 'Could not link datasource')
        await api.addDemoFile(uploadBatchId, fileKey)
      }
      setBatchId(uploadBatchId)
      await refresh(uploadBatchId)
      setDatasourceReadFiles(selections.map(({ fileKey }) => `${fileKey}.xlsx`))
      await qc.invalidateQueries({ queryKey: ['batch-latest'] })
      await qc.invalidateQueries({ queryKey: ['datasources'] })
      setDatasourceSuccess('Datasource linked successfully. The selected files are now in Files.')
      setDatasourceMode('none')
      setSelectedSystem(null)
      showToast('success', 'Datasource linked', 'The selected files are ready.')
    } catch (error) {
      setDatasourceError(error instanceof Error ? error.message : 'Could not link datasource')
    } finally {
      setLinkingDatasource(false)
    }
  }

  // Keep polling while any file is still being read.
  const reading = batch?.files.some((f) => f.status === 'queued' || f.status === 'reading') ?? false
  useEffect(() => {
    if (!reading) return
    const t = setInterval(() => void refresh(), 1000)
    return () => clearInterval(t)
  }, [reading, refresh])

  useEffect(() => {
    if (!datasourceSuccess || datasourceReadFiles.length === 0 || !batch) return
    const filesByName = new Map(batch.files.map((file) => [file.name.toLowerCase(), file]))
    const selectedFiles = datasourceReadFiles.map((name) => filesByName.get(name.toLowerCase()))
    if (selectedFiles.every((file) => file && (file.status === 'done' || file.status === 'error'))) {
      setDatasourceSuccess(null)
      setDatasourceReadFiles([])
    }
  }, [batch, datasourceReadFiles, datasourceSuccess])

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
  const types = schema.data?.types ?? []
  const linkedFiles = linkedDatasources.data?.datasources ?? []

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
        {datasourceError && <InlineNotification kind="error" title="Could not link datasource" subtitle={datasourceError} hideCloseButton onClose={() => setDatasourceError(null)} />}
        {datasourceSuccess && <InlineNotification kind="success" title="Datasource linked" subtitle={datasourceSuccess} hideCloseButton />}

        {/* Home screen when no data loaded yet */}
        {!loaded && datasourceMode === 'none' && (
          <div className="grid">
            <WelcomeCard onLink={() => setDatasourceMode('system-picker')} />
            {(batch || linkedFiles.length > 0) && <StatusCard batch={batch} linkedFiles={linkedFiles} onManageFiles={() => setDatasourceMode('files')} />}
          </div>
        )}

        {datasourceMode === 'files' && (
          <div className="stack-05">
            <div className="row-between">
              <Button className="back-to-data-setup" kind="ghost" size="md" onClick={() => setDatasourceMode('none')}>Back to data setup</Button>
            </div>
            {preprocessError ? <ApiErrorNotification error={preprocessError} fallbackTitle="Could not update linked files" /> : null}
            {processStep === 'files' && (
              <>
                <AddFiles batch={batch}
                  onRemove={(id, datasourceId) => void removeFile(id, datasourceId)} linkedDatasources={linkedFiles}
                  onRemoveDatasource={(id) => void removeDatasource(id)} />
                {batch?.groups.length ? (
                  <MapColumns batchId={batch.id} batch={batch} types={types} refresh={() => refresh(batch.id)}
                    onInvalidate={() => setQuality(null)} />
                ) : null}
                <div className="row-between">
                  <span className="footnote">{batch?.problems.join(' ')}</span>
                  <Button kind="primary" size="md" disabled={!batch?.ready}
                    onClick={() => { setQuality(null); setProcessStep('quality') }}>
                    Check for duplicates and data quality
                  </Button>
                </div>
              </>
            )}
            {processStep === 'quality' && batchId && (
              <>
                <CheckQuality batchId={batchId} quality={quality} setQuality={setQuality}
                decisions={decisions} setDecisions={setDecisions} />
                {quality?.status === 'done' && (
                <div className="row-between">
                  <Button kind="secondary" size="md" onClick={() => setProcessStep('files')}>Back to files</Button>
                  <Button kind="primary" size="md" onClick={() => setProcessStep('load')}>Review data load</Button>
                </div>
                )}
              </>
            )}
            {processStep === 'load' && batch && quality?.status === 'done' && (
              <>
                <LoadStep batch={batch} quality={quality} decisions={decisions} error={loadError} />
                <div className="row-between">
                  <Button kind="secondary" size="md" onClick={() => setProcessStep('quality')}>Back</Button>
                  <Button kind="primary" size="md" disabled={confirmState?.status === 'running'} onClick={() => void loadCleanedData()}>
                    {confirmState?.status === 'running' ? `Loading ${Math.round((confirmState.progress ?? 0) * 100)}%` : 'Load cleaned data'}
                  </Button>
                </div>
              </>
            )}
            {processStep === 'done' && processedWorkspace && <Done ws={processedWorkspace} />}
            {loadError && <InlineNotification kind="error" title="Data load failed" subtitle={loadError} hideCloseButton />}
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
            <FileList systemKey={selectedSystem} onBack={() => setDatasourceMode('system-picker')}
              onConfigure={(selections) => void configureDatasource(selections)}
              isConfiguring={linkingDatasource} />
          </div>
        )}

      </div>

      <Modal open={confirmReplace} danger size="sm" modalHeading="Replace the loaded data?" primaryButtonText="Replace data" secondaryButtonText="Cancel"
        onRequestClose={() => setConfirmReplace(false)} onRequestSubmit={() => void replace()} onSecondarySubmit={() => setConfirmReplace(false)}>
        <p>This removes the loaded data, the Explore views and the forecasts built from it. Your original files are not changed.</p>
      </Modal>
    </>
  )
}

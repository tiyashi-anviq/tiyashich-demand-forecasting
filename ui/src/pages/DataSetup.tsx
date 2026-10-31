import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiErrorNotification, ModulePageHeader, PendingLabel, useToast } from '@reiq/ui'
import { Button, Modal, ProgressBar, ProgressIndicator, ProgressStep, SkeletonText } from '@reiq/ui/carbon'
import { MODULE } from '../App'
import { api } from '../api'
import type { Batch, Quality } from '../types'
import AddFiles from './data/AddFiles'
import MapColumns from './data/MapColumns'
import CheckQuality from './data/CheckQuality'
import LoadStep from './data/LoadStep'
import Done from './data/Done'
import FooterBar from './data/FooterBar'

const STEPS = ['Add files', 'Match columns', 'Check data', 'Load']

export default function DataSetup() {
  const qc = useQueryClient()
  const go = useNavigate()
  const { showToast } = useToast()
  const schema = useQuery({ queryKey: ['schema'], queryFn: api.schema, staleTime: Infinity })
  const ws = useQuery({ queryKey: ['workspace'], queryFn: api.workspace, staleTime: 0 })
  const latest = useQuery({ queryKey: ['batch-latest'], queryFn: api.latestBatch, staleTime: 0 })

  const [batchId, setBatchId] = useState<string | null>(null)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [step, setStep] = useState(0)
  const [replacing, setReplacing] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [quality, setQuality] = useState<Quality | null>(null)
  const [decisions, setDecisions] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [loadPct, setLoadPct] = useState(0)
  const [loadMsg, setLoadMsg] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [resetError, setResetError] = useState<unknown>(null)
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
    setBatchId(id); return id
  }, [batchId])

  // Keep polling while any file is still being read.
  const reading = batch?.files.some((f) => f.status === 'queued' || f.status === 'reading') ?? false
  useEffect(() => {
    if (!reading) return
    const t = setInterval(() => void refresh(), 1000)
    return () => clearInterval(t)
  }, [reading, refresh])

  async function removeFile(fid: string) {
    if (!batchId) return
    try { await api.removeFile(batchId, fid); await refresh() } catch (e) { setResetError(e) }
  }

  function invalidateQuality() { setQuality(null) }

  async function load() {
    if (!batchId) return
    setLoading(true); setLoadError(null); setLoadPct(0); setLoadMsg('Starting')
    try {
      await api.confirm(batchId, decisions)
      for (;;) {
        await new Promise((r) => setTimeout(r, 1000))
        const s = await api.confirmState(batchId)
        setLoadPct(Math.round((s.progress ?? 0) * 100)); setLoadMsg(s.message ?? '')
        if (s.status === 'error') throw new Error(s.message || 'Loading stopped before it finished.')
        if (s.status === 'done') break
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ['workspace'] }), qc.invalidateQueries({ queryKey: ['eda'] }), qc.invalidateQueries({ queryKey: ['forecast'] })])
      setReplacing(false)
      showToast('success', 'Data loaded', 'Explore and Forecasts are being prepared from it.')
    } catch (e) { setLoadError((e as Error).message) } finally { setLoading(false) }
  }

  async function replace() {
    setConfirmReplace(false); setResetError(null)
    try {
      await api.resetWorkspace()
      setBatch(null); setBatchId(null); setStep(0); setQuality(null); setDecisions({}); setReplacing(true)
      await qc.invalidateQueries({ queryKey: ['workspace'] })
      showToast('success', 'Data removed', 'Add the new files to load them.')
    } catch (e) { setResetError(e) }
  }

  const loaded = !!ws.data?.loaded && !replacing
  const types = schema.data?.types ?? []
  const included = batch?.groups.filter((g) => g.include && g.type !== 'reference') ?? []
  const filesReady = !!batch && batch.files.length > 0 && !reading && batch.files.some((f) => f.status === 'done')
  const mapped = included.length > 0 && included.every((g) => g.ok)

  const header = (
    <ModulePageHeader moduleLabel={MODULE} title="Data setup"
      description={loaded ? 'Your data is loaded and ready for Explore and Forecasts.' : 'Add your files, match their columns, check the data, then load it.'}
      actions={loaded ? (
        <>
          <Button kind="tertiary" size="md" onClick={() => setConfirmReplace(true)}>Replace data</Button>
          <Button kind="primary" size="md" onClick={() => go('/explore')}>Explore your data</Button>
        </>
      ) : undefined} />
  )

  if (schema.isPending || ws.isPending || latest.isPending) {
    return <>{header}<div role="status" aria-busy="true" aria-label="Loading data setup"><SkeletonText heading width="30%" /><SkeletonText paragraph lineCount={4} /></div></>
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
        {loaded && ws.data ? <Done ws={ws.data} /> : (
          <>
            <ProgressIndicator currentIndex={step} spaceEqually onChange={(i: number) => { if (i < step) setStep(i) }}>
              {STEPS.map((s, i) => <ProgressStep key={s} label={s} complete={i < step} current={i === step} secondaryLabel={i < step ? 'Done' : i === step ? 'In progress' : 'Not started'} />)}
            </ProgressIndicator>

            {step === 0 && <AddFiles batch={batch} sources={schema.data?.sources ?? []} ensureBatch={ensureBatch} refresh={refresh} onRemove={(fid) => void removeFile(fid)} />}
            {step === 1 && batch && batchId && <MapColumns batchId={batchId} batch={batch} types={types} refresh={refresh} onInvalidate={invalidateQuality} />}
            {step === 2 && batchId && <CheckQuality batchId={batchId} quality={quality} setQuality={setQuality} decisions={decisions} setDecisions={setDecisions} />}
            {step === 3 && batch && quality && <LoadStep batch={batch} quality={quality} decisions={decisions} error={loadError} />}

            {step === 0 && <FooterBar note={filesReady ? `${batch!.files.length} file${batch!.files.length === 1 ? '' : 's'} read.` : 'Add at least one file to continue.'}
              primaryLabel="Match columns" primaryDisabled={!filesReady} onPrimary={() => setStep(1)} />}
            {step === 1 && <FooterBar note={mapped ? undefined : 'Every included table needs its columns matched before you continue.'}
              onBack={() => setStep(0)} primaryLabel="Check data" primaryDisabled={!mapped} onPrimary={() => { setQuality(null); setStep(2) }} />}
            {step === 2 && <FooterBar onBack={() => setStep(1)} primaryLabel="Review and load" primaryDisabled={quality?.status !== 'done'} onPrimary={() => setStep(3)} />}
            {step === 3 && <FooterBar onBack={() => setStep(2)} primaryLabel="Load data" primaryIcon={false}
              busy={loading
                ? <div className="wizard-working" role="status" aria-live="polite"><ProgressBar label="Loading your data" hideLabel value={loadPct} max={100} helperText={loadMsg} /></div>
                : <Button kind="primary" size="md" onClick={() => void load()}><PendingLabel pending={false} idle="Load data" busy="Loading..." /></Button>}
              onPrimary={() => void load()} />}
          </>
        )}
      </div>

      <Modal open={confirmReplace} danger size="sm" modalHeading="Replace the loaded data?" primaryButtonText="Replace data" secondaryButtonText="Cancel"
        onRequestClose={() => setConfirmReplace(false)} onRequestSubmit={() => void replace()} onSecondarySubmit={() => setConfirmReplace(false)}>
        <p>This removes the loaded data, the Explore views and the forecasts built from it. Your original files are not changed.</p>
      </Modal>
    </>
  )
}

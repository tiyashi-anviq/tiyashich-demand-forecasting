import { useEffect, useRef } from 'react'
import { CheckmarkFilled, WarningAltFilled } from '@carbon/icons-react'
import { ApiErrorNotification, AppError, PageSection } from '@reiq/ui'
import { Accordion, AccordionItem, ProgressBar, Select, SelectItem, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tag } from '@reiq/ui/carbon'
import type { Issue, Quality } from '../../types'
import { api } from '../../api'
import { fmtInt } from '../../lib/format'

/** `flag` picks the row colour: red for problems to fix, yellow for minor notes; rows that are fine stay plain. */
function IssueTable({ issues, decisions, onChange, caption, flag }: { issues: Issue[]; decisions: Record<string, string>; onChange: (id: string, v: string) => void; caption: string; flag?: 'red' | 'yellow' }) {
  return (
    <div className="table-scroll thin-scroll">
      <Table size="md" aria-label={caption}>
        <TableHead>
          <TableRow>
            <TableHeader>Issue</TableHeader>
            <TableHeader>Table</TableHeader>
            <TableHeader className="cell-num">Items</TableHeader>
            <TableHeader>What we found</TableHeader>
            <TableHeader>What to do</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {issues.map((i) => (
            <TableRow key={i.id} className={flag && (flag === 'yellow' || (i.severity !== 'ok' && i.severity !== 'skipped')) ? `issue-row-${flag}` : undefined}>
              <TableCell><span className="row-03">
                {i.severity === 'ok' ? <CheckmarkFilled size={16} aria-label="Fine" /> : i.severity === 'warn' ? <WarningAltFilled size={16} aria-label="Needs a decision" /> : null}
                {i.title}</span></TableCell>
              <TableCell><Tag type="gray" size="sm">{i.dataset}</Tag></TableCell>
              <TableCell className="cell-num">{i.count > 0 ? fmtInt(i.count) : ''}</TableCell>
              <TableCell>{i.detail}</TableCell>
              <TableCell>
                {i.actions.length > 0 ? (
                  <div className="issue-fix">
                    <Select id={`a-${i.id}`} size="sm" labelText={`What should we do about: ${i.title}`} hideLabel value={decisions[i.id] ?? i.default ?? ''} onChange={(e) => onChange(i.id, e.target.value)}>
                      {i.actions.map((a) => <SelectItem key={a.id} value={a.id} text={a.label + (a.recommended ? ' (recommended)' : '')} />)}
                    </Select>
                  </div>
                ) : <span className="footnote">{i.severity === 'skipped' ? 'Skipped' : i.severity === 'ok' ? 'Nothing to do' : 'For your information'}</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function CheckQuality({ batchId, quality, setQuality, decisions, setDecisions }: {
  batchId: string
  quality: Quality | null
  setQuality: (q: Quality) => void
  decisions: Record<string, string>
  setDecisions: (d: Record<string, string>) => void
}) {
  const started = useRef(false)

  // Start the check once, then poll until it finishes.
  useEffect(() => {
    let stop = false
    async function run() {
      try {
        let q = await api.quality(batchId)
        if ((q.status === 'idle' || q.status === 'error') && !started.current) {
          started.current = true
          await api.startQuality(batchId)
          q = await api.quality(batchId)
        }
        while (!stop) {
          setQuality(q)
          if (q.status === 'done' || q.status === 'error') break
          await new Promise((r) => setTimeout(r, 1000))
          q = await api.quality(batchId)
        }
        if (!stop && q.status === 'done') {
          const base: Record<string, string> = {}
          for (const i of q.issues ?? []) if (i.default) base[i.id] = i.default
          setDecisions({ ...base, ...decisions })
        }
      } catch (e) { setQuality({ status: 'error', message: (e as Error).message }) }
    }
    if (!quality || quality.status !== 'done') void run()
    return () => { stop = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId])

  if (!quality || quality.status === 'idle' || quality.status === 'running') {
    const pct = Math.round((quality?.progress ?? 0) * 100)
    return (
      <div className="wizard-working" role="status" aria-live="polite" aria-busy="true">
        <h2 className="card-title">Checking your data</h2>
        <p className="supporting">{quality?.message ? `${quality.message}. ` : ''}This usually takes under a minute.</p>
        <ProgressBar label="Checking your data" hideLabel value={pct} max={100} />
      </div>
    )
  }
  if (quality.status === 'error') {
    return (
      <ApiErrorNotification error={new AppError(quality.message ?? 'The check stopped before it finished.')} fallbackTitle="The data check did not finish"
        onRetry={() => { started.current = false; setQuality({ status: 'idle' }); window.location.reload() }} />
    )
  }

  const issues = quality.issues ?? []
  const cleanup = issues.filter((i) => i.scope === 'cleanup' && !i.minor)
  const minor = issues.filter((i) => i.scope === 'cleanup' && i.minor)
  const cleansing = issues.filter((i) => i.scope === 'cleansing')
  const toReview = cleanup.filter((i) => i.severity === 'warn').length
  const set = (id: string, v: string) => setDecisions({ ...decisions, [id]: v })

  return (
    <div className="stack-07">
      <PageSection title="Check your data"
        note={cleanup.length + cleansing.filter((c) => c.actions.length).length === 0 ? 'Nothing needs fixing.' : 'A fix is recommended for each item. Change any choice you disagree with, then continue.'}>
        {cleanup.length > 0 ? (
          <div className="stack-03">
            <h3 className="card-title-sm">Fix before loading {toReview > 0 && <Tag type="red" size="sm">{toReview}</Tag>}</h3>
            <p className="supporting">Problems in the files themselves.</p>
            <IssueTable issues={cleanup} decisions={decisions} onChange={set} caption="Problems in the files" flag="red" />
          </div>
        ) : null}
      </PageSection>

      <PageSection title="Clean up demand" note="Real sales are messy. These steps separate one-off events from normal demand, so the forecast learns the right pattern. Your original numbers are never overwritten; new columns are added.">
        <IssueTable issues={cleansing} decisions={decisions} onChange={set} caption="Demand clean-up steps" />
      </PageSection>

      {minor.length > 0 && (
        <Accordion>
          <AccordionItem title={`${minor.length} minor note${minor.length === 1 ? '' : 's'}, no action needed`}>
            <IssueTable issues={minor} decisions={decisions} onChange={set} caption="Minor notes" flag="yellow" />
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}

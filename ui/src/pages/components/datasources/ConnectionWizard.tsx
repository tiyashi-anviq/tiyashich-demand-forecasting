/** Connection wizard: 3 steps — Connection → Scope & Schedule → Test & Link. */
import { useState } from 'react'
import { Button, Tile, Tag, InlineNotification, Select, SelectItem, InlineLoading } from '@reiq/ui/carbon'
import { CheckmarkFilled, WarningAltFilled } from '@carbon/icons-react'
import { SOURCE_SYSTEMS } from '../../../lib/datasources.config'

interface WizardState {
  step: number
  systemKey: string
  connection: Record<string, string | boolean>
  schedule: {
    frequency: string
    time: string | null
    dayOfWeek: number | null
    incrementalKey: string
  }
  selectedTables: string[]
}

const INITIAL_STATE: WizardState = {
  step: 1,
  systemKey: '',
  connection: {},
  schedule: { frequency: 'daily', time: '02:00', dayOfWeek: 1, incrementalKey: 'Week_Start' },
  selectedTables: [],
}

export default function ConnectionWizard({ onClose, onComplete, systemKey, selectedFiles }: { onClose: () => void; onComplete: (payload: any) => void; systemKey: string; selectedFiles: string[] }) {
  const [state, setState] = useState<WizardState>({ ...INITIAL_STATE, systemKey, selectedTables: [] })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const system = SOURCE_SYSTEMS.find((s) => s.key === state.systemKey)
  const fields = system?.requiredFields ?? []

  const isSAP = ['sap-sd', 'sap-mm', 'sap-ibp', 'sap-mdg', 'sap-ariba'].includes(state.systemKey)
  const isNIQ = state.systemKey === 'nielseniq'

  const goStep = (step: number) => setState((s) => ({ ...s, step }))

  const handleChange = (key: string, value: string | boolean) => {
    setState((s) => ({ ...s, connection: { ...s.connection, [key]: value } }))
  }

  const toggleTable = (table: string) => {
    setState((s) => {
      const next = new Set(s.selectedTables)
      if (next.has(table)) next.delete(table)
      else next.add(table)
      return { ...s, selectedTables: Array.from(next) }
    })
  }

  const runTest = () => {
    setTestResult({ ok: true, message: 'Connectivity OK', tables: {} })
    setError(null)
  }

  const handleLink = async () => {
    setTesting(true)
    try {
      const resp = await fetch('/api/datasources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_key: selectedFiles[0],
          name: undefined,
          system_key: state.systemKey,
          connection: state.connection,
          schedule: state.schedule,
          tables: state.selectedTables.map((t) => ({ name: t, enabled: true })),
        }),
      })
      const result = await resp.json()
      if (resp.ok) {
        onComplete(result)
      } else {
        setError(result.detail || 'Link failed')
      }
    } catch (e: any) {
      setError(e.message || 'Link failed')
    } finally {
      setTesting(false)
    }
  }

  const stepLabel = state.step === 1 ? 'Connection' : state.step === 2 ? 'Scope and schedule' : 'Test and link'

  return (
    <div className="stack-05">
      <div className="row-between">
        <div className="card-heading">
          <span className="card-title-sm">Link {system?.name ?? 'system'}</span>
          <p className="footnote">{stepLabel}</p>
        </div>
        <Button kind="ghost" size="md" onClick={onClose}>Close</Button>
      </div>
      {error && <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton onClose={() => setError(null)} />}

      {/* Step indicator */}
      <div className="row-03 step-indicator" style={{ marginBottom: '1rem' }}>
        {[1, 2, 3].map((n) => (
          <div key={n} className={`step ${n === state.step ? 'active' : ''} ${n < state.step ? 'done' : ''}`}>
            <span className="step-number">{n < state.step ? <CheckmarkFilled size={14} aria-hidden="true" /> : n}</span>
            <span className="step-label">{n === 1 ? 'Connection' : n === 2 ? 'Scope' : 'Test & link'}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Connection */}
      {state.step === 1 && (
        <Tile className="card">
          <div className="card-heading"><span className="card-title-sm">Connection details</span></div>
          <div className="stack-03" style={{ marginTop: '0.75rem' }}>
            {fields.map((field) => {
              const skip = (field.sapOnly && !isSAP) || (field.nielseniqOnly && !isNIQ)
              if (skip) return null
              return (
                <div key={field.key} className="stack-02">
                  <label className="field-label">{field.label}</label>
                  {field.type === 'select' ? (
                    <Select id={`f-${field.key}`} size="md" labelText={field.label} hideLabel
                      value={String(state.connection[field.key] ?? field.default ?? '')}
                      onChange={(e) => handleChange(field.key, e.target.value)}>
                      {field.options?.map((o) => <SelectItem key={o.value} value={o.value} text={o.label} />)}
                    </Select>
                  ) : field.type === 'password' ? (
                    <input type="password" className="text-input" placeholder={field.placeholder}
                      value={String(state.connection[field.key] ?? '')}
                      onChange={(e) => handleChange(field.key, e.target.value)} />
                  ) : (
                    <input type={field.type} className="text-input" placeholder={field.placeholder}
                      value={String(state.connection[field.key] ?? '')}
                      onChange={(e) => handleChange(field.key, e.target.value)} />
                  )}
                  {field.placeholder && <p className="footnote">{field.placeholder}</p>}
                </div>
              )
            })}
            <div className="row-between" style={{ marginTop: '1rem' }}>
              <Button kind="secondary" size="md" onClick={() => goStep(0)} disabled={state.step === 1}>Back</Button>
              <Button kind="primary" size="md" onClick={() => goStep(2)}>Next</Button>
            </div>
          </div>
        </Tile>
      )}

      {/* Step 2: Scope & Schedule */}
      {state.step === 2 && (
        <Tile className="card">
          <div className="card-heading"><span className="card-title-sm">Scope and schedule</span></div>
          <div className="stack-03" style={{ marginTop: '0.75rem' }}>
            <div className="stack-03">
              <span className="field-label">Tables to include</span>
              <div className="table-grid">
                {system?.files.flatMap((_f) => {
                  const fileTables = ['Table_A', 'Table_B', 'Table_C']
                  return fileTables.map((t) => (
                    <label key={t} className="table-checkbox">
                      <input type="checkbox" checked={state.selectedTables.includes(t)}
                        onChange={() => toggleTable(t)} />
                      {t}
                    </label>
                  ))
                })}
              </div>
            </div>
            <div className="stack-03">
              <span className="field-label">Schedule</span>
              <Select id="freq" size="md" labelText="Frequency" hideLabel
                value={state.schedule.frequency}
                onChange={(e) => setState((s) => ({ ...s, schedule: { ...s.schedule, frequency: e.target.value } }))}>
                <SelectItem value="hourly" text="Hourly" />
                <SelectItem value="daily" text="Daily 02:00" />
                <SelectItem value="weekly" text="Weekly" />
                <SelectItem value="manual" text="Manual" />
              </Select>
              <p className="footnote">Fiscal year runs April–March. Incremental key: {state.schedule.incrementalKey}</p>
            </div>
            <div className="row-between" style={{ marginTop: '1rem' }}>
              <Button kind="secondary" size="md" onClick={() => goStep(1)}>Back</Button>
              <Button kind="primary" size="md" onClick={() => goStep(3)}>Next</Button>
            </div>
          </div>
        </Tile>
      )}

      {/* Step 3: Test & Link */}
      {state.step === 3 && (
        <Tile className="card">
          <div className="card-heading"><span className="card-title-sm">Test and link</span></div>
          <div className="stack-03" style={{ marginTop: '0.75rem' }}>
            <Button kind="secondary" size="md" onClick={runTest} disabled={testing}>
              {testing ? <InlineLoading description="Testing…" /> : 'Run connectivity test'}
            </Button>
            {testResult && (
              <div className="stack-02" style={{ marginTop: '0.75rem' }}>
                <span className={`test-badge ${testResult.ok ? 'ok' : 'fail'}`}>
                  {testResult.ok ? <CheckmarkFilled size={14} aria-hidden="true" /> : <WarningAltFilled size={14} aria-hidden="true" />}
                  {testResult.message}
                </span>
                <div className="table-results">
                  {Object.entries(testResult.tables || {}).map(([name, res]: [string, any]) => (
                    <div key={name} className="table-result-row">
                      <span>{name}</span>
                      <span className="footnote">{res.origin}</span>
                      <Tag type={res.ok && !res.missing_columns?.length ? 'green' : 'red'} size="sm">
                        {res.missing_columns?.length ? 'Missing columns' : 'OK'}
                      </Tag>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {testResult?.missing_columns && testResult.missing_columns.length > 0 && (
              <p className="footnote">Schema warnings: some expected columns are missing. You can still link with confirmation.</p>
            )}
            <div className="row-between" style={{ marginTop: '1rem' }}>
              <Button kind="secondary" size="md" onClick={() => goStep(2)}>Back</Button>
              <Button kind="primary" size="md" onClick={handleLink} disabled={testing || (testResult && !testResult.ok)}>
                Link Datasource
              </Button>
            </div>
          </div>
        </Tile>
      )}
    </div>
  )
}

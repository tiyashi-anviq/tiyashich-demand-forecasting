/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiErrorNotification, ModulePageHeader, TabbedView } from '@reiq/ui'
import { MODULE } from '../App'
import { getJson } from '../lib/http'
import { NeedsData } from '../ui/NeedsData'
import type { Options } from '../lib/filters'
import { FinalNumbers } from './challenge/Final'
import { RegionalInput } from './challenge/RegionalInput'
import { BUWorkspace, SDWorkspace } from './challenge/Workspaces'

// The four steps of the challenge, in the order they happen. The tab is also the role: whoever is looking picks the
// level they act at. Final values is a read-only roll-up, so it opens at the S&D Head's full scope.
const TABS = [
  { id: 'regional', label: '1 · Regional Head' },
  { id: 'sd', label: '2 · S&D Head' },
  { id: 'bu', label: '3 · Channel Head (BU Head)' },
  { id: 'final', label: '4 · Final Values' },
] as const
type Tab = (typeof TABS)[number]['id']

// Old links used the previous tab ids; keep them working instead of dropping the reader on the first tab.
const LEGACY_TAB: Record<string, Tab> = { submission: 'regional', review: 'sd', negotiate: 'bu' }

export default function Challenge() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const q = useQuery({ queryKey: ['challenge'], queryFn: () => getJson<any>('/api/challenge/cycle'), staleTime: 0 })
  const fo = useQuery({ queryKey: ['forecast', 'options'], queryFn: () => getJson<Options>('/api/forecast/options'), staleTime: Infinity })

  const tabParam = params.get('tab')
  const tab = (TABS.find((t) => t.id === tabParam)?.id ?? (tabParam ? LEGACY_TAB[tabParam] : undefined) ?? 'regional') as Tab
  const set = (patch: Record<string, string | null>) => setParams((cur) => {
    const next = new URLSearchParams(cur)
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)))
    return next
  }, { replace: true })

  // Normalise the URL: an unknown or legacy tab is rewritten to the tab that is actually shown.
  useEffect(() => {
    if (params.get('tab') !== tab) {
      setParams((cur) => {
        const next = new URLSearchParams(cur)
        next.set('tab', tab)
        return next
      }, { replace: true })
    }
  }, [params, tab, setParams])

  const d = q.data
  const month = d?.months[0]?.m ?? ''
  const region = d?.regions.includes(params.get('region')) ? params.get('region') : d?.regions[0]
  const unit = d?.units.find((u: any) => u.bu === params.get('bu'))
    ?? d?.units.find((u: any) => d.items.some((item: any) =>
      item.month === month && item.bus.some((b: any) => b.bu === u.bu && b.status === 'negotiating' && b.turn === 'bu')))
    ?? d?.units[0]
  const opts: Options = fo.data ?? { family: [], region: [], channel: [], product: [] }
  const onDone = (c: any) => qc.setQueryData(['challenge'], c)

  // No toolbar needed - all tabs use filters within their content
  const toolbar = null

  return (
    <>
      <ModulePageHeader
        moduleLabel={MODULE}
        title="Forecast challenge"
        description="The Regional Head submits a number, the S&D Head reviews it and sends it to the channel heads (BU heads), who agree the channel forecast before it becomes final."
        toolbar={toolbar}
      />
      <NeedsData base="forecast" building={{ what: 'build the forecasts', how: 'The challenge starts from the model forecast, so it waits for the forecasts to finish.' }}>
        {q.isPending ? (
          <p className="supporting">Loading forecast challenge...</p>
        ) : q.isError ? (
          <ApiErrorNotification error={q.error} fallbackTitle="Could not load the forecast challenge" onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <p className="supporting">No challenge data available. Upload data and build forecasts first.</p>
        ) : (
          <div className="stack-05">
            <TabbedView
              tabs={[
                {
                  id: 'regional',
                  label: '1 · Regional Head',
                  content: (
                    <RegionalInput
                      key={`regional|${region}`}
                      month={month}
                      region={region}
                      regions={d.regions}
                      onRegion={(r) => set({ region: r })}
                      units={d.units}
                      items={d.items.filter((i: any) => i.month === month)}
                      options={opts}
                      onDone={onDone}
                      stamp={q.dataUpdatedAt}
                    />
                  ),
                },
                {
                  id: 'sd',
                  label: '2 · S&D Head',
                  content: (
                    <SDWorkspace cycle={d} month={month} options={opts} stamp={q.dataUpdatedAt} onDone={onDone} />
                  ),
                },
                {
                  id: 'bu',
                  label: '3 · Channel Head (BU Head)',
                  content: unit ? (
                    <BUWorkspace 
                      key={`bu|${unit.bu}`} 
                      cycle={d} 
                      month={month} 
                      unit={unit} 
                      options={opts} 
                      stamp={q.dataUpdatedAt} 
                      onDone={onDone}
                      onBuChange={(bu) => set({ bu })}
                    />
                  ) : (
                    <p className="supporting">No channels were found in the data.</p>
                  ),
                },
                {
                  id: 'final',
                  label: '4 · Final Values',
                  content: (
                    <FinalNumbers
                      key={`final|${month}`}
                      month={month}
                      stamp={q.dataUpdatedAt}
                      role="sd"
                      region={null}
                      unit={null}
                    />
                  ),
                },
              ]}
            />
            <p className="footnote">
              A family reaches Final Values once the S&D Head has sent it to the channel heads (BU heads) and each channel has
              agreed. Those numbers are what the Supply and production plan and Procurement use.
            </p>
          </div>
        )}
      </NeedsData>
    </>
  )
}

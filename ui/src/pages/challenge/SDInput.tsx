/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiErrorNotification } from '@reiq/ui'
import { Button, InlineNotification, Tag, Tile } from '@reiq/ui/carbon'
import { getJson } from '../../lib/http'
import { fmtInt } from '../../lib/format'
import { RegionsSection } from './Regions'

/** S&D Head workflow with full filtering: Region, BU, Family, Product (all optional except Family for detail view) */
export function SDInput({ month, onDone, stamp }: {
  month: string
  onDone: (c: any) => void
  stamp: number
}) {
  const [family, setFamily] = useState<string | null>(null)
  const [region, setRegion] = useState<string | null>(null)

  // Load all families data to show notifications
  const allFamilies = useQuery({
    queryKey: ['challenge-all-families', month, stamp],
    queryFn: () => getJson<any>('/api/challenge/cycle'),
    staleTime: 0
  })

  // Load specific family data (only when family is selected)
  const q = useQuery({
    queryKey: ['challenge-family', month, family, stamp],
    queryFn: () => getJson<any>(`/api/challenge/family?month=${month}&family=${family}`),
    enabled: !!family && !!month,
    staleTime: 0
  })


  
  // Wait for all families data to load before showing dashboard
  if (!family && allFamilies.isPending) {
    return <p className="supporting">Loading dashboard...</p>
  }

  if (!family && allFamilies.isError) {
    return <ApiErrorNotification error={allFamilies.error} fallbackTitle="Could not load forecast data" />
  }
  
  // Calculate pending submissions across all families
  const allData = allFamilies.data
  const pendingItems = allData?.items?.filter((item: any) => 
    item.month === month && 
    item.regional?.some((r: any) => r.status === 'negotiating' && r.turn === 'sd')
  ) || []
  
  const totalPending = pendingItems.reduce((sum: number, item: any) => {
    return sum + item.regional.filter((r: any) => r.status === 'negotiating' && r.turn === 'sd').length
  }, 0)

  // Calculate status groups
  const waitingItems = allData?.items?.filter((item: any) => 
    item.month === month && 
    item.regional?.some((r: any) => r.status === 'negotiating' && r.turn === 'regional')
  ) || []
  
  const agreedItems = allData?.items?.filter((item: any) => 
    item.month === month && 
    item.n_regions_agreed === item.n_regions
  ) || []

  const totalAgreed = agreedItems.length
  const totalFamilies = allData?.items?.filter((item: any) => item.month === month)?.length || 0
  const progressPercent = totalFamilies > 0 ? Math.round((totalAgreed / totalFamilies) * 100) : 0

  // Step 1: Dashboard View
  if (!family) {
    return (
      <div className="stack-05">
        {/* Dashboard Overview */}
        <Tile className="card">
          <h3 className="card-title">📊 Your Dashboard</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ textAlign: 'center', padding: '1rem', background: totalPending > 0 ? 'var(--cds-support-error-inverse)' : 'var(--cds-layer-01)', borderRadius: '4px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: totalPending > 0 ? 'var(--cds-support-error)' : 'var(--cds-text-secondary)' }}>
                {totalPending}
              </div>
              <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {totalPending > 0 ? '🔴 Action Needed' : 'No Pending Items'}
              </div>
              <div className="footnote" style={{ marginTop: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                {pendingItems.length} {pendingItems.length === 1 ? 'family' : 'families'}, {totalPending} {totalPending === 1 ? 'region' : 'regions'}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--cds-layer-01)', borderRadius: '4px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--cds-support-warning)' }}>
                {waitingItems.length}
              </div>
              <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                🟡 Waiting on Regional Heads
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--cds-layer-01)', borderRadius: '4px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--cds-support-success)' }}>
                {totalAgreed}
              </div>
              <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                ✅ Regions Agreed
              </div>
            </div>
          </div>
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span className="footnote">Overall Progress</span>
              <span className="footnote">{progressPercent}% ({totalAgreed}/{totalFamilies} families)</span>
            </div>
            <div style={{ height: '8px', background: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${progressPercent}%`, height: '100%', background: 'var(--cds-support-success)', transition: 'width 0.3s' }} />
            </div>
          </div>
        </Tile>

        {/* Needs Attention Section */}
        {pendingItems.length > 0 && (
          <Tile className="card">
            <h3 className="card-title">🔴 Needs Your Attention ({pendingItems.length} {pendingItems.length === 1 ? 'family' : 'families'}, {totalPending} {totalPending === 1 ? 'region' : 'regions'})</h3>
            <div className="stack-05" style={{ marginTop: '1rem' }}>
              {pendingItems.map((item: any) => {
                const pending = item.regional.filter((r: any) => r.status === 'negotiating' && r.turn === 'sd')
                return (
                  <div key={item.family} style={{ padding: '1rem', background: 'var(--cds-layer-01)', borderRadius: '4px', borderLeft: '3px solid var(--cds-support-error)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{item.family}</h4>
                        <p className="footnote" style={{ margin: '0.25rem 0 0 0', color: 'var(--cds-text-secondary)' }}>
                          {pending.length} region{pending.length === 1 ? '' : 's'} waiting: {pending.map((r: any) => r.region).join(', ')}
                        </p>
                      </div>
                      <Tag type="red" size="sm">{pending.length} pending</Tag>
                    </div>
                    <div className="stack-03">
                      {pending.map((r: any) => (
                        <div key={r.region} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
                          <div>
                            <strong>{r.region}:</strong> {fmtInt(r.qty)} units
                            <span style={{ marginLeft: '0.5rem', color: 'var(--cds-text-secondary)' }}>
                              ({r.qty > r.model ? '+' : ''}{Math.round((r.qty / r.model - 1) * 100)}% vs model)
                            </span>
                          </div>
                          <Button 
                            kind="primary" 
                            size="sm"
                            onClick={() => { setFamily(item.family); setRegion(r.region) }}
                          >
                            Review & Respond
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Tile>
        )}

        {/* Waiting Section */}
        {waitingItems.length > 0 && (
          <Tile className="card">
            <h3 className="card-title">🟡 Waiting for Regional Heads ({waitingItems.length})</h3>
            <div className="stack-03" style={{ marginTop: '1rem' }}>
              {waitingItems.map((item: any) => {
                const waiting = item.regional.filter((r: any) => r.status === 'negotiating' && r.turn === 'regional')
                return (
                  <div key={item.family} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--cds-layer-01)', borderRadius: '4px' }}>
                    <div>
                      <strong>{item.family}</strong>
                      <span className="footnote" style={{ marginLeft: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                        {waiting.map((r: any) => r.region).join(', ')} ({waiting.length} region{waiting.length === 1 ? '' : 's'})
                      </span>
                    </div>
                    <Button kind="ghost" size="sm" onClick={() => setFamily(item.family)}>
                      View Details
                    </Button>
                  </div>
                )
              })}
            </div>
          </Tile>
        )}

        {/* Agreed Section */}
        {agreedItems.length > 0 && (
          <Tile className="card">
            <h3 className="card-title">✅ Regions All Agreed ({agreedItems.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
              {agreedItems.map((item: any) => (
                <div key={item.family} style={{ padding: '0.75rem', background: 'var(--cds-layer-01)', borderRadius: '4px', borderLeft: '3px solid var(--cds-support-success)' }}>
                  <strong>{item.family}</strong>
                  <p className="footnote" style={{ margin: '0.25rem 0 0 0' }}>
                    {fmtInt(item.consolidated)} units • {item.n_regions} regions ✓
                  </p>
                </div>
              ))}
            </div>
          </Tile>
        )}
      </div>
    )
  }

  // Loading state (only when family is selected)
  if (family && q.isPending) {
    return <p className="supporting">Loading {family} data...</p>
  }

  // Error state (only when family is selected)
  if (family && q.isError) {
    return (
      <div className="stack-05">
        <ApiErrorNotification error={q.error} fallbackTitle="Could not load family data" />
        <Button kind="secondary" size="md" onClick={() => setFamily(null)}>
          ← Back to Dashboard
        </Button>
      </div>
    )
  }

  const d = q.data
  if (family && !d) return null

  // Find regions waiting for S&D response
  const pendingRegions = d.regional?.filter((r: any) => r.status === 'negotiating' && r.turn === 'sd') || []
  const totalSubmitted = d.regional?.reduce((sum: number, r: any) => {
    return sum + (r.rounds?.length || 0)
  }, 0) || 0

  return (
    <div className="stack-05">
      <Tile className="card">
        <div className="card-heading">
          <h3 className="card-title">{family}</h3>
          <p className="footnote">
            {d.n_regions_agreed} of {d.n_regions} regions agreed • {totalSubmitted} total submission{totalSubmitted === 1 ? '' : 's'}
          </p>
        </div>
        <Button kind="ghost" size="sm" onClick={() => { setFamily(null); setRegion(null) }}>
          ← Change family
        </Button>
      </Tile>

      {/* Regional submissions waiting for response */}
      {pendingRegions.length > 0 && (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={`${pendingRegions.length} region${pendingRegions.length === 1 ? '' : 's'} waiting for your response`}
          subtitle={`${pendingRegions.map((r: any) => `${r.region} proposed ${fmtInt(r.qty)} units`).join(', ')}. Click on a region below to review and respond.`}
        />
      )}

      <RegionsSection 
        it={d} 
        role="sd" 
        pick={region} 
        onPick={setRegion} 
        stamp={stamp} 
        onDone={onDone}
      />
    </div>
  )
}

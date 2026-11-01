/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiErrorNotification } from '@reiq/ui'
import { Button, Dropdown, InlineNotification, Tag, Tile } from '@reiq/ui/carbon'
import { getJson } from '../../lib/http'
import { fmtInt } from '../../lib/format'
import type { Options } from '../../lib/filters'
import { BuPanel } from './Regions'

/** Simplified workflow for BU Head: Select Family → Review → Respond */
export function BUInput({ month, unit, options, onDone, stamp }: {
  month: string
  unit: { bu: string; name: string }
  options: Options
  onDone: (c: any) => void
  stamp: number
}) {
  const [family, setFamily] = useState<string | null>(null)

  // Load all families data to show notifications
  const allFamilies = useQuery({
    queryKey: ['challenge-all-families', month, stamp],
    queryFn: () => getJson<any>('/api/challenge/cycle'),
    staleTime: 0
  })

  // Load specific family data
  const q = useQuery({
    queryKey: ['challenge-family', month, family, stamp],
    queryFn: () => getJson<any>(`/api/challenge/family?month=${month}&family=${family}`),
    enabled: !!family,
    staleTime: 0
  })

  const families = [...new Set(options.product?.map(p => p.family).filter(Boolean))] as string[]
  
  // Calculate pending submissions for this BU
  const allData = allFamilies.data
  const pendingItems = allData?.items?.filter((item: any) => {
    const buData = item.bus?.find((b: any) => b.bu === unit.bu)
    return item.month === month && buData && buData.status === 'negotiating' && buData.turn === 'bu'
  }) || []
  
  const totalPending = pendingItems.length

  // Step 1: Family Selection
  if (!family) {
    return (
      <div className="stack-05">
        {/* Pending Submissions Alert */}
        {totalPending > 0 && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={`${totalPending} forecast${totalPending === 1 ? '' : 's'} waiting for your response`}
            subtitle={`The S&D Head has submitted forecasts for ${unit.name} that need your review.`}
          />
        )}

        {/* Family-specific notifications */}
        {pendingItems.length > 0 && (
          <Tile className="card">
            <h4 className="card-title">Pending Reviews for {unit.name}</h4>
            <div className="stack-03">
              {pendingItems.map((item: any) => {
                const buData = item.bus?.find((b: any) => b.bu === unit.bu)
                return (
                  <div key={item.family} className="row-03" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong>{item.family}</strong>
                      <p className="footnote">
                        S&D Head proposed {fmtInt(buData.proposal)} units
                      </p>
                    </div>
                    <div className="row-03">
                      <Tag type="purple" size="sm">Your turn</Tag>
                      <Button 
                        kind="ghost" 
                        size="sm" 
                        onClick={() => setFamily(item.family)}
                      >
                        Review →
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Tile>
        )}

        <Tile className="card stack-05">
          <h3 className="card-title">Select Product Family</h3>
          <p className="supporting">
            As the head of {unit.name}, choose a family to review your unit's forecast.
          </p>
          <Dropdown
            id="bu-family"
            size="md"
            titleText="Product family"
            label="Select family"
            items={families}
            itemToString={(i: string) => i}
            selectedItem={family}
            onChange={({ selectedItem }) => setFamily(selectedItem)}
          />
          {family && (
            <Button kind="primary" size="md" onClick={() => q.refetch()}>
              Continue
            </Button>
          )}
        </Tile>
      </div>
    )
  }

  // Loading state
  if (q.isPending) {
    return <p className="supporting">Loading {family} data...</p>
  }

  // Error state
  if (q.isError) {
    return <ApiErrorNotification error={q.error} fallbackTitle="Could not load family data" />
  }

  const d = q.data
  if (!d) return null

  // Find this unit's data
  const buData = d.bus?.find((b: any) => b.bu === unit.bu)
  if (!buData) {
    return (
      <Tile className="card">
        <p className="supporting">No data found for {unit.name} in {family}</p>
        <Button kind="ghost" size="sm" onClick={() => setFamily(null)}>
          ← Change family
        </Button>
      </Tile>
    )
  }

  return (
    <div className="stack-05">
      <Tile className="card">
        <div className="card-heading">
          <h3 className="card-title">{family} - {unit.name}</h3>
          <p className="footnote">Review and respond to the consolidated forecast</p>
        </div>
        <Button kind="ghost" size="sm" onClick={() => setFamily(null)}>
          ← Change family
        </Button>
      </Tile>

      {/* Show notification if it's your turn */}
      {buData.status === 'negotiating' && buData.turn === 'bu' && (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="S&D Head is waiting for your response"
          subtitle={`Proposed forecast: ${fmtInt(buData.proposal)} units. Review the details below and accept or counter.`}
        />
      )}

      <BuPanel 
        key={`${month}|${family}|${unit.bu}`}
        it={d}
        b={buData}
        role="bu"
        stamp={stamp} 
        onDone={onDone}
      />
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { ModulePageHeader, TabbedView } from '@reiq/ui'
import { InlineNotification } from '@reiq/ui/carbon'
import { MODULE } from '../App'
import { getJson } from '../lib/http'
import { useFilters, type Options } from '../lib/filters'
import { useBuild } from '../lib/useView'
import { FilterBar } from '../ui/FilterBar'
import { NeedsData } from '../ui/NeedsData'
import Inventory from './Inventory'
import Disruption from './supply/Disruption'
import Plan3 from './supply/Plan3'

/** Supply and production plan: the plan for next month, depot stock and transfers, and what a vendor failure does to the plan. One set of filters for all three. */
export default function SupplyPlan() {
  const { f, set, reset, dirty } = useFilters()
  const build = useBuild('forecast')
  const opts = useQuery({ queryKey: ['forecast', 'options'], queryFn: () => getJson<Options>('/api/forecast/options'), enabled: build.data?.state === 'ready', staleTime: Infinity })
  
  // Read the first forecast cycle month dynamically instead of hardcoding it
  const cycle = useQuery({ queryKey: ['challenge-cycle'], queryFn: () => getJson<any>('/api/challenge/cycle'), staleTime: 60_000 })
  const firstMonth = cycle.data?.months?.[0]?.m
  
  // Check for available forecast challenge values for the current cycle month
  const challenge = useQuery({ 
    queryKey: ['challenge-final', firstMonth], 
    queryFn: () => firstMonth ? getJson<any>(`/api/challenge/final?month=${firstMonth}`) : null, 
    staleTime: 30_000,
    enabled: !!firstMonth
  })
  
  const hasAgreedValues = challenge.data?.lines?.length > 0
  
  return (
    <>
      <ModulePageHeader moduleLabel={MODULE} title="Supply and production plan"
        description="The plan for next month, the depot stock and transfers that would balance it, and what a raw-material vendor failure would do to the plan."
        toolbar={opts.data ? <FilterBar f={f} set={set} reset={reset} dirty={dirty} opts={opts.data} channel={true} /> : undefined} />
      
      {hasAgreedValues && (
        <div style={{ padding: '0 1rem' }}>
          <InlineNotification 
            kind="success" 
            lowContrast 
            hideCloseButton
            title={`${challenge.data.lines.length} agreed forecast values available`}
            subtitle={`Values confirmed at all three levels (Regional → S&D → BU) for ${new Set(challenge.data.lines.map((l: any) => l.family)).size} product ${new Set(challenge.data.lines.map((l: any) => l.family)).size === 1 ? 'family' : 'families'}. These values are available to integrate into your supply plan.`} />
        </div>
      )}
      
      <TabbedView tabs={[
        { id: 'plan3', label: 'Next month', content: <NeedsData base="forecast" building={{ what: 'build the forecasts', how: 'The plan starts from the demand forecast for the next month.' }}><Plan3 f={f} /></NeedsData> },
        { id: 'stock', label: 'Depot stock and transfers', content: <Inventory embedded f={f} /> },
        { id: 'disruption', label: 'Vendor disruption', content: <NeedsData base="forecast" building={{ what: 'build the forecasts', how: 'The scenario starts from next month\'s demand forecast. It is built in a few minutes the first time.' }}><Disruption f={f} /></NeedsData> },
      ]} />
    </>
  )
}

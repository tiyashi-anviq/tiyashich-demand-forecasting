import { useQuery } from '@tanstack/react-query'
import { ModulePageHeader, TabbedView } from '@reiq/ui'
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
  return (
    <>
      <ModulePageHeader moduleLabel={MODULE} title="Supply and production plan"
        description="The plan for next month, the depot stock and transfers that would balance it, and what a raw-material vendor failure would do to the plan. Synthetic data."
        toolbar={opts.data ? <FilterBar f={f} set={set} reset={reset} dirty={dirty} opts={opts.data} channel={false} /> : undefined} />
      <TabbedView tabs={[
        { id: 'plan3', label: 'Next month', content: <NeedsData base="forecast" building={{ what: 'build the forecasts', how: 'The plan starts from the demand forecast for the next month.' }}><Plan3 f={f} /></NeedsData> },
        { id: 'stock', label: 'Depot stock and transfers', content: <Inventory embedded f={f} /> },
        { id: 'disruption', label: 'Vendor disruption', content: <NeedsData base="forecast" building={{ what: 'build the forecasts', how: 'The scenario starts from next month\'s demand forecast. It is built in a few minutes the first time.' }}><Disruption f={f} /></NeedsData> },
      ]} />
    </>
  )
}

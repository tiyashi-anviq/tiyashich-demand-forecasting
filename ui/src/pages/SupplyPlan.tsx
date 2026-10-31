import { ModulePageHeader, TabbedView } from '@reiq/ui'
import { MODULE } from '../App'
import { NeedsData } from '../ui/NeedsData'
import Inventory from './Inventory'
import Disruption from './supply/Disruption'
import Plan3 from './supply/Plan3'

/** Supply and production plan: what a vendor failure does to the plan, and the depot stock and transfers for the month ahead. */
export default function SupplyPlan() {
  return (
    <>
      <ModulePageHeader moduleLabel={MODULE} title="Supply and production plan"
        description="The plan for next month, the depot stock and transfers that would balance it, and what a raw-material vendor failure would do to the plan. Synthetic data." />
      <TabbedView tabs={[
        { id: 'plan3', label: 'Next month', content: <NeedsData base="forecast" building={{ what: 'build the forecasts', how: 'The plan starts from the demand forecast for the next month.' }}><Plan3 /></NeedsData> },
        { id: 'stock', label: 'Depot stock and transfers', content: <Inventory embedded /> },
        { id: 'disruption', label: 'Vendor disruption', content: <NeedsData base="forecast" building={{ what: 'build the forecasts', how: 'The scenario starts from next month\'s demand forecast. It is built in a few minutes the first time and kept afterwards.' }}><Disruption /></NeedsData> },
      ]} />
    </>
  )
}

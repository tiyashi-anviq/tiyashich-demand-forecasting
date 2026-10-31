import { ModulePageHeader, TabbedView } from '@reiq/ui'
import { MODULE } from '../App'
import MoqEconomics from './MoqEconomics'
import Procurement from './Procurement'

/** Procurement: check each raw-material request against the plant's need, then see what the minimum order and the buffer add on top. */
export default function ProcurementHub() {
  return (
    <>
      <ModulePageHeader moduleLabel={MODULE} title="Procurement"
        description="The raw materials the plan needs, and the requests to buy them: each request is checked against the plant's need, last year's use, recent use and stock cover, then costed for the minimum order and the buffer on top. Synthetic data." />
      <TabbedView tabs={[
        { id: 'check', label: 'Order check', content: <Procurement embedded /> },
        { id: 'moq', label: 'MOQ economics', content: <MoqEconomics embedded /> },
      ]} />
    </>
  )
}

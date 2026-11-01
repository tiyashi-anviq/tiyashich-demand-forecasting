import { useQuery } from '@tanstack/react-query'
import { ModulePageHeader, TabbedView } from '@reiq/ui'
import { MODULE } from '../App'
import { getJson } from '../lib/http'
import { useBuild } from '../lib/useView'
import { NeedsData } from '../ui/NeedsData'
import { ViewShell } from '../ui/ViewShell'
import RepackCase from './newproducts/RepackCase'
import Planner from './newproducts/Planner'

export default function NewProducts() {
  const build = useBuild('eda')
  const q = useQuery({ queryKey: ['np', 'cases'], queryFn: () => getJson<any>('/api/new-products/cases'), enabled: build.data?.state === 'ready' }) // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <>
      <ModulePageHeader moduleLabel={MODULE} title="New products"
        description="Map old products to a new one and follow the switch, and plan a launch: an upgrade is judged against Eveready's own range, a new product range against the market."
      />
      <NeedsData base="eda" building={{ what: 'prepare your data', how: 'Joining sales with the other tables takes about 15 seconds the first time and is saved afterwards.' }}>
        <ViewShell query={q} errorTitle="Could not load the launch cases">
          {(d) => (
            <TabbedView tabs={[
              { id: 'repack', label: 'Repackaged SKU', content: <RepackCase d={d} /> },
              { id: 'plan', label: 'Plan a launch', content: <Planner /> },
            ]} />
          )}
        </ViewShell>
      </NeedsData>
    </>
  )
}

import { useQuery } from '@tanstack/react-query'
import { ModulePageHeader, TabbedView } from '@reiq/ui'
import { MODULE } from '../App'
import { getJson } from '../lib/http'
import { useBuild } from '../lib/useView'
import { useFilters, type Options } from '../lib/filters'
import { FilterBar } from '../ui/FilterBar'
import { NeedsData } from '../ui/NeedsData'
import Shocks from './weather/Shocks'
import Seasonal from './weather/Seasonal'

export default function Weather() {
  const { f, set, reset, dirty } = useFilters()
  const build = useBuild('eda')
  const opts = useQuery({ queryKey: ['eda', 'options'], queryFn: () => getJson<Options>('/api/eda/options'), enabled: build.data?.state === 'ready', staleTime: Infinity })
  return (
    <>
      <ModulePageHeader moduleLabel={MODULE} title="Weather and seasons"
        description="How a weather surprise moved demand away from the baseline made just before it, and which products sell more in each season. Orders received, synthetic data."
        toolbar={opts.data ? <FilterBar f={f} set={set} reset={reset} dirty={dirty} opts={opts.data} /> : undefined} />
      <NeedsData base="eda" building={{ what: 'prepare your data', how: 'Joining sales with weather, festivals and promotions takes about 15 seconds the first time and is saved afterwards.' }}>
        {opts.data ? (
          <TabbedView tabs={[
            { id: 'shocks', label: 'Weather and shocks', content: <Shocks f={f} opts={opts.data} onClear={reset} /> },
            { id: 'seasonal', label: 'Seasonal demand', content: <Seasonal f={f} opts={opts.data} onClear={reset} /> },
          ]} />
        ) : null}
      </NeedsData>
    </>
  )
}

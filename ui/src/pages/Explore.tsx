import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ModulePageHeader, TabbedView } from '@reiq/ui'
import { MODULE } from '../App'
import { getJson } from '../lib/http'
import { useBuild } from '../lib/useView'
import { useFilters, type Options } from '../lib/filters'
import { FilterBar } from '../ui/FilterBar'
import { NeedsData } from '../ui/NeedsData'
import Overview from './explore/Overview'
import Profile from './explore/Profile'
import Trends from './explore/Trends'
import Drivers from './explore/Drivers'
import Segments from './explore/Segments'
import Distribution from './explore/Distribution'

export default function Explore() {
  const { f, set, reset, dirty } = useFilters()
  const [params] = useSearchParams()
  const build = useBuild('eda')
  const opts = useQuery({ queryKey: ['eda', 'options'], queryFn: () => getJson<Options>('/api/eda/options'), enabled: build.data?.state === 'ready', staleTime: Infinity })
  const onOverview = (params.get('tab') ?? 'overview') === 'overview'
  const o = opts.data
  return (
    <>
      <ModulePageHeader moduleLabel={MODULE} title="Explore your data"
        description="What is in the cleaned data, what moves demand, and how hard each series is to forecast. Primary sales, synthetic data."
        toolbar={o ? <FilterBar f={f} set={set} reset={reset} dirty={dirty} opts={o} period measure measureLocked={onOverview} /> : undefined} />
      <NeedsData base="eda" building={{ what: 'prepare your data', how: 'Joining sales with weather, festivals, promotions, market and commodity data takes about 15 seconds the first time and is saved afterwards.' }}>
        {o ? (
          <TabbedView tabs={[
            { id: 'overview', label: 'Overview', content: <Overview f={f} opts={o} onClear={reset} /> },
            { id: 'profile', label: 'Data profile', content: <Profile f={f} opts={o} onClear={reset} /> },
            { id: 'trends', label: 'Trends and seasonality', content: <Trends f={f} opts={o} onClear={reset} /> },
            { id: 'drivers', label: 'Demand drivers', content: <Drivers f={f} opts={o} onClear={reset} /> },
            { id: 'segments', label: 'Forecastability', content: <Segments f={f} opts={o} onClear={reset} /> },
            { id: 'distribution', label: 'Distribution and outliers', content: <Distribution f={f} opts={o} onClear={reset} /> },
          ]} />
        ) : null}
      </NeedsData>
    </>
  )
}

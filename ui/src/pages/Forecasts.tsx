import { useQuery } from '@tanstack/react-query'
import { ModulePageHeader, TabbedView } from '@reiq/ui'
import { MODULE } from '../App'
import { getJson } from '../lib/http'
import { useBuild } from '../lib/useView'
import { useFilters, type Options } from '../lib/filters'
import { FilterBar } from '../ui/FilterBar'
import { NeedsData } from '../ui/NeedsData'
import Outlook from './forecast/Outlook'
import Vintages from './forecast/Vintages'

export default function Forecasts() {
  const { f, set, reset, dirty } = useFilters()
  const build = useBuild('forecast')
  const opts = useQuery({ queryKey: ['forecast', 'options'], queryFn: () => getJson<Options>('/api/forecast/options'), enabled: build.data?.state === 'ready', staleTime: Infinity })
  return (
    <>
      <ModulePageHeader moduleLabel={MODULE} title="Forecasts"
        description="Monthly orders received, forecast to Dec 2027 and replayed against what happened."
        toolbar={opts.data ? <FilterBar f={f} set={set} reset={reset} dirty={dirty} opts={opts.data} /> : undefined} />
      <NeedsData base="forecast" building={{ what: 'build the forecasts', how: 'This takes a few minutes the first time because every forecast is replayed as it would have looked in the past. It is kept afterwards.' }}>
        <TabbedView tabs={[
          { id: 'outlook', label: 'Outlook to Dec 2027', content: <Outlook f={f} onClear={reset} /> },
          ...(['M3', 'M2', 'M1'] as const).map((r) => ({ id: r.toLowerCase(), label: r, content: <Vintages f={f} onClear={reset} only={r} /> })),
        ]} />
      </NeedsData>
    </>
  )
}

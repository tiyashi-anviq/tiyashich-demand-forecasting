/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, ComboBox, Tile } from '@reiq/ui/carbon'
import { fmtN, fmtSigned, monthLong } from '../../lib/format'
import { getJson } from '../../lib/http'
import { queryOf, type Filters } from '../../lib/filters'
import { useView } from '../../lib/useView'
import TrendChart from '../../charts/TrendChart'
import { seriesTable } from '../../charts/kit'
import { ChartCard } from '../../ui/ChartCard'
import { StatRow } from '../../ui/StatRow'
import { ViewShell } from '../../ui/ViewShell'
import WeekWhy from './WeekWhy'

const MONTHS: Record<string, 'monsoon' | 'festive'> = {
  '06': 'monsoon',
  '07': 'monsoon',
  '08': 'monsoon',
  '09': 'monsoon',
  '10': 'festive',
  '11': 'festive',
  '12': 'festive',
}
const LIMIT = 30

function SeasonalSlider({ id, label, months, value, onChange }: {
  id: string
  label: string
  months: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="scenario-control">
      <div className="row-between">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="tabular-nums">{value > 0 ? '+' : ''}{value}%</output>
      </div>
      <input id={id} type="range" min={-LIMIT} max={LIMIT} step={1} value={value}
        aria-valuetext={`${value > 0 ? 'plus ' : ''}${value} percent`}
        onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <div className="row-between footnote"><span>{-LIMIT}%</span><span>{months}</span><span>+{LIMIT}%</span></div>
    </div>
  )
}

export default function Scenario({ f, onClear }: { f: Filters; onClear: () => void }) {
  const [monsoon, setMonsoon] = useState(0)
  const [festive, setFestive] = useState(0)
  const [pickW, setPickW] = useState<string | null>(null)
  const q = useView<any>('forecast', 'outlook', queryOf(f, undefined, { by: 'family' }, false))
  const cal = useQuery({ queryKey: ['forecast', 'calendar'], queryFn: () => getJson<Record<string, any[]>>('/api/forecast/calendar'), staleTime: Infinity })

  return (
    <ViewShell query={q} errorTitle="Could not load the forecast scenario" onClear={onClear}>
      {(d) => {
        const wk = d.weekly
        const adjustmentFor = (month: string) => {
          if (!month.startsWith('2027')) return 0
          const assumption = MONTHS[month.slice(5, 7)]
          return assumption === 'monsoon' ? monsoon : assumption === 'festive' ? festive : 0
        }
        const adjust = (value: number | null, month: string) => value === null ? null : value * (1 + adjustmentFor(month) / 100)
        const scenario = d.forecast.map((value: number, i: number) => adjust(value, d.fmonths[i]) as number)
        const scenarioWeekly = wk.forecast.map((value: number | null, i: number) => adjust(value, wk.dates[i]))
        const scenarioP50 = wk.p50.map((value: number | null, i: number) => adjust(value, wk.dates[i]))
        const weeklySeries = [
          { name: 'Orders received (actual)', values: wk.actual, tone: 1 as const },
          { name: 'Baseline forecast', values: wk.forecast, tone: 2 as const },
          { name: 'Scenario forecast', values: scenarioWeekly, tone: 3 as const },
        ]
        const weeklyTable = seriesTable('Week starting', wk.dates, weeklySeries, (n) => String(Math.round(n)))
        const annual = d.fmonths.reduce((sum: number, month: string, i: number) => sum + (month.startsWith('2027') ? d.forecast[i] : 0), 0)
        const adjustedAnnual = d.fmonths.reduce((sum: number, month: string, i: number) => sum + (month.startsWith('2027') ? scenario[i] : 0), 0)
        const change = annual > 0 ? adjustedAnnual / annual - 1 : null
        const changeUnits = adjustedAnnual - annual
        const rows = d.fmonths.map((month: string, i: number) => [
          monthLong(month),
          fmtN(d.forecast[i]),
          fmtN(scenario[i]),
          fmtSigned(d.forecast[i] ? scenario[i] / d.forecast[i] - 1 : 0, 1),
        ])
        return (
          <>
            <Tile className="card stack-05">
              <div className="row-between">
                <span className="card-heading">
                  <span className="card-title">Set seasonal demand assumptions</span>
                  <span className="footnote">Applied to the selected forecast filters; the baseline is unchanged.</span>
                </span>
                <Button kind="ghost" size="sm" onClick={() => { setMonsoon(0); setFestive(0) }}>Reset</Button>
              </div>
              <div className="scenario-controls">
                <SeasonalSlider id="scenario-monsoon" label="Monsoon-season demand change" months="Jun–Sep 2027"
                  value={monsoon} onChange={setMonsoon} />
                <SeasonalSlider id="scenario-festive" label="Festive-period demand change" months="Oct–Dec 2027"
                  value={festive} onChange={setFestive} />
              </div>
              <p className="footnote">
                These are user-set demand changes, not predictions of rainfall or measured causal effects. The model&apos;s weekly shape is preserved;
                the selected percentage scales each forecast month in that period. Future weather is not known. Explain this week uses the loaded
                festival calendar; dates not in that calendar cannot be identified as exact festival dates.
              </p>
            </Tile>
            <StatRow items={[
              { label: '2027 baseline (units)', value: fmtN(annual) },
              { label: '2027 scenario (units)', value: fmtN(adjustedAnnual), sublabel: `${fmtSigned(change, 1)} vs baseline` },
              { label: 'Scenario change (units)', value: changeUnits === 0 ? '0' : `${changeUnits > 0 ? '+' : '−'}${fmtN(Math.abs(changeUnits))}` },
            ]} />
            <ChartCard title="Weekly baseline and scenario through Dec 2027"
              subtitle="Choose a forecast week to see its festival-calendar context and scenario adjustment"
              label="Weekly baseline and scenario forecast through December 2027"
              toolbar={<ComboBox id="scenario-why-week" size="sm" titleText="" placeholder="Explain this week"
                items={wk.dates.filter((date: string, i: number) => date.startsWith('2027') && wk.forecast[i] !== null).map((date: string) => ({ id: date, label: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }))}
                itemToString={(item: any) => item?.label ?? ''}
                selectedItem={pickW === null ? null : { id: pickW, label: new Date(`${pickW}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }}
                onChange={({ selectedItem }: any) => setPickW(selectedItem?.id ?? null)} />}
              headers={weeklyTable.headers} rows={weeklyTable.rows}
              chart={<TrendChart kind="week" noDots x={wk.dates} series={weeklySeries}
                yTitle="Orders received per week (units)" yFmt={fmtN}
                label="Weekly baseline and scenario forecast through December 2027" />}
              note="The scenario scales each forecast week in an adjusted month by the same percentage; the baseline weekly profile is preserved." />
            {pickW !== null && (() => {
              const i = wk.dates.indexOf(pickW)
              if (i < 0) return null
              const baseline = wk.forecast[i] as number | null
              const value = scenarioWeekly[i] as number | null
              return <WeekWhy wk={wk} date={pickW} cal={cal.data} onClose={() => setPickW(null)}
                scenarioForecast={{
                  baseline,
                  value,
                  p50: scenarioP50[i] as number | null,
                  previousValue: i > 0 ? scenarioWeekly[i - 1] as number | null : null,
                  change: baseline ? (value ?? baseline) / baseline - 1 : 0,
                }} />
            })()}
            <ChartCard title="Baseline and scenario forecast to Dec 2027"
              subtitle="Only the 2027 seasonal months selected above are adjusted"
              label="Monthly baseline and user-adjusted scenario forecast through December 2027"
              headers={['Month', 'Baseline (units)', 'Scenario (units)', 'Change (%)']}
              rows={rows}
              chart={<TrendChart x={d.fmonths} series={[
                { name: 'Baseline forecast', values: d.forecast, tone: 1 },
                { name: 'Scenario forecast', values: scenario, tone: 2 },
              ]} yTitle="Monthly orders (units)" yFmt={fmtN} label="Baseline and scenario forecast to December 2027" />}
              note="A positive adjustment raises the baseline in the selected months; a negative adjustment lowers it. The scenario is illustrative and does not retrain the model." />
          </>
        )
      }}
    </ViewShell>
  )
}

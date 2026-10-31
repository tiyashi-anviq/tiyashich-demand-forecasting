/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, ComboBox, ContentSwitcher, Dropdown, Switch, Tag } from '@reiq/ui/carbon'
import { fmtN, fmtPct, fmtSigned, monthLong } from '../../lib/format'
import { getJson } from '../../lib/http'
import { queryOf, type Filters } from '../../lib/filters'
import { useView } from '../../lib/useView'
import TrendChart from '../../charts/TrendChart'
import { seriesTable } from '../../charts/kit'
import { G } from '../../lib/glossary'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { Delta, StatRow } from '../../ui/StatRow'
import { Findings } from '../../ui/Findings'
import { ViewShell } from '../../ui/ViewShell'
import WhyMonth from './WhyMonth'
import WeekWhy from './WeekWhy'

const BY = ['family', 'region', 'channel', 'sku'] as const
const BY_LABEL = ['Family', 'Region', 'Channel', 'SKU']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const weekLong = (s: string) => { const [y, m, d] = s.split('-'); return `${+d} ${MON[+m - 1]} ${y}` }

export default function Outlook({ f, onClear }: { f: Filters; onClear: () => void }) {
  const [by, setBy] = useState<(typeof BY)[number]>('family')
  const [hid, setHid] = useState<Record<string, boolean>>({ 'P50 (median)': true })  // the P50 line starts hidden; each line is switched from the legend
  const [pick, setPick] = useState<number | null>(null)
  const [pickW, setPickW] = useState<string | null>(null)
  const q = useView<any>('forecast', 'outlook', queryOf(f, undefined, { by }, false))
  const cal = useQuery({ queryKey: ['forecast', 'calendar'], queryFn: () => getJson<Record<string, any[]>>('/api/forecast/calendar'), staleTime: Infinity })

  return (
    <ViewShell query={q} errorTitle="Could not load the outlook" onClear={onClear}>
      {(d) => {
        const k = d.kpis
        const wk = d.weekly
        const series = [
          { name: 'Orders received (actual)', values: wk.actual, tone: 1 as const },
          { name: 'Forecast (model)', values: wk.forecast, tone: 2 as const },
          { name: 'P50 (median)', values: wk.p50, tone: 6 as const },
        ]
        const tbl = seriesTable('Week starting', wk.dates.map(weekLong), [...series, { name: 'Same week last year', values: wk.last_year, tone: 8 as const }], (n) => String(Math.round(n)))
        const cols: Col<any>[] = [
          { header: BY_LABEL[BY.indexOf(by)], cell: (r) => (r.name ? `${r.label}, ${r.name}` : r.label), sort: (r) => String(r.label).toLowerCase() },
          ...(by === 'sku' ? [{ header: 'Family', cell: (r: any) => r.family, sort: (r: any) => String(r.family).toLowerCase() } as Col<any>] : []),
          { header: 'Last 12 months (units)', num: true, cell: (r) => fmtN(r.last12), sort: (r) => r.last12 },
          { header: '2027 forecast (units)', num: true, cell: (r) => fmtN(r.f27), sort: (r) => r.f27 },
          { header: 'Change (%)', num: true, cell: (r) => <Delta value={r.growth} text={fmtSigned(r.growth, 1)} />, sort: (r) => r.growth },
        ]
        const compare = seriesTable('Month', d.fmonths.map(monthLong), [
          { name: 'Blend', values: d.forecast, tone: 1 }, { name: 'Weekly boosting', values: d.wlgb, tone: 2 }, { name: 'Monthly boosting', values: d.lgb, tone: 3 },
          { name: 'Last year + trend', values: d.sn, tone: 4 }, { name: 'Smoothing', values: d.ets, tone: 5 },
        ], (n) => String(Math.round(n)))
        return (
          <>
            <StatRow items={[
              { label: 'Expected in 2027 (units)', value: fmtN(k.cy2027), sublabel: <Delta value={k.g27} text={`${fmtSigned(k.g27, 1)} on 2026`} /> },
              { label: 'Busiest month ahead', value: monthLong(k.peak_month), sublabel: `${fmtN(k.peak_value)} units` },
              { label: 'Weekly model accuracy', info: G.weekly + ' ' + G.wape, value: fmtPct(1 - wk.week_wape, 1), sublabel: `WAPE ${fmtPct(wk.week_wape, 1)} over ${wk.weeks_scored} unseen weeks` },
            ]} />
            <Findings items={d.notes.filter((n: any) => n.tone !== 'info')} title="Read this first" />


            <ChartCard title="Weekly orders: the test period, then the forecast to Dec 2027"
              toolbar={<>
                <Dropdown id="why-month" size="sm" titleText="" label="Month" items={d.fmonths.map((m: string, i: number) => ({ id: i, label: monthLong(m) }))}
                  itemToString={(i: any) => i?.label ?? ''} selectedItem={pick === null ? null : { id: pick, label: monthLong(d.fmonths[pick]) }}
                  onChange={({ selectedItem }: any) => { setPick(selectedItem ? selectedItem.id : null); setPickW(null) }} />
                <ComboBox id="why-week" size="sm" titleText="" placeholder={pick === null ? 'Explain a week' : 'Then pick a week'}
                  items={wk.dates.filter((x: string, k: number) => (pick === null ? wk.forecast[k] !== null : x.startsWith(d.fmonths[pick]))).map((x: string) => ({ id: x, label: weekLong(x) }))}
                  itemToString={(i: any) => i?.label ?? ''} selectedItem={pickW === null ? null : { id: pickW, label: weekLong(pickW) }}
                  onChange={({ selectedItem }: any) => { setPickW(selectedItem ? selectedItem.id : null) }} />
              </>}
              subtitle="Units of orders received per week, from the start of the test period (Oct 2025). Before the forecast starts, the forecast line is what the model predicted in advance for weeks it had not seen, so you can compare it with the actuals. Pick a month to see why it looks that way, then a week in it to see that week."
              label="Weekly orders received from October 2025, with the model forecast and P50 to December 2027"
              headers={tbl.headers} rows={tbl.rows}
              chart={<div className="stack-03"><div className="row-03" role="group" aria-label="Choose which lines to show">{series.map((s) => { const on = !hid[s.name]; return (<Button key={s.name} kind={on ? 'tertiary' : 'ghost'} size="sm" aria-pressed={on} onClick={() => setHid({ ...hid, [s.name]: on })}><span className={`line-swatch tone-${s.tone} ${on ? '' : 'off'}`} aria-hidden="true" />{s.name}</Button>) })}</div><TrendChart legend={false} kind="week" noDots zero={false} x={wk.dates} series={series.filter((s) => !hid[s.name])} yTitle="Orders received per week (units)" yFmt={(n) => fmtN(n)}
                markers={wk.forecast_starts ? [{ i: wk.dates.indexOf(wk.forecast_starts), label: 'Forecast starts' }] : []}
                label="Weekly orders received from October 2025, with the model forecast and P50 to December 2027" /></div>}
              note={<>Each point is one week (Monday start). Oct 2025 to Sep 2026 are weeks the model had not seen: each month&apos;s forecast was made ahead of time, so the gap to the actual line is the real miss. Each month&apos;s forecast is split across its weeks using the weekly model&apos;s own shape, so the build-up before a festival shows week by week. October 2026 is only partly in. The P50 is the forecast times the median past miss for these filters, so half of the weeks landed above it. <Tag type="cool-gray" size="sm" title="Computed from the model, not an actual">Est.</Tag></>} />

            {/* below the chart, not above it: opening it must not push the graph off the screen */}
            {pickW !== null && <WeekWhy wk={wk} date={pickW} cal={cal.data} onClose={() => setPickW(null)} />}
            {pickW === null && pick !== null && pick < d.fmonths.length && <WhyMonth d={d} i={pick} cal={cal.data} onClose={() => setPick(null)} />}

            {(() => {
              const ws = wk.dates.map((_: string, n: number) => ({ d: wk.dates[n], v: wk.week_pct[n] })).filter((x: any) => x.v !== null)
              const x = ws.map((r: any) => r.d)
              const es = [{ name: 'WAPE for the week (%)', values: ws.map((r: any) => r.v * 100), tone: 2 as const }]
              const et = seriesTable('Week starting', x.map(weekLong), es, (n) => String(Math.round(n * 10) / 10))
              return (
                <ChartCard title="Model error (WAPE), week by week"
                  subtitle="For each week of the test period: the gap between the forecast and the actual orders, divided by that week's actual orders. Lower is better."
                  label="Weekly WAPE over the test period"
                  headers={et.headers} rows={et.rows}
                  chart={<TrendChart kind="week" noDots zero x={x} series={es} yTitle="WAPE (%)" yFmt={(n) => `${n.toFixed(0)}%`} label="Weekly WAPE over the test period" />}
                  note={`Over the ${wk.weeks_scored} weeks scored, WAPE was ${fmtPct(wk.week_wape, 1)} in total (under-forecast ${fmtPct(wk.week_under, 1)}, over-forecast ${fmtPct(wk.week_over, 1)}), for these filters. A single week misses by more than the whole period does, because misses in opposite directions cancel as weeks are added up.`} />
              )
            })()}

            <ContentSwitcher size="sm" selectedIndex={BY.indexOf(by)} onChange={({ index = 0 }) => setBy(BY[index])}>
              {BY_LABEL.map((l) => <Switch key={l} name={l} text={l} />)}
            </ContentSwitcher>
            <DataCard id="split" title="Where the 2027 volume sits" description="Last 12 months of orders against the 2027 forecast"
              cols={cols} rows={d.breakdown} itemsLabel="Rows per page" rowKey={(r) => String(r.label)}
              defaultSort={{ col: by === 'sku' ? 3 : 2, dir: 'desc' }}
              note={by === 'sku' ? `Each SKU gets its family, region and channel forecast multiplied by its share of that group's orders in the last 8 weeks before the forecast starts. ${d.breakdown_total > d.breakdown.length ? `Showing the biggest ${d.breakdown.length} of ${d.breakdown_total}.` : ''}` : undefined} />

            <div className="grid">
              <ChartCard title="How the three methods compare" subtitle="Forecast by method. The blend is the number this screen uses."
                label="Forecast by method, next months" headers={compare.headers} rows={compare.rows}
                chart={<TrendChart x={d.fmonths} series={[
                  { name: 'Blend', values: d.forecast, tone: 1 }, { name: 'Weekly boosting', values: d.wlgb, tone: 2 }, { name: 'Monthly boosting', values: d.lgb, tone: 3 },
                  { name: 'Last year + trend', values: d.sn, tone: 4 }, { name: 'Smoothing', values: d.ets, tone: 5 },
                ]} yTitle="Units" yFmt={(n) => fmtN(n)} label="Forecast by method, next months" />}
                note={`Blend weights: weekly boosting ${fmtPct(d.weights['3'].wlgb)}, monthly boosting ${fmtPct(d.weights['3'].lgb)}, last year + trend ${fmtPct(d.weights['3'].sn)}, smoothing ${fmtPct(d.weights['3'].ets)}. They were set on Oct 2024 to Sep 2025, not on the test months.`} />
</div>
          </>
        )
      }}
    </ViewShell>
  )
}

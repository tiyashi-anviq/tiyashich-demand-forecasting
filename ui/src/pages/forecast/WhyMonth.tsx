/* eslint-disable @typescript-eslint/no-explicit-any */
import { Close } from '@carbon/icons-react'
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tile } from '@reiq/ui/carbon'
import { fmtN, fmtPct, fmtSigned, monthLong } from '../../lib/format'
import { Delta, StatRow } from '../../ui/StatRow'

const NAMES: Record<string, string> = { wlgb: 'Weekly boosting', lgb: 'Monthly boosting', sn: 'Last year + trend', ets: 'Smoothing' }
const ABOUT: Record<string, string> = {
  wlgb: 'Learns week by week how stocking builds in the weeks before each festival, then adds the weeks up',
  lgb: 'Learns from sales, price, festival dates and the calendar across all series',
  sn: 'Same month last year, carried forward at the recent growth rate',
  ets: 'Recent level and trend, damped so it does not run away',
}
const dlong = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const ratio = (a: number, b: number | null | undefined) => (b ? a / b - 1 : null)

/** The reasons behind one forecast month: how it compares, what each method says, and what the calendar holds. */
export default function WhyMonth({ d, i, cal, onClose }: { d: any; i: number; cal: Record<string, any[]> | undefined; onClose: () => void }) {
  const m: string = d.fmonths[i]
  const F: number = d.forecast[i]
  const ly: number | null = d.last_year[i]
  const prev: number = i > 0 ? d.forecast[i - 1] : d.actual[d.actual.length - 1]
  const prevLabel = i > 0 ? monthLong(d.fmonths[i - 1]) : monthLong(d.months[d.months.length - 1])
  const yoy = ratio(F, ly), mom = ratio(F, prev)
  const w = d.weights['3']
  const pulls = ['wlgb', 'lgb', 'sn', 'ets'].map((k) => ({ k, value: d[k][i] as number, w: w[k] as number, pull: (w[k] as number) * (d[k][i] as number) }))
  const lo = Math.min(...pulls.map((p) => p.value)), hi = Math.max(...pulls.map((p) => p.value))
  const spread = F ? (hi - lo) / F : 0
  const top = pulls.slice().sort((a, b) => b.pull - a.pull)[0]
  const fest = cal?.[m] ?? []
  // A festival's stocking window can start in the month before the festival itself.
  const [yy, mm] = m.split('-').map(Number)
  const nextKey = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}`
  const lead = (cal?.[nextKey] ?? []).filter((f) => f.peak_from.slice(0, 7) <= m)
  const h = Math.min(i + 1, 3)
  const acc = d.accuracy[`M${h}`]
  const bits: string[] = []
  bits.push(`The model expects ${fmtN(F)} units in ${monthLong(m)}${yoy === null ? '' : `, ${fmtSigned(yoy, 1)} on the same month last year`}${mom === null ? '' : ` and ${fmtSigned(mom, 1)} on ${prevLabel}`}.`)
  if (fest.length) bits.push(`${fest.map((f) => f.name).join(' and ')} fall${fest.length === 1 ? 's' : ''} in this month, which is what lifts it.`)
  else if (lead.length) bits.push(`${lead.map((f) => f.name).join(' and ')} follow${lead.length === 1 ? 's' : ''} next month, so dealers are already stocking up.`)
  bits.push(spread < 0.1 ? 'The three methods broadly agree.' : `The three methods are ${fmtPct(spread, 0)} apart, so read this one with care.`)

  return (
    <Tile className="card stack-05" aria-label={`Why the forecast for ${monthLong(m)}`}>
      <div className="row-between">
        <span className="card-heading">
          <span className="card-title">Why {monthLong(m)} looks like this</span>
          <span className="footnote">Forecast for the filters above, {h} month{h === 1 ? '' : 's'} or more ahead of the data</span>
        </span>
        <Button kind="ghost" size="sm" hasIconOnly renderIcon={Close} iconDescription="Close this explanation" onClick={onClose} />
      </div>

      <StatRow items={[
        { label: 'Forecast (units)', value: fmtN(F) },
        { label: 'Same month last year (units)', value: ly === null ? '–' : fmtN(ly), sublabel: <Delta value={yoy} text={fmtSigned(yoy, 1)} /> },
        { label: `${prevLabel}, ${i > 0 ? 'forecast' : 'actual'} (units)`, value: fmtN(prev), sublabel: <Delta value={mom} text={fmtSigned(mom, 1)} /> },
        { label: 'P50, the median outcome (units)', value: fmtN(d.p50[i]) },
      ]} />

      <div className="why-short"><p>{bits.join(' ')}</p></div>

      <div className="stack-03">
        <h3 className="card-title-sm">What each method says</h3>
        <p className="supporting">The forecast is each method&apos;s number times its weight, added up. The pulls sum to {fmtN(F)} units.</p>
        <div className="table-scroll thin-scroll">
          <Table size="md" aria-label="What each method says">
            <TableHead>
              <TableRow>
                <TableHeader>Method</TableHeader>
                <TableHeader className="cell-num">Says (units)</TableHeader>
                <TableHeader className="cell-num">Weight (%)</TableHeader>
                <TableHeader>Pull (units)</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {pulls.map((p) => (
                <TableRow key={p.k}>
                  <TableCell><div className="stack-03"><span>{NAMES[p.k]}</span><span className="footnote">{ABOUT[p.k]}</span></div></TableCell>
                  <TableCell className="cell-num">{fmtN(p.value)}</TableCell>
                  <TableCell className="cell-num">{fmtPct(p.w, 0)}</TableCell>
                  <TableCell>
                    <div className="row-03">
                      <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ inlineSize: `${F ? Math.max(2, (p.pull / F) * 100) : 0}%` }} /></div>
                      <span className="tabular-nums">{fmtN(p.pull)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell><strong>Forecast</strong></TableCell><TableCell /><TableCell className="cell-num">100%</TableCell>
                <TableCell><strong className="tabular-nums">{fmtN(pulls.reduce((a, p) => a + p.pull, 0))}</strong></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="footnote">{NAMES[top.k]} carries the most weight here ({fmtN(top.pull)} of {fmtN(F)} units). The weights were fitted on past forecast misses, not chosen by hand.</p>
      </div>

      <div className="stack-03">
        <h3 className="card-title-sm">Facts about the period</h3>
        <ul className="why-facts">
          {fest.map((f) => <li key={f.name + f.date}><strong>{f.name}</strong> on {dlong(f.date)}. Dealer stocking runs for about {f.weeks} weeks before it, from {dlong(f.peak_from)}.</li>)}
          {lead.map((f) => <li key={`l${f.name}`}><strong>{f.name}</strong> is on {dlong(f.date)}; its stocking window starts {dlong(f.peak_from)}, inside this month.</li>)}
          {!fest.length && !lead.length && <li>No festival or stocking window falls in this month.</li>}
          <li>The P50 is {fmtN(d.p50[i])} units and the model forecast {fmtN(F)} units.</li>
          {i < 3
            ? <li>Past forecasts made {h} month{h === 1 ? '' : 's'} ahead were off by {fmtPct(acc.wape, 1)} on the monthly total for these filters.</li>
            : <li>This is more than 3 months ahead. Past 3-month forecasts were off by {fmtPct(d.accuracy.M3.wape, 1)}; beyond that there is no backtest, so expect more.</li>}
        </ul>
      </div>
    </Tile>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Close } from '@carbon/icons-react'
import { Button, Tile } from '@reiq/ui/carbon'
import { fmtN, fmtPct, fmtSigned } from '../../lib/format'
import { Delta, StatRow } from '../../ui/StatRow'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dlong = (s: string) => { const [y, m, d] = s.split('-'); return `${+d} ${MON[+m - 1]} ${y}` }
const addDays = (s: string, n: number) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10)
const ratio = (a: number | null | undefined, b: number | null | undefined) => (a && b ? a / b - 1 : null)

/** The reasons behind one week of the weekly chart: its forecast and actual, how it compares, and which festivals sit near it. */
export default function WeekWhy({ wk, date, cal, onClose, scenarioForecast }: {
  wk: any
  date: string
  cal: Record<string, any[]> | undefined
  onClose: () => void
  scenarioForecast?: {
    baseline: number | null
    value: number | null
    p50: number | null
    previousValue: number | null
    change: number
  }
}) {
  const n: number = wk.dates.indexOf(date)
  if (n < 0) return null
  const F: number | null = scenarioForecast?.value ?? wk.forecast[n]
  const P: number | null = scenarioForecast?.p50 ?? wk.p50[n]
  const A: number | null = wk.actual[n]
  const ly: number | null = wk.last_year[n]
  const pv = n > 0 ? (wk.actual[n - 1] ?? scenarioForecast?.previousValue ?? wk.forecast[n - 1]) : null
  const pvKind = n > 0 && wk.actual[n - 1] !== null ? 'actual' : 'forecast'
  const month = date.slice(0, 7)
  const inMonth = wk.dates.map((d: string, k: number) => ({ d, f: wk.forecast[k] })).filter((x: any) => x.d.startsWith(month) && x.f !== null)
  const baselineMonth = inMonth.reduce((s: number, x: any) => s + x.f, 0)
  const scenarioMonth = scenarioForecast?.baseline && scenarioForecast.value !== null
    ? baselineMonth * scenarioForecast.value / scenarioForecast.baseline
    : baselineMonth
  const share = F !== null && scenarioMonth ? F / scenarioMonth : null
  const weekEnd = addDays(date, 6)
  const all: any[] = Object.values(cal ?? {}).flat()
  const calendarThrough = all.reduce((last: string | null, f) => f.date > (last ?? '') ? f.date : last, null)
  const on = all.filter((f) => f.date >= date && f.date <= weekEnd)
  const stocking = all.filter((f) => f.date > weekEnd && f.peak_from <= weekEnd)
  const after = all.filter((f) => f.date < date && f.date >= addDays(date, -14))
  const vsLy = ratio(F, ly), vsPv = ratio(F, pv)
  const bits: string[] = []
  if (F !== null) bits.push(`${scenarioForecast ? 'With your scenario assumption, the forecast is' : 'The model expects'} ${fmtN(F)} units in the week of ${dlong(date)}${vsLy === null ? '' : `, ${fmtSigned(vsLy, 1)} on the same week last year`}${vsPv === null ? '' : ` and ${fmtSigned(vsPv, 1)} on the week before`}.`)
  if (on.length) bits.push(`${on.map((f) => `${f.name} (${dlong(f.date)})`).join(' and ')} fall${on.length === 1 ? 's' : ''} in this week.`)
  else if (stocking.length) bits.push(`${stocking.map((f) => `${f.name} (${dlong(f.date)})`).join(' and ')} come${stocking.length === 1 ? 's' : ''} up during the stocking window, so this week sits inside it.`)
  else if (after.length) bits.push(`${after.map((f) => `${f.name} (${dlong(f.date)})`).join(' and ')} just passed, so orders are easing back.`)
  else if (!cal) bits.push('The festival calendar has not loaded, so festival context is not available yet.')
  else if (calendarThrough && date > calendarThrough) bits.push(`No festival is listed for this week. The loaded festival calendar currently ends on ${dlong(calendarThrough)}, so later festival dates may be missing.`)
  else bits.push('No festival falls in or just around this week in the loaded calendar, so it follows the usual pattern.')
  if (scenarioForecast) bits.push(`The scenario changes this week's baseline by ${fmtSigned(scenarioForecast.change, 0)}; it changes the forecast level, not the week-by-week shape.`)
  if (A !== null && F !== null) bits.push(`This week had actual orders of ${fmtN(A)}, ${fmtPct(Math.abs(F - A) / A, 1)} ${F >= A ? 'above' : 'below'} the forecast made in advance.`)

  return (
    <Tile className="card stack-05" aria-label={`Why the forecast for the week of ${dlong(date)}`}>
      <div className="row-between">
        <span className="card-heading">
          <span className="card-title">Why the week of {dlong(date)} looks like this</span>
          <span className="footnote">{scenarioForecast ? 'Scenario forecast for the filters above. The seasonal assumption scales the baseline while keeping the weekly model’s shape.' : 'Forecast for the filters above. Each month is split into its weeks using the weekly model’s own shape.'}</span>
        </span>
        <Button kind="ghost" size="sm" hasIconOnly renderIcon={Close} iconDescription="Close this explanation" onClick={onClose} />
      </div>
      <StatRow items={[
        { label: scenarioForecast ? 'Scenario forecast (units)' : 'Forecast (units)', value: F === null ? '–' : fmtN(F) },
        ...(scenarioForecast ? [{ label: 'Baseline forecast (units)', value: scenarioForecast.baseline === null ? '–' : fmtN(scenarioForecast.baseline) }] : []),
        { label: 'Actual orders (units)', value: A === null ? 'Not yet' : fmtN(A), sublabel: A !== null && F ? <Delta value={A / F - 1} text={`${fmtSigned(A / F - 1, 1)} on forecast`} /> : undefined },
        { label: 'Same week last year (units)', value: ly === null ? '–' : fmtN(ly), sublabel: vsLy === null ? undefined : <Delta value={vsLy} text={fmtSigned(vsLy, 1)} /> },
        { label: 'Share of its month', value: share === null ? '–' : fmtPct(share, 0), sublabel: P === null ? undefined : `P50 ${fmtN(P)} units` },
      ]} />
      <div className="why-short"><p>{bits.join(' ')}{pv === null ? '' : ''}</p></div>
      {pv !== null && <p className="footnote">Week before ({pvKind}): {fmtN(pv)} units.</p>}
    </Tile>
  )
}

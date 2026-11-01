/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { ArrowDown, ArrowUp } from '@carbon/icons-react'
import { ContentSwitcher, InlineLoading, Switch, Tag } from '@reiq/ui/carbon'
import { fmtPct, fmtSigned } from '../../lib/format'
import { queryOf, type Filters, type Options } from '../../lib/filters'
import { useView } from '../../lib/useView'
import BarsChart from '../../charts/BarsChart'
import HeatChart from '../../charts/HeatChart'
import TrendChart from '../../charts/TrendChart'
import { ChartCard } from '../../ui/ChartCard'
import { DataCard, type Col } from '../../ui/DataCard'
import { StatRow } from '../../ui/StatRow'
import { Findings } from '../../ui/Findings'
import { MiniBar } from '../../ui/MiniBar'
import { ViewShell } from '../../ui/ViewShell'

const GROUP_LABEL: Record<string, string> = { calendar: 'Calendar', weather: 'Weather', price: 'Price and promo', commercial: 'Downstream', macro: 'Macro', identity: 'Base level' }
const VERDICT: Record<string, any> = { Keep: 'green', Test: 'blue', Drop: 'gray' }
const pts = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)} pts`

export default function Drivers({ f, opts, onClear }: { f: Filters; opts: Options; onClear: () => void }) {
  const [feature, setFeature] = useState('')
  const [lagMode, setLagMode] = useState<'adjusted' | 'raw'>('adjusted')
  const q = useView<any>('eda', 'drivers', queryOf(f, opts, feature ? { feature } : {}))
  return (
    <ViewShell query={q} errorTitle="Could not load the demand drivers" emptyTitle="Too little data for these filters"
      emptyMessage="Widen the family, region, channel or period so there are at least 500 weekly values." onClear={onClear}>
      {(d) => {
        if (d.state && d.state !== 'ready') {
          return (
            <div className="stack-03" role="status">
              <InlineLoading status={d.state === 'error' ? 'error' : 'active'} description={d.state === 'error' ? 'Model training failed.' : (d.message || 'Training driver model...')} />
              <p className="supporting">Building predictive model to identify demand drivers. First run takes ~1 minute.</p>
            </div>
          )
        }
        const v = d.validation
        const rows: any[] = d.rows ?? []
        const top = rows[0]?.shap || 1
        const lag = d.lag
        const lagHead = lag.lags.map((l: number) => (l === 0 ? 'Now' : `${l} weeks earlier`))
        const bestNote = lag.rows.map((r: any) => `${r.label}: ${r[`best_lag_${lagMode}`] === 0 ? 'same week' : `${r[`best_lag_${lagMode}`]} weeks earlier`}`).join('. ')
        const rankCols: Col<any>[] = [
          { header: 'Covariate', cell: (r) => (r.limited ? `${r.label}, limited coverage` : r.label), sort: (r) => String(r.label).toLowerCase() },
          { header: 'Group', cell: (r) => <Tag size="sm" type="gray">{GROUP_LABEL[r.group]}</Tag>, sort: (r) => String(r.group) },
          { header: 'Importance, SHAP (%)', cell: (r) => <MiniBar value={r.shap / top} text={fmtPct(r.shap_share, 1)} />, sort: (r) => r.shap },
          { header: 'Correlation', num: true, cell: (r) => (r.pearson === null ? '–' : r.pearson.toFixed(2)), sort: (r) => r.pearson },
          { header: 'Mutual information', num: true, cell: (r) => r.mi.toFixed(2), sort: (r) => r.mi },
          { header: 'Effect, high vs low (%)', num: true, cell: (r) => (r.effect === null ? '–' : <span className="delta">{r.effect >= 0 ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />} {fmtSigned(Math.abs(r.effect))}</span>), sort: (r) => r.effect },
          { header: 'Best lag', cell: (r) => (r.best_lag === null || r.best_lag === undefined ? '–' : r.best_lag === 0 ? 'Same week' : `${r.best_lag} weeks earlier`), sort: (r) => r.best_lag },
          { header: 'Verdict', cell: (r) => <Tag size="sm" type={VERDICT[r.verdict]}>{r.verdict}</Tag>, sort: (r) => String(r.verdict) },
        ]
        const exCols: Col<any>[] = [
          { header: 'Region', cell: (r) => r.region },
          { header: 'Same week', num: true, cell: (r) => r.same_week.toFixed(2) },
          { header: 'One week earlier', num: true, cell: (r) => r.one_week_earlier.toFixed(2) },
          { header: 'Seasonality removed', num: true, cell: (r) => r.after_seasonal.toFixed(2) },
        ]
        const engCols: Col<any>[] = [
          { header: 'Factor', cell: (e) => `${e.factor}, from ${e.raw}`, sort: (e) => String(e.factor).toLowerCase() },
          { header: 'Engineered covariate', cell: (e) => e.engineered },
          { header: 'Model layer', cell: (e) => e.model },
          { header: 'Share (%)', num: true, cell: (e) => (e.present ? fmtPct(e.shap_share, 1) : 'Not in data'), sort: (e) => (e.present ? e.shap_share : -1) },
        ]
        const leakCols: Col<any>[] = [
          { header: 'Group', cell: (l) => l.label },
          { header: 'Status', cell: (l) => <Tag size="sm" type={l.status === 'Safe' ? 'green' : 'warm-gray'}>{l.status}</Tag> },
          { header: 'What to do', cell: (l) => l.note },
        ]
        const ev = d.event_study
        const evSeries = [
          ...ev.rows.filter((r: any) => /Lighting|Batteries/.test(r.family)).map((r: any, k: number) => ({ name: r.family, values: r.values, tone: (k + 1) as any })),
          ...(d.reference_index ? Object.entries(d.reference_index.series).filter(([k]) => /LED|Batteries/.test(k)).map(([k, vals]: any, j) => ({
            name: `Reference: ${k.replace('_Index', '').replace(/_/g, ' ')}`, tone: (j + 3) as any,
            values: ev.weeks.map((w: number) => { const i = d.reference_index.weeks.indexOf(w); return i >= 0 ? vals[i] : null }),
          })) : []),
        ]
        const resp = d.response
        return (
          <>
            <Findings items={d.findings} title="What the data says" />
            <StatRow items={[
              { label: 'Test Period Error (%)', value: fmtPct(v.full.monthly_wape, 1), info: 'WAPE on unseen test months' },
              { label: 'Under-forecast (%)', value: fmtPct(v.full.under_pct, 1), sublabel: 'Lost sales risk' },
              { label: 'Over-forecast (%)', value: fmtPct(v.full.over_pct, 1), sublabel: 'Excess stock risk' },
              { label: 'Variance Explained (R²)', value: v.full.r2.toFixed(2), info: '0 to 1 scale, higher is better' },
            ]} />
            <p className="supporting">Test period: {v.n_test.toLocaleString('en-IN')} weeks from {String(v.test_start).slice(0, 7)} (unseen by model)</p>

            <div className="grid">
              <ChartCard title="Feature Group Importance" subtitle="Model attention by covariate group (SHAP)" label="Feature importance"
                headers={['Group', 'Share (%)']} rows={d.groups.map((g: any) => [g.label, fmtPct(g.share, 1)])}
                chart={<BarsChart horizontal items={d.groups.map((g: any) => ({ label: g.label, value: g.share, tone: g.group === 'identity' ? 8 : 1 }))} yTitle="Share (%)" fmt={(n) => fmtPct(n, 0)} label="Feature importance" />} />
              <ChartCard title="Ablation Analysis" subtitle="Error increase when group removed (positive = helpful)" label="Ablation study"
                headers={['Group', 'Error without (%)', 'Change']} rows={v.ablation.map((a: any) => [a.label, fmtPct(a.monthly_wape, 1), pts(a.wape_change)])}
                chart={<BarsChart horizontal items={v.ablation.map((a: any) => ({ label: a.label, value: a.wape_change * 100, tone: a.wape_change > 0.0005 ? 1 : 8 }))} yTitle="Error change (pts)" fmt={(n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`} label="Ablation study" />}
                note="Gray = no improvement on test data" />
            </div>

            <DataCard id="rank" title="Feature Rankings" description="Click a row to view its response curve below. Verdict is a guideline, not a rule."
              cols={rankCols} rows={rows} itemsLabel="Covariates per page" rowKey={(r) => r.id} onRow={(r) => setFeature(r.id)} selected={(r) => r.id === d.feature} defaultOpen
              note="SHAP: feature impact on predictions. MI: nonlinear relationships. Effect: high vs low decile." />

            <div className="grid">
              <ChartCard title={`How demand responds to ${resp.label.toLowerCase()}`} subtitle="Demand relative to each series' usual level, by range of the covariate" label={`Demand response to ${resp.label.toLowerCase()}`}
                headers={['Range', ...resp.series.map((s: any) => s.name)]} rows={resp.x.map((x: string, i: number) => [x, ...resp.series.map((s: any) => fmtSigned(s.values[i], 1))])}
                chart={resp.series.length ? <TrendChart kind="labels" x={resp.x} series={resp.series.map((s: any, k: number) => ({ name: s.name, values: s.values, tone: (k + 1) as any }))} yTitle="Against the usual level (%)" yFmt={(n) => fmtSigned(n, 0)} zero={false} label={`Demand response to ${resp.label.toLowerCase()}`} pointsAlways />
                  : <p className="supporting">Not enough data to draw this.</p>} />
              <div style={{ gridColumn: "1 / -1" }}><ChartCard title="Do covariates lead demand?" subtitle="Correlation with demand when the covariate is shifted back by 0 to 6 weeks" label="Correlation of each covariate with demand at each lag"
                toolbar={<ContentSwitcher size="sm" selectedIndex={lagMode === 'adjusted' ? 0 : 1} onChange={({ index = 0 }) => setLagMode(index === 0 ? 'adjusted' : 'raw')}>
                  <Switch name="adjusted" text="Without seasonality" /><Switch name="raw" text="As is" /></ContentSwitcher>}
                headers={['Covariate', ...lagHead]} rows={lag.rows.map((r: any) => [r.label, ...r[lagMode].map((x: number | null) => (x === null ? '' : x.toFixed(2)))])}
                chart={<HeatChart rows={lag.rows.map((r: any) => r.label)} cols={lagHead} values={lag.rows.map((r: any) => r[lagMode])} diverging domain={[-0.5, 0.5]} fmt={(n) => n.toFixed(2)} legendTitle="Correlation" label="Correlation of each covariate with demand at each lag" />}
                note={`${lagMode === 'adjusted' ? 'The usual seasonal pattern is taken out of both sides, so this shows short-run effects.' : 'Seasonal patterns line up with each other, so this overstates how closely covariates track demand.'} Strongest lag: ${bestNote}.`} /></div>
              <ChartCard title="Does the Diwali run-up show in the data?" subtitle="Average demand by week relative to Diwali (negative is before), against the reference index in your data pack" label="Demand by week relative to Diwali"
                headers={['Weeks from Diwali', ...evSeries.map((s: any) => s.name)]} rows={ev.weeks.map((w: number, i: number) => [w, ...evSeries.map((s: any) => (s.values[i] === null || s.values[i] === undefined ? '' : s.values[i].toFixed(2)))])}
                chart={<TrendChart kind="labels" x={ev.weeks.map((w: number) => String(w))} series={evSeries} yTitle="Demand against the usual level (index)" yFmt={(n) => n.toFixed(2)} zero={false} label="Demand by week relative to Diwali" />}
                note="Reference lines are the pattern your data pack says to expect. If they differ from what happened, the model needs a sharper Diwali feature than a simple window." />
              <DataCard id="example" title="Example: Rainfall vs Battery Demand" description="Weekly correlation by region (validates framework assumption)"
                cols={exCols} rows={d.example_check.rows} itemsLabel="Regions per page" rowKey={(r) => r.region} defaultOpen
                note="Shows how rainfall correlates with battery orders. After removing seasonal patterns, correlation drops (last column), confirming both follow monsoon calendar." />
              <ChartCard title="Which covariates repeat each other?" subtitle="Correlation among the 12 leading covariates. Pairs near ±1 carry the same information." label="Correlation among the leading covariates"
                headers={['Covariate', ...d.collinearity.labels]} rows={d.collinearity.matrix.map((r: number[], i: number) => [d.collinearity.labels[i], ...r.map((x) => x.toFixed(2))])}
                chart={<HeatChart rows={d.collinearity.labels} cols={d.collinearity.labels.map((_: string, i: number) => String(i + 1))} values={d.collinearity.matrix} diverging domain={[-1, 1]} fmt={(n) => n.toFixed(2)} legendTitle="Correlation" label="Correlation among the leading covariates" />}
                note="Columns are numbered in the order of the rows; the table view names them." />
              <DataCard id="engineered" title="Feature Engineering Details" description="How raw metrics become model features (click to expand)" cols={engCols} rows={d.engineered} itemsLabel="Factors per page" rowKey={(e) => e.factor} />
            </div>

            <DataCard id="leakage" title="Data Availability Check" description="Are these features available at forecast time? (click to expand)" cols={leakCols} rows={d.leakage} itemsLabel="Groups per page" rowKey={(l) => l.group} />
          </>
        )
      }}
    </ViewShell>
  )
}

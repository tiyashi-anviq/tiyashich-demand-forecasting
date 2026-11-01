/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ComboBox, ContentSwitcher, Dropdown, Switch, Tag } from '@reiq/ui/carbon'
import { NumField } from '../../ui/NumField'
import { getJson } from '../../lib/http'
import { fmtN } from '../../lib/format'
import { ViewShell } from '../../ui/ViewShell'
import { DataCard, type Col } from '../../ui/DataCard'
import { StatRow } from '../../ui/StatRow'
import { ChartCard } from '../../ui/ChartCard'
import TrendChart from '../../charts/TrendChart'

const ANY = 'Any', ALL = 'All', AUTO = 'Auto'
const r0 = (v: number) => Math.round(v).toLocaleString('en-IN')
const x = (v: number) => `×${v.toFixed(2)}`

export default function Planner() {
  const opts = useQuery({ queryKey: ['np', 'options'], queryFn: () => getJson<any>('/api/new-products/options'), staleTime: Infinity })
  const [mode, setMode] = useState<'upgrade' | 'new_range'>('upgrade'), [base, setBase] = useState<string | null>(null)
  const [fam, setFam] = useState('Consumer Lighting'), [sub, setSub] = useState(ANY), [price, setPrice] = useState(99)
  const [region, setRegion] = useState(ALL), [channel, setChannel] = useState(ALL), [month, setMonth] = useState(11)
  const [nd, setNd] = useState(60), [scheme, setScheme] = useState(5), [cat, setCat] = useState(AUTO), [sens, setSens] = useState('Medium')
  const nr = mode === 'new_range'
  const effCat = nr ? (cat !== AUTO ? cat : opts.data?.categories?.[0]) : undefined
  const qs = new URLSearchParams({ mode, price: String(price), month: String(month), nd: String(nd), scheme: String(scheme), sensitivity: sens })
  if (!nr) qs.set('family', fam)
  if (!nr && base) qs.set('base_sku', base)
  if (!nr && sub !== ANY) qs.set('sub', sub)
  if (region !== ALL) qs.set('region', region)
  if (channel !== ALL) qs.set('channel', channel)
  if (nr && effCat) qs.set('category', effCat)
  const q = useQuery({ queryKey: ['np', 'plan', qs.toString()], queryFn: () => getJson<any>(`/api/new-products/plan?${qs}`), enabled: opts.isSuccess && (!nr || !!effCat), placeholderData: (p: any) => p })
  const o = opts.data
  const dd = (id: string, title: string, items: string[], val: string, set: (v: string) => void) => (
    <Dropdown id={id} size="md" titleText={title} label={title} items={items} itemToString={(i: string | null) => i ?? ''} selectedItem={val} onChange={({ selectedItem }: any) => selectedItem && set(selectedItem)} />
  )
  const mcols: Col<any>[] = [
    { header: 'Product', cell: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
    { header: 'Code', cell: (r) => r.sku },
    { header: 'Sub-category', cell: (r) => r.sub ?? '' },
    { header: 'Price (₹)', num: true, cell: (r) => r0(r.price), sort: (r) => r.price },
    { header: 'Similarity (0 to 100)', num: true, cell: (r) => r.score.toFixed(0), sort: (r) => r.score },
    { header: 'Settled weekly sales (units)', num: true, cell: (r) => fmtN(r.weekly), sort: (r) => r.weekly },
  ]
  const bcols: Col<any>[] = [
    { header: 'Brand', cell: (r) => r.brand, sort: (r) => r.brand },
    { header: 'Share of category units', num: true, cell: (r) => `${(r.share * 100).toFixed(1)}%`, sort: (r) => r.share },
    { header: 'Stores reached (%)', num: true, cell: (r) => r.nd.toFixed(1), sort: (r) => r.nd },
    { header: 'Average price (₹)', num: true, cell: (r) => r0(r.price), sort: (r) => r.price },
    { header: 'Share per unit of reach', num: true, cell: (r) => r.prod.toFixed(2), sort: (r) => r.prod },
  ]
  const dcols: Col<any>[] = [
    { header: 'Driver', cell: (r) => r.d },
    { header: 'Your input', cell: (r) => r.i },
    { header: 'What the data shows', cell: (r) => r.ref },
    { header: 'Effect on own-range estimate', num: true, cell: (r) => r.own },
    { header: 'Effect on market estimate', num: true, cell: (r) => r.ext },
  ]
  return (
    <div className="stack-05">
      {o ? (
        <>
          <div className="row-03">
            <ContentSwitcher size="md" selectedIndex={nr ? 1 : 0} onChange={({ index = 0 }: any) => setMode(index === 1 ? 'new_range' : 'upgrade')}>
              <Switch name="upgrade" text="Upgrade of a product we sell" /><Switch name="new_range" text="New product range" />
            </ContentSwitcher>
          </div>
          <div className="row-03">
            {nr ? dd('np-k', 'Market category it will sit in', o.categories, effCat ?? '', setCat) : (<>
            <Dropdown id="np-f" size="md" titleText="Product family" label="Family" items={o.families} itemToString={(i: string | null) => i ?? ''} selectedItem={fam} onChange={({ selectedItem }: any) => { if (selectedItem) { setFam(selectedItem); setSub(ANY); setBase(null) } }} />
            {dd('np-s', 'Sub-category', [ANY, ...(o.subs[fam] ?? [])], sub, (v) => { setSub(v) })}
            <ComboBox id="np-b" size="md" titleText="Product being upgraded" placeholder="Pick the product it replaces (optional)"
              items={(o.products ?? []).filter((p: any) => p.family === fam)} itemToString={(i: any) => (i ? `${i.name} (${i.sku})` : '')}
              selectedItem={(o.products ?? []).find((p: any) => p.sku === base) ?? null} onChange={({ selectedItem }: any) => setBase(selectedItem ? selectedItem.sku : null)} />
            </>)}
            <NumField id="np-p" label="Selling price (₹)" min={1} max={1e6} step={1} value={price} onChange={setPrice} />
            {dd('np-m', 'Launch month', o.months, o.months[month - 1], (v) => setMonth(o.months.indexOf(v) + 1))}
            {dd('np-r', 'Region', [ALL, ...o.regions], region, setRegion)}
            {dd('np-c', 'Sales channel', [ALL, ...o.channels], channel, setChannel)}
          </div>
          <div className="row-03">
            <NumField id="np-nd" label="Reach (% of the best-covered brand's)" min={5} max={100} step={5} value={nd} onChange={setNd} />
            <NumField id="np-sc" label="Trade scheme at launch (% discount)" min={0} max={20} step={0.5} value={scheme} onChange={setScheme} />
            {dd('np-e', 'Price sensitivity of buyers', o.sensitivity, sens, setSens)}
          </div>
        </>
      ) : null}
      <ViewShell query={q} errorTitle="Could not score the launch">
        {(d) => {
          const w = d.own ?? { season: 1, ref_nd: 0, dist: 1, hist_disc: 0, per_point: 0, scheme: 1, weekly: 0 }, e = d.ext
          const rows = [
            { d: 'Launch month', i: d.month, ref: e ? `Market sells ${x(e.season)} an average week in ${d.month}; own range ${x(w.season)} against the last 13 weeks` : `Own range ${x(w.season)} against the last 13 weeks`, own: x(w.season), ext: e ? x(e.season) : '–' },
            { d: 'Reach', i: `${nd}% of the best-covered brand`, ref: e ? (e.incumbent ? (nr ? `Eveready already sells ${(e.eveready_share * 100).toFixed(1)}% of this category` : `Eveready reaches ${w.ref_nd.toFixed(0)}% of that today`) : 'Eveready is not in this category yet') : 'Not tracked for this family', own: e && w.ref_nd ? x(w.dist) : '–', ext: e ? x(nd / 100) : '–' },
            { d: 'Price', i: `₹${r0(price)}`, ref: e ? `Category average ₹${r0(e.price)}, so you are at ${e.price_index.toFixed(2)}× (${sens.toLowerCase()} sensitivity)` : `Typical in this family ₹${d.price_median ? r0(d.price_median) : '–'}`, own: 'In the match score', ext: e ? x(e.price_factor) : '–' },
            { d: 'Trade scheme', i: `${scheme}%`, ref: `History carries about ${w.hist_disc.toFixed(1)}% on average; each point has lifted sales by about ${(w.per_point * 100).toFixed(1)}%`, own: x(w.scheme), ext: e ? x(w.scheme) : '–' },
            { d: 'Region and channel', i: `${region}, ${channel}`, ref: e && e.channel_share < 1 ? `${(e.channel_share * 100).toFixed(0)}% of this family's sales go through the channel` : 'Run-rates are taken inside this scope', own: 'In the run-rates', ext: e ? x(e.channel_share) : '–' },
          ]
          return (
            <>
              <StatRow items={nr && e ? [
                { label: 'Expected weekly sales once settled (units)', value: fmtN(d.blend), sublabel: 'From what already sells in the market category. Est.' },
                { label: 'Market category (units per week)', value: fmtN(e.market_week), sublabel: `${e.category}, all brands, on our invoicing scale` },
                { label: 'Share of the category', value: e.share >= 0.001 ? `${(e.share * 100).toFixed(1)}%` : '<0.1%', sublabel: e.incumbent ? 'What one Eveready product gets today' : 'A challenger brand, as Eveready is not here yet' },
                {
                  label: 'Market position',
                  value: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                        {e.price_index < 0.8 ? 'Budget' : e.price_index > 1.2 ? 'Premium' : 'Mid-range'}
                      </span>
                    </div>
                  ),
                  sublabel: `Price at ${e.price_index.toFixed(2)}× category average`,
                  info: 'Positioning based on price vs market average and reach'
                },
              ] : [
                { label: 'Expected weekly sales once settled (units)', value: fmtN(d.blend), sublabel: 'From Eveready\'s own range. Est.' },
                { label: 'Range (units per week)', value: `${fmtN(d.low)} to ${fmtN(d.high)}`, sublabel: 'From the quieter to the busier of the closest products' },
                { label: base ? 'Product being upgraded (units per week)' : 'Closest product in our range (units per week)', value: d.matches[0] ? fmtN(d.matches[0].weekly) : '–', sublabel: d.matches[0] ? d.matches[0].name : 'No settled product matches' },
                { 
                  label: 'Best match similarity', 
                  value: d.matches[0] ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>{d.matches[0].score.toFixed(0)}</span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>/100</span>
                    </div>
                  ) : '–', 
                  sublabel: d.matches[0] ? 'Based on family, sub-category, and price match' : 'No matches found',
                  info: 'Similarity score: Family (50 pts), Sub-category (30 pts), Price (20 pts)'
                },
              ]} />
              {/* Similarity Index Card - shown for BOTH modes */}
              {nr && e ? (
                /* New Range Mode: Market-based similarity */
                <div className="card" style={{ padding: '1.5rem', background: 'var(--cds-layer-01)', borderRadius: '4px', borderLeft: '4px solid var(--cds-interactive)' }}>
                  <h3 className="card-title" style={{ marginBottom: '1rem' }}>Market Similarity Analysis</h3>
                  <p className="supporting" style={{ marginBottom: '1.5rem' }}>
                    How your product compares to the <strong>{e.category}</strong> market based on input features
                  </p>
                  
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {/* Price Positioning */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Price Positioning</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {e.price_index.toFixed(2)}× market average
                        </span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                        {/* Market average line */}
                        <div style={{ position: 'absolute', left: '50%', width: '2px', height: '100%', background: 'var(--cds-text-primary)', zIndex: 1 }} />
                        <div style={{ 
                          width: `${Math.min(100, (e.price_index / 2) * 100)}%`, 
                          height: '100%', 
                          background: e.price_index < 0.8 ? 'var(--cds-support-info)' : 
                                     e.price_index > 1.2 ? 'var(--cds-support-warning)' : 
                                     'var(--cds-support-success)',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      <p className="footnote" style={{ marginTop: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                        Your price: ₹{r0(price)} vs Market avg: ₹{r0(e.price)} → 
                        {e.price_index < 0.8 ? ' Budget segment' : 
                         e.price_index > 1.2 ? ' Premium segment' : ' Mid-market'}
                      </p>
                    </div>

                    {/* Market Reach */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Distribution Reach</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {nd}% of best-covered brand
                        </span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${nd}%`, 
                          height: '100%', 
                          background: nd >= 80 ? 'var(--cds-support-success)' : 
                                     nd >= 50 ? 'var(--cds-support-warning)' : 
                                     'var(--cds-support-error)',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      <p className="footnote" style={{ marginTop: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                        {e.incumbent ? 
                          `Eveready already in this market (${(e.eveready_share * 100).toFixed(1)}% share)` : 
                          'Eveready entering new category'}
                      </p>
                    </div>

                    {/* Expected Market Share */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Projected Market Share</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {e.share >= 0.001 ? `${(e.share * 100).toFixed(1)}%` : '<0.1%'}
                        </span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${Math.min(100, e.share * 100 * 10)}%`, 
                          height: '100%', 
                          background: 'var(--cds-interactive)',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      <p className="footnote" style={{ marginTop: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                        Based on {e.incumbent ? 'Eveready\'s current' : 'challenger brand'} performance in {e.category}
                      </p>
                    </div>

                    {/* Competitive Landscape */}
                    <div style={{ marginTop: '0.5rem', padding: '1rem', background: 'var(--cds-layer-02)', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Competitive Landscape</span>
                          <p className="footnote" style={{ margin: '0.25rem 0 0 0', color: 'var(--cds-text-secondary)' }}>
                            {e.brands.length} brands competing • Market: {fmtN(e.market_week)} units/week
                          </p>
                        </div>
                        <Tag 
                          type={e.incumbent ? 'green' : 'purple'}
                          size="md"
                        >
                          {e.incumbent ? 'Existing Market' : 'New Entry'}
                        </Tag>
                      </div>
                    </div>
                  </div>
                </div>
              ) : !nr && d.matches[0] ? (
                /* Upgrade Mode: Product similarity (existing) */
                <div className="card" style={{ padding: '1.5rem', background: 'var(--cds-layer-01)', borderRadius: '4px', borderLeft: '4px solid var(--cds-interactive)' }}>
                  <h3 className="card-title" style={{ marginBottom: '1rem' }}>Similarity Index: {d.matches[0].score.toFixed(0)}/100</h3>
                  <p className="supporting" style={{ marginBottom: '1.5rem' }}>
                    How similar is your new product to <strong>{d.matches[0].name}</strong> based on input features
                  </p>
                  
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {/* Family Match */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Family Match</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {d.matches[0].family === fam ? '50/50' : '0/50'}
                        </span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: d.matches[0].family === fam ? '100%' : '0%', 
                          height: '100%', 
                          background: d.matches[0].family === fam ? 'var(--cds-support-success)' : 'var(--cds-support-error)',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      <p className="footnote" style={{ marginTop: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                        {d.matches[0].family === fam ? `✓ Same family: ${fam}` : `✗ Different family: ${d.matches[0].family}`}
                      </p>
                    </div>

                    {/* Sub-category Match */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Sub-category Match</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {d.matches[0].sub && sub !== ANY && d.matches[0].sub === sub ? '30/30' : 
                           d.matches[0].sub && sub !== ANY ? '0/30' : '0/30 (not specified)'}
                        </span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: d.matches[0].sub && sub !== ANY && d.matches[0].sub === sub ? '100%' : '0%', 
                          height: '100%', 
                          background: d.matches[0].sub && sub !== ANY && d.matches[0].sub === sub ? 'var(--cds-support-success)' : 
                                     sub === ANY ? 'var(--cds-support-warning)' : 'var(--cds-support-error)',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      <p className="footnote" style={{ marginTop: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                        {sub === ANY ? '– Sub-category not selected' : 
                         d.matches[0].sub === sub ? `✓ Same sub-category: ${sub}` : 
                         `✗ Different: ${d.matches[0].sub || 'None'}`}
                      </p>
                    </div>

                    {/* Price Similarity */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Price Similarity</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {(() => {
                            const priceDiff = Math.abs(price - d.matches[0].price) / d.matches[0].price
                            const priceScore = Math.max(0, 20 * (1 - priceDiff))
                            return `${priceScore.toFixed(0)}/20`
                          })()}
                        </span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: (() => {
                            const priceDiff = Math.abs(price - d.matches[0].price) / d.matches[0].price
                            return `${Math.max(0, 100 * (1 - priceDiff))}%`
                          })(), 
                          height: '100%', 
                          background: (() => {
                            const priceDiff = Math.abs(price - d.matches[0].price) / d.matches[0].price
                            return priceDiff < 0.1 ? 'var(--cds-support-success)' : 
                                   priceDiff < 0.3 ? 'var(--cds-support-warning)' : 'var(--cds-support-error)'
                          })(),
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      <p className="footnote" style={{ marginTop: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                        Your price: ₹{r0(price)} vs Match: ₹{r0(d.matches[0].price)} 
                        {(() => {
                          const diff = ((price - d.matches[0].price) / d.matches[0].price * 100)
                          return ` (${diff > 0 ? '+' : ''}${diff.toFixed(1)}%)`
                        })()}
                      </p>
                    </div>

                    {/* Overall Confidence */}
                    <div style={{ marginTop: '0.5rem', padding: '1rem', background: 'var(--cds-layer-02)', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Confidence Level</span>
                          <p className="footnote" style={{ margin: '0.25rem 0 0 0', color: 'var(--cds-text-secondary)' }}>
                            {d.matches[0].score >= 80 ? 'High - Strong similarity to existing product' :
                             d.matches[0].score >= 60 ? 'Medium - Moderate similarity, use with caution' :
                             d.matches[0].score >= 40 ? 'Low - Weak similarity, results may vary' :
                             'Very Low - Consider as rough estimate only'}
                          </p>
                        </div>
                        <Tag 
                          type={d.matches[0].score >= 80 ? 'green' :
                                d.matches[0].score >= 60 ? 'teal' :
                                d.matches[0].score >= 40 ? 'warm-gray' : 'red'}
                          size="md"
                        >
                          {d.matches[0].score >= 80 ? 'High' : 
                           d.matches[0].score >= 60 ? 'Medium' : 
                           d.matches[0].score >= 40 ? 'Low' : 'Very Low'}
                        </Tag>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <ChartCard title="Simulated sales after launch" info="The expected weekly sales once settled, shaped by how comparable launches built up over their first 12 months. The band is the quieter to the busier of the closest products." subtitle={`Launching in ${d.month}. Units per week`}
                chart={<TrendChart kind="labels" zero x={d.sim.months} series={[
                  { name: 'Expected', values: d.sim.expected, tone: 1 },
                  { name: 'Quieter case', values: d.sim.low, tone: 5 },
                  { name: 'Busier case', values: d.sim.high, tone: 2 },
                ]} yTitle="Units per week" label="Simulated weekly sales over the first 12 months after launch" />}
                headers={['Month after launch', 'Expected (units a week)', 'Quieter case', 'Busier case']} rows={d.sim.months.map((mo: string, i: number) => [`${i + 1}. ${mo}`, fmtN(d.sim.expected[i]), fmtN(d.sim.low[i]), fmtN(d.sim.high[i])])} label="Simulated weekly sales over the first 12 months after launch"
                note={<>The build-up follows the {d.sim.source}. The settled level is the estimate above; seasonality beyond the launch month is not applied. Est.</>} />
              <DataCard id="npd" title="What drives the estimate" description="Each input, what the data says about it, and how much it moves each view" cols={dcols.filter((_c, i) => (nr ? i !== 4 : i !== 5))} rows={rows} itemsLabel="drivers" rowKey={(r) => r.d}
                note="A factor of ×1.00 leaves the estimate unchanged. The market view takes the category's weekly units, gives your product the share per unit of reach that Eveready's range gets (a challenger's, if Eveready is not there yet), spread across the range's depth, and puts the units on our invoicing scale." />
              {e && nr ? (
                <DataCard id="npb" title={`Competitors in ${e.category}`} description={`Last 12 months${d.scope.regions.length ? `, ${d.scope.regions.join(' and ')}` : ', all regions'}`} cols={bcols} rows={e.brands} itemsLabel="brands" rowKey={(r) => r.brand} defaultSort={{ col: 1, dir: 'desc' }}
                  note="Source: the market audit. Reach is the average share of stores that stock the brand. Eveready's own units in the audit are on a different scale from our invoices, so they are scaled by the ratio between the two." />
              ) : null}
              {!nr && d.matches[0] ? (
                <>
                  {/* Similarity Index Breakdown */}
                  <div className="card" style={{ padding: '1.5rem', background: 'var(--cds-layer-01)', borderRadius: '4px', borderLeft: '4px solid var(--cds-interactive)' }}>
                    <h3 className="card-title" style={{ marginBottom: '1rem' }}>Similarity Index: {d.matches[0].score.toFixed(0)}/100</h3>
                    <p className="supporting" style={{ marginBottom: '1.5rem' }}>
                      How similar is your new product to <strong>{d.matches[0].name}</strong> based on input features
                    </p>
                    
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      {/* Family Match */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Family Match</span>
                          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                            {d.matches[0].family === fam ? '50/50' : '0/50'}
                          </span>
                        </div>
                        <div style={{ height: '8px', background: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: d.matches[0].family === fam ? '100%' : '0%', 
                            height: '100%', 
                            background: d.matches[0].family === fam ? 'var(--cds-support-success)' : 'var(--cds-support-error)',
                            transition: 'width 0.3s'
                          }} />
                        </div>
                        <p className="footnote" style={{ marginTop: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                          {d.matches[0].family === fam ? `✓ Same family: ${fam}` : `✗ Different family: ${d.matches[0].family}`}
                        </p>
                      </div>

                      {/* Sub-category Match */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Sub-category Match</span>
                          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                            {d.matches[0].sub && sub !== ANY && d.matches[0].sub === sub ? '30/30' : 
                             d.matches[0].sub && sub !== ANY ? '0/30' : '0/30 (not specified)'}
                          </span>
                        </div>
                        <div style={{ height: '8px', background: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: d.matches[0].sub && sub !== ANY && d.matches[0].sub === sub ? '100%' : '0%', 
                            height: '100%', 
                            background: d.matches[0].sub && sub !== ANY && d.matches[0].sub === sub ? 'var(--cds-support-success)' : 
                                       sub === ANY ? 'var(--cds-support-warning)' : 'var(--cds-support-error)',
                            transition: 'width 0.3s'
                          }} />
                        </div>
                        <p className="footnote" style={{ marginTop: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                          {sub === ANY ? '– Sub-category not selected' : 
                           d.matches[0].sub === sub ? `✓ Same sub-category: ${sub}` : 
                           `✗ Different: ${d.matches[0].sub || 'None'}`}
                        </p>
                      </div>

                      {/* Price Similarity */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Price Similarity</span>
                          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                            {(() => {
                              const priceDiff = Math.abs(price - d.matches[0].price) / d.matches[0].price
                              const priceScore = Math.max(0, 20 * (1 - priceDiff))
                              return `${priceScore.toFixed(0)}/20`
                            })()}
                          </span>
                        </div>
                        <div style={{ height: '8px', background: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: (() => {
                              const priceDiff = Math.abs(price - d.matches[0].price) / d.matches[0].price
                              return `${Math.max(0, 100 * (1 - priceDiff))}%`
                            })(), 
                            height: '100%', 
                            background: (() => {
                              const priceDiff = Math.abs(price - d.matches[0].price) / d.matches[0].price
                              return priceDiff < 0.1 ? 'var(--cds-support-success)' : 
                                     priceDiff < 0.3 ? 'var(--cds-support-warning)' : 'var(--cds-support-error)'
                            })(),
                            transition: 'width 0.3s'
                          }} />
                        </div>
                        <p className="footnote" style={{ marginTop: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                          Your price: ₹{r0(price)} vs Match: ₹{r0(d.matches[0].price)} 
                          {(() => {
                            const diff = ((price - d.matches[0].price) / d.matches[0].price * 100)
                            return ` (${diff > 0 ? '+' : ''}${diff.toFixed(1)}%)`
                          })()}
                        </p>
                      </div>

                      {/* Overall Confidence */}
                      <div style={{ marginTop: '0.5rem', padding: '1rem', background: 'var(--cds-layer-02)', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Confidence Level</span>
                            <p className="footnote" style={{ margin: '0.25rem 0 0 0', color: 'var(--cds-text-secondary)' }}>
                              {d.matches[0].score >= 80 ? 'High - Strong similarity to existing product' :
                               d.matches[0].score >= 60 ? 'Medium - Moderate similarity, use with caution' :
                               d.matches[0].score >= 40 ? 'Low - Weak similarity, results may vary' :
                               'Very Low - Consider as rough estimate only'}
                            </p>
                          </div>
                          <Tag 
                            type={d.matches[0].score >= 80 ? 'green' : 
                                  d.matches[0].score >= 60 ? 'teal' : 
                                  d.matches[0].score >= 40 ? 'warm-gray' : 'red'}
                            size="md"
                          >
                            {d.matches[0].score >= 80 ? 'High' : 
                             d.matches[0].score >= 60 ? 'Medium' : 
                             d.matches[0].score >= 40 ? 'Low' : 'Very Low'}
                          </Tag>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Existing matches table */}
                  <DataCard id="npm" title="All matches in our range" description="Scored on family (50), sub-category (30) and price (20)" cols={mcols} rows={d.matches} itemsLabel="products" rowKey={(r) => r.sku} defaultSort={{ col: 4, dir: 'desc' }}
                    note={`${d.borrowed ? 'This family has too few settled products, so the whole range is used. ' : ''}A product launched in the last 13 weeks is left out because its sales have not settled. The weekly figure is each product's average orders over its last 13 weeks in the chosen region and channel. This is a starting point for a plan, not a forecast.`} />
                </>
              ) : null}
              {!nr && d.borrowed ? <Tag type="gray" size="md">Own-range view is weak for this family</Tag> : null}
            </>
          )
        }}
      </ViewShell>
    </div>
  )
}

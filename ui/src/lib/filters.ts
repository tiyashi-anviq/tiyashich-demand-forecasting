import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export type Filters = { family: string[]; region: string[]; channel: string[]; product: string[]; period: string; measure: string }
export const DEFAULT_FILTERS: Filters = { family: [], region: [], channel: [], product: [], period: 'all', measure: 'orders' }
export type Options = { family: string[]; region: string[]; channel: string[]; product?: { id: string; label: string; family?: string }[]; date_from?: string; date_to?: string; measures?: { id: string; label: string }[] }

const list = (v: string | null) => (v ? v.split('~').filter(Boolean) : [])

/** The filters live in the URL, so a reload or a shared link shows the same selection. A default is never written. */
export function useFilters() {
  const [params, setParams] = useSearchParams()
  const f = useMemo<Filters>(() => ({
    family: list(params.get('family')), region: list(params.get('region')), channel: list(params.get('channel')), product: list(params.get('product')),
    period: params.get('period') ?? DEFAULT_FILTERS.period, measure: params.get('measure') ?? DEFAULT_FILTERS.measure,
  }), [params])
  const set = useCallback((patch: Partial<Filters>) => {
    setParams((cur) => {
      const next = new URLSearchParams(cur)
      const merged = { ...f, ...patch }
      for (const k of ['family', 'region', 'channel', 'product'] as const) {
        if (merged[k].length) next.set(k, merged[k].join('~')); else next.delete(k)
      }
      for (const k of ['period', 'measure'] as const) {
        if (merged[k] !== DEFAULT_FILTERS[k]) next.set(k, merged[k]); else next.delete(k)
      }
      return next
    }, { replace: true })
  }, [f, setParams])
  const reset = useCallback(() => set(DEFAULT_FILTERS), [set])
  const dirty = JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTERS)
  return { f, set, reset, dirty }
}

function addMonths(iso: string, m: number) {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + m)
  return d.toISOString().slice(0, 10)
}

/** The query string the API expects. `period` becomes a date range. */
export function queryOf(f: Filters, opts: Options | undefined, extra: Record<string, string> = {}, withMeasure = true) {
  const q = new URLSearchParams()
  if (f.family.length) q.set('family', f.family.join('~'))
  if (f.region.length) q.set('region', f.region.join('~'))
  if (f.channel.length) q.set('channel', f.channel.join('~'))
  if (f.product.length) q.set('product', f.product.join('~'))
  if (withMeasure) q.set('measure', f.measure)
  
  // Period conversion with proper date_to handling
  if (opts?.date_to) {
    const dateTo = opts.date_to
    if (f.period === 'last12') {
      q.set('date_from', addMonths(dateTo, -12))
      q.set('date_to', dateTo)
    } else if (f.period === 'last24') {
      q.set('date_from', addMonths(dateTo, -24))
      q.set('date_to', dateTo)
    } else if (f.period === 'train') {
      q.set('date_to', '2025-09-30')
    } else if (f.period === 'test') {
      q.set('date_from', '2025-10-01')
    } else if (f.period === 'all') {
      // Explicitly set full range for 'all'
      if (opts.date_from) q.set('date_from', opts.date_from)
      q.set('date_to', dateTo)
    }
  }
  
  Object.entries(extra).forEach(([k, v]) => q.set(k, v))
  return q.toString()
}

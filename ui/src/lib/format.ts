/** Indian number style throughout (lakh, crore). Units are always said beside the number. */
export const fmtInt = (n: number) => n.toLocaleString('en-IN')

export function fmtN(n: number | null | undefined, d = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  const a = Math.abs(n)
  if (a >= 1e7) return `${(n / 1e7).toFixed(2)} cr`
  if (a >= 1e5) return `${(n / 1e5).toFixed(d)} lakh`
  if (a >= 1e3) return Math.round(n).toLocaleString('en-IN')
  if (a >= 100) return n.toFixed(0)
  return n.toFixed(a >= 10 ? 1 : 2)
}
export const fmtPct = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '–' : `${(n * 100).toFixed(d)}%`)
/** A change always carries its sign. */
export const fmtSigned = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(d)}%`

export function fmtRows(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M rows`
  if (n >= 10_000) return `${Math.round(n / 1000)}k rows`
  return `${fmtInt(n)} rows`
}
export function fmtSize(b: number) {
  if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(b > 10_000_000 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(b / 1000))} KB`
}
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLong = (s: string) => {
  const [y, m] = s.split('-')
  return `${MONTHS[+m - 1]} ${y}`
}
/** "2025-10" as a date, for a Carbon Charts time axis. */
export const monthDate = (s: string) => {
  const [y, m] = s.split('-')
  return new Date(Date.UTC(+y, +m - 1, 1))
}

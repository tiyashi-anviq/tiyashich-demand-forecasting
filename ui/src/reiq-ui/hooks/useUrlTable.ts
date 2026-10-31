import { useSearchParams } from 'react-router-dom'

export type SortDir = 'asc' | 'desc'

/** Search and sort for a record table, kept in the URL (`q`, `sort`, `dir`), so a reload, a shared
 *  link and the back button land on the same list - the handbook's rule for every table.
 *
 *  A default is removed from the URL rather than written. Any change to the search or the order
 *  deletes `page` (and `size` is left alone), because a new search must never land past the end of
 *  its own results. Writes replace the history entry (typing is not navigation) and leave every
 *  other param untouched.
 *
 *  `headerProps(key)` is spread onto a Carbon `TableHeader`: it makes the column sortable, marks
 *  the active one with its direction, and a click flips it (or starts a column on `firstDir`). */
export function useUrlTable<K extends string>({
  sortKeys,
  defaultSort,
  pageKeys = ['page'],
}: {
  sortKeys: readonly K[]
  defaultSort: { key: K; dir: SortDir }
  /** The page params to reset on a change. A page with several tables lists its own. */
  pageKeys?: readonly string[]
}) {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const rawKey = params.get('sort')
  const key = (sortKeys as readonly string[]).includes(rawKey ?? '') ? (rawKey as K) : defaultSort.key
  const rawDir = params.get('dir')
  const dir: SortDir =
    rawDir === 'asc' || rawDir === 'desc' ? rawDir : key === defaultSort.key ? defaultSort.dir : 'asc'

  function write(change: (next: URLSearchParams) => void) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        change(next)
        pageKeys.forEach((pageKey) => next.delete(pageKey))
        return next
      },
      { replace: true },
    )
  }

  const sortBy = (next: K, firstDir: SortDir = 'asc') =>
    write((params) => {
      const nextDir: SortDir = next === key ? (dir === 'asc' ? 'desc' : 'asc') : firstDir
      if (next === defaultSort.key && nextDir === defaultSort.dir) {
        params.delete('sort')
        params.delete('dir')
      } else {
        params.set('sort', next)
        params.set('dir', nextDir)
      }
    })

  return {
    query,
    setQuery: (value: string) => write((params) => (value === '' ? params.delete('q') : params.set('q', value))),
    sortKey: key,
    sortDir: dir,
    sortBy,
    headerProps: (column: K, firstDir: SortDir = 'asc') => ({
      isSortable: true as const,
      isSortHeader: key === column,
      sortDirection: key === column ? (dir === 'asc' ? ('ASC' as const) : ('DESC' as const)) : ('NONE' as const),
      onClick: () => sortBy(column, firstDir),
    }),
  }
}

/** Sorts a copy by one accessor. Numbers compare as numbers, strings with the user's locale
 *  (digits in order, "2" before "10"); a missing value goes last in either direction. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => string | number | null | undefined, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    if (typeof left === 'number' && typeof right === 'number') return sign * (left - right)
    return sign * String(left).localeCompare(String(right), undefined, { numeric: true })
  })
}

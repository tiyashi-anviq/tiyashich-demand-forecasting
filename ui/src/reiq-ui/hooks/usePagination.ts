import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export const DEFAULT_PAGE_SIZES = [10, 25, 50, 100]

export interface PaginationState<T> {
	/** The slice to render. */
	rows: T[]
	page: number
	pageSize: number
	total: number
	setPage: (page: number) => void
	setPageSize: (pageSize: number) => void
}

/** Client-side paging over a list already in hand. The page is clamped while rendering, not
 *  corrected in an effect, so a shrinking list (a filter, a delete) never shows an empty page.
 *  Changing the page size goes back to page 1, same as the admin console. */
export function usePagination<T>(
	items: readonly T[],
	pageSizes: readonly number[] = DEFAULT_PAGE_SIZES,
): PaginationState<T> {
	const [requestedPage, setRequestedPage] = useState(1)
	const [pageSize, setSize] = useState(pageSizes[0])
	const total = items.length
	const lastPage = Math.max(1, Math.ceil(total / pageSize))
	const page = Math.min(requestedPage, lastPage)
	const start = (page - 1) * pageSize

	return {
		rows: items.slice(start, start + pageSize),
		page,
		pageSize,
		total,
		setPage: setRequestedPage,
		setPageSize: (next) => {
			setSize(next)
			setRequestedPage(1)
		},
	}
}

/** The same paging with the page and size kept in the URL (`page`, `size`, or the prefixed pair), so a reload, a shared
 *  link and the back button land on the same page. A default is removed from the URL rather than
 *  written; a size that is not one of `pageSizes` falls back to the first; changing the size goes
 *  back to page 1; and every write replaces the history entry and leaves the other params alone.
 *  A search that changes the list should delete `page` itself (a new search starts at page 1). */
export function useUrlPagination<T>(
  items: readonly T[],
  pageSizes: readonly number[] = DEFAULT_PAGE_SIZES,
  /** For a page with more than one paged table: each takes its own prefix, so `contacts` writes
   *  `contactsPage` and `contactsSize` and the tables never share a page number. */
  prefix = '',
): PaginationState<T> {
  const pageKey = prefix ? `${prefix}Page` : 'page'
  const sizeKey = prefix ? `${prefix}Size` : 'size'
  const [params, setParams] = useSearchParams()
  const requestedSize = Number(params.get(sizeKey))
  const pageSize = pageSizes.includes(requestedSize) ? requestedSize : pageSizes[0]
  const total = items.length
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, Math.floor(Number(params.get(pageKey))) || 1), lastPage)
  const start = (page - 1) * pageSize

  function write(change: (next: URLSearchParams) => void) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        change(next)
        return next
      },
      { replace: true },
    )
  }

  return {
    rows: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    setPage: (next) =>
      write((params) => (next <= 1 ? params.delete(pageKey) : params.set(pageKey, String(next)))),
    setPageSize: (next) =>
      write((params) => {
        params.delete(pageKey)
        if (next === pageSizes[0]) params.delete(sizeKey)
        else params.set(sizeKey, String(next))
      }),
  }
}

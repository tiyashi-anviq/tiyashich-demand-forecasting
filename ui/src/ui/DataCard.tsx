import { ArrowDown, ArrowUp, ArrowsVertical, ChevronDown, ChevronUp } from '@carbon/icons-react'
import { Info } from './Info'
import { columnInfo } from '../lib/columnInfo'
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TablePagination, useUrlPagination } from '@reiq/ui'
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tile } from '@reiq/ui/carbon'

export type Col<R> = {
  header: string
  /** A column of figures: right-aligned, mono, tabular. The unit goes in the header. */
  num?: boolean
  cell: (r: R) => ReactNode
  /** Makes the header sortable; the choice is kept in the URL under this card's id. */
  sort?: (r: R) => number | string | null
  /** What the column holds, opened from an "i" in the header. When left out, the shared glossary of column names is used. */
  info?: string
}

const SIZES = [10, 25, 50]

/** A list of records with columns, on a card: title and a one-line description with the total, sortable headers,
 *  and a paging footer named for the records once the list is longer than one page. */
export function DataCard<R>({ id, title, info, description, cols, rows, itemsLabel, note, rowKey, onRow, selected, defaultSort, defaultOpen = false }: {
  id: string
  title: string
  /** A plain-language explanation, opened from an "i" beside the title. */
  info?: string
  description?: string
  cols: Col<R>[]
  rows: R[]
  itemsLabel: string
  note?: ReactNode
  rowKey: (r: R, i: number) => string
  /** The first cell becomes a button that opens the row. */
  onRow?: (r: R) => void
  selected?: (r: R) => boolean
  defaultSort?: { col: number; dir: 'asc' | 'desc' }
  /** Tables start folded to their title; one click opens them. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [params, setParams] = useSearchParams()
  const sortKey = `${id}Sort`, dirKey = `${id}Dir`
  const rawCol = params.get(sortKey)
  const sortCol = rawCol !== null && cols[+rawCol]?.sort ? +rawCol : defaultSort && cols[defaultSort.col]?.sort ? defaultSort.col : null
  const dir = (params.get(dirKey) === 'asc' || params.get(dirKey) === 'desc' ? params.get(dirKey) : defaultSort?.dir ?? 'asc') as 'asc' | 'desc'
  const sorted = (() => {
    if (sortCol === null) return rows
    const f = cols[sortCol].sort!
    const out = [...rows].sort((a, b) => {
      const x = f(a), y = f(b)
      if (x === y) return 0
      if (x === null) return 1
      if (y === null) return -1
      return (x < y ? -1 : 1) * (dir === 'asc' ? 1 : -1)
    })
    return out
  })()
  const pg = useUrlPagination(sorted, SIZES, id)
  const sortBy = (c: number) =>
    setParams((cur) => {
      const next = new URLSearchParams(cur)
      next.set(sortKey, String(c))
      next.set(dirKey, c === sortCol && dir === 'asc' ? 'desc' : 'asc')
      next.delete(`${id}Page`)
      return next
    }, { replace: true })
  return (
    <Tile className={open ? 'card dc-card' : 'card dc-card dc-folded'} onClick={open ? undefined : (e: any) => { if (!e.target.closest?.('.info-tip')) setOpen(true) }}>
      <TableContainer title={info ? <>{title}<Info text={info} label={`About ${title}`} /></> : title} description={description}
        decorator={
          <button type="button" className="dc-toggle" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
            <span>{open ? 'Hide table' : `Show table (${rows.length} ${itemsLabel})`}</span>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        }>
        {open ? <div className="table-scroll thin-scroll">
          <Table size="md" aria-label={title}>
            <TableHead>
              <TableRow>
                {cols.map((c, i) => {
                  const tip = c.info ?? columnInfo(c.header)
                  const active = sortCol === i
                  if (!tip) {
                    return (
                      <TableHeader key={c.header} className={c.num ? 'cell-num' : undefined}
                        {...(c.sort ? { isSortable: true, isSortHeader: active, sortDirection: active ? (dir === 'asc' ? 'ASC' : 'DESC') : 'NONE', onClick: () => sortBy(i) } : {})}>
                        {c.header}
                      </TableHeader>
                    )
                  }
                  return (
                    <TableHeader key={c.header} className={`${c.num ? 'cell-num' : ''}${active ? ' th-active' : ''}`.trim() || undefined} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      <span className="th-flex">
                        {c.sort ? (
                          <button type="button" className="th-sort" onClick={() => sortBy(i)} aria-label={`Sort rows by ${c.header}`}>
                            <span>{c.header}</span>
                            {active ? (dir === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowsVertical size={16} className="th-unsorted" />}
                          </button>
                        ) : <span>{c.header}</span>}
                        <Info text={tip} label={`About ${c.header}`} />
                      </span>
                    </TableHeader>
                  )
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {pg.rows.map((r, i) => (
                <TableRow key={rowKey(r, i)} isSelected={selected?.(r)}>
                  {cols.map((c, k) => (
                    <TableCell key={c.header} className={c.num ? 'cell-num' : undefined}>
                      {k === 0 && onRow ? <Button kind="ghost" size="sm" onClick={() => onRow(r)}>{c.cell(r)}</Button> : c.cell(r)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div> : null}
      </TableContainer>
      {open ? <TablePagination page={pg.page} pageSize={pg.pageSize} totalItems={pg.total} pageSizes={SIZES} itemsLabel={itemsLabel}
        onChange={({ page, pageSize }) => { if (pageSize !== pg.pageSize) pg.setPageSize(pageSize); else pg.setPage(page) }} /> : null}
      {open && note ? <p className="footnote">{note}</p> : null}
    </Tile>
  )
}

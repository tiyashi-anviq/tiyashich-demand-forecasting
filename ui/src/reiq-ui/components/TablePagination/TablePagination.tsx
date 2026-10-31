import { Pagination } from '../../carbon'
import { DEFAULT_PAGE_SIZES } from '../../hooks/usePagination'
import './TablePagination.css'

interface TablePaginationProps {
	page: number
	pageSize: number
	totalItems: number
	onChange: (next: { page: number; pageSize: number }) => void
	pageSizes?: readonly number[]
	disabled?: boolean
	itemsLabel?: string
	/** Show the footer even when everything fits the smallest page, so the count and the
	 *  page controls are always where a reader looks for them. */
	alwaysShow?: boolean
}

/** The one pagination footer for every record table: Carbon's Pagination with the admin
 *  console's sizes and square footer. Renders nothing when everything fits the smallest page,
 *  so a short list carries no empty chrome, unless `alwaysShow` is set. Put it directly under the table, inside the same
 *  card. */
export function TablePagination({
	page,
	pageSize,
	totalItems,
	onChange,
	pageSizes = DEFAULT_PAGE_SIZES,
	disabled,
	itemsLabel = 'Items per page:',
	alwaysShow = false,
}: TablePaginationProps) {
	if (!alwaysShow && totalItems <= Math.min(...pageSizes)) return null
	return (
		<Pagination
			className="table-pagination"
			page={page}
			pageSize={pageSize}
			pageSizes={[...pageSizes]}
			totalItems={totalItems}
			disabled={disabled}
			itemsPerPageText={itemsLabel}
			onChange={({ page: nextPage, pageSize: nextSize }) =>
				onChange({ page: nextSize !== pageSize ? 1 : nextPage, pageSize: nextSize })
			}
		/>
	)
}

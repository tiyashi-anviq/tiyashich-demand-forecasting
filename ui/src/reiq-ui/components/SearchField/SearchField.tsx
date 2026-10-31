import { forwardRef, type ComponentProps } from 'react'
import { Search } from '../../carbon'

type CarbonSearchProps = ComponentProps<typeof Search>

export interface SearchFieldProps
  extends Omit<
    CarbonSearchProps,
    'onChange' | 'value' | 'defaultValue' | 'labelText' | 'placeholder' | 'size' | 'closeButtonLabelText'
  > {
  /** Names the field for a screen reader, e.g. "Search deals". */
  label: string
  /** Says what is searched, not just that it is a search: "Search by deal id or building". */
  placeholder: string
  value: string
  /** The raw text as typed (and '' when cleared). Trim where it is used, not where it is stored,
   *  or a space typed between two words is swallowed. */
  onChange: (next: string) => void
  /** By job: `sm` for a filter row or a toolbar (the default), `md` inside a card or modal, `lg`
   *  only for a module's primary search row. One row, one size. */
  size?: 'sm' | 'md' | 'lg'
}

/** The one search field in every module: Carbon's Search with the app's standard clear label and a
 *  plain string in, plain string out. Put it in the row of filters above a list or table, or in a
 *  toolbar; keep the query in the URL (`useUrlTable`'s `q`) so a reload or a shared link shows the
 *  same list. Anything else Carbon's Search takes (id, disabled, className, key handlers, aria
 *  attributes for an autocomplete) passes straight through. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { label, placeholder, value, onChange, size = 'sm', ...rest },
  ref,
) {
  return (
    <Search
      ref={ref}
      size={size}
      labelText={label}
      placeholder={placeholder}
      closeButtonLabelText="Clear search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      {...rest}
    />
  )
})

// Theme and hooks
export { ThemeProvider } from './theme/ThemeProvider'
export { useTheme, type AppTheme, type ThemePreference } from './theme/useTheme'
export { useBrandTheme, toBrandTheme, type BrandTheme } from './theme/brandTheme'
export { useIsMobile } from './hooks/useIsMobile'
export { useDocumentTitle } from './hooks/useDocumentTitle'
export { useUrlTable, sortRows, type SortDir } from './hooks/useUrlTable'
export { usePagination, useUrlPagination, DEFAULT_PAGE_SIZES, type PaginationState } from './hooks/usePagination'
export { inSentence, sentenceCase } from './utils/sentenceCase'
export { closeMenuButKeepValueOnEscape } from './utils/comboBoxEscape'
export { hubUrl, authEnabled, moduleUrl } from './config'

// Sign-in
export { AuthProvider, useAuth, type AuthStatus } from './auth/AuthContext'
export { reportAccessDenied, useAccessDenied } from './auth/accessDenied'
export { loginHref } from './auth/loginHref'
export { signOut } from './auth/authApi'
export { canOpenModule, canWrite, isAdmin, moduleRole } from './auth/permissions'
export type { AuthUser } from './auth/types'

// Scaffold
export { AppScaffold } from './scaffold/AppScaffold'
export { ModuleShell, type NavItem } from './scaffold/ModuleShell'
export { PageShell } from './scaffold/PageShell'
export { ModuleSidebar } from './scaffold/ModuleSidebar'
export { ModuleSidebarLink } from './scaffold/ModuleSidebarLink'
export { ModuleNavDrawer } from './scaffold/ModuleNavDrawer'
// For an app that lays out its own rail column instead of using ModuleShell (product-mix).
export { useModuleRailCollapse, useModuleRailState, useRailCollapsed } from './scaffold/ModuleRailContext'
export { useFoldRailWhile } from './scaffold/useFoldRailWhile'

// Errors
export { AppError } from './errors/AppError'

// Components
export { BrandMark } from './components/BrandMark/BrandMark'
export { EmptyState, EmptyStateBadge, type EmptyStateTone } from './components/EmptyState/EmptyState'
export {
  ModulePageHeader,
  type Crumb,
  type ModulePageHeaderProps,
} from './components/ModulePageHeader/ModulePageHeader'
export { IconBadge } from './components/IconBadge/IconBadge'
export { StatTile } from './components/StatTile/StatTile'
export { PageSection } from './components/PageSection/PageSection'
export { ChartOrTable } from './components/ChartOrTable/ChartOrTable'
export { TabbedView, type TabDef } from './components/TabbedView/TabbedView'
export { PendingLabel } from './components/PendingLabel/PendingLabel'
export { SearchField, type SearchFieldProps } from './components/SearchField/SearchField'
export { TablePagination } from './components/TablePagination/TablePagination'
export {
  ApiErrorNotification,
  ApiErrorCopyProvider,
  type ApiErrorCopy,
  type ErrorCopy,
} from './components/ApiErrorNotification/ApiErrorNotification'
export { AccessDeniedPage } from './components/AccessDeniedPage/AccessDeniedPage'
export { NotFoundPage } from './components/NotFoundPage/NotFoundPage'
export { SettingsDrawer, type SettingsDrawerProps } from './components/SettingsDrawer/SettingsDrawer'
export {
  ToastProvider,
  useToast,
  type ToastAction,
  type ToastKind,
  type ToastMessage,
} from './components/Toast/ToastProvider'
export {
  cssColors,
  cssVarFor,
  themedColors,
  type ResolvedColorPair,
  type TokenColorPair,
} from './brand/tokenColors'
// Maps and locations (title-search, land-feasibility) are subpaths, not exported here, so an
// app without a map does not bundle their CSS: '@reiq/ui/map/MapLayerControl',
// '@reiq/ui/map/mapTiles', '@reiq/ui/location/radius', '@reiq/ui/location/types'.

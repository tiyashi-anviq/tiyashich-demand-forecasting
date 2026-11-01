import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Analytics, ChartLine, Chat, Upload, Rain, DeliveryParcel, Product, ShoppingCart, Box } from '@carbon/icons-react'
import { ApiErrorCopyProvider, AppScaffold, AuthProvider, ModuleShell, ThemeProvider, ToastProvider, type NavItem } from '@reiq/ui'
import DataSetup from './pages/DataSetup'
import Explore from './pages/Explore'
import Forecasts from './pages/Forecasts'
import Challenge from './pages/Challenge'
import Weather from './pages/Weather'
import QuickCommerce from './pages/QuickCommerce'
import NewProducts from './pages/NewProducts'
import ProcurementHub from './pages/ProcurementHub'
import SupplyPlan from './pages/SupplyPlan'

export const MODULE = 'Demand planning'

function usePinnedHeaderHeight() {
  const { pathname } = useLocation()
  useEffect(() => {
    const set = () => {
      const h = document.querySelector<HTMLElement>('.module-page-header-pin-toolbar')
      const off = parseFloat(h?.style.getPropertyValue('--module-page-header-toolbar-offset') ?? '0') || 0
      const v = h ? `${Math.max(0, Math.round(h.offsetHeight - off))}px` : '0px'
      if (document.documentElement.style.getPropertyValue('--pinned-header-h') !== v) document.documentElement.style.setProperty('--pinned-header-h', v)
      const tb = document.querySelector<HTMLElement>('.tabbed-view-row')
      const tv = tb ? `${tb.offsetHeight}px` : '3rem'
      if (document.documentElement.style.getPropertyValue('--tabs-h') !== tv) document.documentElement.style.setProperty('--tabs-h', tv)
    }
    set()
    const id = window.setInterval(set, 300)
    return () => { window.clearInterval(id); document.documentElement.style.setProperty('--pinned-header-h', '0px') }
  }, [pathname])
}

function PinnedHeader() { usePinnedHeaderHeight(); return null }

const NAV: NavItem[] = [
  { to: '/data', label: 'Data setup', icon: Upload },
  { to: '/explore', label: 'Explore', icon: Analytics },
  { to: '/weather', label: 'Weather and seasons', icon: Rain },
  { to: '/forecasts', label: 'Forecasts', icon: ChartLine },
  { to: '/challenge', label: 'Forecast challenge', icon: Chat },
  { to: '/new-products', label: 'New products', icon: Product },
  { to: '/quick-commerce', label: 'Quick commerce', icon: DeliveryParcel },
  { to: '/inventory', label: 'Supply and production plan', icon: Box },
  { to: '/procurement', label: 'Procurement', icon: ShoppingCart },
]

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } } })

const ERROR_COPY = {
  api: {},
  network: { title: 'Could not reach the demand planning service', hint: 'Check that the API is running, then try again in a moment.' },
  timeout: { title: 'The demand planning service took too long', hint: 'Try again in a moment.' },
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <ApiErrorCopyProvider copy={ERROR_COPY}>
            <ToastProvider>
              <BrowserRouter>
                <PinnedHeader />
                <AppScaffold label={MODULE}>
                  <ModuleShell label={MODULE} nav={NAV}>
                    <Routes>
                      <Route path="/" element={<Navigate to="/data" replace />} />
                      <Route path="/data" element={<DataSetup />} />
                      <Route path="/explore" element={<Explore />} />
                      <Route path="/forecasts" element={<Forecasts />} />
                      <Route path="/challenge" element={<Challenge />} />
                      <Route path="/weather" element={<Weather />} />
                      <Route path="/quick-commerce" element={<QuickCommerce />} />
                      <Route path="/new-products" element={<NewProducts />} />
                      <Route path="/moq" element={<Navigate to="/procurement?tab=moq" replace />} />
                      <Route path="/procurement" element={<ProcurementHub />} />
                      <Route path="/inventory" element={<SupplyPlan />} />
                      <Route path="*" element={<Navigate to="/data" replace />} />
                    </Routes>
                  </ModuleShell>
                </AppScaffold>
              </BrowserRouter>
            </ToastProvider>
          </ApiErrorCopyProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

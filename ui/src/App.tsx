import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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

const NAV: NavItem[] = [
  // the story: bring the data in, understand it, forecast demand, test the forecast, cover demand with no history, then turn it into supply
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

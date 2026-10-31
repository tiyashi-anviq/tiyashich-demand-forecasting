import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Styles in the handbook's order: Carbon and the REIQ theme first, the app's own after, the phone layer last.
import '@reiq/ui/styles/carbon-theme.scss'
import '@reiq/ui/styles/global.css'
import '@reiq/ui/styles/fixed-shell.css'
import '@reiq/ui/styles/surfaces.css'
import './design/global.css'
import { App } from './App'
import '@reiq/ui/styles/responsive.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

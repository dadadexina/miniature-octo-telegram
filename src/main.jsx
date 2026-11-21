import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { initTelemetry } from './lib/telemetry'
import { initPwaUpdates } from './lib/pwaUpdate'
import { StoreProvider } from './store'
import './index.css'

initTelemetry()
initPwaUpdates(registerSW)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <StoreProvider>
          <App />
        </StoreProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)

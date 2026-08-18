import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { warmUpApi } from './api/warmup'

// Fired before React mounts, not from an effect: the frontend is served by a
// host that never sleeps, so this is the earliest moment the sleeping API can
// be told to get up. Every millisecond here comes off the shopper's wait.
void warmUpApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

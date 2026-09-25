import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { clearApiCache } from './services/api'

// Le risposte API non vengono più salvate sul dispositivo: si eliminano
// quelle lasciate dalle versioni precedenti.
void clearApiCache()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

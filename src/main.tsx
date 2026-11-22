import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// Kalau ada service worker lama yang masih mengontrol halaman ini, reload
// sekali saat versi baru mengambil alih — supaya build terbaru (animasi,
// perbaikan bug) langsung dipakai, bukan versi cache yang lama.
const hadController = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller
if (hadController) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
}

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// ?fresh=1 → buang service worker & cache lama, lalu reload tanpa parameter.
// Berguna kalau browser masih menyajikan build lama dari cache.
if (new URLSearchParams(window.location.search).has('fresh')) {
  const clean = new URL(window.location.href)
  clean.searchParams.delete('fresh')
  void (async () => {
    try {
      const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? []
      await Promise.all(registrations.map((registration) => registration.unregister()))
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    } catch {
      // Browser bisa melarang; reload tetap dijalankan.
    }
    window.location.replace(clean.toString())
  })()
} else {
  // Kalau service worker lama masih mengontrol halaman, reload sekali saat
  // versi baru mengambil alih supaya perbaikan langsung terlihat.
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
}

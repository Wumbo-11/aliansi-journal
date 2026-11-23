import { useCallback, useEffect, useState } from 'react'

/** Fullscreen Web API: masuk/keluar lewat klik, sinkron dengan tombol Esc/back. */
export function useFullscreen() {
  const [active, setActive] = useState(false)
  const supported = typeof document !== 'undefined' &&
    !!document.documentElement.requestFullscreen

  useEffect(() => {
    const sync = () => {
      const next = !!document.fullscreenElement
      setActive(next)

      // Chrome Android mengubah tinggi viewport saat address bar muncul lagi.
      // Tanpa paksaan ini, layout sempat "nggak ke-refresh" dan menyisakan
      // area hitam kosong di atas header setelah keluar fullscreen.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!next && window.scrollY > 0) window.scrollTo(0, 0)
          window.dispatchEvent(new window.Event('resize'))
        })
      })
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {})
    }
  }, [])

  return { active, supported, toggle }
}

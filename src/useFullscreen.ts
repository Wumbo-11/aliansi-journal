import { useCallback, useEffect, useState } from 'react'

/** Fullscreen Web API: masuk/keluar lewat klik, sinkron dengan tombol Esc/back. */
export function useFullscreen() {
  const [active, setActive] = useState(false)
  const supported = typeof document !== 'undefined' &&
    !!document.documentElement.requestFullscreen

  useEffect(() => {
    const sync = () => setActive(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
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

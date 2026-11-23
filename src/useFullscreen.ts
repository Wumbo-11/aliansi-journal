import { useCallback, useEffect, useState } from 'react'

/**
 * Fullscreen Web API: masuk/keluar lewat klik, sinkron dengan tombol Esc/back.
 *
 * Di Chrome Android address bar muncul lagi saat keluar fullscreen. Dulu ini
 * memicu "resize storm" (visualViewport + double rAF + timer berulang) yang
 * bikin stutter & dot berkedut. Sekarang: tandai transisi LEBIH AWAL (sebelum
 * browser sempat melaporkan viewport lebar), ukur ulang tepat sekali, lalu
 * lepas penanda setelah address bar stabil.
 */
export function useFullscreen() {
  const [active, setActive] = useState(false)
  const supported = typeof document !== 'undefined' &&
    !!document.documentElement.requestFullscreen

  const resync = useCallback(() => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    window.dispatchEvent(new window.Event('resize'))
  }, [])

  useEffect(() => {
    let releaseTimer = 0
    let frame = 0

    const onFullscreenChange = () => {
      const root = document.documentElement
      const next = !!document.fullscreenElement
      setActive(next)
      if (next) root.dataset.fullscreen = 'true'
      else delete root.dataset.fullscreen

      // Satu frame cukup untuk layout selesai. Tidak ada interval, tidak ada
      // visualViewport listener — sumber stutter & kedut sebelumnya.
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        resync()
        // Lepas penanda setelah animasi address bar selesai.
        window.clearTimeout(releaseTimer)
        releaseTimer = window.setTimeout(() => {
          delete root.dataset.fullscreenTransition
        }, 700)
      })
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(releaseTimer)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
      delete document.documentElement.dataset.fullscreenTransition
    }
  }, [resync])

  // Pasang penanda SEBELUM requestFullscreen: Chrome sesaat melaporkan viewport
  // lebar saat transisi, yang memicu zoom "desktop site" & black bar/domain ilang.
  const toggle = useCallback(() => {
    document.documentElement.dataset.fullscreenTransition = 'true'
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {
        delete document.documentElement.dataset.fullscreenTransition
      })
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {
        delete document.documentElement.dataset.fullscreenTransition
      })
    }
  }, [])

  return { active, supported, toggle }
}

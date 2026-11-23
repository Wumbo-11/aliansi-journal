import { useCallback, useEffect, useState } from 'react'

/**
 * Fullscreen Web API: masuk/keluar lewat klik, sinkron dengan tombol Esc/back.
 *
 * Chrome Android mengubah tinggi viewport + posisi scroll saat address bar
 * muncul lagi. Akibatnya bagian atas tampak hitam dan dots terdorong keluar.
 * Karena itu:
 *  1. Suspend deteksi "desktop site" selama transisi (index.html).
 *  2. Paksa scroll ke 0 + resize setelah transisi selesai.
 *  3. Kunci tinggi dokumen 100% via CSS (failsafe @media pointer: coarse).
 */
export function useFullscreen() {
  const [active, setActive] = useState(false)
  const supported = typeof document !== 'undefined' &&
    !!document.documentElement.requestFullscreen

  const resync = useCallback(() => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    // Beri tahu lampu & App supaya ukur ulang sekali setelah ukuran stabil.
    window.dispatchEvent(new window.Event('resize'))
  }, [])

  useEffect(() => {
    let timers: number[] = []
    const settle = () => {
      for (const t of timers) window.clearTimeout(t)
      requestAnimationFrame(() => {
        resync()
        requestAnimationFrame(resync)
      })
      // Setelah animasi address bar selesai, lepas penanda transisi supaya
      // deteksi desktop-site aktif lagi (dengan viewport yang sudah stabil).
      timers = [400, 700].map((ms) => window.setTimeout(() => {
        resync()
        if (ms === 700) delete document.documentElement.dataset.fullscreenTransition
      }, ms))
    }

    const sync = () => {
      setActive(!!document.fullscreenElement)
      document.documentElement.dataset.fullscreenTransition = 'true'
      settle()
    }
    const onViewport = () => {
      if (document.documentElement.dataset.fullscreenTransition === 'true') settle()
    }

    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    window.visualViewport?.addEventListener('resize', onViewport)
    window.addEventListener('orientationchange', settle)
    return () => {
      for (const t of timers) window.clearTimeout(t)
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
      window.visualViewport?.removeEventListener('resize', onViewport)
      window.removeEventListener('orientationchange', settle)
      delete document.documentElement.dataset.fullscreenTransition
    }
  }, [resync])

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {})
    }
  }, [])

  return { active, supported, toggle }
}

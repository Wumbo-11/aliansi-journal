import { useCallback, useEffect, useState } from 'react'

/**
 * Fullscreen Web API: masuk/keluar lewat klik, sinkron dengan tombol Esc/back.
 *
 * Chrome Android mengubah tinggi viewport + posisi scroll saat address bar
 * muncul lagi. Akibatnya bagian atas tampak kosong/hitam dan dots terdorong
 * keluar layar. Karena itu setiap perubahan disusul "paksa ukur ulang"
 * berlapis selama transisi selesai (100ms → ~1 detik).
 */
export function useFullscreen() {
  const [active, setActive] = useState(false)
  const supported = typeof document !== 'undefined' &&
    !!document.documentElement.requestFullscreen

  const resync = useCallback(() => {
    // Seluruh dokumen memang tidak boleh scroll (layout satu layar).
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    // Resize event dipakai App & lampu untuk ukur ulang. DotField sekarang
    // mengabaikan resize "palsu" (ukuran sama) jadi ini aman — tapi tetap
    // gua batasi: hanya disipulkan saat transisi, bukan interval abadi.
    window.dispatchEvent(new window.Event('resize'))
  }, [])

  useEffect(() => {
    let timers: number[] = []
    const settle = () => {
      for (const t of timers) window.clearTimeout(t)
      // Cukup 2 frame + 1 timer setelah address bar selesai bergerak.
      // (Dulu 6× resize — berlebihan & memicu micro-stutter dot.)
      requestAnimationFrame(() => {
        resync()
        requestAnimationFrame(resync)
      })
      timers = [350].map((ms) => window.setTimeout(resync, ms))
    }

    const sync = () => {
      setActive(!!document.fullscreenElement)
      settle()
    }
    const onViewport = () => settle()

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

import { useCallback, useEffect, useState } from 'react'

/**
 * Fullscreen Web API + workaround address bar Chrome Android.
 *
 * Bug Chrome Android (terkenal): setelah exitFullscreen(), address bar sering
 * tidak muncul lagi kalau halaman overflow:hidden — karena Chrome hanya
 * menampilkan toolbar saat pengguna scroll ke atas. Solusinya: "nudge" —
 * buat area scroll sementara, scroll turun lalu naik, lalu kembalikan.
 */
export function useFullscreen() {
  const [active, setActive] = useState(false)
  const supported = typeof document !== 'undefined' &&
    !!document.documentElement.requestFullscreen

  /** Pulihkan address bar Chrome setelah keluar fullscreen. */
  const nudgeAddressBar = useCallback(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return
    const html = document.documentElement
    const body = document.body
    const spacer = document.createElement('div')
    spacer.style.cssText = 'height:140px;width:1px;pointer-events:none;opacity:0;'
    const prevHtml = html.style.overflow
    const prevBody = body.style.overflow
    body.appendChild(spacer)
    html.style.overflow = 'auto'
    body.style.overflow = 'visible'
    window.scrollTo(0, 100)
    requestAnimationFrame(() => {
      window.scrollTo(0, 0)
      requestAnimationFrame(() => {
        spacer.remove()
        html.style.overflow = prevHtml
        body.style.overflow = prevBody
      })
    })
  }, [])

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

      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        resync()
        // Saat KELUAR fullscreen, paksa Chrome menampilkan address bar lagi.
        if (!next) nudgeAddressBar()
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
  }, [resync, nudgeAddressBar])

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

import { useEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

const CORD = 76
// Batas ayun per sumbu (~35°). Panjang kabel TIDAK berubah — ujung selalu
// berada di bola berjari-jari CORD dari titik gantung.
const MAX_ANGLE = 0.62
const MAX_D = Math.sin(MAX_ANGLE) * CORD
const REST_EPS = 0.0015
// Perspektif 3D: rotasi X (samping) + rotasi Z (naik-turun).
const PERSPECTIVE = 900

/**
 * Lampu gantung yang bisa ditarik bebas ke SEGALA ARAH (kiri/kanan/atas/bawah),
 * seperti bandul 2D — bukan hanya pendulum satu sumbu.
 *
 * Model: posisi lampu = titik di permukaan bola berjari-jari CORD di bawah
 * titik gantung. Jadi:
 *  - panjang kabel tetap (tidak memanjang/memendek),
 *  - posisi gantung tetap,
 *  - lampu bisa ditarik ke samping (x) dan ke atas/bawah (y dalam arti
 *    menjauhi/mendekati layar lewat rotasi Z yang terlihat seperti naik-turun).
 *
 * Performa:
 * - Geometri diukur sekali (resize/ResizeObserver), bukan per frame.
 * - Satu commit() yang hanya menulis DOM bila nilainya berubah.
 * - Input pointer di-coalesce ke frame berikutnya.
 * - Tanpa state React saat drag.
 */
export default function HangingLamp() {
  const rigRef = useRef<HTMLDivElement>(null)
  // Sudut 2 sumbu: ax = samping, ay = naik/turun (proyeksi).
  const angleX = useRef(0)
  const angleY = useRef(0)
  const velX = useRef(0)
  const velY = useRef(0)
  const dragging = useRef(false)
  const raf = useRef(0)
  const lastTime = useRef(0)

  const geo = useRef({
    anchorX: 0, left: 0, zoom: 1, textLeft: 0, textWidth: 1, restY: CORD, ready: false,
  })
  const textRef = useRef<HTMLElement | null>(null)
  const last = useRef({ rot: '', rel: NaN })
  // Target pointer (client coords), dikonsumsi di frame.
  const pending = useRef<{ x: number; y: number } | null>(null)
  const frameQueued = useRef(false)

  const measure = () => {
    const rig = rigRef.current
    const hero = rig?.parentElement
    if (!rig || !hero) return
    const rect = hero.getBoundingClientRect()
    const zoom = Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
    const width = rect.width / zoom
    const text = hero.querySelector('.title-mark-text') as HTMLElement | null
    let textLeft = 0
    let textWidth = width
    if (text) {
      const tr = text.getBoundingClientRect()
      textLeft = (tr.left - rect.left) / zoom
      textWidth = tr.width / zoom || width || 1
    }
    textRef.current = text
    geo.current = {
      anchorX: width / 2,
      left: rect.left / zoom,
      zoom,
      textLeft,
      textWidth,
      // Posisi istirahat kap lampu di layar: CORD di bawah titik gantung.
      restY: rect.top / zoom + CORD,
      ready: width > 0,
    }
    last.current = { rot: '', rel: NaN }
  }

  const commit = () => {
    const rig = rigRef.current
    const hero = rig?.parentElement
    if (!rig || !hero) return
    const { anchorX, textLeft, textWidth } = geo.current
    const ax = angleX.current
    const ay = angleY.current

    // --- RIG: rotasi 2 sumbu ---
    // CSS rotate(+θ) memutar ke KIRI (sumbu Y ke bawah), jadi negatifkan ax
    // supaya kap lampu bergerak searah tarikan jari.
    const transform =
      `perspective(${PERSPECTIVE}px) rotateZ(${ay.toFixed(4)}rad) rotate(${(-ax).toFixed(4)}rad)`
    if (transform !== last.current.rot) {
      rig.style.transform = transform
      last.current.rot = transform
    }

    // --- Sorotan di teks: posisi X lampu, plus redup saat lampu menjauhi
    //     (ditarik ke atas) supaya terasa 3D. ---
    const bx = anchorX + Math.sin(ax) * CORD
    const rel = ((bx - textLeft) / textWidth) * 100
    if (rel !== last.current.rel) {
      ;(textRef.current ?? hero).style.setProperty('--lamp-rel', `${rel.toFixed(2)}%`)
      // Semakin lampu "naik" (ditarik menjauh), sorotan sedikit melembut.
      const lift = Math.min(1, Math.abs(Math.sin(ay)))
      ;(textRef.current ?? hero).style.setProperty('--lamp-glow', (1 - lift * 0.45).toFixed(3))
      last.current.rel = rel
    }
  }

  const queueFrame = () => {
    if (frameQueued.current) return
    frameQueued.current = true
    raf.current = requestAnimationFrame(() => {
      frameQueued.current = false
      if (!geo.current.ready) measure()
      const point = pending.current
      if (point) {
        aimAt(point.x, point.y)
        pending.current = null
      }
      commit()
    })
  }

  /** Ubah posisi pointer → sudut 2 sumbu, dibatasi bola berjari-jari CORD. */
  const aimAt = (clientX: number, clientY: number) => {
    if (!geo.current.ready) measure()
    const { anchorX, left, zoom, restY } = geo.current
    const dx = clientX / zoom - left - anchorX

    // Bola: sqrt(x² + z²) = CORD. Drag 2D dipetakan ke dua sudut:
    //   ax dari dx (maks ±MAX_D)
    //   ay dari seberapa jauh ditarik ke ATAS dari posisi istirahat.
    const clamped = dx < -MAX_D ? -MAX_D : dx > MAX_D ? MAX_D : dx
    angleX.current = Math.asin(clamped / CORD)

    const dyUp = restY - clientY / zoom // positif = ditarik ke atas
    const ratio = dyUp / CORD
    angleY.current = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, ratio))
  }

  const swingBack = () => {
    cancelAnimationFrame(raf.current)
    frameQueued.current = false
    lastTime.current = 0
    const rig = rigRef.current
    rig?.classList.add('is-swinging')
    const step = (now: number) => {
      const dt = lastTime.current ? Math.min(2, (now - lastTime.current) / 16.667) : 1
      lastTime.current = now
      // Spring damper, dua sumbu independen.
      velX.current += -angleX.current * 0.075 * dt
      velY.current += -angleY.current * 0.075 * dt
      velX.current *= dt >= 2 ? 0.81 : 0.9
      velY.current *= dt >= 2 ? 0.81 : 0.9
      angleX.current += velX.current * dt
      angleY.current += velY.current * dt
      commit()
      if (
        Math.abs(angleX.current) > REST_EPS || Math.abs(velX.current) > REST_EPS ||
        Math.abs(angleY.current) > REST_EPS || Math.abs(velY.current) > REST_EPS
      ) {
        raf.current = requestAnimationFrame(step)
      } else {
        angleX.current = 0
        angleY.current = 0
        velX.current = 0
        velY.current = 0
        commit()
        rig?.classList.remove('is-swinging')
      }
    }
    raf.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    measure()
    commit()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fonts = (document as any).fonts
    fonts?.ready?.then(() => {
      measure()
      commit()
    })

    let resizeObserver: ResizeObserver | null = null
    const hero = rigRef.current?.parentElement
    const text = hero?.querySelector('.title-mark-text') as HTMLElement | null
    if (text && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        measure()
        commit()
      })
      resizeObserver.observe(text)
    }

    let resizeRaf = 0
    const onResize = () => {
      cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        measure()
        commit()
      })
    }
    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('orientationchange', onResize, { passive: true })
    return () => {
      cancelAnimationFrame(raf.current)
      cancelAnimationFrame(resizeRaf)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return
      pending.current = { x: event.clientX, y: event.clientY }
      queueFrame()
    }
    const release = () => {
      if (!dragging.current) return
      dragging.current = false
      pending.current = null
      rigRef.current?.classList.remove('is-dragging')
      swingBack()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
    }
  }, [])

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true
    velX.current = 0
    velY.current = 0
    cancelAnimationFrame(raf.current)
    frameQueued.current = false
    lastTime.current = 0
    rigRef.current?.classList.remove('is-swinging')
    rigRef.current?.classList.add('is-dragging')
    aimAt(event.clientX, event.clientY)
    commit()
    event.preventDefault()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.16 : 0.07
    if (event.key === 'Home') {
      cancelAnimationFrame(raf.current)
      angleX.current = 0
      angleY.current = 0
      velX.current = 0
      velY.current = 0
      commit()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      cancelAnimationFrame(raf.current)
      const dir = event.key === 'ArrowLeft' ? -1 : 1
      const next = angleX.current + step * dir
      angleX.current = next < -MAX_ANGLE ? -MAX_ANGLE : next > MAX_ANGLE ? MAX_ANGLE : next
      commit()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      cancelAnimationFrame(raf.current)
      const dir = event.key === 'ArrowUp' ? 1 : -1
      const next = angleY.current + step * dir
      angleY.current = next < -MAX_ANGLE ? -MAX_ANGLE : next > MAX_ANGLE ? MAX_ANGLE : next
      commit()
    } else {
      return
    }
    event.preventDefault()
  }

  return (
    <div
      ref={rigRef}
      className="lamp-rig"
      onPointerDown={onDown}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Tarik lampu ke segala arah. Pakai tombol panah untuk menggerakkan."
    >
      <span className="lamp-cord" aria-hidden="true" />
      <div className="lamp-head">
        <svg className="lamp-shade" viewBox="0 0 80 58" aria-hidden="true">
          <path d="M40 3 L40 14" className="lamp-wire" />
          <path d="M14 48 Q40 10 66 48 Z" className="lamp-body" />
          <path d="M12 48 Q40 56 68 48" className="lamp-rim" />
          <circle cx="40" cy="50" r="6" className="lamp-bulb" />
        </svg>
        <span className="lamp-halo" aria-hidden="true" />
      </div>
    </div>
  )
}

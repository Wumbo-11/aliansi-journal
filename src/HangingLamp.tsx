import { useEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

const CORD = 76
const MAX_ANGLE = 0.62 // ~35° — batas ayunan
const MAX_DX = Math.sin(MAX_ANGLE) * CORD
const REST_EPS = 0.0015

/**
 * Lampu gantung pendulum yang dioptimalkan untuk 60fps.
 *
 * Prinsip performa:
 * - Ukuran hero & judul diukur SEKALI (dan saat resize), bukan tiap frame.
 *   `getBoundingClientRect` / `getComputedStyle` memaksa layout, jadi
 *   memanggilnya per frame adalah sumber lag terbesar.
 * - Semua penulisan ke DOM lewat satu `commit()` yang hanya menulis gaya
 *   bila nilainya benar-benar berubah.
 * - Input pointer di-coalesce ke frame berikutnya (satu render per frame).
 * - Tanpa state React saat drag → tidak ada re-render komponen.
 */
export default function HangingLamp() {
  const rigRef = useRef<HTMLDivElement>(null)
  const angle = useRef(0)
  const velocity = useRef(0)
  const dragging = useRef(false)
  const raf = useRef(0)
  const lastTime = useRef(0)

  // Cache geometri — diisi oleh measure(), dipakai render tanpa reflow.
  const geo = useRef({ anchorX: 0, left: 0, zoom: 1, textLeft: 0, textWidth: 1, ready: false })
  // Elemen judul: variabel sorotan ditulis langsung ke sini (cakupan kecil).
  const textRef = useRef<HTMLElement | null>(null)
  // Nilai terakhir yang ditulis, supaya tidak menulis DOM berulang.
  const last = useRef({ rot: NaN, rel: NaN })
  // Target pointer untuk drag, di-consume di frame.
  const pending = useRef<number | null>(null)
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
    geo.current = { anchorX: width / 2, left: rect.left / zoom, zoom, textLeft, textWidth, ready: width > 0 }
    // Paksa commit berikutnya menulis ulang semua nilai.
    last.current = { rot: NaN, rel: NaN }
  }

  const commit = () => {
    const rig = rigRef.current
    const hero = rig?.parentElement
    if (!rig || !hero) return
    const { anchorX, textLeft, textWidth } = geo.current
    const a = angle.current

    // CSS rotate(+θ) memutar ke KIRI (sumbu Y ke bawah). Negatifkan supaya
    // kap lampu bergerak searah dengan sorotan di teks.
    const rot = -a
    if (rot !== last.current.rot) {
      rig.style.transform = `rotate(${rot}rad)`
      last.current.rot = rot
    }
    const bx = anchorX + Math.sin(a) * CORD
    const rel = ((bx - textLeft) / textWidth) * 100
    if (rel !== last.current.rel) {
      ;(textRef.current ?? hero).style.setProperty('--lamp-rel', `${rel.toFixed(2)}%`)
      last.current.rel = rel
    }
  }

  /** Satu render per frame, dipakai saat drag (input-high-rate). */
  const queueFrame = () => {
    if (frameQueued.current) return
    frameQueued.current = true
    raf.current = requestAnimationFrame(() => {
      frameQueued.current = false
      if (!geo.current.ready) measure()
      const x = pending.current
      if (x !== null) {
        aimAtClientX(x)
        pending.current = null
      }
      commit()
    })
  }

  const aimAtClientX = (clientX: number) => {
    if (!geo.current.ready) measure()
    const { anchorX, left, zoom } = geo.current
    const dx = clientX / zoom - left - anchorX
    const clamped = dx < -MAX_DX ? -MAX_DX : dx > MAX_DX ? MAX_DX : dx
    angle.current = Math.asin(clamped / CORD)
  }

  const swingBack = () => {
    cancelAnimationFrame(raf.current)
    frameQueued.current = false
    lastTime.current = 0
    const rig = rigRef.current
    rig?.classList.add('is-swinging')
    const step = (now: number) => {
      // Clamp delta: tab yang sempat tertunda tidak meledakkan gerak.
      const dt = lastTime.current ? Math.min(2, (now - lastTime.current) / 16.667) : 1
      lastTime.current = now
      velocity.current += -angle.current * 0.075 * dt
      velocity.current *= dt >= 2 ? 0.81 : 0.9 // 0.9^dt tanpa Math.pow
      angle.current += velocity.current * dt
      commit()
      if (Math.abs(angle.current) > REST_EPS || Math.abs(velocity.current) > REST_EPS) {
        raf.current = requestAnimationFrame(step)
      } else {
        angle.current = 0
        velocity.current = 0
        commit()
        // Lepas layer GPU begitu lampu benar-benar diam.
        rig?.classList.remove('is-swinging')
      }
    }
    raf.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    // Ukur setelah layout & font siap, lalu sekali lagi saat font termuat
    // (lebar judul bisa berubah → posisi sorotan harus ikut presisi).
    measure()
    commit()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fonts = (document as any).fonts
    fonts?.ready?.then(() => {
      measure()
      commit()
    })

    // Judul "Aliansi" mengetik/hilang huruf, jadi lebarnya berubah.
    // ResizeObserver memastikan sorotan ikut bergeser dengan tepat.
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
      pending.current = event.clientX
      queueFrame()
    }
    const release = () => {
      if (!dragging.current) return
      dragging.current = false
      pending.current = null
      rigRef.current?.classList.remove('is-dragging')
      swingBack()
    }
    // pointerup bisa hilang kalau kursor keluar jendela — tangkap juga
    // pointerleave/blur supaya lampu tidak "nyangkut" menempel kursor.
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
    velocity.current = 0
    cancelAnimationFrame(raf.current)
    frameQueued.current = false
    lastTime.current = 0
    // Kelas drag ditulis langsung ke DOM (tanpa setState / re-render).
    rigRef.current?.classList.remove('is-swinging')
    rigRef.current?.classList.add('is-dragging')
    aimAtClientX(event.clientX)
    commit()
    event.preventDefault()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.16 : 0.07
    if (event.key === 'Home') {
      cancelAnimationFrame(raf.current)
      angle.current = 0
      velocity.current = 0
      commit()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      cancelAnimationFrame(raf.current)
      const dir = event.key === 'ArrowLeft' ? -1 : 1
      const next = angle.current + step * dir
      angle.current = next < -MAX_ANGLE ? -MAX_ANGLE : next > MAX_ANGLE ? MAX_ANGLE : next
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
      aria-label="Geser lampu mengikuti kabel. Pakai tombol panah kiri/kanan."
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

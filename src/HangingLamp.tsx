import { useEffect, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

/**
 * Lampu gantung "ragdoll": kabel adalah rantai 8 ruas yang disimulasikan
 * dengan Verlet integration. Setiap ruas panjangnya TETAP (= segmen), jadi
 * kabel tidak pernah memanjang, tapi bisa melengkung/menggantung seperti
 * tali asli saat lampu ditarik ke segala arah.
 *
 * - Titik pertama rantai (titik gantung) DIKUNCI.
 * - Titik terakhir = kap lampu. Saat drag, titik ini diikuti jari (1:1),
 *   dan rantai lainnya menyusul dengan gerakan melengkung yang halus.
 * - Tidak ada atan2/snap: kap lampu mengikuti posisi jari langsung, jadi
 *   tidak ada lompatan di bagian atas (bedanya dengan versi sudut).
 * - Kap lampu menunduk mengikuti arah ruas terakhir kabel → bohlam selalu
 *   menjauhi titik gantung, tidak terkunci ke bawah.
 * - Render di overlay full-screen (bukan di dalam hero yang overflow:hidden)
 *   supaya lampu tidak pernah terpotong di atas.
 */
const SEGMENTS = 8
const SEG = 76 / SEGMENTS // panjang tiap ruas → total kabel tetap 76
const ITER = 12 // iterasi constraint → rantai kaku tapi tetap lentur
const REST_EPS = 0.05
const MAX_REACH = 280 // jangkauan maksimum kap dari titik gantung

type XY = { x: number; y: number }
type Pt = XY & { px: number; py: number }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export default function HangingLamp() {
  const overlayRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLElement | null>(null)

  const pts = useRef<Pt[]>(
    Array.from({ length: SEGMENTS + 1 }, (_, i) => ({
      x: 0, y: i * SEG, px: 0, py: i * SEG,
    })),
  )
  const anchor = useRef<Pt>({ x: 0, y: 0, px: 0, py: 0 })
  const dragging = useRef(false)
  const raf = useRef(0)
  const lastTime = useRef(0)
  const target = useRef<XY | null>(null) // posisi jari (viewport) saat drag
  const releaseTarget = useRef<XY | null>(null)
  const initialized = useRef(false)
  const last = useRef({ d: '', transform: '', rel: NaN })

  const measure = () => {
    const hero = document.querySelector('.hero-inner') as HTMLElement | null
    const text = document.querySelector('.title-mark-text') as HTMLElement | null
    textRef.current = text
    const heroRect = hero?.getBoundingClientRect()
    const zoom = heroRect
      ? Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
      : 1
    // Titik gantung: tengah hero-inner, di atas judul.
    const ax = heroRect && heroRect.width > 0
      ? (heroRect.left + heroRect.width / 2) / zoom
      : window.innerWidth / 2
    const ay = heroRect && heroRect.top > 0 ? heroRect.top / zoom + 10 : 190
    anchor.current = { x: ax, y: ay, px: ax, py: ay }

    if (!initialized.current) {
      pts.current = Array.from({ length: SEGMENTS + 1 }, (_, i) => ({
        x: ax, y: ay + i * SEG, px: ax, py: ay + i * SEG,
      }))
      initialized.current = true
    }
    svgRef.current?.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`)
    last.current = { d: '', transform: '', rel: NaN }
  }

  /** Paksa ujung kabel tetap di jari, dan batasi jangkauan total. */
  const constrain = () => {
    const p = pts.current
    const a = anchor.current
    p[0].x = a.x
    p[0].y = a.y

    // Batasi jangkauan kap (biar tidak keluar layar / menimpa teks).
    const lastPt = p[SEGMENTS]
    if (target.current) {
      const dx = target.current.x - a.x
      const dy = target.current.y - a.y
      const d = Math.hypot(dx, dy) || 1
      const scale = d > MAX_REACH ? MAX_REACH / d : 1
      lastPt.x = a.x + dx * scale
      lastPt.y = a.y + dy * scale
      lastPt.px = lastPt.x
      lastPt.py = lastPt.y
    } else if (releaseTarget.current) {
      const lp = p[SEGMENTS]
      lp.x = releaseTarget.current.x
      lp.y = releaseTarget.current.y
      lp.px = lp.x
      lp.py = lp.y
    }

    // Verlet: setiap ruas dipaksa sepanjang SEG.
    for (let k = 0; k < ITER; k++) {
      p[0].x = a.x
      p[0].y = a.y
      for (let i = 0; i < SEGMENTS; i++) {
        const one = p[i]
        const two = p[i + 1]
        const dx = two.x - one.x
        const dy = two.y - one.y
        const d = Math.hypot(dx, dy) || 1
        const diff = (d - SEG) / d
        // Titik gantung tidak bisa digeser; kap lampu tidak bisa digeser saat drag.
        const lockOne = i === 0
        const lockTwo = i + 1 === SEGMENTS && (dragging.current || !!releaseTarget.current)
        if (!lockOne && !lockTwo) {
          one.x += dx * diff * 0.5
          one.y += dy * diff * 0.5
          two.x -= dx * diff * 0.5
          two.y -= dy * diff * 0.5
        } else if (lockOne && !lockTwo) {
          two.x -= dx * diff
          two.y -= dy * diff
        } else if (!lockOne && lockTwo) {
          one.x += dx * diff
          one.y += dy * diff
        }
      }
      p[0].x = a.x
      p[0].y = a.y
      if (target.current) {
        const lp = p[SEGMENTS]
        lp.x = target.current.x
        lp.y = target.current.y
        lp.px = lp.x
        lp.py = lp.y
      }
    }
  }

  const commit = () => {
    const path = pathRef.current
    const head = headRef.current
    if (!path || !head) return
    const p = pts.current
    const cap = p[SEGMENTS]
    const neck = p[SEGMENTS - 1]

    // Kabel = kurva halus lewat semua titik rantai (satu path kontinyu).
    // Pakai quadratic smooth antar titik → tidak ada sambungan yang putus.
    let d = `M ${p[0].x.toFixed(2)} ${p[0].y.toFixed(2)}`
    for (let i = 1; i < SEGMENTS; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2
      const my = (p[i].y + p[i + 1].y) / 2
      d += ` Q ${p[i].x.toFixed(2)} ${p[i].y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`
    }
    d += ` L ${neck.x.toFixed(2)} ${neck.y.toFixed(2)}`
    if (d !== last.current.d) {
      path.setAttribute('d', d)
      last.current.d = d
    }

    // Kap menunduk mengikuti arah ruas terakhir (leher → kap).
    const dx = cap.x - neck.x
    const dy = cap.y - neck.y
    const ang = Math.atan2(-dx, dy)
    const rot = ` rotate(${ang.toFixed(4)}rad)`
    const transform =
      `translate3d(${cap.x.toFixed(2)}px, ${cap.y.toFixed(2)}px, 0) translate(-50%, -50%)${rot}`
    if (transform !== last.current.transform) {
      head.style.transform = transform
      last.current.transform = transform
    }

    // Sorotan judul mengikuti X kap.
    const text = textRef.current
    if (text) {
      const tr = text.getBoundingClientRect()
      const rel = ((cap.x - tr.left) / tr.width) * 100
      if (rel !== last.current.rel) {
        text.style.setProperty('--lamp-rel', `${clamp(rel, -200, 300).toFixed(2)}%`)
        last.current.rel = rel
      }
    }
  }

  const step = (now: number) => {
    lastTime.current = now
    const p = pts.current
    const gravity = 0.32
    const damping = 0.99

    // Verlet integration tiap titik (kecuali titik gantung).
    for (let i = 1; i < SEGMENTS; i++) {
      const pt = p[i]
      const vx = (pt.x - pt.px) * damping
      const vy = (pt.y - pt.py) * damping
      pt.px = pt.x
      pt.py = pt.y
      pt.x += vx
      pt.y += vy + gravity
    }
    // Ujung kabel: ikut jari saat drag, atau jatuh bebas saat dilepas.
    const cap = p[SEGMENTS]
    if (target.current) {
      cap.px = cap.x
      cap.py = cap.y
      cap.x = target.current.x
      cap.y = target.current.y
    } else {
      const vx = (cap.x - cap.px) * damping
      const vy = (cap.y - cap.py) * damping
      cap.px = cap.x
      cap.py = cap.y
      cap.x += vx
      cap.y += vy + gravity
    }

    constrain()
    commit()

    // Tetap jalan saat masih bergerak / masih ditarik / belum turun.
    const moving = p.some((pt) => Math.abs(pt.x - pt.px) > REST_EPS || Math.abs(pt.y - pt.py) > REST_EPS)
    if (dragging.current || target.current || moving) {
      raf.current = requestAnimationFrame(step)
    } else {
      raf.current = 0
      lastTime.current = 0
    }
  }

  const start = () => {
    if (!raf.current) {
      lastTime.current = 0
      raf.current = requestAnimationFrame(step)
    }
  }

  useLayoutEffect(() => {
    measure()
    commit()
    start()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fonts = (document as any).fonts
    fonts?.ready?.then(() => {
      measure()
      start()
    })
    const onResize = () => {
      cancelAnimationFrame(raf.current)
      raf.current = 0
      measure()
      start()
    }
    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('orientationchange', onResize, { passive: true })
    return () => {
      cancelAnimationFrame(raf.current)
      raf.current = 0
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return
      target.current = { x: event.clientX, y: event.clientY }
      releaseTarget.current = null
      start()
    }
    const release = () => {
      if (!dragging.current) return
      dragging.current = false
      // Lepaskan target jari → ujung kabel jatuh bebas & berayun.
      target.current = null
      releaseTarget.current = null
      overlayRef.current?.classList.remove('is-dragging')
      start()
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
    const head = event.currentTarget
    try {
      head.setPointerCapture(event.pointerId)
    } catch {
      /* abaikan */
    }
    measure()
    dragging.current = true
    target.current = { x: event.clientX, y: event.clientY }
    releaseTarget.current = null
    overlayRef.current?.classList.add('is-dragging')
    start()
    event.preventDefault()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const stepPx = event.shiftKey ? 20 : 8
    const cap = pts.current[SEGMENTS]
    if (event.key === 'Home') {
      measure()
      pts.current = Array.from({ length: SEGMENTS + 1 }, (_, i) => ({
        x: anchor.current.x, y: anchor.current.y + i * SEG,
        px: anchor.current.x, py: anchor.current.y + i * SEG,
      }))
      commit()
      return
    }
    if (event.key === 'ArrowLeft') cap.x -= stepPx
    else if (event.key === 'ArrowRight') cap.x += stepPx
    else if (event.key === 'ArrowUp') cap.y -= stepPx
    else if (event.key === 'ArrowDown') cap.y += stepPx
    else return
    event.preventDefault()
    target.current = { x: cap.x, y: cap.y }
    start()
  }

  return (
    <div ref={overlayRef} className="lamp-overlay">
      <svg ref={svgRef} className="lamp-cable" aria-hidden="true">
        <path ref={pathRef} className="lamp-cable-path" />
      </svg>
      <div
        ref={headRef}
        className="lamp-head"
        onPointerDown={onDown}
        onKeyDown={onKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Tarik lampu ke segala arah. Pakai tombol panah untuk menggerakkan."
      >
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

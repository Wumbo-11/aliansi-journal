import { useEffect, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

/**
 * Lampu gantung ragdoll — kabel = rantai Verlet 8 ruas.
 * - Panjang total 76px, target jari di-CLAMP ke lingkaran radius 76 dari
 *   titik gantung → kabel tidak pernah memanjang, tapi bebas 360°.
 * - Iterasi constraint dilunakkan → kabel melengkung & smooth, bukan kaku.
 * - Grab offset disimpan saat pointer-down → kap tidak melompat ke jari.
 * - Anchor dihitung dari bounding box judul → jarak ke "Aliansi" konstan
 *   di mode biasa maupun fullscreen.
 * - Render di overlay fixed → tidak terpotong overflow:hidden.
 */
const SEGMENTS = 8
const CORD = 76
const SEG = CORD / SEGMENTS
const ITER = 8 // koreksi cukup kenceng: kabel tidak melar, tetap lentur
const CORRECT = 0.85
const GRAVITY = 0.42
const DAMPING = 0.986
const REST_EPS = 0.05
const TITLE_GAP = 42 // jarak kap saat diam ke tepi atas judul

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
  const target = useRef<XY | null>(null)
  const grab = useRef<XY>({ x: 0, y: 0 })
  const initialized = useRef(false)
  const glowRef = useRef(NaN)
  const last = useRef({ d: '', transform: '', rel: NaN })

  const measure = () => {
    const hero = document.querySelector('.hero-inner') as HTMLElement | null
    const title = document.querySelector('.title-mark') as HTMLElement | null
    const text = document.querySelector('.title-mark-text') as HTMLElement | null
    textRef.current = text
    const heroRect = hero?.getBoundingClientRect()
    const zoom = heroRect?.width
      ? Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
      : 1

    // Titik gantung: di atas judul, tetap relatif ke judul (aman fullscreen).
    let ax = heroRect && heroRect.width > 0
      ? (heroRect.left + heroRect.width / 2) / zoom
      : window.innerWidth / 2
    let ay = heroRect && heroRect.top > 0 ? heroRect.top / zoom + 10 : 190
    if (title) {
      const tr = title.getBoundingClientRect()
      if (tr.width > 0) {
        ax = (tr.left + tr.width / 2) / zoom
        ay = (tr.top - TITLE_GAP - CORD) / zoom
      }
    }
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

  /** Target jari dibatasi lingkaran radius CORD — kabel tidak bisa memanjang. */
  const clampedTarget = (): XY | null => {
    if (!target.current) return null
    const a = anchor.current
    const dx = target.current.x - a.x
    const dy = target.current.y - a.y
    const d = Math.hypot(dx, dy) || 1
    if (d <= CORD) return target.current
    return { x: a.x + (dx / d) * CORD, y: a.y + (dy / d) * CORD }
  }

  const constrain = () => {
    const p = pts.current
    const a = anchor.current
    const goal = clampedTarget()
    p[0].x = a.x
    p[0].y = a.y
    if (goal) {
      const lp = p[SEGMENTS]
      lp.x = goal.x
      lp.y = goal.y
    }
    for (let k = 0; k < ITER; k++) {
      p[0].x = a.x
      p[0].y = a.y
      for (let i = 0; i < SEGMENTS; i++) {
        const one = p[i]
        const two = p[i + 1]
        const dx = two.x - one.x
        const dy = two.y - one.y
        const d = Math.hypot(dx, dy) || 1
        const diff = ((d - SEG) / d) * CORRECT
        const lockOne = i === 0
        const lockTwo = i + 1 === SEGMENTS && !!goal
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
      if (goal) {
        const lp = p[SEGMENTS]
        lp.x = goal.x
        lp.y = goal.y
      }
    }
    // Koreksi akhir: ujung TIDAK boleh lebih jauh dari CORD dari anchor.
    // (Saat idle kap jatuh bebas → constraint bisa sedikit melar; ini kuncinya.)
    if (!goal) {
      const lp = p[SEGMENTS]
      const dx = lp.x - a.x
      const dy = lp.y - a.y
      const d = Math.hypot(dx, dy) || 1
      if (d > CORD) {
        lp.x = a.x + (dx / d) * CORD
        lp.y = a.y + (dy / d) * CORD
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

    // Catmull-Rom → cubic Bézier: kurva halus lewat semua titik, kontinyu.
    let d = `M ${p[0].x.toFixed(2)} ${p[0].y.toFixed(2)}`
    for (let i = 0; i < SEGMENTS; i++) {
      const p0 = p[Math.max(0, i - 1)]
      const p1 = p[i]
      const p2 = p[i + 1]
      const p3 = p[Math.min(SEGMENTS, i + 2)]
      const c1x = p1.x + (p2.x - p0.x) / 6
      const c1y = p1.y + (p2.y - p0.y) / 6
      const c2x = p2.x - (p3.x - p1.x) / 6
      const c2y = p2.y - (p3.y - p1.y) / 6
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
    }
    if (d !== last.current.d) {
      path.setAttribute('d', d)
      last.current.d = d
    }

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

    const text = textRef.current
    if (text) {
      const tr = text.getBoundingClientRect()
      const rel = ((cap.x - tr.left) / tr.width) * 100
      if (rel !== last.current.rel) {
        text.style.setProperty('--lamp-rel', `${clamp(rel, -200, 300).toFixed(2)}%`)
        last.current.rel = rel
      }
    }

    // Glow header: makin dekat kap ke header, makin terang (0..1).
    const bar = document.querySelector('.topbar') as HTMLElement | null
    const headerBottom = bar ? bar.getBoundingClientRect().bottom : 72
    const glow = clamp(1 - (cap.y - headerBottom) / 150, 0, 1)
    if (Math.abs(glow - glowRef.current) > 0.02) {
      document.documentElement.style.setProperty('--lamp-glow', glow.toFixed(3))
      glowRef.current = glow
    }
  }

  const step = () => {
    const p = pts.current
    for (let i = 1; i < SEGMENTS; i++) {
      const pt = p[i]
      const vx = (pt.x - pt.px) * DAMPING
      const vy = (pt.y - pt.py) * DAMPING
      pt.px = pt.x
      pt.py = pt.y
      pt.x += vx
      pt.y += vy + GRAVITY
    }
    const cap = p[SEGMENTS]
    const goal = clampedTarget()
    if (goal) {
      // Kap mengikuti target dengan sedikit easing → smooth, tetap presisi.
      cap.px = cap.x
      cap.py = cap.y
      cap.x += (goal.x - cap.x) * 0.55
      cap.y += (goal.y - cap.y) * 0.55
    } else {
      const vx = (cap.x - cap.px) * DAMPING
      const vy = (cap.y - cap.py) * DAMPING
      cap.px = cap.x
      cap.py = cap.y
      cap.x += vx
      cap.y += vy + GRAVITY
    }
    constrain()
    commit()
    const moving = p.some((pt) => Math.abs(pt.x - pt.px) > REST_EPS || Math.abs(pt.y - pt.py) > REST_EPS)
    if (dragging.current || goal || moving) raf.current = requestAnimationFrame(step)
    else raf.current = 0
  }

  const start = () => {
    if (!raf.current) raf.current = requestAnimationFrame(step)
  }

  useLayoutEffect(() => {
    measure()
    commit()
    start()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fonts = (document as any).fonts
    fonts?.ready?.then(() => { measure(); start() })
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
      // Offset grab → kap tidak melompat ke ujung jari.
      target.current = { x: event.clientX + grab.current.x, y: event.clientY + grab.current.y }
      start()
    }
    const release = () => {
      if (!dragging.current) return
      dragging.current = false
      target.current = null
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
    try { head.setPointerCapture(event.pointerId) } catch { /* abaikan */ }
    measure()
    const cap = pts.current[SEGMENTS]
    grab.current = { x: cap.x - event.clientX, y: cap.y - event.clientY }
    dragging.current = true
    // Target awal = posisi kap sekarang → tidak ada loncatan saat disentuh.
    target.current = { x: cap.x, y: cap.y }
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
      target.current = null
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

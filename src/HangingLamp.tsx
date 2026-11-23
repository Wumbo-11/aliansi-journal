import { useEffect, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

/**
 * Lampu gantung — KAP KINEMATIS, KABEL RAGDOLL.
 * - Kap (bola) nempel jari 1:1 (plus grab offset). Jari diam → kap langsung
 *   diam. Tidak ada easing/gravitasi/velocity pada kap saat disentuh.
 * - Rotasi kap dihitung dari vektor ANCHOR → KAP (bukan dari kabel), jadi
 *   deterministik: ditarik ke atas → menghadap atas, kanan → kanan, dll.
 * - Kabel = rantai Verlet: titik atas di-pin ke anchor, titik bawah di-pin ke
 *   leher kap, titik TENGAH yang ragdoll (inertia + gravitasi + damping).
 * - Kabel digambar lebih panjang (CABLE) dari jangkauan kap (CORD) → selalu
 *   ada lengkung, tidak pernah lurus kaku / tidak pernah "memanjang".
 * - Re-anchor: kalau posisi judul bergeser (font/resize/fullscreen), SEMUA
 *   titik rantai + kap ikut digeser, bukan cuma anchor-nya.
 * - Render di overlay fixed → tidak terpotong overflow:hidden.
 */
const SEGMENTS = 8
const CORD = 76 // jangkauan maksimal kap dari titik gantung
const NECK = 18 // leher kap (tempat kabel menyambung), menghadap anchor
// Panjang kabel = jarak anchor→leher saat kap mentok. Pas ditarik mentok kabel
// tegang lurus; pas kap didorong ke dalam, slack muncul → kabel nekuk menggantung.
const SEG = (CORD - NECK) / SEGMENTS
const ITER = 6
const CORRECT = 0.8
const GRAVITY = 0.34
const DAMPING = 0.988
const REST_EPS = 0.05
const TITLE_GAP = 54 // jarak kap saat diam ke tepi atas judul
const SPRING = 0.02 // ayunan bandul saat dilepas
const BOUNCE_DAMP = 0.95

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
  const anchor = useRef<XY>({ x: 0, y: 0 })
  const capPos = useRef<XY>({ x: 0, y: CORD })
  const capVel = useRef<XY>({ x: 0, y: 0 })
  const dragging = useRef(false)
  const raf = useRef(0)
  const target = useRef<XY | null>(null)
  const grab = useRef<XY>({ x: 0, y: 0 })
  const initialized = useRef(false)
  const glowRef = useRef(-1)
  const litRef = useRef(-1)
  const last = useRef({ d: '', transform: '', rel: NaN })

  /** Arah kap = anchor → kap. Rotasi ini yang dipakai kap (deterministik). */
  const capAngle = () => {
    const a = anchor.current
    const c = capPos.current
    return Math.atan2(-(c.x - a.x), c.y - a.y)
  }

  /** Leher kap = pusat kap dikurangi NECK searah sumbu kap (menghadap anchor). */
  const neckPos = () => {
    const c = capPos.current
    const a = capAngle()
    return { x: c.x + NECK * Math.sin(a), y: c.y - NECK * Math.cos(a) }
  }

  const measure = () => {
    const hero = document.querySelector('.hero-inner') as HTMLElement | null
    const text = document.querySelector('.title-mark-text') as HTMLElement | null
    textRef.current = text
    const heroRect = hero?.getBoundingClientRect()
    const zoom = heroRect?.width
      ? Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
      : 1

    // Titik gantung: DIHITUNG DARI TEKS judul (bukan container + margin),
    // dan jaraknya diukur dari BAWAH kap lampu supaya shade tidak menimpa huruf.
    let ax = heroRect && heroRect.width > 0
      ? (heroRect.left + heroRect.width / 2) / zoom
      : window.innerWidth / 2
    let ay = heroRect && heroRect.top > 0 ? heroRect.top / zoom + 10 : 190
    if (text) {
      const tr = text.getBoundingClientRect()
      if (tr.width > 0) {
        ax = (tr.left + tr.width / 2) / zoom
        // kap center = tr.top - GAP - SHADE_H/2 ; anchor = center - CORD
        ay = (tr.top - TITLE_GAP - 30 - CORD) / zoom
      }
    }

    const old = anchor.current
    const dx = ax - old.x
    const dy = ay - old.y
    if (initialized.current && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
      // Anchor bergeser → geser SEMUA titik rantai & kap ikut delta.
      pts.current.forEach((pt) => { pt.x += dx; pt.y += dy; pt.px += dx; pt.py += dy })
      capPos.current.x += dx
      capPos.current.y += dy
    }
    anchor.current = { x: ax, y: ay }

    if (!initialized.current) {
      pts.current = Array.from({ length: SEGMENTS + 1 }, (_, i) => ({
        x: ax, y: ay + i * SEG, px: ax, py: ay + i * SEG,
      }))
      capPos.current = { x: ax, y: ay + CORD }
      initialized.current = true
    }
    svgRef.current?.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`)
    last.current = { d: '', transform: '', rel: NaN }
  }

  /** Target jari di-clamp ke lingkaran radius CORD. */
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
    const neck = neckPos()
    p[0].x = a.x; p[0].y = a.y
    p[SEGMENTS].x = neck.x; p[SEGMENTS].y = neck.y
    for (let k = 0; k < ITER; k++) {
      p[0].x = a.x; p[0].y = a.y
      p[SEGMENTS].x = neck.x; p[SEGMENTS].y = neck.y
      for (let i = 0; i < SEGMENTS; i++) {
        const one = p[i]
        const two = p[i + 1]
        const dx = two.x - one.x
        const dy = two.y - one.y
        const d = Math.hypot(dx, dy) || 1
        const diff = ((d - SEG) / d) * CORRECT
        const lockOne = i === 0
        const lockTwo = i + 1 === SEGMENTS
        if (!lockOne && !lockTwo) {
          one.x += dx * diff * 0.5; one.y += dy * diff * 0.5
          two.x -= dx * diff * 0.5; two.y -= dy * diff * 0.5
        } else if (lockOne && !lockTwo) {
          two.x -= dx * diff; two.y -= dy * diff
        } else if (!lockOne && lockTwo) {
          one.x += dx * diff; one.y += dy * diff
        }
      }
    }
  }

  const commit = () => {
    const path = pathRef.current
    const head = headRef.current
    if (!path || !head) return
    const p = pts.current
    const c = capPos.current

    // Catmull-Rom → cubic Bézier: satu path kontinyu lewat semua titik.
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
    if (d !== last.current.d) { path.setAttribute('d', d); last.current.d = d }

    // Rotasi dari anchor → kap (deterministik, tidak peduli kabel goyah).
    const ang = capAngle()
    const rot = ` rotate(${ang.toFixed(4)}rad)`
    const transform =
      `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) translate(-50%, -50%)${rot}`
    if (transform !== last.current.transform) {
      head.style.transform = transform
      last.current.transform = transform
    }

    const text = textRef.current
    if (text) {
      const tr = text.getBoundingClientRect()
      const rel = ((c.x - tr.left) / tr.width) * 100
      if (rel !== last.current.rel) {
        text.style.setProperty('--lamp-rel', `${clamp(rel, -200, 300).toFixed(2)}%`)
        last.current.rel = rel
      }
    }

    // Glow & peredupan judul berdasarkan ARAH (lift), bukan jarak absolut.
    const a = anchor.current
    const lift = clamp((a.y - c.y) / CORD, 0, 1)
    if (Math.abs(lift - glowRef.current) > 0.01) {
      document.documentElement.style.setProperty('--lamp-glow', lift.toFixed(3))
      glowRef.current = lift
    }
    const lit = clamp(1 - lift * 1.4, 0, 1)
    if (Math.abs(lit - litRef.current) > 0.01) {
      document.documentElement.style.setProperty('--title-lit', lit.toFixed(3))
      litRef.current = lit
    }
  }

  const step = () => {
    const p = pts.current
    const goal = clampedTarget()

    if (goal) {
      // Kap KINEMATIS: nempel target, TANPA easing/gravitasi/velocity.
      capPos.current.x = goal.x
      capPos.current.y = goal.y
      capVel.current.x = 0
      capVel.current.y = 0
    } else if (dragging.current) {
      // Jari masih menekan tapi belum move → kap diam di tempat.
    } else {
      // Dilepas → ayunan bandul (spring 2D) kembali ke posisi diam.
      const a = anchor.current
      const restX = a.x
      const restY = a.y + CORD
      capVel.current.x = (capVel.current.x + (restX - capPos.current.x) * SPRING) * BOUNCE_DAMP
      capVel.current.y = (capVel.current.y + (restY - capPos.current.y) * SPRING) * BOUNCE_DAMP
      capPos.current.x += capVel.current.x
      capPos.current.y += capVel.current.y
      // Batasi jangkauan kap ≤ CORD.
      const dx = capPos.current.x - a.x
      const dy = capPos.current.y - a.y
      const dd = Math.hypot(dx, dy) || 1
      if (dd > CORD) {
        capPos.current.x = a.x + (dx / dd) * CORD
        capPos.current.y = a.y + (dy / dd) * CORD
      }
      if (
        Math.abs(capPos.current.x - restX) < REST_EPS &&
        Math.abs(capPos.current.y - restY) < REST_EPS &&
        Math.abs(capVel.current.x) < REST_EPS &&
        Math.abs(capVel.current.y) < REST_EPS
      ) {
        capPos.current.x = restX
        capPos.current.y = restY
        capVel.current.x = 0
        capVel.current.y = 0
      }
    }

    // Cuma titik TENGAH kabel yang ragdoll (Verlet).
    for (let i = 1; i < SEGMENTS; i++) {
      const pt = p[i]
      const vx = (pt.x - pt.px) * DAMPING
      const vy = (pt.y - pt.py) * DAMPING
      pt.px = pt.x; pt.py = pt.y
      pt.x += vx
      pt.y += vy + GRAVITY
    }
    constrain()
    commit()

    const moving = p.some((pt) =>
      Math.abs(pt.x - pt.px) > REST_EPS || Math.abs(pt.y - pt.py) > REST_EPS)
    const settling = !dragging.current && !goal && (
      Math.abs(capVel.current.x) > REST_EPS ||
      Math.abs(capVel.current.y) > REST_EPS ||
      Math.abs(capPos.current.y - (anchor.current.y + CORD)) > REST_EPS
    )
    if (goal || moving || settling) raf.current = requestAnimationFrame(step)
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
    const onLayout = () => {
      cancelAnimationFrame(raf.current)
      raf.current = 0
      measure()
      start()
    }
    window.addEventListener('resize', onLayout, { passive: true })
    window.addEventListener('orientationchange', onLayout, { passive: true })
    document.addEventListener('fullscreenchange', onLayout)
    return () => {
      cancelAnimationFrame(raf.current)
      raf.current = 0
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('orientationchange', onLayout)
      document.removeEventListener('fullscreenchange', onLayout)
    }
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return
      target.current = { x: event.clientX + grab.current.x, y: event.clientY + grab.current.y }
      start()
    }
    const release = () => {
      if (!dragging.current) return
      dragging.current = false
      target.current = null
      capVel.current = { x: 0, y: 0 }
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
    const c = capPos.current
    grab.current = { x: c.x - event.clientX, y: c.y - event.clientY }
    dragging.current = true
    target.current = { x: c.x, y: c.y }
    capVel.current = { x: 0, y: 0 }
    overlayRef.current?.classList.add('is-dragging')
    start()
    event.preventDefault()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const stepPx = event.shiftKey ? 20 : 8
    const c = capPos.current
    if (event.key === 'Home') {
      measure()
      const a = anchor.current
      capPos.current = { x: a.x, y: a.y + CORD }
      capVel.current = { x: 0, y: 0 }
      target.current = null
      pts.current = Array.from({ length: SEGMENTS + 1 }, (_, i) => ({
        x: a.x, y: a.y + i * SEG, px: a.x, py: a.y + i * SEG,
      }))
      commit()
      return
    }
    if (event.key === 'ArrowLeft') c.x -= stepPx
    else if (event.key === 'ArrowRight') c.x += stepPx
    else if (event.key === 'ArrowUp') c.y -= stepPx
    else if (event.key === 'ArrowDown') c.y += stepPx
    else return
    event.preventDefault()
    target.current = { x: c.x, y: c.y }
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

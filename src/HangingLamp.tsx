import { useEffect, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

// Jarak gantung saat diam (titik gantung → pusat kap lampu).
const CORD = 76
const REST_EPS = 0.05
// Batas panggung: hanya supaya kap lampu tidak keluar dari area hero.
const PAD_X = 26
const PAD_TOP = 12
const PAD_BOTTOM = 24

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Lampu gantung dengan kabel yang berperilaku seperti kabel:
 *
 *  - Titik gantung (anchor) di atas TETAP. Tidak ikut bergerak.
 *  - Kap lampu menempel ke jari 1:1 — tanpa redaman, tanpa snap, tanpa zona
 *    "karet". Mau ditarik 1 px ke arah mana pun, ya segitu pindahnya.
 *  - Kabel digambar sebagai cubic Bézier dengan tangen vertikal di titik
 *    gantung: selalu turun dulu dari langit-langit baru melengkung ke kap
 *    lampu, jadi tidak pernah tampak seperti garis lurus yang melar.
 *  - Saat digeser cepat, lengkung kabel tertinggal di belakang gerakan.
 *  - Saat dilepas, lampu kembali ke posisi istirahat dengan pegas teredam
 *    dua sumbu (jalur melengkung seperti bandul, bukan garis lurus kaku).
 *
 * Performa: geometri diukur sekali (mount/resize/drag-start), penulisan DOM
 * lewat satu commit() yang hanya menulis bila berubah, pointer di-coalesce
 * per frame, tanpa state React saat drag.
 */
export default function HangingLamp() {
  const rigRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const cableRef = useRef<SVGPathElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const textRef = useRef<HTMLElement | null>(null)

  // Posisi kap lampu relatif ke titik gantung (px ruang layout).
  const posX = useRef(0)
  const posY = useRef(CORD)
  const velX = useRef(0)
  const velY = useRef(0)
  const dragging = useRef(false)
  const raf = useRef(0)
  const lastTime = useRef(0)

  const geo = useRef({
    ax: 0, width: 0, height: 0, originLeft: 0, originTop: 0, zoom: 1,
    textLeft: 0, textWidth: 1, ready: false, inited: false,
  })
  const last = useRef({ transform: '', d: '', rel: NaN })
  const grab = useRef({ dx: 0, dy: 0 })
  // Kecepatan halus (px/frame) → dipakai untuk lengkuk kabel.
  const flow = useRef({ x: 0, y: 0 })
  const prev = useRef({ x: 0, y: CORD })
  const pending = useRef<{ x: number; y: number } | null>(null)
  const frameQueued = useRef(false)

  const measure = () => {
    const rig = rigRef.current
    const hero = rig?.parentElement
    if (!rig || !hero) return
    const rect = rig.getBoundingClientRect()
    const zoom = Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
    // Fallback: jsdom / layout belum siap (rect = 0) → pakai lebar viewport.
    const width = rect.width / zoom || hero.clientWidth || window.innerWidth || 360
    const height = rect.height / zoom || window.innerHeight || 640

    const text = hero.querySelector('.title-mark-text') as HTMLElement | null
    let textLeft = 0
    let textWidth = width
    if (text) {
      const tr = text.getBoundingClientRect()
      textLeft = (tr.left - rect.left) / zoom
      textWidth = tr.width / zoom || width
    }

    textRef.current = text
    geo.current = {
      ax: width / 2, width, height,
      originLeft: rect.left, originTop: rect.top, zoom,
      textLeft, textWidth,
      ready: width > 0, inited: geo.current.inited,
    }
    svgRef.current?.setAttribute('viewBox', `0 0 ${width.toFixed(2)} ${height.toFixed(2)}`)
    last.current = { transform: '', d: '', rel: NaN }

    if (!geo.current.inited && width > 0) {
      posX.current = width / 2
      posY.current = CORD
      prev.current = { x: posX.current, y: posY.current }
      geo.current.inited = true
    }
  }

  /** Batas geser: keras di tepi panggung saja — di dalamnya 1:1 dengan jari. */
  const limitX = (v: number) => {
    const { width } = geo.current
    return width > 0 ? clamp(v, PAD_X, Math.max(PAD_X, width - PAD_X)) : v
  }
  const limitY = (v: number) => {
    const { height } = geo.current
    return height > 0 ? clamp(v, PAD_TOP, Math.max(PAD_TOP, height - PAD_BOTTOM)) : v
  }

  const commit = () => {
    const head = headRef.current
    const path = cableRef.current
    if (!head || !path) return
    const { ax, textLeft, textWidth } = geo.current
    const x = posX.current
    const y = posY.current

    // --- Kap lampu: persis di posisi jari (tanpa redaman, tanpa snap). ---
    const transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%)`
    if (transform !== last.current.transform) {
      head.style.transform = transform
      last.current.transform = transform
    }

    // --- Kecepatan halus (px/frame) untuk lengkung kabel. ---
    flow.current.x += (x - prev.current.x - flow.current.x) * 0.35
    flow.current.y += (y - prev.current.y - flow.current.y) * 0.35
    prev.current.x = x
    prev.current.y = y

    // --- Kabel: cubic Bézier dari titik gantung tetap ke kap lampu. ---
    // Tangen di titik gantung SELALU vertikal: kabel turun dulu dari langit-
    // langit, baru melengkung ke kap lampu. Jadi bagian atas kabel kelihatan
    // diam & menggantung, bukan garis lurus yang ikut melar.
    const dx = x - ax
    const dy = y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    // Saat digeser cepat, lengkungnya tertinggal di belakang gerakan (tali).
    const trail = clamp(-(flow.current.x * nx + flow.current.y * ny) * 1.3, -38, 38)
    // P1 sengaja persis di bawah titik gantung → tangen atas selalu vertikal.
    const p1x = ax
    const p1y = dy * 0.55
    const p2x = x - dx * 0.12 + nx * trail * 0.55
    const p2y = y - dy * 0.22
    const d =
      `M ${ax.toFixed(2)} 0 C ${p1x.toFixed(2)} ${p1y.toFixed(2)} ` +
      `${p2x.toFixed(2)} ${p2y.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`
    if (d !== last.current.d) {
      path.setAttribute('d', d)
      last.current.d = d
    }

    // --- Sorotan di huruf selalu mengikuti posisi X lampu. ---
    const rel = ((x - textLeft) / textWidth) * 100
    if (rel !== last.current.rel) {
      ;(textRef.current ?? head).style.setProperty('--lamp-rel', `${rel.toFixed(2)}%`)
      last.current.rel = rel
    }
  }

  const queueFrame = () => {
    if (frameQueued.current) return
    frameQueued.current = true
    raf.current = requestAnimationFrame(() => {
      frameQueued.current = false
      const point = pending.current
      if (point) {
        if (!geo.current.ready) measure()
        const { originLeft, originTop, zoom } = geo.current
        posX.current = limitX((point.x - originLeft) / zoom + grab.current.dx)
        posY.current = limitY((point.y - originTop) / zoom + grab.current.dy)
        pending.current = null
      }
      commit()
    })
  }

  const settle = () => {
    cancelAnimationFrame(raf.current)
    frameQueued.current = false
    lastTime.current = 0
    const rig = rigRef.current
    rig?.classList.add('is-swinging')
    const restX = geo.current.ax
    const restY = CORD
    const step = (now: number) => {
      const dt = lastTime.current ? Math.min(2, (now - lastTime.current) / 16.667) : 1
      lastTime.current = now
      // Pegas teredam dua sumbu → jalurnya melengkung seperti bandul
      // (periode ±1,1 detik, 2–3 ayunan sebelum diam — tidak kaku).
      velX.current = (velX.current + (restX - posX.current) * 0.009 * dt) * Math.pow(0.96, dt)
      velY.current = (velY.current + (restY - posY.current) * 0.009 * dt) * Math.pow(0.96, dt)
      posX.current += velX.current * dt
      posY.current += velY.current * dt
      commit()
      if (
        Math.abs(restX - posX.current) > REST_EPS || Math.abs(velX.current) > REST_EPS ||
        Math.abs(restY - posY.current) > REST_EPS || Math.abs(velY.current) > REST_EPS
      ) {
        raf.current = requestAnimationFrame(step)
      } else {
        posX.current = restX
        posY.current = restY
        velX.current = 0
        velY.current = 0
        flow.current = { x: 0, y: 0 }
        commit()
        rig?.classList.remove('is-swinging')
      }
    }
    raf.current = requestAnimationFrame(step)
  }

  // Layout effect: posisi awal sudah benar sebelum frame pertama dilukis.
  useLayoutEffect(() => {
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
        const wasDragging = dragging.current
        measure()
        if (!wasDragging) {
          posX.current = geo.current.ax
          posY.current = CORD
        }
        commit()
      })
      resizeObserver.observe(text)
    }

    let resizeRaf = 0
    const onResize = () => {
      cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        const wasDragging = dragging.current
        measure()
        if (!wasDragging) {
          posX.current = geo.current.ax
          posY.current = CORD
          velX.current = 0
          velY.current = 0
        }
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
      settle()
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
    // Tangkap pointer: drag tetap jalan walau jari keluar dari kap lampu.
    try {
      head.setPointerCapture(event.pointerId)
    } catch {
      /* pointer capture tidak tersedia — pointermove global tetap dipakai. */
    }
    // Ukur ulang sekali di awal drag supaya posisi presisi.
    measure()
    const { originLeft, originTop, zoom } = geo.current
    // Selisih pusat lampu vs jari → tidak melompat saat ditekan.
    grab.current = {
      dx: posX.current - (event.clientX - originLeft) / zoom,
      dy: posY.current - (event.clientY - originTop) / zoom,
    }
    dragging.current = true
    velX.current = 0
    velY.current = 0
    flow.current = { x: 0, y: 0 }
    prev.current = { x: posX.current, y: posY.current }
    cancelAnimationFrame(raf.current)
    frameQueued.current = false
    lastTime.current = 0
    rigRef.current?.classList.remove('is-swinging')
    rigRef.current?.classList.add('is-dragging')
    commit()
    event.preventDefault()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 18 : 8
    if (event.key === 'Home') {
      cancelAnimationFrame(raf.current)
      posX.current = geo.current.ax
      posY.current = CORD
      velX.current = 0
      velY.current = 0
      flow.current = { x: 0, y: 0 }
      prev.current = { x: posX.current, y: posY.current }
      commit()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      cancelAnimationFrame(raf.current)
      posX.current = limitX(posX.current + (event.key === 'ArrowLeft' ? -step : step))
      commit()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      cancelAnimationFrame(raf.current)
      posY.current = limitY(posY.current + (event.key === 'ArrowUp' ? -step : step))
      commit()
    } else {
      return
    }
    event.preventDefault()
  }

  return (
    <div ref={rigRef} className="lamp-rig">
      <svg ref={svgRef} className="lamp-cable" aria-hidden="true">
        <path ref={cableRef} className="lamp-cable-path" />
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

import { useEffect, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

// Jari-jari = panjang kabel. Pusat kap lampu SELALU sejauh ini dari titik
// gantung, ke arah mana pun (lingkaran penuh, bukan busur pendek).
const R = 76
// Jarak pusat kap ke leher (tempat kabel menyambung), searah sumbu kap.
const NECK = 26
// Batas ayun ~143°: bebas ke samping & agak ke atas, tapi tidak menutupi header.
const MAX_A = 2.5
const REST_EPS = 0.0015

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Lampu gantung model bandul 2D penuh — seperti bola di ujung tali:
 *
 *  - Titik gantung TETAP.
 *  - Pusat kap lampu selalu berada di lingkaran berjari-jari R dari titik
 *    gantung. Mau ditarik ke kiri, kanan, atas, bawah, atau miring 1° —
 *    jaraknya tetap R. Kabel tidak pernah memanjang.
 *  - Kap lampu menunduk mengikuti arah kabel: leher selalu menghadap titik
 *    gantung, bohlam menjauhinya. Tidak pernah terkunci ke bawah.
 *  - Kabel = SATU garis lurus kontinyu dari titik gantung ke leher kap.
 *    Tidak ada sambungan yang putus di tengah.
 *  - Drag presisi: sudut lampu = sudut jari relatif titik gantung (+ offset
 *    grab supaya tidak melompat saat disentuh). 1° jari = 1° lampu.
 *  - Lepas → pegas teredam kembali ke posisi diam dengan ayunan lembut.
 *
 * Performa: geometri diukur sekali, commit() hanya menulis saat berubah,
 * pointer di-coalesce per frame, tanpa state React saat drag.
 */
export default function HangingLamp() {
  const rigRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const cableRef = useRef<SVGPathElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const textRef = useRef<HTMLElement | null>(null)

  // Sudut dari vertikal ke bawah: 0 = bawah, + = kanan, - = kiri, ±pi = atas.
  const theta = useRef(0)
  const vel = useRef(0)
  const dragging = useRef(false)
  const raf = useRef(0)
  const lastTime = useRef(0)
  const grabAngle = useRef(0)

  const geo = useRef({
    ax: 0, width: 0, height: 0, originLeft: 0, originTop: 0, zoom: 1,
    textLeft: 0, textWidth: 1, ready: false,
  })
  const last = useRef({ transform: '', d: '', rel: NaN })
  const pending = useRef<{ x: number; y: number } | null>(null)
  const frameQueued = useRef(false)

  const measure = () => {
    const rig = rigRef.current
    const hero = rig?.parentElement
    if (!rig || !hero) return
    const rect = rig.getBoundingClientRect()
    const zoom = Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
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
      textLeft, textWidth, ready: width > 0,
    }
    svgRef.current?.setAttribute('viewBox', `0 0 ${width.toFixed(2)} ${height.toFixed(2)}`)
    last.current = { transform: '', d: '', rel: NaN }
  }

  /** Sudut jari terhadap titik gantung (0 = bawah, + = kanan). */
  const pointerAngle = (clientX: number, clientY: number) => {
    const { ax, originLeft, originTop, zoom } = geo.current
    const dx = clientX / zoom - originLeft - ax
    const dy = clientY / zoom - originTop
    return Math.atan2(dx, dy)
  }

  const commit = () => {
    const head = headRef.current
    const path = cableRef.current
    if (!head || !path) return
    const { ax, textLeft, textWidth } = geo.current
    const th = theta.current
    const sin = Math.sin(th)
    const cos = Math.cos(th)

    // Pusat kap: selalu di lingkaran jari-jari R dari titik gantung.
    const x = ax + R * sin
    const y = R * cos
    // Leher kap = pusat dikurangi NECK searah kabel (menghadap titik gantung).
    const neckX = x - NECK * sin
    const neckY = y - NECK * cos

    // Kabel: SATU garis lurus, dari titik gantung langsung ke leher kap.
    // Tidak ada kurva/trail yang bisa membuat sambungan tampak putus.
    const d = `M ${ax.toFixed(2)} 0 L ${neckX.toFixed(2)} ${neckY.toFixed(2)}`
    if (d !== last.current.d) {
      path.setAttribute('d', d)
      last.current.d = d
    }

    // Kap lampu menunduk mengikuti arah kabel: rotasi = -th.
    // Leher (0,-NECK) setelah rotate(-th) = (x - NECK*sin, y - NECK*cos)
    // → tepat sama dengan ujung kabel di atas. Sambungannya kontinyu.
    const rot = ` rotate(${(-th).toFixed(4)}rad)`
    const transform =
      `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%)${rot}`
    if (transform !== last.current.transform) {
      head.style.transform = transform
      last.current.transform = transform
    }

    // Sorotan di huruf mengikuti posisi X lampu.
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
        theta.current = clamp(pointerAngle(point.x, point.y) + grabAngle.current, -MAX_A, MAX_A)
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
    const step = (now: number) => {
      const dt = lastTime.current ? Math.min(2, (now - lastTime.current) / 16.667) : 1
      lastTime.current = now
      vel.current = (vel.current - theta.current * 0.012 * dt) * Math.pow(0.95, dt)
      theta.current += vel.current * dt
      commit()
      if (Math.abs(theta.current) > REST_EPS || Math.abs(vel.current) > REST_EPS) {
        raf.current = requestAnimationFrame(step)
      } else {
        theta.current = 0
        vel.current = 0
        commit()
        rig?.classList.remove('is-swinging')
      }
    }
    raf.current = requestAnimationFrame(step)
  }

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
    try {
      head.setPointerCapture(event.pointerId)
    } catch {
      /* pointer capture tidak tersedia — pointermove global tetap dipakai. */
    }
    measure()
    // Offset sudut: lampu tidak melompat saat jari menekan kap di sembarang titik.
    grabAngle.current = theta.current - pointerAngle(event.clientX, event.clientY)
    dragging.current = true
    vel.current = 0
    cancelAnimationFrame(raf.current)
    frameQueued.current = false
    lastTime.current = 0
    rigRef.current?.classList.remove('is-swinging')
    rigRef.current?.classList.add('is-dragging')
    commit()
    event.preventDefault()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.12 : 0.035 // ~2° / ~7°
    if (event.key === 'Home') {
      cancelAnimationFrame(raf.current)
      theta.current = 0
      vel.current = 0
      commit()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      cancelAnimationFrame(raf.current)
      theta.current = clamp(
        theta.current + (event.key === 'ArrowLeft' ? -step : step), -MAX_A, MAX_A,
      )
      commit()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      // Atas = dekat vertikal (0), bawah = menjauh ke samping maksimal.
      cancelAnimationFrame(raf.current)
      const dir = event.key === 'ArrowUp' ? -1 : 1
      const sign = theta.current < 0 ? -1 : 1
      theta.current = clamp(theta.current + dir * step * sign, -MAX_A, MAX_A)
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

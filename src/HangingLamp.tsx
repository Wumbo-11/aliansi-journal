import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

const CORD = 76
const MAX_ANGLE = 0.62 // ~35° — batas ayunan, tapi titik cahaya tetap terikat kabel

/**
 * Lampu gantung pendulum. Posisi vertikal paten (panjang kabel tetap);
 * lampu cuma bisa berayun mengikuti busur kabel. Satu sumber kebenaran
 * (--lamp-x / --lamp-y) dipakai baik oleh bola lampu maupun oleh sorotan
 * teks, jadi arah cahaya SELALU sama dengan arah lampu.
 */
export default function HangingLamp() {
  const rigRef = useRef<HTMLDivElement>(null)
  const angle = useRef(0)
  const velocity = useRef(0)
  const dragging = useRef(false)
  const raf = useRef(0)
  const lastTime = useRef(0)
  const [active, setActive] = useState(false)

  const heroBox = () => {
    const hero = rigRef.current?.parentElement
    if (!hero) return { width: window.innerWidth, left: 0, zoom: 1, rect: { left: 0, width: window.innerWidth } }
    const rect = hero.getBoundingClientRect()
    const zoom = Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
    return { width: rect.width / zoom, left: rect.left / zoom, zoom, rect }
  }

  const render = () => {
    const rig = rigRef.current
    const hero = rig?.parentElement
    if (!rig || !hero) return
    const { width, rect, zoom } = heroBox()
    const anchorX = width / 2
    // CSS rotate(+θ) memutar ke KIRI (sumbu Y ke bawah). Negatifkan supaya
    // bola lampu & sorotan bergerak ke arah yang sama dengan gerakan jari.
    rig.style.transform = `rotate(${-angle.current}rad)`
    const bx = anchorX + Math.sin(angle.current) * CORD
    const by = CORD * Math.cos(angle.current)
    hero.style.setProperty('--lamp-x', `${bx}px`)
    hero.style.setProperty('--lamp-y', `${by}px`)
    // Posisi sorotan relatif terhadap lebar span teks "Aliansi".
    // Bola lampu (bx) diukur dari tepi kiri hero; span bisa lebih sempit
    // dan terpusat, jadi kita konversi ke persentase span.
    const text = hero.querySelector('.title-mark-text')
    if (text) {
      const tr = text.getBoundingClientRect()
      const textLeft = (tr.left - rect.left) / zoom
      const textWidth = tr.width / zoom || 1
      const rel = ((bx - textLeft) / textWidth) * 100
      hero.style.setProperty('--lamp-rel', `${rel}%`)
    }
    rig.style.setProperty('--cord-length', `${CORD}px`)
  }

  const aimAt = (clientX: number) => {
    const { width, left, zoom } = heroBox()
    const anchorX = width / 2
    const dx = (clientX - left) / zoom - anchorX
    const maxDx = Math.sin(MAX_ANGLE) * CORD
    const ratio = Math.max(-maxDx, Math.min(maxDx, dx))
    angle.current = Math.asin(ratio / CORD)
    render()
  }

  const swingBack = () => {
    cancelAnimationFrame(raf.current)
    lastTime.current = 0
    const step = (now: number) => {
      const dt = lastTime.current ? Math.min(2, (now - lastTime.current) / 16.67) : 1
      lastTime.current = now
      velocity.current += (-angle.current * 0.075) * dt
      velocity.current *= Math.pow(0.9, dt)
      angle.current += velocity.current * dt
      render()
      if (Math.abs(angle.current) > 0.0015 || Math.abs(velocity.current) > 0.0015) {
        raf.current = requestAnimationFrame(step)
      } else {
        angle.current = 0
        velocity.current = 0
        render()
      }
    }
    raf.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    render()
    const onResize = () => render()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf.current)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (dragging.current) aimAt(event.clientX)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      setActive(false)
      swingBack()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true
    velocity.current = 0
    cancelAnimationFrame(raf.current)
    setActive(true)
    aimAt(event.clientX)
    event.preventDefault()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.16 : 0.07
    if (event.key === 'Home') {
      cancelAnimationFrame(raf.current)
      angle.current = 0
      velocity.current = 0
      render()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      cancelAnimationFrame(raf.current)
      const dir = event.key === 'ArrowLeft' ? -1 : 1
      angle.current = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle.current + step * dir))
      render()
    } else {
      return
    }
    event.preventDefault()
  }

  return (
    <div
      ref={rigRef}
      className={`lamp-rig${active ? ' is-dragging' : ''}`}
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

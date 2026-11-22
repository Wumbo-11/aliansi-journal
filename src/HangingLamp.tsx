import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

const CORD = 76
const MAX_ANGLE = 0.66 // ~38° — batas ayunan mengikuti panjang kabel

/**
 * Lampu gantung pendulum: posisi vertical paten (panjang kabel tetap),
 * hanya bisa bergeser mengikuti busur kabel. Cahaya putih & bayangan
 * dihitung real-time dari sudut ayunan lewat CSS variable di hero.
 */
export default function HangingLamp() {
  const rigRef = useRef<HTMLDivElement>(null)
  const angle = useRef(0)
  const velocity = useRef(0)
  const dragging = useRef(false)
  const raf = useRef(0)
  const [active, setActive] = useState(false)

  const render = () => {
    const rig = rigRef.current
    const hero = rig?.parentElement
    if (!rig || !hero) return
    rig.style.transform = `rotate(${angle.current}rad)`
    const rect = hero.getBoundingClientRect()
    const zoom = Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
    const anchorX = rect.width / zoom / 2
    const bx = anchorX + Math.sin(angle.current) * CORD
    const by = Math.cos(angle.current) * CORD
    hero.style.setProperty('--lamp-x', `${bx}px`)
    hero.style.setProperty('--lamp-y', `${by}px`)
    rig.style.setProperty('--cord-length', `${CORD}px`)
  }

  const aimAt = (clientX: number) => {
    const hero = rigRef.current?.parentElement
    if (!hero) return
    const rect = hero.getBoundingClientRect()
    const zoom = Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
    const anchorX = rect.width / zoom / 2
    const dx = (clientX - rect.left) / zoom - anchorX
    const ratio = Math.max(-Math.sin(MAX_ANGLE), Math.min(Math.sin(MAX_ANGLE), dx / CORD))
    angle.current = Math.asin(ratio)
    render()
  }

  const swingBack = () => {
    cancelAnimationFrame(raf.current)
    const step = () => {
      velocity.current += -angle.current * 0.06
      velocity.current *= 0.93
      angle.current += velocity.current
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
    return () => cancelAnimationFrame(raf.current)
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
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      // Kabel paten — naik/turun tidak mengubah posisi, tetap di busur.
      return
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

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

/**
 * Lampu gantung interaktif di hero. Bisa digeser pakai jari/mouse;
 * kolam cahaya & bayangan mengikuti posisinya lewat CSS variable.
 * Sengaja tanpa scroll listener/supaya scroll tetap ringan.
 */
export default function HangingLamp() {
  const rigRef = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: 0, y: 0 })
  const grab = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const [active, setActive] = useState(false)

  const heroBox = () => {
    const hero = rigRef.current?.parentElement
    if (!hero) return { width: window.innerWidth, height: 400 }
    const rect = hero.getBoundingClientRect()
    const zoom = Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
    return { width: rect.width / zoom, height: rect.height / zoom }
  }

  const apply = (x: number, y: number) => {
    const rig = rigRef.current
    const hero = rig?.parentElement
    if (!rig || !hero) return
    const { width, height } = heroBox()
    const px = Math.max(54, Math.min(width - 54, x))
    const py = Math.max(20, Math.min(height * 0.6, y))
    pos.current = { x: px, y: py }
    rig.style.left = `${px}px`
    rig.style.top = `${py}px`
    rig.style.setProperty('--cord-length', `${py}px`)
    hero.style.setProperty('--lamp-x', `${px}px`)
    hero.style.setProperty('--lamp-y', `${py}px`)
  }

  useEffect(() => {
    const hero = rigRef.current?.parentElement
    if (!hero) return
    const box = heroBox()
    apply(box.width / 2, Math.min(110, box.height * 0.16))
    const onResize = () => {
      const next = heroBox()
      apply(pos.current.x || next.width / 2, pos.current.y || 100)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return
      const hero = rigRef.current?.parentElement
      if (!hero) return
      const rect = hero.getBoundingClientRect()
      const zoom = Number.parseFloat(window.getComputedStyle(hero).zoom) || 1
      apply(
        (event.clientX - rect.left - grab.current.x) / zoom,
        (event.clientY - rect.top - grab.current.y) / zoom,
      )
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      setActive(false)
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
    const hero = rigRef.current?.parentElement
    if (!hero) return
    const rect = hero.getBoundingClientRect()
    grab.current = {
      x: event.clientX - rect.left - pos.current.x,
      y: event.clientY - rect.top - pos.current.y,
    }
    dragging.current = true
    setActive(true)
    event.preventDefault()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 30 : 12
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (event.key === 'Home') {
      apply(heroBox().width / 2, 100)
      event.preventDefault()
      return
    }
    const move = moves[event.key]
    if (!move) return
    apply(pos.current.x + move[0], pos.current.y + move[1])
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
      aria-label="Geser lampu. Pakai tombol panah untuk memindahkannya."
    >
      <span className="lamp-cord" aria-hidden="true" />
      <svg className="lamp-shade" viewBox="0 0 80 58" aria-hidden="true">
        <path d="M40 3 L40 14" className="lamp-wire" />
        <path d="M14 48 Q40 10 66 48 Z" className="lamp-body" />
        <path d="M12 48 Q40 56 68 48" className="lamp-rim" />
        <circle cx="40" cy="50" r="6" className="lamp-bulb" />
      </svg>
      <span className="lamp-halo" aria-hidden="true" />
    </div>
  )
}

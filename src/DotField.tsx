import { useEffect, useRef } from 'react'

type Dot = { bx: number; by: number; ox: number; oy: number; seed: number }

/**
 * Lapisan latar berupa titik-titik halus yang menjauh dari kursor,
 * plus cahaya lembut mengikuti pointer. Ringan, tanpa dependensi.
 */
export default function DotField({ theme }: { theme: 'dark' | 'light' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const touch = window.matchMedia('(hover: none)').matches

    const spacing = 30
    const baseRadius = 1.1
    const influence = 155
    const push = 26

    let dots: Dot[] = []
    let width = 0
    let height = 0
    let raf = 0
    let running = true
    const pointer = { x: -9999, y: -9999, active: false }

    const build = () => {
      width = window.innerWidth
      height = window.innerHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * ratio)
      canvas.height = Math.floor(height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

      dots = []
      const cols = Math.ceil(width / spacing) + 1
      const rows = Math.ceil(height / spacing) + 1
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          dots.push({
            bx: col * spacing + spacing / 2,
            by: row * spacing + spacing / 2,
            ox: 0,
            oy: 0,
            seed: col * 13 + row * 7,
          })
        }
      }
    }

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height)

      const dark = theme === 'dark'
      const dotRGB = dark ? '243,239,231' : '27,25,22'
      const accentRGB = dark ? '201,168,106' : '154,123,63'
      const baseAlpha = dark ? 0.15 : 0.12

      if (pointer.active && !reduced && !touch) {
        const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 230)
        glow.addColorStop(0, `rgba(${accentRGB},0.075)`)
        glow.addColorStop(1, `rgba(${accentRGB},0)`)
        ctx.fillStyle = glow
        ctx.fillRect(pointer.x - 230, pointer.y - 230, 460, 460)
      }

      for (const dot of dots) {
        let targetX = 0
        let targetY = 0
        let energy = 0

        if (!reduced && !touch && pointer.active) {
          const dx = dot.bx - pointer.x
          const dy = dot.by - pointer.y
          const distance = Math.hypot(dx, dy)
          if (distance < influence && distance > 0.001) {
            const strength = 1 - distance / influence
            energy = strength * strength
            targetX = (dx / distance) * push * strength
            targetY = (dy / distance) * push * strength
          }
        }

        if (!reduced) {
          targetX += Math.sin(time * 0.0004 + dot.seed) * 1.2
          targetY += Math.cos(time * 0.00035 + dot.seed) * 1.2
        }

        const easing = reduced ? 1 : 0.12
        dot.ox += (targetX - dot.ox) * easing
        dot.oy += (targetY - dot.oy) * easing

        const alpha = Math.min(0.85, baseAlpha + energy * 0.5)
        ctx.beginPath()
        ctx.arc(dot.bx + dot.ox, dot.by + dot.oy, baseRadius + energy * 1.4, 0, Math.PI * 2)
        ctx.fillStyle = energy > 0.15
          ? `rgba(${accentRGB},${alpha})`
          : `rgba(${dotRGB},${alpha})`
        ctx.fill()
      }
    }

    const loop = (time: number) => {
      draw(time)
      raf = requestAnimationFrame(loop)
    }

    const onResize = () => {
      build()
      if (reduced) draw(0)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (touch) return
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.active = true
    }
    const onPointerLeave = () => {
      pointer.active = false
    }
    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!reduced && !running) {
        running = true
        raf = requestAnimationFrame(loop)
      }
    }

    build()
    if (reduced) draw(0)
    else raf = requestAnimationFrame(loop)

    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [theme])

  return <canvas ref={canvasRef} className="dot-field" aria-hidden="true" />
}

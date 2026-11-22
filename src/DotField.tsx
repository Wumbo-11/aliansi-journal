import { useEffect, useRef } from 'react'

type Dot = {
  ax: number
  ay: number
  sx: number
  sy: number
}

/**
 * Dot field interaktif: titik rapat yang menjauh dari kursor/jari.
 * Mengikuti pola DotField pada gestalt: kecepatan pointer menggerakkan
 * dot, lalu pelan-pelan kembali ke posisi semula.
 */
export default function DotField({ theme }: { theme: 'dark' | 'light' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const compact = window.matchMedia('(max-width: 720px)').matches

    // Rapet seperti referensi; sedikit lebih longgar di HP biar ringan.
    const dotRadius = compact ? 1.3 : 1.5
    const spacing = compact ? 16 : 14
    const cursorRadius = compact ? 240 : 350
    const bulgeStrength = 62

    let dots: Dot[] = []
    let width = 0
    let height = 0
    let raf = 0
    let running = true
    let intensity = 0
    let speed = 0
    const pointer = { x: -9999, y: -9999, prevX: -9999, prevY: -9999 }

    const build = () => {
      width = window.innerWidth
      height = window.innerHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * ratio)
      canvas.height = Math.floor(height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

      const step = dotRadius + spacing
      const cols = Math.floor(width / step)
      const rows = Math.floor(height / step)
      const startX = (width % step) / 2 + step / 2
      const startY = (height % step) / 2 + step / 2

      dots = []
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = startX + col * step
          const y = startY + row * step
          dots.push({ ax: x, ay: y, sx: x, sy: y })
        }
      }
    }

    const trackSpeed = () => {
      const dx = pointer.prevX - pointer.x
      const dy = pointer.prevY - pointer.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      speed += (distance - speed) * 0.5
      if (speed < 0.001) speed = 0
      pointer.prevX = pointer.x
      pointer.prevY = pointer.y
    }
    const speedTimer = window.setInterval(trackSpeed, 20)

    const BUCKETS = 7
    const baseAlpha = theme === 'dark' ? 0.035 : 0.03
    const peakAlpha = theme === 'dark' ? 0.5 : 0.4

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      const dark = theme === 'dark'
      const gradient = ctx.createLinearGradient(0, 0, width, height)
      if (dark) {
        gradient.addColorStop(0, 'rgba(243,239,231,0.9)')
        gradient.addColorStop(1, 'rgba(201,168,106,0.55)')
      } else {
        gradient.addColorStop(0, 'rgba(27,25,22,0.8)')
        gradient.addColorStop(1, 'rgba(154,123,63,0.5)')
      }
      ctx.fillStyle = gradient

      const target = Math.min(speed / 5, 1)
      intensity += (target - intensity) * 0.08
      if (intensity < 0.001) intensity = 0

      const radiusSquared = cursorRadius * cursorRadius
      const active = intensity > 0.01 && !reduced
      const paths = Array.from({ length: BUCKETS }, () => new Path2D())

      for (const dot of dots) {
        const dx = pointer.x - dot.ax
        const dy = pointer.y - dot.ay
        const distanceSquared = dx * dx + dy * dy
        let glow = 0

        if (active && distanceSquared < radiusSquared) {
          const distance = Math.sqrt(distanceSquared) || 0.001
          const close = 1 - distance / cursorRadius
          glow = close * close * intensity
          const push = close * close * bulgeStrength * intensity
          const angle = Math.atan2(dy, dx)
          dot.sx += (dot.ax - Math.cos(angle) * push - dot.sx) * 0.16
          dot.sy += (dot.ay - Math.sin(angle) * push - dot.sy) * 0.16
        } else {
          dot.sx += (dot.ax - dot.sx) * 0.1
          dot.sy += (dot.ay - dot.sy) * 0.1
        }

        const level = Math.min(BUCKETS - 1, Math.floor(glow * BUCKETS))
        const path = paths[level]
        path.moveTo(dot.sx + dotRadius, dot.sy)
        path.arc(dot.sx, dot.sy, dotRadius, 0, Math.PI * 2)
      }

      for (let level = 0; level < BUCKETS; level += 1) {
        ctx.globalAlpha = baseAlpha + (level / (BUCKETS - 1)) * (peakAlpha - baseAlpha)
        ctx.fill(paths[level])
      }
      ctx.globalAlpha = 1
    }

    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }

    const onMouseMove = (event: MouseEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
    }
    const onTouch = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        pointer.x = event.touches[0].clientX
        pointer.y = event.touches[0].clientY
      }
    }
    const onLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
    }
    const onResize = () => {
      build()
      if (reduced) draw()
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
    if (reduced) {
      draw()
    } else {
      raf = requestAnimationFrame(loop)
      window.addEventListener('mousemove', onMouseMove, { passive: true })
      window.addEventListener('touchstart', onTouch, { passive: true })
      window.addEventListener('touchmove', onTouch, { passive: true })
      window.addEventListener('touchend', onLeave, { passive: true })
      window.addEventListener('touchcancel', onLeave, { passive: true })
      document.addEventListener('mouseleave', onLeave)
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(speedTimer)
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('touchend', onLeave)
      window.removeEventListener('touchcancel', onLeave)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [theme])

  return <canvas ref={canvasRef} className="dot-field" aria-hidden="true" />
}

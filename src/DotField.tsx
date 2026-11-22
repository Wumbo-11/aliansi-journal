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
    const narrow = window.matchMedia('(max-width: 720px)').matches
    // Mode "desktop site" di HP tetap terdeteksi sebagai layar lebar —
    // tapi perangkatnya touch. Pakai profil ringan supaya scroll tetap mulus.
    const touch = (navigator.maxTouchPoints || 0) > 0
    const compact = narrow || touch

    const dotRadius = touch && !narrow ? 1.2 : compact ? 1.3 : 1.5
    const spacing = touch && !narrow ? 18 : compact ? 16 : 14
    const cursorRadius = touch && !narrow ? 220 : compact ? 240 : 350
    const bulgeStrength = compact ? 62 : 82

    let dots: Dot[] = []
    let width = 0
    let height = 0
    let raf = 0
    let running = true
    let intensity = 0
    let speed = 0
    let lastDraw = 0
    let idleFrames = 0
    let scrolling = false
    let scrollTimer = 0
    const pointer = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, active: false }

    // Gradient dibuat sekali per resize, bukan tiap frame — jauh lebih ringan.
    let gradient: CanvasGradient | null = null
    const makeGradient = () => {
      const g = ctx.createLinearGradient(0, 0, width, height)
      if (theme === 'dark') {
        g.addColorStop(0, 'rgba(243,239,231,0.9)')
        g.addColorStop(1, 'rgba(201,168,106,0.55)')
      } else {
        g.addColorStop(0, 'rgba(27,25,22,0.95)')
        g.addColorStop(1, 'rgba(124,95,45,0.7)')
      }
      gradient = g
    }

    const build = () => {
      width = window.innerWidth
      height = window.innerHeight
      // DPR tinggi di HP bikin canvas jauh lebih berat — batasi.
      const ratio = Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 2)
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
      makeGradient()
    }

    const trackSpeed = () => {
      const dx = pointer.prevX - pointer.x
      const dy = pointer.prevY - pointer.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      speed += (distance - speed) * 0.4
      if (speed < 0.001) speed = 0
      pointer.prevX = pointer.x
      pointer.prevY = pointer.y
    }
    const speedTimer = window.setInterval(trackSpeed, 20)

    const BUCKETS = 7
    // Tema terang butuh kontras lebih tinggi supaya titiknya benar-benar terlihat.
    const baseAlpha = theme === 'dark' ? 0.045 : 0.11
    const peakAlpha = theme === 'dark' ? 0.5 : 0.46

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      if (gradient) ctx.fillStyle = gradient

      // Di desktop kursor hampir selalu ada: beri respon dasar langsung,
      // kecepatan mouse cuma menambah kuatnya dorongan.
      const target = pointer.active ? Math.min(1, 0.5 + speed / 3) : 0
      const previousIntensity = intensity
      intensity += (target - intensity) * 0.12
      if (intensity < 0.001) intensity = 0
      // "Motion" = masih ada yang berubah secara terlihat. Kalau kursor diam
      // dan dot sudah settles, loop berhenti total (0% CPU) sampai gerak lagi.
      let motion = Math.abs(intensity - previousIntensity) > 0.002

      const radiusSquared = cursorRadius * cursorRadius
      const active = intensity > 0.01 && !reduced
      const paths = Array.from({ length: BUCKETS }, () => new Path2D())

      for (const dot of dots) {
        const dx = pointer.x - dot.ax
        const dy = pointer.y - dot.ay
        const distanceSquared = dx * dx + dy * dy
        let glow = 0

        let nextX = dot.sx
        let nextY = dot.sy
        if (active && distanceSquared < radiusSquared) {
          const distance = Math.sqrt(distanceSquared) || 0.001
          const close = 1 - distance / cursorRadius
          glow = close * close * intensity
          const push = close * close * bulgeStrength * intensity
          const angle = Math.atan2(dy, dx)
          nextX += (dot.ax - Math.cos(angle) * push - nextX) * 0.16
          nextY += (dot.ay - Math.sin(angle) * push - nextY) * 0.16
        } else {
          nextX += (dot.ax - nextX) * 0.1
          nextY += (dot.ay - nextY) * 0.1
        }

        if (Math.abs(nextX - dot.sx) > 0.05 || Math.abs(nextY - dot.sy) > 0.05) {
          motion = true
        }
        dot.sx = nextX
        dot.sy = nextY

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
      return motion
    }

    const start = () => {
      if (reduced || running) return
      running = true
      idleFrames = 0
      raf = requestAnimationFrame(loop)
    }

    const loop = (time: number) => {
      // Jangan menggambar sama sekali saat scroll di perangkat touch —
      // ini sumber utama lag di mode desktop HP.
      if (scrolling) {
        raf = requestAnimationFrame(loop)
        return
      }
      // Di HP cukup ~30 fps supaya ringan.
      if (compact && time - lastDraw < 30) {
        raf = requestAnimationFrame(loop)
        return
      }
      lastDraw = time
      const motion = draw()
      idleFrames = motion ? 0 : idleFrames + 1
      if (idleFrames > 20) {
        running = false
        raf = 0
        return
      }
      raf = requestAnimationFrame(loop)
    }

    const onMouseMove = (event: MouseEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.active = true
      start()
    }
    const onTouch = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        pointer.x = event.touches[0].clientX
        pointer.y = event.touches[0].clientY
        pointer.active = true
        start()
      }
    }
    const onLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
      pointer.active = false
      start() // animasikan peluruhan glow walau loop sedang idle
    }
    const onResize = () => {
      build()
      if (reduced) draw()
    }
    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!reduced) {
        start()
      }
    }
    const onScroll = () => {
      if (!touch) return
      scrolling = true
      window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(() => {
        scrolling = false
        start()
      }, 180)
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
    if (touch) window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.clearInterval(speedTimer)
      window.clearTimeout(scrollTimer)
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
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

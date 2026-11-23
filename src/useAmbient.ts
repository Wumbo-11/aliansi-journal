import { useCallback, useEffect, useRef, useState } from 'react'

export type SoundMode = 'off' | 'ambient' | 'live'

const STORAGE_KEY = 'aliansi-sound'
// SomaFM Dronezone — ambient drone 24/7 (206 audio/mpeg, stabil).
const STREAM_URL = 'https://ice1.somafm.com/dronezone-128-mp3'
const AMBIENT_LEVEL = 0.11
const LIVE_LEVEL = 0.42
const ON_FADE = 0.06
const OFF_FADE = 0.12

type Voice = { osc: OscillatorNode; gain: GainNode }

/**
 * Suara ambient: satu tombol OFF ⇄ ON. Graf Web Audio dibangun sekali dan
 * selalu berjalan; tombol hanya memindahkan gain. Ambient generatif langsung
 * berbunyi saat ON, stream radio nyusul via crossfade saat benar-benar playing.
 *
 * Catatan penting: AudioContext TIDAK pernah di-suspend oleh visibilitychange
 * atau fullscreen (sumber suara mati permanen). Hanya gain yang diturunkan.
 */
export function useAmbient() {
  const [mode, setMode] = useState<SoundMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved === 'ambient' || saved === 'live' ? saved : 'off'
    } catch {
      return 'off'
    }
  })

  const modeRef = useRef<SoundMode>(mode)
  const ctxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const voicesRef = useRef<Voice[]>([])
  const lfoRef = useRef<OscillatorNode | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const boundRef = useRef(false)

  const fadeMaster = (to: number, seconds: number) => {
    const ctx = ctxRef.current
    const master = masterRef.current
    if (!ctx || !master) return
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(to, now + seconds)
  }

  const ensureGraph = () => {
    if (ctxRef.current && voicesRef.current.length) return ctxRef.current
    const Ctor = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    let ctx = ctxRef.current
    if (!ctx) {
      ctx = new Ctor()
      const master = ctx.createGain()
      master.gain.value = 0
      master.connect(ctx.destination)
      ctxRef.current = ctx
      masterRef.current = master
    }
    if (voicesRef.current.length) return ctx

    // Satu filter lowpass untuk seluruh pad, tersambung ke master sekali.
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    filter.Q.value = 0.6
    filter.connect(masterRef.current!)

    const specs = [
      { f: 55, g: 0.16 },
      { f: 110, g: 0.13 },
      { f: 164.81, g: 0.08 },
      { f: 220, g: 0.05 },
    ]
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.045
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 0.018
    lfo.connect(lfoDepth)
    lfo.start()

    for (const spec of specs) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = spec.f
      osc.detune.value = (Math.random() - 0.5) * 4
      const gain = ctx.createGain()
      gain.gain.value = spec.g
      lfoDepth.connect(gain.gain)
      osc.connect(gain)
      gain.connect(filter)
      osc.start()
      voicesRef.current.push({ osc, gain })
    }
    lfoRef.current = lfo
    return ctx
  }

  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current
    const audio = document.createElement('audio')
    audio.src = STREAM_URL
    audio.preload = 'none'
    audio.volume = 0
    audio.setAttribute('playsinline', '')
    audioRef.current = audio
    return audio
  }

  /** Pasang listener `playing` tepat sekali. Ambient jadi jembatan sampai stream siap. */
  const bindStream = () => {
    if (boundRef.current) return
    const audio = ensureAudio()
    audio.addEventListener('playing', () => {
      if (modeRef.current !== 'live') return
      // Stream benar-benar berbunyi → lepas jembatan ambient.
      fadeMaster(0, 0.35)
      audio.volume = LIVE_LEVEL
    })
    audio.addEventListener('error', () => {
      // Stream gagal → ambient tetap berbunyi, jangan pernah diam.
      if (modeRef.current === 'live') fadeMaster(AMBIENT_LEVEL, 0.2)
    })
    boundRef.current = true
  }

  const startLive = () => {
    bindStream()
    const audio = audioRef.current!
    // Kalau stream SUDAH playing/buffer dari sesi sebelumnya, event `playing`
    // tidak akan fire lagi → serahkan langsung di sini (anti mute permanen).
    if (audio.readyState >= 3 && !audio.paused) {
      audio.volume = LIVE_LEVEL
      fadeMaster(0, 0.25)
    } else {
      // Masih buffering → ambient jadi jembatan sampai event `playing` fire.
      fadeMaster(AMBIENT_LEVEL, ON_FADE)
    }
    try {
      void audio.play().catch(() => {
        // Play ditolak → jembatan ambient tetap berbunyi, tidak pernah diam.
        if (modeRef.current === 'live') fadeMaster(AMBIENT_LEVEL, 0.12)
      })
    } catch { /* diblokir browser — ambient tetap jalan */ }
  }

  const apply = useCallback((next: SoundMode, unlock = true) => {
    const ctx = ensureGraph()
    if (!ctx) return
    if (unlock && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
    if (next === 'off') {
      fadeMaster(0, OFF_FADE)
      const audio = audioRef.current
      if (audio) audio.volume = 0
    } else {
      fadeMaster(AMBIENT_LEVEL, ON_FADE)
      if (next === 'live') startLive()
      else if (audioRef.current) audioRef.current.volume = 0
    }
    modeRef.current = next
    setMode(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
  }, [])

  const toggle = useCallback(() => {
    const next: SoundMode = modeRef.current === 'off' ? 'live' : 'off'
    modeRef.current = next
    setMode(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
    apply(next)
  }, [apply])

  // Web Audio butuh gesture pengguna untuk mulai. Kalau pengguna sudah menyalakan
  // suara lewat tombol, gesture itu sudah cukup — tidak perlu handler tambahan
  // (handler lama justru mematikan suara saat pengguna swipe/klik di tempat lain).
  // Handler ini HANYA dipakai kalau ada preferensi tersimpan saat mount, dan
  // fungsinya membuka kunci AudioContext, BUKAN mengubah mode suara.
  useEffect(() => {
    const saved = modeRef.current
    if (saved === 'off') return
    const unlock = () => {
      // Pakai mode yang tersimpan — JANGAN diganti 'off' dulu (bug lama:
      // swipe/klik di luar tombol suara bikin musik mati sendiri).
      apply(saved)
    }
    document.addEventListener('pointerdown', unlock, { once: true, passive: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [apply])

  // JANGAN suspend AudioContext saat tab disembunyikan / fullscreen.
  // Cukup hentikan stream; saat aktif lagi, nyalakan kembali lewat apply.
  useEffect(() => {
    const onVisibility = () => {
      if (modeRef.current === 'off') return
      if (document.hidden) {
        if (audioRef.current) audioRef.current.pause()
      } else {
        void ctxRef.current?.resume().catch(() => {})
        apply(modeRef.current, true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      for (const voice of voicesRef.current) {
        try { voice.osc.stop(); voice.osc.disconnect(); voice.gain.disconnect() } catch { /* noop */ }
      }
      voicesRef.current = []
      try { lfoRef.current?.stop(); lfoRef.current?.disconnect() } catch { /* noop */ }
      lfoRef.current = null
      if (audioRef.current) { try { audioRef.current.pause() } catch { /* noop */ } }
      void ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
      masterRef.current = null
      audioRef.current = null
    }
  }, [apply])

  return { mode, cycle: toggle }
}

export const SOUND_TITLES: Record<SoundMode, string> = {
  off: 'Suara mati · klik untuk menyalakan musik',
  live: 'Musik menyala · klik untuk mematikan',
  ambient: 'Ambient · klik untuk mematikan',
}

export const SOUND_LABELS: Record<SoundMode, string> = {
  off: 'Nyalakan musik',
  live: 'Matikan musik',
  ambient: 'Matikan musik',
}

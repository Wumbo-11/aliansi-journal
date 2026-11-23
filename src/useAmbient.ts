import { useCallback, useEffect, useRef, useState } from 'react'

export type SoundMode = 'off' | 'ambient' | 'live'

const STORAGE_KEY = 'aliansi-sound'
// SomaFM Dronezone — ambient drone 24/7 (206 audio/mpeg, stabil).
const STREAM_URL = 'https://ice1.somafm.com/dronezone-128-mp3'
const AMBIENT_LEVEL = 0.11
const LIVE_LEVEL = 0.45
// Graf suara selalu berjalan; tombol hanya memindahkan gain.
// Fade super pendek = ON/OFF terasa seketika, tanpa "klak".
const ON_FADE = 0.06
const OFF_FADE = 0.12

type Voice = { osc: OscillatorNode; gain: GainNode }

/**
 * Suara ambient: OFF → ON (live), ON → OFF. Satu tombol, toggle langsung.
 *
 * Responsivitas:
 *  - Graf audio dibangun sekali dan dibiarkan berjalan; tombol hanya
 *    mengubah gain. Tidak ada rebuild/stop-start tiap klik.
 *  - Mode live tidak menunggu buffering: ambient generatif langsung berbunyi,
 *    lalu stream di-crossfade begitu event `playing` fires. Kalau stream gagal,
 *    ambient tetap terdengar — tidak pernah ada jeda diam.
 *  - Target mode disimpan di ref, jadi klik berturut-turut tidak pernah
 *    "ketinggalan satu state" walau React belum selesai render.
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
  const filterRef = useRef<BiquadFilterNode | null>(null)
  const voicesRef = useRef<Voice[]>([])
  const lfoRef = useRef<OscillatorNode | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const unbindStream = useRef<(() => void) | null>(null)
  const volumeTimer = useRef(0)

  const fadeMaster = (to: number, seconds: number) => {
    const ctx = ctxRef.current
    const master = masterRef.current
    if (!ctx || !master) return
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(to, now + seconds)
  }

  /** Bangun graf sekali saja; setelah itu selalu hidup (gain yang menutupnya). */
  const ensureGraph = () => {
    if (ctxRef.current && voicesRef.current.length) return ctxRef.current
    let ctx = ctxRef.current
    if (!ctx) {
      const Ctor = window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
      const master = ctx.createGain()
      master.gain.value = 0
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 900
      filter.Q.value = 0.6
      filter.connect(master)
      master.connect(ctx.destination)
      ctxRef.current = ctx
      masterRef.current = master
      filterRef.current = filter
    }
    if (voicesRef.current.length) return ctx

    const filter = filterRef.current
    if (!filter) return ctx

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

  const rampVolume = (audio: HTMLAudioElement, to: number, ms: number) => {
    window.clearInterval(volumeTimer.current)
    const from = audio.volume
    const started = Date.now()
    volumeTimer.current = window.setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / ms)
      audio.volume = from + (to - from) * t
      if (t >= 1) window.clearInterval(volumeTimer.current)
    }, 30)
  }

  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current
    const audio = document.createElement('audio')
    audio.src = STREAM_URL
    audio.preload = 'auto'
    audio.volume = 0
    audio.setAttribute('playsinline', '')
    audioRef.current = audio
    return audio
  }

  const goLive = () => {
    const audio = ensureAudio()
    unbindStream.current?.()
    const onPlaying = () => {
      // Stream sudah berbunyi → lepas jembatan ambient, naikkan stream.
      fadeMaster(0, 0.4)
      rampVolume(audio, LIVE_LEVEL, 500)
      unbindStream.current?.()
    }
    audio.addEventListener('playing', onPlaying)
    unbindStream.current = () => audio.removeEventListener('playing', onPlaying)
    try {
      void audio.play().catch(() => {})
    } catch { /* browser/blocked environment */ }
  }

  const goQuiet = () => {
    unbindStream.current?.()
    const audio = audioRef.current
    if (audio) rampVolume(audio, 0, 160)
  }

  /** Terapkan mode baru. `unlock` = dipicu interaksi pengguna. */
  const apply = useCallback((next: SoundMode, unlock = true) => {
    const ctx = ensureGraph()
    if (!ctx) return
    if (unlock && ctx.state !== 'running') {
      void ctx.resume().catch(() => {})
    }

    if (next === 'off') {
      fadeMaster(0, OFF_FADE)
      goQuiet()
    } else {
      // Ambient langsung berbunyi (juga sebagai jembatan mode live).
      fadeMaster(AMBIENT_LEVEL, ON_FADE)
      if (next === 'live') goLive()
      else goQuiet()
    }

    modeRef.current = next
    setMode(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
  }, [])

  /** Satu tombol: OFF → ON (live) → OFF. Langsung merespons di klik yang sama. */
  const toggle = useCallback(() => {
    const next: SoundMode = modeRef.current === 'off' ? 'live' : 'off'
    modeRef.current = next
    setMode(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
    apply(next)
  }, [apply])

  useEffect(() => {
    // Browser melarang autoplay sebelum interaksi. Kalau pengguna punya
    // preferensi ON dari kunjungan sebelumnya, nyalakan ulang pada sentuhan
    // pertama — bukan saat halaman baru dimuat.
    if (modeRef.current === 'off') return
    const unlock = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.sound-button')) return
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
      const saved = modeRef.current
      modeRef.current = 'off'
      apply(saved)
    }
    document.addEventListener('pointerdown', unlock, true)
    document.addEventListener('keydown', unlock, true)
    return () => {
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
    }
  }, [apply])

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        void ctxRef.current?.suspend().catch(() => {})
        try { audioRef.current?.pause() } catch { /* noop */ }
      } else if (modeRef.current !== 'off') {
        void ctxRef.current?.resume().catch(() => {})
        if (modeRef.current === 'live') goLive()
        else fadeMaster(AMBIENT_LEVEL, ON_FADE)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(volumeTimer.current)
      unbindStream.current?.()
      for (const voice of voicesRef.current) {
        try {
          voice.osc.stop()
          voice.osc.disconnect()
          voice.gain.disconnect()
        } catch { /* sudah berhenti */ }
      }
      voicesRef.current = []
      try {
        lfoRef.current?.stop()
        lfoRef.current?.disconnect()
      } catch { /* sudah berhenti */ }
      lfoRef.current = null
      try { audioRef.current?.pause() } catch { /* noop */ }
      void ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
      masterRef.current = null
      filterRef.current = null
      audioRef.current = null
    }
  }, [])

  // Alias `cycle` dipakai App (nama lama), sekarang perilakunya toggle ON/OFF.
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

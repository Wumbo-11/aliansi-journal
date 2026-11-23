import { useCallback, useEffect, useRef, useState } from 'react'

export type SoundMode = 'off' | 'ambient' | 'live'

const STORAGE_KEY = 'aliansi-sound'
// SomaFM Dronezone — ambient drone 24/7 (206 audio/mpeg, stabil).
const STREAM_URL = 'https://ice1.somafm.com/dronezone-128-mp3'
const ORDER: SoundMode[] = ['off', 'ambient', 'live']
const AMBIENT_LEVEL = 0.075
const LIVE_LEVEL = 0.45
// Fade dibuat sangat pendek supaya tombol terasa responsif (langsung bunyi).
const FAST_FADE = 0.12

type Voice = { osc: OscillatorNode; gain: GainNode }

/**
 * Suara ambient: off → generative → radio live.
 *
 * Kunci responsivitas: mode live TIDAK pernah menunggu buffering stream.
 * Generative ambient dinyalakan lebih dulu (langsung bunyi dari oscillator),
 * lalu stream di-crossfade begitu event `playing` fires. Kalau stream gagal,
 * ambient tetap terdengar — tidak ada jeda diam.
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

  const ctxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const filterRef = useRef<BiquadFilterNode | null>(null)
  const voicesRef = useRef<Voice[]>([])
  const lfoRef = useRef<OscillatorNode | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const offTimer = useRef(0)
  const volumeTimer = useRef(0)
  const unbindStream = useRef<(() => void) | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  const fadeMaster = (to: number, seconds: number) => {
    const ctx = ctxRef.current
    const master = masterRef.current
    if (!ctx || !master) return
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(to, now + seconds)
  }

  const ensureContext = () => {
    if (ctxRef.current) return ctxRef.current
    const Ctor = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    const ctx = new Ctor()
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
    return ctx
  }

  const buildVoices = () => {
    const ctx = ctxRef.current
    const filter = filterRef.current
    if (!ctx || !filter || voicesRef.current.length) return

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
    lfo.start()
    lfoRef.current = lfo
  }

  const stopVoices = () => {
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
  }

  /** Ambient langsung bunyi — dipakai juga sebagai jembatan saat live buffering. */
  const startAmbient = (seconds = FAST_FADE) => {
    window.clearTimeout(offTimer.current)
    const ctx = ensureContext()
    if (!ctx) return
    void ctx.resume().catch(() => {})
    buildVoices()
    fadeMaster(AMBIENT_LEVEL, seconds)
  }

  const stopAmbient = (seconds = 0.3) => {
    fadeMaster(0, seconds)
    window.clearTimeout(offTimer.current)
    offTimer.current = window.setTimeout(stopVoices, seconds * 1000 + 60)
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
    audio.preload = 'auto' // mulai buffering lebih awal
    audio.volume = 0
    audio.setAttribute('playsinline', '')
    audioRef.current = audio
    return audio
  }

  const stopAudio = (ms = 300) => {
    unbindStream.current?.()
    const audio = audioRef.current
    if (!audio) return
    rampVolume(audio, 0, ms)
    offTimer.current = window.setTimeout(() => {
      try { audio.pause() } catch { /* noop */ }
    }, ms + 40)
  }

  const apply = useCallback((next: SoundMode, force = false) => {
    const previous = modeRef.current
    if (next === previous && !force) return
    window.clearTimeout(offTimer.current)

    if (next === 'ambient') {
      stopAudio(250)
      startAmbient()
    } else if (next === 'live') {
      // Jembatan instan: ambient dulu, stream menyusul saat siap.
      startAmbient()
      const audio = ensureAudio()
      unbindStream.current?.()
      const onPlaying = () => {
        fadeMaster(0, 0.45)
        rampVolume(audio, LIVE_LEVEL, 500)
        unbindStream.current?.()
      }
      audio.addEventListener('playing', onPlaying)
      unbindStream.current = () => audio.removeEventListener('playing', onPlaying)
      try {
        void audio.play().catch(() => {})
      } catch { /* browser/blocked environment */ }
    } else {
      stopAmbient(250)
      stopAudio(250)
    }

    modeRef.current = next
    setMode(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
  }, [])

  const cycle = useCallback(() => {
    const current = ORDER.indexOf(modeRef.current)
    apply(ORDER[(current + 1) % ORDER.length])
  }, [apply])

  useEffect(() => {
    // Browser melarang autoplay sebelum interaksi. Kalau pengguna punya
    // preferensi "ambient/live" dari kunjungan sebelumnya, nyalakan ulang
    // pada sentuhan/ketukan PERTAMA — bukan saat halaman baru dimuat.
    if (modeRef.current === 'off') return
    const unlock = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.sound-button')) return
      const saved = modeRef.current
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
      modeRef.current = 'off'
      apply(saved, true)
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
        // Aktifkan ulang lewat jalur yang sama (jembatan ambient + stream).
        apply(modeRef.current, true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(offTimer.current)
      window.clearInterval(volumeTimer.current)
      unbindStream.current?.()
      stopVoices()
      try { audioRef.current?.pause() } catch { /* noop */ }
      void ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
      masterRef.current = null
      filterRef.current = null
      audioRef.current = null
    }
  }, [apply])

  return { mode, cycle }
}

export const SOUND_TITLES: Record<SoundMode, string> = {
  off: 'Suara mati · klik untuk ambient',
  ambient: 'Ambient · klik untuk radio live',
  live: 'Radio live · klik untuk matikan',
}

export const SOUND_LABELS: Record<SoundMode, string> = {
  off: 'Nyalakan suara ambient',
  ambient: 'Ganti ke radio live',
  live: 'Matikan suara',
}

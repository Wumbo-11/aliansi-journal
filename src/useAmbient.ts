import { useCallback, useEffect, useRef, useState } from 'react'

export type SoundMode = 'off' | 'ambient' | 'live'

const STORAGE_KEY = 'aliansi-sound'
// SomaFM Dronezone — ambient drone 24/7 (206 audio/mpeg, stabil).
const STREAM_URL = 'https://ice1.somafm.com/dronezone-128-mp3'
const ORDER: SoundMode[] = ['off', 'ambient', 'live']
const AMBIENT_LEVEL = 0.075
const LIVE_LEVEL = 0.45

type Voice = { osc: OscillatorNode; gain: GainNode }

/** Suara ambient: gradasi off → generative → radio live, tanpa file audio. */
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
  const switchTimer = useRef(0)
  const volumeTimer = useRef(0)
  const modeRef = useRef(mode)
  modeRef.current = mode

  const rampParam = (param: AudioParam, to: number, seconds: number) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const now = ctx.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(to, now + seconds)
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

    // Empat sine rendah dan beri LFO sangat pelan → pad hangat yang "hidup",
    // tapi tetap murah (4 oscillator, tanpa buffer/file).
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

  const rampVolume = (audio: HTMLAudioElement, to: number, ms: number) => {
    window.clearInterval(volumeTimer.current)
    const from = audio.volume
    const started = Date.now()
    volumeTimer.current = window.setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / ms)
      audio.volume = from + (to - from) * t
      if (t >= 1) window.clearInterval(volumeTimer.current)
    }, 40)
  }

  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current
    const audio = document.createElement('audio')
    audio.src = STREAM_URL
    audio.loop = true
    audio.preload = 'none'
    audio.volume = 0
    audio.setAttribute('playsinline', '')
    audioRef.current = audio
    return audio
  }

  const apply = useCallback((next: SoundMode, force = false) => {
    const previous = modeRef.current
    if (next === previous && !force) return
    window.clearTimeout(switchTimer.current)

    if (previous === 'ambient' && masterRef.current) {
      rampParam(masterRef.current.gain, 0, 0.45)
    }
    if (previous === 'live' && audioRef.current) {
      rampVolume(audioRef.current, 0, 400)
    }

    if (next === 'ambient') {
      const ctx = ensureContext()
      if (ctx) {
        void ctx.resume().catch(() => {})
        buildVoices()
        if (masterRef.current) rampParam(masterRef.current.gain, AMBIENT_LEVEL, 1.2)
      }
    } else if (next === 'live') {
      switchTimer.current = window.setTimeout(() => {
        stopVoices()
        const audio = ensureAudio()
        try {
          void audio.play().catch(() => {})
        } catch { /* browser/blocked environment */ }
        rampVolume(audio, LIVE_LEVEL, 1200)
      }, previous === 'ambient' ? 500 : 0)
    } else {
      switchTimer.current = window.setTimeout(() => {
        stopVoices()
        if (audioRef.current) {
          try { audioRef.current.pause() } catch { /* noop */ }
        }
      }, 550)
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
      // Biarkan tombol suara menangani kliknya sendiri (cycle).
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
      } else if (modeRef.current === 'ambient') {
        void ctxRef.current?.resume().catch(() => {})
      } else if (modeRef.current === 'live' && audioRef.current) {
        try { void audioRef.current.play().catch(() => {}) } catch { /* noop */ }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(switchTimer.current)
      window.clearInterval(volumeTimer.current)
      stopVoices()
      try { audioRef.current?.pause() } catch { /* noop */ }
      void ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
      masterRef.current = null
      filterRef.current = null
      audioRef.current = null
    }
  }, [])

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

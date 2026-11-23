import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode, TouchEvent } from 'react'
import DotField from './DotField'
import HangingLamp from './HangingLamp'
import { SOUND_LABELS, SOUND_TITLES, useAmbient } from './useAmbient'
import { useFullscreen } from './useFullscreen'
import { CATEGORIES } from './types'
import type { Category, Entry } from './types'
import type { Draft } from './drive'
import {
  addEntryRemote,
  clearDraft,
  deleteEntryRemote,
  getDriveUrl,
  initOwnedWith,
  listEntries,
  readDraft,
  readEntries,
  setDriveUrl,
  updateEntryRemote,
  writeDraft,
  writeEntries,
  uid,
  writeOwned,
} from './drive'

const THEME_KEY = 'aliansi-theme'
const PANEL_OPACITY_KEY = 'aliansi-panel-opacity'

const HEADING_HINTS = [
  'Sebuah cerita, sebuah hari.',
  'Ingin menulis apa?',
  'Ceritakan harimu di sini.',
  'Mulai dari satu kalimat saja.',
  'Apa yang sedang kamu pikirkan?',
  'Tulis apa adanya, tak perlu sempurna.',
  'Cerita kecil boleh jadi berarti.',
  'Kalimat pertama biasanya yang paling jujur.',
]

// Kalimat pembuka halaman 1 — mengetik maju, hapus mundur, berganti selamanya.
const HERO_LINES = [
  'Tempat cerita disimpan, hari dibagikan, dan suara kecil tetap berarti.',
  'Setiap hari punya sesuatu untuk diceritakan.',
  'Tulis pelan, biar kata-katanya sempat bernapas.',
  'Di sini, cerita kecil pun punya tempat.',
  'Simpan hari ini supaya besok bisa kau kenang.',
  'Kadang satu kalimat sudah cukup untuk pulang.',
  'Ruang ini untuk kata yang tak sempat kau ucap.',
  'Tidak perlu panjang, asal jujur.',
  'Ceritamu adalah jejak langit yang tak terlihat.',
  'Hari yang biasa pun layak ditulis.',
  'Pelan-pelan, satu kalimat demi satu kalimat.',
  'Ada keberanian dalam tulisan yang sederhana.',
  'Biarkan suara kecil itu tetap terdengar di sini.',
  'Yang kamu rasakan hari ini, boleh kau tinggalkan di sini.',
  'Menulis adalah cara lain untuk tetap ingat.',
  'Tiap coretan menyimpan versi dirimu yang berbeda.',
]
const dateFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** HP biasa, atau Chrome Android dengan "Desktop site" aktif. */
function isCompactView(): boolean {
  return (
    document.documentElement.dataset.desktopSite === 'true' ||
    window.matchMedia('(max-width: 720px)').matches
  )
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
    </svg>
  )
}

function SoundOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="m17 9 4 6M21 9l-4 6" />
    </svg>
  )
}

function SoundAmbientIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  )
}

function SoundLiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
      <circle cx="14" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </svg>
  )
}

function FullscreenExitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
      <path d="m13.5 7.5 3 3" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

/** Judul "Aliansi" yang mengetik saat melebar, lalu mengetik jadi "A" saat meringkas. */
function TitleMark() {
  const [collapsed, setCollapsed] = useState(false)
  const [shown, setShown] = useState('')
  const shownRef = useRef('')
  const reducedMotion = useReducedMotion()
  const target = collapsed ? 'A' : 'Aliansi'

  useEffect(() => {
    if (reducedMotion) {
      shownRef.current = target
      setShown(target)
      return
    }

    // Pakai interval, bukan rantai setTimeout — lebih tahan terhadap
    // StrictMode, throttle tab, dan re-render yang bisa menghentikan animasi.
    let current = shownRef.current
    const timer = window.setInterval(() => {
      if (current === target) {
        window.clearInterval(timer)
        return
      }
      current = target.startsWith(current)
        ? target.slice(0, current.length + 1)
        : current.slice(0, -1)
      shownRef.current = current
      setShown(current)
    }, 85)

    return () => window.clearInterval(timer)
  }, [target, reducedMotion])

  return (
    <button
      type="button"
      className="title-mark"
      onClick={() => setCollapsed((value) => !value)}
      aria-label={collapsed ? 'Perbesar judul Aliansi' : 'Ringkas judul menjadi A'}
      title="Klik untuk mengubah judul"
    >
      <span className="title-mark-text">{shown || '\u00a0'}</span>
    </button>
  )
}

function Reveal({
  children,
  className = '',
  pop = false,
}: {
  children: ReactNode
  className?: string
  pop?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: pop ? 0.25 : 0.08 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [pop])

  return (
    <div
      ref={ref}
      className={`reveal${pop ? ' reveal-pop' : ''}${visible ? ' is-visible' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/** Judul form yang mengetik berganti-ganti kalimat — sengaja di tempat terlihat. */
function RotatingHeading() {
  const reducedMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [shown, setShown] = useState('')

  useEffect(() => {
    const full = HEADING_HINTS[index]
    if (reducedMotion) {
      setShown(full)
      return
    }

    let current = ''
    let deleting = false
    let hold = 0
    let timer = 0
    let stopped = false

    const tick = () => {
      if (stopped) return
      if (!deleting) {
        current = full.slice(0, current.length + 1)
        setShown(current)
        if (current === full) deleting = true
      } else if (hold < 20) {
        hold += 1
      } else {
        current = current.slice(0, -1)
        setShown(current)
        if (!current) {
          window.clearInterval(timer)
          timer = 0
          setIndex((value) => (value + 1) % HEADING_HINTS.length)
        }
      }
    }
    const run = () => {
      if (timer) return
      timer = window.setInterval(tick, 70)
    }
    const stop = () => {
      if (!timer) return
      window.clearInterval(timer)
      timer = 0
    }
    // Tab tersembunyi: hentikan timer supaya tidak membangunkan CPU.
    const onVisibility = () => (document.hidden ? stop() : run())

    run()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [index, reducedMotion])

  return <span className="rotating-heading-text">{shown || '\u00a0'}</span>
}

/**
 * Subtitle halaman 1: mengetik maju → jeda → hapus mundur → kalimat berikutnya.
 * Font & ukuran mengikuti .hero-subtitle (ditentukan CSS, tidak diubah JS).
 *
 * Mulus tanpa patah:
 *  - Satu requestAnimationFrame loop (bukan setInterval 48ms) → sinkron
 *    dengan refresh rate layar.
 *  - Teks ditulis langsung ke DOM lewat ref, BUKAN setState. Dulu setiap
 *    karakter memicu render React ulang → 20 render/detik → tersendat.
 */
function TypewriterLine() {
  const reducedMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const lineRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const full = HERO_LINES[index]
    const node = lineRef.current
    if (!node) return

    if (reducedMotion) {
      node.textContent = full
      return
    }

    const TYPE_MS = 52 // ms per karakter saat mengetik
    const ERASE_MS = 26 // hapus sedikit lebih cepat → terasa hidup
    const HOLD_MS = 2000 // diam setelah kalimat selesai
    const NEXT_GAP_MS = 300 // jeda kosong sebelum kalimat baru

    let shown = 0
    let phase: 'type' | 'hold' | 'erase' | 'gap' = 'type'
    let phaseStart = -1
    let raf = 0
    let stopped = false
    let carry = 0 // sisa waktu antar-frame → laju konstan, tanpa loncatan

    const render = () => {
      // non-breaking space supaya tinggi baris tidak kolaps saat kosong.
      node.textContent = shown > 0 ? full.slice(0, shown) : '\u00a0'
    }
    render()

    const frame = (now: number) => {
      if (stopped) return
      // Timestamp rAF adalah satu-satunya sumber waktu — tidak dicampur dengan
      // performance.now() supaya tetap benar di browser maupun test runner.
      if (phaseStart < 0) phaseStart = now

      if (phase === 'type') {
        // SATU karakter per frame + sisa waktu disimpan. Kalau frame drop,
        // karakter tertinggal menyusul perlahan — tidak muncul sekaligus.
        carry += now - phaseStart
        phaseStart = now
        if (carry >= TYPE_MS && shown < full.length) {
          const advance = Math.min(2, Math.floor(carry / TYPE_MS))
          shown = Math.min(full.length, shown + advance)
          carry -= advance * TYPE_MS
          render()
        }
        if (shown >= full.length) {
          phase = 'hold'
          phaseStart = now
          carry = 0
        }
      } else if (phase === 'hold') {
        if (now - phaseStart >= HOLD_MS) {
          phase = 'erase'
          phaseStart = now
          carry = 0
        }
      } else if (phase === 'erase') {
        carry += now - phaseStart
        phaseStart = now
        if (carry >= ERASE_MS && shown > 0) {
          const back = Math.min(2, Math.floor(carry / ERASE_MS))
          shown = Math.max(0, shown - back)
          carry -= back * ERASE_MS
          render()
        }
        if (shown <= 0) {
          phase = 'gap'
          phaseStart = now
          carry = 0
        }
      } else if (now - phaseStart >= NEXT_GAP_MS) {
        // Ganti kalimat lewat state — ini satu kali render, bukan per huruf.
        setIndex((value) => (value + 1) % HERO_LINES.length)
        return
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) {
        // Lanjutkan dari fase yang sama; sisa waktu dianggap habis.
        phaseStart = -1
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [index, reducedMotion])

  return (
    <p className="hero-subtitle" aria-live="off">
      {/* Teks phantom mengunci wrapping & tinggi sejak awal. Tanpa ini, saat
          kalimat mengetik melewati batas baris, teks loncat ke kiri → "patah". */}
      <span className="typewriter-ghost" aria-hidden="true">{HERO_LINES[index]}</span>
      <span className="typewriter-live">
        <span className="typewriter-line" ref={lineRef} />
        <span className="typewriter-caret" aria-hidden="true" />
      </span>
    </p>
  )
}

/**
 * Autosave draf: ditulis ringan (debounce 250ms), tapi dipaksa tersimpan
 * saat tab disembunyikan atau halaman ditutup — tulisan tidak mungkin hilang.
 */
function useDraftAutosave(draft: Draft, key?: string) {
  const latest = useRef(draft)
  latest.current = draft

  useEffect(() => {
    const timer = window.setTimeout(() => writeDraft(latest.current, key), 250)
    return () => window.clearTimeout(timer)
  }, [draft.title, draft.author, draft.body, draft.category, key])

  useEffect(() => {
    const flush = () => writeDraft(latest.current, key)
    const onVisibility = () => {
      if (document.hidden) flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [key])
}

function Composer({ onAdd }: { onAdd: (entry: Entry) => void }) {
  const [saved] = useState(readDraft)
  const [title, setTitle] = useState(saved.title)
  const [author, setAuthor] = useState(saved.author)
  const [body, setBody] = useState(saved.body)
  const [category, setCategory] = useState<Category>(saved.category)
  const [error, setError] = useState('')

  // Simpan draf otomatis — aman kalau web ditutup kapan pun.
  useDraftAutosave({ title, author, body, category })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !body.trim()) {
      setError('Judul dan isi cerita wajib diisi.')
      return
    }
    onAdd({
      id: uid(),
      title: title.trim(),
      body: body.trim(),
      author: author.trim(),
      category,
      createdAt: Date.now(),
    })
    clearDraft()
    setTitle('')
    setAuthor('')
    setBody('')
    setCategory('Cerita')
    setError('')
  }

  return (
    <section className="composer panel" id="tulis" aria-labelledby="composer-heading">
      <div className="section-heading">
        <div>
          <h2 id="composer-heading"><RotatingHeading /></h2>
        </div>
      </div>

      <form onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Judul</span>
          <span className="input-wrap">
            <input
              className="title-input"
              value={title}
              placeholder="Tulis judul di sini…"
              onChange={(event) => {
                setTitle(event.target.value)
                setError('')
              }}
            />
          </span>
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Nama</span>
            <input
              className="name-input"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Anonim"
            />
          </label>
          <div className="field chips-field">
            <span className="field-label">Jenis</span>
            <div className="chips" role="group" aria-label="Jenis tulisan">
              {CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`chip${category === item ? ' is-active' : ''}`}
                  onClick={() => setCategory(item)}
                  aria-pressed={category === item}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Isi cerita</span>
          <textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value)
              setError('')
            }}
            placeholder="Tulis apa saja yang ingin kamu simpan atau bagikan…"
            rows={6}
          />
        </label>

        <div className="form-footer">
          <p className={`form-error${error ? ' is-visible' : ''}`} role="alert">{error || '\u00a0'}</p>
          <button type="submit" className="primary-button">
            Simpan cerita
            <span aria-hidden="true">↗</span>
          </button>
        </div>

      </form>
    </section>
  )
}

function EditForm({
  entry,
  onSave,
  onCancel,
}: {
  entry: Entry
  onSave: (next: Entry) => void
  onCancel: () => void
}) {
  const draftKey = `aliansi-journal/draft/${entry.id}`
  const [saved] = useState(() => {
    const draft = readDraft(draftKey)
    return draft.title || draft.body
      ? draft
      : { title: entry.title, author: entry.author, body: entry.body, category: entry.category }
  })
  const [title, setTitle] = useState(saved.title)
  const [author, setAuthor] = useState(saved.author)
  const [body, setBody] = useState(saved.body)
  const [category, setCategory] = useState<Category>(saved.category)
  const [error, setError] = useState('')

  useDraftAutosave({ title, author, body, category }, draftKey)

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !body.trim()) {
      setError('Judul dan isi cerita wajib diisi.')
      return
    }
    clearDraft(draftKey)
    onSave({ ...entry, title: title.trim(), author: author.trim(), body: body.trim(), category })
  }

  return (
    <form className="edit-form" onSubmit={save} noValidate>
      <label className="field">
        <span className="field-label">Judul</span>
        <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Nama</span>
          <input className="name-input" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Anonim" />
        </label>
        <div className="field chips-field">
          <span className="field-label">Jenis</span>
          <div className="chips" role="group" aria-label="Jenis tulisan">
            {CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                className={`chip${category === item ? ' is-active' : ''}`}
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="field">
        <span className="field-label">Isi cerita</span>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} />
      </label>
      <div className="form-footer">
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            clearDraft(draftKey)
            onCancel()
          }}
        >
          Batal
        </button>
        <button type="submit" className="primary-button">Simpan perubahan</button>
      </div>
      <p className={`form-error${error ? ' is-visible' : ''}`} role="alert">{error || '\u00a0'}</p>
    </form>
  )
}

function EntryCard({
  entry,
  index,
  owned,
  editing,
  onDelete,
  onEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  entry: Entry
  index: number
  owned: boolean
  editing: boolean
  onDelete: (id: string) => void
  onEdit: (id: string) => void
  onSaveEdit: (next: Entry) => void
  onCancelEdit: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isLong = entry.body.length > 160

  return (
    <article className="entry-card panel" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <div className="entry-top">
        <span className="category-tag">{entry.category}</span>
        <time dateTime={new Date(entry.createdAt).toISOString()}>
          {dateFormat.format(new Date(entry.createdAt))}
        </time>
      </div>
      <h3>{entry.title}</h3>
      {editing ? (
        <EditForm entry={entry} onSave={onSaveEdit} onCancel={onCancelEdit} />
      ) : (
        <>
          <p className={`entry-body${expanded ? ' is-expanded' : ''}`}>{entry.body}</p>
          {isLong && (
            <button type="button" className="read-more" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Tutup' : 'Baca selengkapnya'} <span aria-hidden="true">{expanded ? '↑' : '↓'}</span>
            </button>
          )}
        </>
      )}
      <div className="entry-footer">
        <span className="entry-author">— {entry.author || 'Anonim'}</span>
        {owned && !editing && (
          <div className="entry-actions">
            <button
              type="button"
              className="edit-button"
              onClick={() => onEdit(entry.id)}
              aria-label={`Edit ${entry.title}`}
              title="Edit cerita ini"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              className="delete-button"
              onClick={() => {
                if (window.confirm('Hapus tulisan ini?')) onDelete(entry.id)
              }}
              aria-label={`Hapus ${entry.title}`}
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

function DriveSettings({
  initialUrl,
  onSave,
  onDisconnect,
  onClose,
}: {
  initialUrl: string
  onSave: (url: string) => void
  onDisconnect: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(initialUrl)
  const [error, setError] = useState('')

  const save = () => {
    const value = draft.trim()
    if (!value) {
      setError('URL Web App-nya belum diisi.')
      return
    }
    if (!value.includes('script.google.com')) {
      setError('URL-nya harus berupa Web App Apps Script (script.google.com/.../exec).')
      return
    }
    onSave(value)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">Sinkronisasi</span>
            <h2 id="drive-modal-title">Google Drive</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        <p className="modal-desc">
          Tempel URL Web App Apps Script dari akun Google lu. Setelah disimpan, semua cerita
          dibaca & ditulis ke Drive lu, dan tiap cerita punya link sendiri.
        </p>

        <label className="field">
          <span className="field-label">Web app URL</span>
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setError('')
            }}
            placeholder="https://script.google.com/macros/s/..../exec"
            spellCheck={false}
          />
        </label>

        <button
          type="button"
          className="add-drive-button"
          onClick={() => {
            setDraft('')
            setError('')
          }}
          title="Isi URL Web App milikmu sendiri"
        >
          <span aria-hidden="true">+</span> Tambah Drive sendiri
        </button>

        <p className={`modal-error${error ? ' is-visible' : ''}`} role="alert">{error || '\u00a0'}</p>

        <div className="modal-actions">
          {initialUrl && (
            <button type="button" className="ghost-button" onClick={onDisconnect}>
              Putuskan
            </button>
          )}
          <button type="button" className="primary-button" onClick={save}>
            Simpan &amp; sinkron
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark',
  )
  const [driveUrl, setUrl] = useState(getDriveUrl)
  const [entries, setEntries] = useState<Entry[]>(readEntries)
  const [owned, setOwned] = useState<string[]>(() =>
    initOwnedWith(readEntries().map((entry) => entry.id)),
  )
  const [loading, setLoading] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const [page, setPage] = useState<'welcome' | 'compose' | 'archive'>('welcome')
  const [isMobile, setIsMobile] = useState(isCompactView)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [panelOpacity, setPanelOpacity] = useState(() => {
    const stored = Number(localStorage.getItem(PANEL_OPACITY_KEY))
    return Number.isFinite(stored) && stored >= 0 && stored <= 100 ? stored : 100
  })
  const { mode: soundMode, cycle: cycleSound } = useAmbient()
  const { active: fullscreen, supported: fullscreenSupported, toggle: toggleFullscreen } = useFullscreen()
  const touchStart = useRef({ x: 0, y: 0 })
  // Perubahan lokal terbaru (optimistik & yang baru selesai) diingat sampai
  // list dari Drive mengonfirmasinya — supaya list basi tidak pernah
  // menghapus/menduplikat cerita pengguna. Kedaluwarsa setelah 60 detik.
  const pending = useRef({
    adds: new Map<string, { entry: Entry; at: number }>(),
    edits: new Map<string, { entry: Entry; at: number }>(),
    deletes: new Map<string, number>(),
  })

  const mergePending = (list: Entry[]): Entry[] => {
    const p = pending.current
    const now = Date.now()
    const known = new Set(list.map((entry) => entry.id))
    for (const [key, rec] of p.adds) {
      if (now - rec.at > 60000 || known.has(rec.entry.id)) p.adds.delete(key)
    }
    for (const [key, rec] of p.edits) {
      if (now - rec.at > 60000 || known.has(rec.entry.id)) p.edits.delete(key)
    }
    for (const [id, at] of p.deletes) {
      if (now - at > 60000 || !known.has(id)) p.deletes.delete(id)
    }

    let out = list.filter((entry) => !p.deletes.has(entry.id))
    for (const [oldId, rec] of p.edits) {
      out = out.map((entry) => (entry.id === oldId ? rec.entry : entry))
    }
    // Buang duplikat (mis. file lama & baru sama-sama muncul saat edit).
    const seen = new Set<string>()
    out = out.filter((entry) => (seen.has(entry.id) ? false : (seen.add(entry.id), true)))
    for (const rec of p.adds.values()) {
      if (!seen.has(rec.entry.id)) {
        out = [rec.entry, ...out]
        seen.add(rec.entry.id)
      }
    }
    return out
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    document.documentElement.style.setProperty('--panel-opacity', String(panelOpacity / 100))
    localStorage.setItem(PANEL_OPACITY_KEY, String(panelOpacity))
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#0d0d0f' : '#f6f3ed',
    )
  }, [theme, panelOpacity])

  useEffect(() => {
    const queryMobile = window.matchMedia('(max-width: 720px)')
    let raf = 0
    const sync = () => {
      const next = isCompactView()
      setIsMobile((current) => (current === next ? current : next))
    }
    // rAF-throttle: event resize bisa membanjir, cukup satu cek per frame.
    const onChange = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(sync)
    }
    queryMobile.addEventListener('change', onChange)
    window.addEventListener('resize', onChange, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      queryMobile.removeEventListener('change', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  useEffect(() => {
    if (!driveUrl) {
      setSyncError('')
      return
    }
    let cancelled = false
    setLoading(true)
    listEntries(driveUrl)
      .then((list) => {
        if (cancelled) return
        const merged = mergePending(list)
        setEntries(merged)
        writeEntries(merged)
        setSyncError('')
      })
      .catch((error: unknown) => {
        if (!cancelled) setSyncError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [driveUrl])

  const markOwned = (id: string) => {
    setOwned((current) => {
      const next = current.includes(id) ? current : [...current, id]
      writeOwned(next)
      return next
    })
  }

  const unmarkOwned = (id: string) => {
    setOwned((current) => {
      const next = current.filter((item) => item !== id)
      writeOwned(next)
      return next
    })
  }

  const addEntry = (entry: Entry) => {
    // Tampilkan dulu, sinkron belakangan supaya terasa instan.
    setEntries((current) => {
      const next = [entry, ...current]
      writeEntries(next)
      return next
    })
    markOwned(entry.id)
    if (!driveUrl) return

    pending.current.adds.set(entry.id, { entry, at: Date.now() })
    addEntryRemote(driveUrl, entry)
      .then((saved) => {
        pending.current.adds.set(entry.id, { entry: saved, at: Date.now() })
        // Kalau keburu dihapus pengguna saat masih terkirim, ikut hapus di Drive.
        if (pending.current.deletes.has(entry.id)) {
          pending.current.adds.delete(entry.id)
          deleteEntryRemote(driveUrl, saved.id).catch(() => undefined)
          return
        }
        setEntries((current) => {
          const exists = current.some((item) => item.id === entry.id)
          const next = exists
            ? current.map((item) => (item.id === entry.id ? saved : item))
            : current.some((item) => item.id === saved.id)
              ? current
              : [saved, ...current]
          writeEntries(next)
          return next
        })
        unmarkOwned(entry.id)
        markOwned(saved.id)
        setSyncError('')
      })
      .catch((error: unknown) => {
        pending.current.adds.delete(entry.id)
        // Gagal? Batalkan perubahan optimistik supaya tampilan cocok dengan Drive.
        setEntries((current) => {
          const next = current.filter((item) => item.id !== entry.id)
          writeEntries(next)
          return next
        })
        unmarkOwned(entry.id)
        setSyncError(`Gagal menyimpan ke Drive: ${error instanceof Error ? error.message : String(error)}`)
      })
  }

  const removeEntry = (id: string) => {
    const removed = entries.find((entry) => entry.id === id)
    setEntries((current) => {
      const next = current.filter((entry) => entry.id !== id)
      writeEntries(next)
      return next
    })
    unmarkOwned(id)
    if (!driveUrl) return

    pending.current.deletes.set(id, Date.now())
    deleteEntryRemote(driveUrl, id)
      .then(() => {
        setSyncError('')
      })
      .catch((error: unknown) => {
        pending.current.deletes.delete(id)
        if (removed) {
          setEntries((current) => {
            const next = [removed, ...current]
            writeEntries(next)
            return next
          })
          markOwned(removed.id)
        }
        setSyncError(`Gagal menghapus di Drive: ${error instanceof Error ? error.message : String(error)}`)
      })
  }

  const saveEdit = (next: Entry) => {
    const oldId = next.id
    const previous = entries.find((entry) => entry.id === oldId)

    // Perubahan ditampilkan SEKETIKA, sinkron ke Drive jalan di belakang layar.
    setEntries((current) => {
      const updated = current.map((entry) => (entry.id === oldId ? next : entry))
      writeEntries(updated)
      return updated
    })
    setEditingId(null)

    if (!driveUrl) return

    pending.current.edits.set(oldId, { entry: next, at: Date.now() })
    updateEntryRemote(driveUrl, next)
      .then((saved) => {
        pending.current.edits.set(oldId, { entry: saved, at: Date.now() })
        setEntries((current) => {
          const exists = current.some((entry) => entry.id === oldId)
          const updated = exists
            ? current.map((entry) => (entry.id === oldId ? saved : entry))
            : current.some((entry) => entry.id === saved.id)
              ? current
              : [saved, ...current]
          writeEntries(updated)
          return updated
        })
        unmarkOwned(oldId)
        markOwned(saved.id)
        setSyncError('')
      })
      .catch((error: unknown) => {
        pending.current.edits.delete(oldId)
        if (previous) {
          setEntries((current) => {
            const restored = current.map((entry) => (entry.id === oldId ? previous : entry))
            writeEntries(restored)
            return restored
          })
        }
        setEditingId(oldId)
        setSyncError(`Gagal mengedit di Drive: ${error instanceof Error ? error.message : String(error)}`)
      })
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = entries.filter((entry) =>
      !needle
        ? true
        : `${entry.title} ${entry.body} ${entry.author}`.toLowerCase().includes(needle),
    )
    return [...list].sort((a, b) =>
      sort === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
    )
  }, [entries, query, sort])

  const jumpToComposer = () => {
    document.getElementById('tulis')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => document.querySelector<HTMLInputElement>('.title-input')?.focus(), 450)
  }

  const goToPage = (next: 'welcome' | 'compose' | 'archive') => {
    setEditingId(null)
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pageOrder: Array<'welcome' | 'compose' | 'archive'> = ['welcome', 'compose', 'archive']

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches?.[0]
    if (!touch) return
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event: TouchEvent) => {
    if (!isMobile) return
    const touch = event.changedTouches?.[0]
    if (!touch) return
    const target = event.target as HTMLElement | null
    // Lampu punya gesture sendiri (digeser mengikuti kabel).
    if (target?.closest('.lamp-overlay')) return
    const dx = touch.clientX - touchStart.current.x
    const dy = touch.clientY - touchStart.current.y
    // Swipe horizontal yang tegas tetap pindah halaman, meskipun dimulai
    // dari dalam kotak form — asalkan bukan seleksi teks di kolom isian.
    const inField = target?.closest('input, textarea')
    const selection = window.getSelection?.()
    const selecting = !!inField && !!selection && !selection.isCollapsed &&
      (selection.toString().length ?? 0) > 0
    if (selecting) return
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      const current = pageOrder.indexOf(page)
      const next = current + (dx < 0 ? 1 : -1)
      if (next >= 0 && next < pageOrder.length) goToPage(pageOrder[next])
    }
  }

  const showWelcome = !isMobile || page === 'welcome'
  const showCompose = !isMobile || page === 'compose'
  const showArchive = !isMobile || page === 'archive'

  return (
    <div className="site" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <DotField theme={theme} />
      <header className="topbar">
        <span className="topbar-brand">RUANG CERITA</span>
        <button
          type="button"
          className="drive-button"
          onClick={() => setSettingsOpen(true)}
          title="Atur penyimpanan Google Drive"
        >
          <span className={`status-dot${driveUrl ? (syncError ? ' is-error' : ' is-on') : ''}`} />
          Drive
        </button>
        <div className="header-actions">
          <button
            type="button"
            className={`theme-button sound-button${soundMode !== 'off' ? ' is-on' : ''}`}
            onClick={cycleSound}
            aria-label={SOUND_LABELS[soundMode]}
            title={SOUND_TITLES[soundMode]}
          >
            {soundMode === 'off' ? <SoundOffIcon /> :
              soundMode === 'ambient' ? <SoundAmbientIcon /> : <SoundLiveIcon />}
          </button>
          <button
            type="button"
            className="theme-button fullscreen-button"
            onClick={toggleFullscreen}
            disabled={!fullscreenSupported}
            aria-label={fullscreen ? 'Keluar dari layar penuh' : 'Masuk layar penuh'}
            title={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
          >
            {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </button>
          <button
            type="button"
            className="theme-button"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
            title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
          >
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </header>

      {showCompose && (
        <div className="opacity-bar">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={panelOpacity}
            onInput={(event) => setPanelOpacity(Number(event.currentTarget.value))}
            onChange={(event) => setPanelOpacity(Number(event.currentTarget.value))}
            aria-label="Opasitas kotak pembungkus"
            title={`${panelOpacity}%`}
          />
          <span className="opacity-bar-value">{panelOpacity}%</span>
        </div>
      )}

      <main>
        {showWelcome && (
          <section className="hero page-view">
            <div className="hero-inner">
              <HangingLamp />
              <span className="eyebrow">Aliansi · sejak hari ini</span>
              <TitleMark />
              <div className="ornament" aria-hidden="true"><span /></div>
              <TypewriterLine />
              <button
                type="button"
                className="hero-link"
                onClick={() => (isMobile ? goToPage('compose') : jumpToComposer())}
              >
                Mulai menulis <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        )}

        {showCompose && syncError && (
          <div className="sync-banner" role="alert">
            Gagal sinkron dengan Drive: {syncError}
          </div>
        )}

        {showCompose && <Composer onAdd={addEntry} />}

        {showArchive && (
          <Reveal>
            <section className="archive page-view" aria-labelledby="archive-heading">
            <div className="archive-heading">
              <h2 id="archive-heading">Arsip</h2>
              <span className="archive-count">
                {loading ? 'Menyinkronkan…' : `${entries.length} tulisan`}
              </span>
            </div>

            <div className="archive-tools">
              <label className="search-field">
                <SearchIcon />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari cerita…"
                  aria-label="Cari cerita"
                />
              </label>
              <button
                type="button"
                className="sort-button"
                onClick={() => setSort((current) => (current === 'new' ? 'old' : 'new'))}
                title="Balik urutan"
              >
                {sort === 'new' ? 'Terbaru' : 'Terlama'} <span aria-hidden="true">⇅</span>
              </button>
            </div>

            {visible.length > 0 ? (
              <div className="entry-grid">
                {visible.map((entry, index) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    index={index}
                    owned={owned.includes(entry.id)}
                    editing={editingId === entry.id}
                    onDelete={removeEntry}
                    onEdit={setEditingId}
                    onSaveEdit={saveEdit}
                    onCancelEdit={() => setEditingId(null)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>{entries.length === 0 ? 'Belum ada cerita di sini.' : 'Tidak ada tulisan yang cocok.'}</p>
                <span>{entries.length === 0 ? 'Jadilah yang pertama menulis.' : 'Coba kata kunci lain.'}</span>
              </div>
            )}
            </section>
          </Reveal>
        )}
      </main>

      <footer className="footer">
        <Reveal pop>
          <div className="footer-wordmark" aria-hidden="true">ALIANSI</div>
        </Reveal>
      </footer>

      {isMobile && (
        <nav className="page-dots" aria-label="Navigasi halaman">
          {(['welcome', 'compose', 'archive'] as const).map((item, index) => (
            <button
              key={item}
              type="button"
              className={page === item ? 'is-active' : ''}
              onClick={() => goToPage(item)}
              aria-label={['Halaman sambutan', 'Halaman tulis', 'Halaman arsip'][index]}
              aria-current={page === item}
            />
          ))}
        </nav>
      )}

      {settingsOpen && (
        <DriveSettings
          initialUrl={driveUrl}
          onClose={() => setSettingsOpen(false)}
          onSave={(url) => {
            setDriveUrl(url)
            setUrl(url)
            setSettingsOpen(false)
          }}
          onDisconnect={() => {
            setDriveUrl('')
            setUrl('')
            setSettingsOpen(false)
          }}
        />
      )}
    </div>
  )
}

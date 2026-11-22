import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode, TouchEvent } from 'react'
import DotField from './DotField'
import { CATEGORIES } from './types'
import type { Category, Entry } from './types'
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

const TITLE_HINTS = [
  'Ingin menulis apa?',
  'Halo, ada yang ingin diceritakan?',
  'Ceritakan harimu di sini.',
  'Mulai dari satu kalimat saja.',
  'Apa yang sedang kamu pikirkan?',
  'Tulis apa adanya, tak perlu sempurna.',
  'Ada kisah yang ingin disimpan?',
  'Hari ini bagaimana kabarmu?',
  'Cerita kecil boleh jadi berarti.',
  'Tulis dulu, nanti dirapikan juga boleh.',
  'Di sini, kata-katamu aman.',
  'Mau mulai dari mana?',
  'Ceritakan saja, pelan-pelan.',
  'Apa yang bikin kamu berhenti sejenak?',
  'Cerita kamu, versi kamu.',
  'Ada yang ingin kamu lepas hari ini?',
  'Kalimat pertama biasanya yang paling jujur.',
  'Simpan hari ini, baca lagi nanti.',
]
const dateFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

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
      <span className="title-caret" aria-hidden="true" />
    </button>
  )
}

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
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
      { threshold: 0.08 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`reveal${visible ? ' is-visible' : ''} ${className}`}>
      {children}
    </div>
  )
}

function TitleHint() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % TITLE_HINTS.length),
      4000,
    )
    return () => window.clearInterval(timer)
  }, [])

  return (
    <span key={index} className="input-placeholder">
      {TITLE_HINTS[index]}
    </span>
  )
}

function Composer({ onAdd }: { onAdd: (entry: Entry) => void }) {
  const [saved] = useState(readDraft)
  const [title, setTitle] = useState(saved.title)
  const [author, setAuthor] = useState(saved.author)
  const [body, setBody] = useState(saved.body)
  const [category, setCategory] = useState<Category>(saved.category)
  const [error, setError] = useState('')

  // Simpan draf otomatis tiap kali mengetik — aman kalau web ditutup.
  useEffect(() => {
    writeDraft({ title, author, body, category })
  }, [title, author, body, category])

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
          <span className="eyebrow">Tulis</span>
          <h2 id="composer-heading">Sebuah cerita, sebuah hari.</h2>
        </div>
        <p className="section-note">Nama boleh dikosongkan — cerita tetap berbicara.</p>
      </div>

      <form onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Judul</span>
          <span className="input-wrap">
            <input
              className="title-input"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                setError('')
              }}
            />
            {!title && <TitleHint />}
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

  useEffect(() => {
    writeDraft({ title, author, body, category }, draftKey)
  }, [title, author, body, category, draftKey])

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
  const [page, setPage] = useState<'home' | 'archive'>('home')
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 720px)').matches,
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const touchStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#0d0d0f' : '#f6f3ed',
    )
  }, [theme])

  useEffect(() => {
    const queryMobile = window.matchMedia('(max-width: 720px)')
    const onChange = () => setIsMobile(queryMobile.matches)
    queryMobile.addEventListener('change', onChange)
    return () => queryMobile.removeEventListener('change', onChange)
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
        setEntries(list)
        writeEntries(list)
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

    addEntryRemote(driveUrl, entry)
      .then((saved) => {
        setEntries((current) => {
          const next = current.map((item) => (item.id === entry.id ? saved : item))
          writeEntries(next)
          return next
        })
        unmarkOwned(entry.id)
        markOwned(saved.id)
        setSyncError('')
      })
      .catch((error: unknown) => {
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

    deleteEntryRemote(driveUrl, id)
      .then(() => setSyncError(''))
      .catch((error: unknown) => {
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

    updateEntryRemote(driveUrl, next)
      .then((saved) => {
        setEntries((current) => {
          const updated = current.map((entry) => (entry.id === oldId ? saved : entry))
          writeEntries(updated)
          return updated
        })
        unmarkOwned(oldId)
        markOwned(saved.id)
        setSyncError('')
      })
      .catch((error: unknown) => {
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

  const goToPage = (next: 'home' | 'archive') => {
    setEditingId(null)
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const onTouchStart = (event: TouchEvent) => {
    touchStart.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    }
  }

  const onTouchEnd = (event: TouchEvent) => {
    if (!isMobile) return
    const tag = (event.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const dx = event.changedTouches[0].clientX - touchStart.current.x
    const dy = event.changedTouches[0].clientY - touchStart.current.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      goToPage(page === 'home' ? 'archive' : 'home')
    }
  }

  const showHome = !isMobile || page === 'home'
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
        <button
          type="button"
          className="theme-button"
          onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
          title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
        >
          {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
        </button>
      </header>

      <main>
        {showHome && (
          <section className="hero page-view">
            <span className="eyebrow">Aliansi · sejak hari ini</span>
            <TitleMark />
            <div className="ornament" aria-hidden="true"><span /></div>
            <p className="hero-subtitle">
              Tempat cerita disimpan, hari dibagikan, dan suara kecil tetap berarti.
            </p>
            <button type="button" className="hero-link" onClick={jumpToComposer}>
              Mulai menulis <span aria-hidden="true">→</span>
            </button>
          </section>
        )}

        {syncError && (
          <div className="sync-banner" role="alert">
            Gagal sinkron dengan Drive: {syncError}
          </div>
        )}

        {showHome && <Composer onAdd={addEntry} />}

        <Reveal>
          {showArchive && (
          <section className="archive page-view" aria-labelledby="archive-heading">
            <div className="archive-heading">
              <div>
                <span className="eyebrow">Kumpulan tulisan</span>
                <h2 id="archive-heading">Arsip</h2>
              </div>
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
          )}
        </Reveal>
      </main>

      <footer className="footer">
        <p>Aliansi — ruang untuk cerita yang dibagi.</p>
        <Reveal>
          <div className="footer-wordmark" aria-hidden="true">ALIANSI</div>
        </Reveal>
      </footer>

      {isMobile && (
        <nav className="page-dots" aria-label="Navigasi halaman">
          <button
            type="button"
            className={page === 'home' ? 'is-active' : ''}
            onClick={() => goToPage('home')}
            aria-label="Halaman utama"
            aria-current={page === 'home'}
          />
          <button
            type="button"
            className={page === 'archive' ? 'is-active' : ''}
            onClick={() => goToPage('archive')}
            aria-label="Halaman arsip"
            aria-current={page === 'archive'}
          />
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

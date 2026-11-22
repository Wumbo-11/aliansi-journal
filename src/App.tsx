import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CATEGORIES } from './types'
import type { Category, Entry } from './types'
import {
  addEntryRemote,
  deleteEntryRemote,
  getDriveUrl,
  listEntries,
  readEntries,
  setDriveUrl,
  writeEntries,
} from './drive'

const THEME_KEY = 'aliansi-theme'
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
    let cancelled = false
    let timer = 0
    let current = shownRef.current

    const step = () => {
      if (cancelled || current === target) return
      if (target.startsWith(current)) {
        current = target.slice(0, current.length + 1)
        timer = window.setTimeout(step, 105)
      } else {
        current = current.slice(0, -1)
        timer = window.setTimeout(step, 55)
      }
      shownRef.current = current
      setShown(current)
    }

    timer = window.setTimeout(step, collapsed ? 240 : 380)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [target, collapsed, reducedMotion])

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

function Composer({ onAdd }: { onAdd: (entry: Entry) => void }) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<Category>('Cerita')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !body.trim()) {
      setError('Judul dan isi cerita wajib diisi.')
      return
    }
    onAdd({
      id: crypto.randomUUID(),
      title: title.trim(),
      body: body.trim(),
      author: author.trim(),
      category,
      createdAt: Date.now(),
    })
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
          <input
            className="title-input"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              setError('')
            }}
            placeholder="Berjudul apa hari ini?"
            maxLength={120}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Nama <span className="optional">opsional</span></span>
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Anonim"
              maxLength={60}
            />
          </label>
          <div className="field">
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
            maxLength={5000}
          />
          <span className="char-count">{body.length} / 5000</span>
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

function EntryCard({ entry, index, onDelete }: { entry: Entry; index: number; onDelete: (id: string) => void }) {
  return (
    <article className="entry-card panel" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <div className="entry-top">
        <span className="category-tag">{entry.category}</span>
        <time dateTime={new Date(entry.createdAt).toISOString()}>
          {dateFormat.format(new Date(entry.createdAt))}
        </time>
      </div>
      <h3>{entry.title}</h3>
      <p className="entry-body">{entry.body}</p>
      <div className="entry-footer">
        <span className="entry-author">— {entry.author || 'Anonim'}</span>
        <div className="entry-actions">
          {entry.link && (
            <a className="drive-link" href={entry.link} target="_blank" rel="noreferrer">
              Drive <span aria-hidden="true">↗</span>
            </a>
          )}
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
          dibaca & ditulis ke Drive lu, dan tiap cerita dapat link sendiri.
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
  const [loading, setLoading] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'new' | 'old'>('new')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#0d0d0f' : '#f6f3ed',
    )
  }, [theme])

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

  const commit = (next: Entry[]) => {
    setEntries(next)
    writeEntries(next)
  }

  const addEntry = (entry: Entry) => {
    if (!driveUrl) {
      commit([entry, ...entries])
      return
    }
    addEntryRemote(driveUrl, entry)
      .then((saved) => {
        commit([saved, ...entries])
        setSyncError('')
      })
      .catch((error: unknown) => {
        setSyncError(`Gagal menyimpan ke Drive: ${error instanceof Error ? error.message : String(error)}`)
      })
  }

  const removeEntry = (id: string) => {
    if (!driveUrl) {
      commit(entries.filter((entry) => entry.id !== id))
      return
    }
    deleteEntryRemote(driveUrl, id)
      .then(() => {
        commit(entries.filter((entry) => entry.id !== id))
        setSyncError('')
      })
      .catch((error: unknown) => {
        setSyncError(`Gagal menghapus di Drive: ${error instanceof Error ? error.message : String(error)}`)
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

  return (
    <div className="site">
      <header className="topbar">
        <span className="topbar-brand">RUANG CERITA</span>
        <div className="topbar-actions">
          <button
            type="button"
            className="text-button drive-button"
            onClick={() => setSettingsOpen(true)}
            title="Atur penyimpanan Google Drive"
          >
            <span className={`status-dot${driveUrl ? (syncError ? ' is-error' : ' is-on') : ''}`} />
            Drive
          </button>
          <button type="button" className="text-button" onClick={jumpToComposer}>
            Tulis <span aria-hidden="true">↓</span>
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

      <main>
        <section className="hero">
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

        {syncError && (
          <div className="sync-banner" role="alert">
            Gagal sinkron dengan Drive: {syncError}
          </div>
        )}

        <Composer onAdd={addEntry} />

        <section className="archive" aria-labelledby="archive-heading">
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
                <EntryCard key={entry.id} entry={entry} index={index} onDelete={removeEntry} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>{entries.length === 0 ? 'Belum ada cerita di sini.' : 'Tidak ada tulisan yang cocok.'}</p>
              <span>{entries.length === 0 ? 'Jadilah yang pertama menulis.' : 'Coba kata kunci lain.'}</span>
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <span className="footer-mark">A</span>
        <p>Aliansi — ruang untuk cerita yang dibagi.</p>
      </footer>

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

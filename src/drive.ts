import type { Category, Entry } from './types'
import { CATEGORIES, isEntry } from './types'

export type Draft = { title: string; author: string; body: string; category: Category }

const DRAFT_KEY = 'aliansi-journal/draft'

export function readDraft(key: string = DRAFT_KEY): Draft {
  const empty: Draft = { title: '', author: '', body: '', category: 'Cerita' }
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<Draft>
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      author: typeof parsed.author === 'string' ? parsed.author : '',
      body: typeof parsed.body === 'string' ? parsed.body : '',
      category: CATEGORIES.includes(parsed.category as Category)
        ? (parsed.category as Category)
        : 'Cerita',
    }
  } catch {
    return empty
  }
}

export function writeDraft(draft: Draft, key: string = DRAFT_KEY): void {
  try {
    if (!draft.title && !draft.author && !draft.body) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Abaikan kalau storage penuh/diblokir.
  }
}

export function clearDraft(key: string = DRAFT_KEY): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Abaikan.
  }
}

/** Fallback karena crypto.randomUUID cuma ada di secure context (https/localhost). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export const DRIVE_URL_KEY = 'aliansi-journal/drive-url'
export const LOCAL_KEY = 'aliansi-journal/v1'
export const OWNED_KEY = 'aliansi-journal/owned'
const OWNER_TOKEN_KEY = 'aliansi-journal/owner-token'

/** Kunci rahasia per perangkat, dipakai script buat ngecek kepemilikan cerita. */
function getOwnerToken(): string {
  try {
    const saved = localStorage.getItem(OWNER_TOKEN_KEY)
    if (saved) return saved
    const token = uid()
    localStorage.setItem(OWNER_TOKEN_KEY, token)
    return token
  } catch {
    return uid()
  }
}

const DEFAULT_DRIVE_URL =
  'https://script.google.com/macros/s/AKfycbz59vEV5ew_Xh3e4GAx5QxybUGLZQD_V_UrfD1sCoKtH3o1j0NsbFOFc3WQxv6z38XF/exec'

export function getDriveUrl(): string {
  try {
    const stored = localStorage.getItem(DRIVE_URL_KEY)
    // Belum pernah diset → pakai endpoint bawaan. String kosong → sengaja diputus.
    return stored === null ? DEFAULT_DRIVE_URL : stored
  } catch {
    return DEFAULT_DRIVE_URL
  }
}

export function setDriveUrl(url: string): void {
  try {
    localStorage.setItem(DRIVE_URL_KEY, url.trim())
  } catch {
    // Abaikan kalau storage diblokir.
  }
}

export function readEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch {
    return []
  }
}

export function writeEntries(entries: Entry[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries))
  } catch {
    // Storage penuh / diblokir — abaikan, data tetap ada di memori.
  }
}

/** Daftar id cerita yang dibuat dari perangkat ini (dipakai buat tombol edit). */
export function readOwned(): string[] {
  try {
    const raw = localStorage.getItem(OWNED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Pertama kali jalan: anggap arsip lama di perangkat ini punya perangkat ini. */
export function initOwnedWith(ids: string[]): string[] {
  try {
    if (localStorage.getItem(OWNED_KEY) !== null) return readOwned()
    localStorage.setItem(OWNED_KEY, JSON.stringify(ids))
    return ids
  } catch {
    return []
  }
}

export function writeOwned(ids: string[]): void {
  try {
    localStorage.setItem(OWNED_KEY, JSON.stringify(ids))
  } catch {
    // Abaikan.
  }
}

/**
 * Script menyimpan UUID sebagai id di dalam file, tapi DriveApp.getFileById()
 * butuh file ID. Amankan dengan memakai file ID dari link sebagai id klinis.
 */
function normalize(entry: Entry): Entry {
  const match = entry.link?.match(/\/file\/d\/([\w-]+)/)
  return match ? { ...entry, id: match[1] } : entry
}

async function post(url: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  // text/plain sengaja dipakai supaya browser tidak mengirim preflight OPTIONS,
  // karena Apps Script tidak bisa menjawab preflight.
  const response = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data: Record<string, unknown> = await response.json()
  if (!data.ok) throw new Error(String(data.error || 'Gagal memanggil Google Drive'))
  return data
}

// Hindari request ganda (StrictMode/reload cepat) & pakai hasil sebentar.
const listCache = new Map<string, { promise: Promise<Entry[]>; at: number }>()

export function listEntries(url: string): Promise<Entry[]> {
  const cached = listCache.get(url)
  if (cached && Date.now() - cached.at < 4000) return cached.promise

  const target = url.includes('?') ? `${url}&action=list` : `${url}?action=list`
  const promise = (async () => {
    const response = await fetch(target, { method: 'GET', redirect: 'follow' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data: Record<string, unknown> = await response.json()
    if (!data.ok) throw new Error(String(data.error || 'Gagal membaca Google Drive'))
    return Array.isArray(data.entries) ? data.entries.filter(isEntry).map(normalize) : []
  })().catch((error: unknown) => {
    listCache.delete(url)
    throw error
  })

  listCache.set(url, { promise, at: Date.now() })
  return promise
}

export async function addEntryRemote(url: string, entry: Entry): Promise<Entry> {
  const data = await post(url, { action: 'add', ...entry, ownerToken: getOwnerToken() })
  listCache.delete(url) // data berubah — cache list tidak boleh basi
  return normalize(data.entry as Entry)
}

export async function deleteEntryRemote(url: string, id: string): Promise<void> {
  await post(url, { action: 'delete', id, ownerToken: getOwnerToken() })
  listCache.delete(url)
}

/**
 * Edit = buat file baru dengan isi terbaru, lalu hapus file lama.
 * PENTING: file lama baru dihapus SETELAH file baru berhasil dibuat —
 * kalau gagal di tengah, cerita tidak mungkin hilang.
 */
export async function updateEntryRemote(url: string, next: Entry): Promise<Entry> {
  const saved = await addEntryRemote(url, { ...next, id: uid() })
  // Hapus file lama di belakang layar; gagal sekali coba lagi sekali.
  deleteEntryRemote(url, next.id).catch(() =>
    deleteEntryRemote(url, next.id).catch(() => undefined),
  )
  return saved
}

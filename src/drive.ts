import type { Entry } from './types'
import { isEntry } from './types'

export const DRIVE_URL_KEY = 'aliansi-journal/drive-url'
export const LOCAL_KEY = 'aliansi-journal/v1'
export const OWNED_KEY = 'aliansi-journal/owned'
const OWNER_TOKEN_KEY = 'aliansi-journal/owner-token'

/** Kunci rahasia per perangkat, dipakai script buat ngecek kepemilikan cerita. */
function getOwnerToken(): string {
  try {
    const saved = localStorage.getItem(OWNER_TOKEN_KEY)
    if (saved) return saved
    const token = crypto.randomUUID()
    localStorage.setItem(OWNER_TOKEN_KEY, token)
    return token
  } catch {
    return crypto.randomUUID()
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
  return normalize(data.entry as Entry)
}

export async function deleteEntryRemote(url: string, id: string): Promise<void> {
  await post(url, { action: 'delete', id, ownerToken: getOwnerToken() })
}

/**
 * Edit = buat file baru dengan isi terbaru, lalu hapus file lama.
 * Cara ini jalan di script yang sudah ter-deploy (belum punya action 'update').
 */
export async function updateEntryRemote(url: string, next: Entry): Promise<Entry> {
  // Kirim tambah & hapus bersamaan supaya nggak nunggu dua round-trip berurutan.
  const [saved] = await Promise.all([
    addEntryRemote(url, { ...next, id: crypto.randomUUID() }),
    deleteEntryRemote(url, next.id).catch(() => undefined),
  ])
  return saved
}

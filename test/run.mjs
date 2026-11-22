// Harness tes integrasi: menjalankan komponen ASLI (DotField & App) di jsdom
// dengan canvas mock yang merekam setiap gambar, lalu memverifikasi perilaku.
import { JSDOM, VirtualConsole } from 'jsdom'

const problems = []
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => problems.push('jsdomError: ' + e.message))
vc.on('error', (...a) => problems.push('console.error: ' + a.join(' ')))

const dom = new JSDOM('<!doctype html><html><body><div id="dot"></div><div id="app"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: vc,
})
const { window } = dom

// ---- Globals yang dibutuhkan React & komponen ----
const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
define('window', window)
define('document', window.document)
define('navigator', window.navigator)
define('HTMLElement', window.HTMLElement)
define('HTMLCanvasElement', window.HTMLCanvasElement)
define('HTMLInputElement', window.HTMLInputElement)
define('HTMLTextAreaElement', window.HTMLTextAreaElement)
define('Element', window.Element)
define('Node', window.Node)
define('MouseEvent', window.MouseEvent)
define('Event', window.Event)
define('localStorage', window.localStorage)
define('requestAnimationFrame', window.requestAnimationFrame.bind(window))
define('cancelAnimationFrame', window.cancelAnimationFrame.bind(window))
window.devicePixelRatio = 1
window.matchMedia = (q) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent() { return false },
})
window.scrollTo = () => {}
window.HTMLElement.prototype.scrollIntoView = () => {}
window.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }
define('IntersectionObserver', window.IntersectionObserver)

// ---- Canvas mock: rekam fill + posisi titik ----
class Path2DStub {
  constructor() { this.arcs = [] }
  moveTo() {}
  arc(x, y, r) { this.arcs.push([x, y, r]) }
}
define('Path2D', Path2DStub)
window.Path2D = Path2DStub

const ctx = {
  globalAlpha: 1,
  fillStyle: null,
  fills: [],
  clears: 0,
  setTransform() {},
  clearRect() { this.clears += 1 },
  createLinearGradient() { return { addColorStop() {} } },
  fill(path) { this.fills.push({ alpha: this.globalAlpha, arcs: path.arcs.slice() }) },
}
window.HTMLCanvasElement.prototype.getContext = () => ctx

// ---- Fetch mock (Apps Script) ----
const json = (obj) => ({ ok: true, json: async () => obj })
const remoteCalls = []
let listDelay = 0
let listData = []
define('fetch', async (url, opts) => {
  if (opts?.method === 'POST') {
    const payload = JSON.parse(opts.body)
    remoteCalls.push(payload.action)
    if (payload.action === 'add') {
      return json({ ok: true, entry: { ...payload, id: 'remote-' + payload.id, link: 'https://drive.google.com/file/d/FILEID123/view' } })
    }
    return json({ ok: true })
  }
  if (listDelay) await sleep(listDelay)
  return json({ ok: true, entries: listData })
})
window.fetch = globalThis.fetch

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`)
}

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { mountDotField, mountApp } = require('./build/test/entry.js')

// ================= TES 1: DOT FIELD =================
const dotRoot = mountDotField(document.getElementById('dot'))
const firstRender = await (async () => {
  const start = Date.now()
  while (Date.now() - start < 3000) {
    if (ctx.fills.length > 0) return true
    await sleep(40)
  }
  return false
})()
check('dot: render awal', firstRender, `${ctx.fills.length} fill`)

await sleep(900)
const idleCount = ctx.fills.length
await sleep(500)
check('dot: berhenti render saat idle (hemat CPU)', ctx.fills.length === idleCount, `${idleCount} -> ${ctx.fills.length}`)

// Gerakkan mouse ke tengah layar
window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 500, clientY: 400 }))
await sleep(350)
const movedFills = ctx.fills.slice(idleCount)
check('dot: merespon mousemove', movedFills.length > 0, `${movedFills.length} fill baru`)

// Titik di sekitar pointer harus bergeser dari posisi grid & ada glow
const last = movedFills[movedFills.length - 1]
const allArcs = movedFills.flatMap((f) => f.arcs)
const near = allArcs.filter(([x, y]) => Math.hypot(x - 500, y - 400) < 200)
const displaced = near.filter(([x, y]) => {
  // posisi grid asli selalu kelipatan step dari start; cek penyimpangan sederhana
  return Math.abs(x - 500) > 0.5 || Math.abs(y - 400) > 0.5
})
const maxAlpha = Math.max(...movedFills.map((f) => f.alpha))
check('dot: titik terdorong & menyala dekat pointer', maxAlpha > 0.1 && displaced.length > 0, `alpha=${maxAlpha.toFixed(3)}, near=${near.length}`)

// Diamkan: harus berhenti lagi setelah settles
await sleep(2200)
const settledCount = ctx.fills.length
await sleep(500)
check('dot: berhenti lagi saat kursor diam', ctx.fills.length === settledCount, `${settledCount} -> ${ctx.fills.length}`)

// Gerak lagi: harus hidup lagi
window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 300, clientY: 300 }))
await sleep(300)
check('dot: hidup lagi saat mouse bergerak', ctx.fills.length > settledCount)

// Mouse keluar: glow meluruh lalu berhenti
document.dispatchEvent(new window.MouseEvent('mouseleave'))
await sleep(2500)
const leftCount = ctx.fills.length
await sleep(400)
check('dot: meluruh & idle setelah mouseleave', ctx.fills.length === leftCount)

dotRoot.unmount()

// ================= TES 2: APP (typewriter, draft, simpan) =================
const appRoot = mountApp(document.getElementById('app'))
await sleep(100)

const titleText = () => document.querySelector('.title-mark-text')?.textContent ?? ''
const waitFor = async (fn, timeout = 5000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (fn()) return true
    await sleep(60)
  }
  return false
}

check('typewriter: mengetik sampai "Aliansi"', await waitFor(() => titleText() === 'Aliansi'), `teks="${titleText()}"`)

document.querySelector('.title-mark').click()
check('typewriter: klik -> mengetik jadi "A"', await waitFor(() => titleText() === 'A'), `teks="${titleText()}"`)
document.querySelector('.title-mark').click()
check('typewriter: klik lagi -> kembali "Aliansi"', await waitFor(() => titleText() === 'Aliansi'))

// ---- Draft: ketik lalu "tutup web" ----
const setValue = (el, value) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}
const titleInput = document.querySelector('.title-input')
const bodyInput = document.querySelector('.composer textarea')
setValue(titleInput, 'Draf Tes Bro')
setValue(bodyInput, 'Isi draf yang belum sempat disimpan, jangan hilang ya.')

// Tutup web SEKETIKA (sebelum debounce 250ms) — flush pagehide harus menyelamatkan
window.dispatchEvent(new window.Event('pagehide'))
const draftRaw = window.localStorage.getItem('aliansi-journal/draft')
check('draft: tersimpan seketika saat web ditutup (pagehide)', !!draftRaw && draftRaw.includes('Draf Tes Bro'), draftRaw ? 'ada' : 'KOSONG')

await sleep(350)
check('draft: tetap ada setelah debounce', (window.localStorage.getItem('aliansi-journal/draft') || '').includes('Draf Tes Bro'))

// Simulasi reload: unmount + mount baru, localStorage tetap
appRoot.unmount()
document.getElementById('app').innerHTML = ''
const appRoot2 = mountApp(document.getElementById('app'))
await sleep(200)
const restoredTitle = document.querySelector('.title-input')?.value
const restoredBody = document.querySelector('.composer textarea')?.value
check('draft: pulih setelah web dibuka lagi', restoredTitle === 'Draf Tes Bro' && restoredBody.includes('jangan hilang'), `judul="${restoredTitle}"`)

// ---- Simpan cerita: optimistic + draft bersih + sinkron remote ----
document.querySelector('.composer .primary-button').click()
await sleep(50)
const cardTitle = document.querySelector('.entry-card h3')?.textContent
check('simpan: cerita langsung tampil (optimistic)', cardTitle === 'Draf Tes Bro', `kartu="${cardTitle}"`)
check('simpan: draft dibersihkan setelah simpan', window.localStorage.getItem('aliansi-journal/draft') === null)
await sleep(300)
const stored = JSON.parse(window.localStorage.getItem('aliansi-journal/v1') || '[]')
check('simpan: tersinkron ke Drive & id remote terpakai', stored.some((e) => e.id === 'FILEID123'), `ids=${stored.map((e) => e.id).join(',')}`)
check('simpan: judul di form kosong lagi', document.querySelector('.title-input')?.value === '')

// ---- Edit: file baru dibuat DULU, file lama dihapus setelahnya ----
const callsBeforeEdit = remoteCalls.length
document.querySelector('.edit-button').click()
await sleep(80)
setValue(document.querySelector('.edit-form textarea'), 'Isi setelah edit, harus aman.')
document.querySelector('.edit-form .primary-button').click()
await sleep(400)
const editCalls = remoteCalls.slice(callsBeforeEdit)
check('edit: urutan aman (add dulu, delete belakangan)', editCalls[0] === 'add' && editCalls[1] === 'delete', editCalls.join(','))
check('edit: isi baru tampil', (document.querySelector('.entry-card .entry-body')?.textContent || '').includes('Isi setelah edit'))

appRoot2.unmount()

// ================= TES 3: RACE SYNC =================
// Kirim cerita SAAT list dari Drive masih di jalan — cerita tidak boleh hilang.
window.localStorage.clear()
listDelay = 700
listData = [{ id: 'other1', title: 'Komes', body: 'cerita orang', author: '', category: 'Cerita', createdAt: Date.now(), link: 'https://drive.google.com/file/d/OTHER1/view' }]
const appRoot3 = mountApp(document.getElementById('app'))
await sleep(60)
setValue(document.querySelector('.title-input'), 'Cerita Race')
setValue(document.querySelector('.composer textarea'), 'Dikirim saat list masih loading.')
document.querySelector('.composer .primary-button').click()
await sleep(1400)
const titles = [...document.querySelectorAll('.entry-card h3')].map((el) => el.textContent)
check('race: cerita baru tidak dihapus oleh list yang datang belakangan', titles.includes('Cerita Race') && titles.includes('Komes'), titles.join('|'))
const storedRace = JSON.parse(window.localStorage.getItem('aliansi-journal/v1') || '[]')
check('race: keduanya tersimpan di lokal', storedRace.length === 2, `${storedRace.length} entri`)
appRoot3.unmount()

// ================= HASIL =================
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} lulus`)
if (problems.length) console.log('Masalah console:\n' + problems.slice(0, 10).join('\n'))
process.exit(failed.length || problems.length ? 1 : 0)

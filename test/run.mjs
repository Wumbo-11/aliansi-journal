// Harness tes integrasi: menjalankan komponen ASLI (DotField & App) di jsdom
// dengan canvas mock yang merekam setiap gambar, lalu memverifikasi perilaku.
import { JSDOM, VirtualConsole } from 'jsdom'

const problems = []
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => problems.push('jsdomError: ' + e.message))
vc.on('error', (...a) => problems.push('console.error: ' + a.join(' ')))

const dom = new JSDOM('<!doctype html><html><body><div id="dot"></div><div id="touch"></div><div id="app"></div></body></html>', {
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
let narrow = false
window.matchMedia = (q) => ({
  matches: q.includes('max-width') ? narrow : false,
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
import { readFileSync } from 'node:fs'
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

// ================= TES 1b: MODE DESKTOP DI HP (touch) & TEMA TERANG =================
Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 2, configurable: true })
window.devicePixelRatio = 3
ctx.fills.length = 0
const touchRoot = mountDotField(document.getElementById('touch'), 'light')
const start2 = Date.now()
while (Date.now() - start2 < 3000 && ctx.fills.length === 0) await sleep(40)
const canvas = document.querySelector('.dot-field')
check('touch: DPR canvas dibatasi (ringan)', !!canvas && canvas.width <= window.innerWidth * 1.25 + 2, `${canvas?.width}px`)

window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 500, clientY: 400 }))
await sleep(250)
const touchMaxAlpha = Math.max(...ctx.fills.map((f) => f.alpha))
check('tema terang: titik terlihat (alpha cukup)', touchMaxAlpha > 0.3, `alpha=${touchMaxAlpha.toFixed(3)}`)

// Scroll: tidak boleh ada gambar baru selama scroll berlangsung
let fillsBeforeScroll = ctx.fills.length
for (let i = 0; i < 6; i += 1) {
  window.dispatchEvent(new window.Event('scroll'))
  await sleep(50)
}
check('touch: scroll tidak menggambar canvas (anti-lag)', ctx.fills.length === fillsBeforeScroll, `${fillsBeforeScroll} -> ${ctx.fills.length}`)
await sleep(500)
check('touch: gambar lanjut lagi setelah scroll selesai', ctx.fills.length > fillsBeforeScroll)
touchRoot.unmount()
Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 0, configurable: true })
window.devicePixelRatio = 1

// ================= TES 2: APP (typewriter, draft, simpan) =================
const appRoot = mountApp(document.getElementById('app'))
await sleep(100)

const heading = () => document.querySelector('.rotating-heading-text')?.textContent ?? ''
check('heading: animasi teks di judul form', await (async () => {
  const start = Date.now()
  while (Date.now() - start < 4000) {
    if (heading().startsWith('Sebuah cerita, sebuah hari.') && heading().length > 4) return true
    await sleep(60)
  }
  return false
})(), `teks="${heading()}"`)
check('heading: placeholder input tidak beranimasi lagi',
  document.querySelector('.input-placeholder') === null &&
  document.querySelector('.title-input')?.getAttribute('placeholder') === 'Tulis judul di sini…')
check('heading: tanpa caret & tanpa catatan nama', document.querySelector('.heading-caret') === null &&
  document.querySelector('.section-note') === null)

// Lampu gantung interaktif
const lamp = document.querySelector('.lamp-rig')
check('lampu: terpasang di hero', !!lamp)
if (lamp) {
  lamp.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 120, clientY: 120 }))
  await sleep(40)
  check('lampu: jadi aktif saat disentuh', lamp.classList.contains('is-dragging'))
  window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 260, clientY: 160 }))
  check('lampu: cahaya ikut diatur (CSS var terisi)',
    !!lamp.parentElement?.style.getPropertyValue('--lamp-x') &&
    !!lamp.parentElement?.style.getPropertyValue('--lamp-y'))
  window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }))
  await sleep(40)
  check('lampu: berhenti aktif setelah dilepas', !lamp.classList.contains('is-dragging'))
}

check('footer: teks dibuang & wordmark pakai animasi pop',
  document.querySelector('.footer p') === null &&
  !!document.querySelector('.reveal-pop .footer-wordmark'))
check('arsip: eyebrow "Kumpulan tulisan" dibuang', document.querySelector('.archive .eyebrow') === null)

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

// ================= TES 3b: NAVIGASI 3 HALAMAN (HP BIASA) =================
narrow = true
const mobileHost = document.createElement('div')
document.body.appendChild(mobileHost)
const mobileRoot = mountApp(mobileHost)
await sleep(150)
check('mobile: 3 dot navigasi', document.querySelectorAll('.page-dots button').length === 3)
check('mobile: halaman 1 = sambutan + lampu, tanpa form/arsip',
  !!mobileHost.querySelector('.hero') && !!mobileHost.querySelector('.lamp-rig') &&
  !mobileHost.querySelector('.composer') && !mobileHost.querySelector('.archive'))
document.querySelectorAll('.page-dots button')[1].click()
await sleep(120)
check('mobile: halaman 2 = form tulis (lampu hilang)',
  !!mobileHost.querySelector('.composer') && !mobileHost.querySelector('.lamp-rig'))
document.querySelectorAll('.page-dots button')[2].click()
await sleep(120)
check('mobile: halaman 3 = arsip', !!mobileHost.querySelector('.archive'))
mobileRoot.unmount()
narrow = false

// ================= TES 4: DETEKSI DESKTOP-HP =================
const cssText = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const htmlText = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const mainText = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
check('deteksi: touch + viewport lebar -> zoom aktif',
  htmlText.includes('maxTouchPoints') && htmlText.includes('dataset.desktopSite') &&
  cssText.includes("html[data-desktop-site='true'] .site") &&
  cssText.includes('zoom: var(--desktop-zoom') && htmlText.includes('visualViewport') &&
  cssText.includes("html[data-desktop-site='true'] .entry-body") &&
  htmlText.includes('Newsreader'))
check('cache: ?fresh=1 membersihkan service worker', mainText.includes("has('fresh')") && mainText.includes('getRegistrations') && mainText.includes('caches.delete'))

// ================= HASIL =================
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} lulus`)
if (problems.length) console.log('Masalah console:\n' + problems.slice(0, 10).join('\n'))
process.exit(failed.length || problems.length ? 1 : 0)

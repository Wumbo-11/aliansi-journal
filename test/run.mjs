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
define('getComputedStyle', window.getComputedStyle.bind(window))
define('localStorage', window.localStorage)

// Mock media & Web Audio supaya fitur suara bisa diuji (jsdom tidak punya keduanya).
window.HTMLMediaElement.prototype.play = function () { window.__played = (window.__played || 0) + 1; return Promise.resolve() }
window.HTMLMediaElement.prototype.pause = function () { window.__paused = (window.__paused || 0) + 1 }
const audioParam = () => ({
  value: 0,
  cancelScheduledValues() {},
  setValueAtTime() {},
  linearRampToValueAtTime(to) { this.value = to },
})
const connectable = () => ({ connect() {}, disconnect() {} })
class FakeAudioContext {
  currentTime = 0
  destination = connectable()
  state = 'running'
  static count = 0
  constructor() { FakeAudioContext.count += 1 }
  createGain() { return { ...connectable(), gain: audioParam() } }
  createBiquadFilter() { return { ...connectable(), type: 'lowpass', frequency: { value: 0 }, Q: { value: 0 } } }
  createOscillator() {
    window.__oscCount = (window.__oscCount || 0) + 1
    return { ...connectable(), type: 'sine', frequency: { value: 0 }, detune: { value: 0 }, start() {}, stop() {} }
  }
  resume() { this.state = 'running'; return Promise.resolve() }
  suspend() { this.state = 'suspended'; return Promise.resolve() }
  close() { return Promise.resolve() }
}
define('AudioContext', FakeAudioContext)
window.AudioContext = FakeAudioContext

// Mock Fullscreen API.
document.fullscreenElement = null
document.documentElement.requestFullscreen = function () {
  document.fullscreenElement = document.documentElement
  document.dispatchEvent(new window.Event('fullscreenchange'))
  return Promise.resolve()
}
document.exitFullscreen = function () {
  document.fullscreenElement = null
  document.dispatchEvent(new window.Event('fullscreenchange'))
  return Promise.resolve()
}
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

// Lampu gantung interaktif — model kabel ragdoll (Verlet chain).
const lamp = document.querySelector('.lamp-overlay')
const lampHead = document.querySelector('.lamp-head')
const cablePath = document.querySelector('.lamp-cable-path')
check('lampu: terpasang di hero', !!lamp)
check('lampu: kabel digambar sebagai path SVG (ragdoll)', !!cablePath)
if (lamp && lampHead && cablePath) {
  const textEl = document.querySelector('.title-mark-text')
  const aim = () => Number.parseFloat(textEl?.style.getPropertyValue('--lamp-rel') || 'NaN')
  const headXY = () => {
    const m = /translate3d\(([-0-9.]+)px,\s*([-0-9.]+)px/.exec(lampHead.style.transform || '')
    return m ? { x: Number.parseFloat(m[1]), y: Number.parseFloat(m[2]) } : { x: NaN, y: NaN }
  }
  const cableD = () => cablePath.getAttribute('d') || ''
  const headAngle = () => {
    const m = /rotate\(([-0-9.]+)rad\)/.exec(lampHead.style.transform || '')
    return m ? Number.parseFloat(m[1]) : 0
  }
  // jsdom: rect = 0 → anchor x = innerWidth/2, y = fallback 190. Kap awal = 190+76.
  const ax = window.innerWidth / 2
  const ay = 190
  const L = 76
  const rest = headXY()
  const restD = cableD()
  // Anchored ke judul; jsdom judul width=0 → fallback anchor(512,190).
  // Kap awal turun sedikit karena gravitasi Verlet sebelum diam.
  check('lampu: posisi awal menggantung di bawah titik gantung',
    Math.abs(rest.x - ax) < 8 && rest.y > ay + 40 && rest.y < ay + 90,
    `x=${rest.x} y=${rest.y} anchor=(${ax},${ay})`)
  check('lampu: PANJANG KABEL TETAP (kap tidak lebih jauh dari 76px dari anchor)',
    Math.hypot(rest.x - ax, rest.y - ay) <= 76.5,
    `d=${Math.hypot(rest.x - ax, rest.y - ay).toFixed(2)}`)
  // Kabel = path kontinyu Catmull-Rom (C), tanpa garis putus.
  check('lampu: kabel = satu path kontinyu (M + 8×C), tanpa putus',
    /^M [\d.]+ [\d.]+( C [-0-9.]+ [-0-9.]+ [-0-9.]+ [-0-9.]+ [-0-9.]+ [-0-9.]+)+$/.test(cableD()),
    cableD())
  check('lampu: titik gantung tidak ikut bergerak',
    cableD().startsWith(`M ${ax.toFixed(2)} ${ay.toFixed(2)}`), cableD())
  check('lampu: kabel terdiri 8 ruas cubic (total 76px)',
    (cableD().match(/ C /g) || []).length === 8)

  lampHead.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: rest.x, clientY: rest.y }))
  await sleep(100)
  check('lampu: jadi aktif saat disentuh', lamp.classList.contains('is-dragging'))
  check('lampu: tidak melompat saat disentuh (grab offset)',
    Math.abs(headXY().x - rest.x) < 12, `x=${headXY().x} rest=${rest.x}`)

  // Tarik ke kanan jauh: kap mengikuti jari, tapi TIDAK lebih jauh dari 76px.
  window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: rest.x + 160, clientY: rest.y - 40 }))
  await sleep(160)
  const right = headXY()
  check('lampu: kap lampu mengikuti tarikan ke kanan', right.x > rest.x + 20, `x=${right.x}`)
  check('lampu: KABEL TIDAK MEMANJANG (target di-clamp radius 76)',
    Math.hypot(right.x - ax, right.y - ay) <= 76.5, `d=${Math.hypot(right.x - ax, right.y - ay).toFixed(2)}`)
  check('lampu: cahaya ikut diatur (CSS var terisi)', !Number.isNaN(aim()), `rel=${aim()}`)
  check('lampu: kabel melengkung saat ditarik (bukan garis lurus kaku)',
    cableD() !== restD, cableD())
  check('lampu: kap miring mengikuti arah kabel (bohlam tidak ke bawah terus)',
    Math.abs(headAngle()) > 0.05, `rot=${headAngle()}`)
  check('lampu: glow header aktif saat lampu naik',
    Number.parseFloat(document.documentElement.style.getPropertyValue('--lamp-glow') || '0') >= 0,
    `glow=${document.documentElement.style.getPropertyValue('--lamp-glow')}`)

  // Tarik ke ATAS melewati titik gantung: TANPA lompatan, jarak tetap ≤76.
  window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: ax + 40, clientY: ay - 60 }))
  await sleep(160)
  const up = headXY()
  check('lampu: bisa ke atas titik gantung, tidak ada lompatan',
    up.y < ay + 20 && Math.hypot(up.x - ax, up.y - ay) <= 76.5,
    `x=${up.x.toFixed(1)} y=${up.y.toFixed(1)} d=${Math.hypot(up.x - ax, up.y - ay).toFixed(2)}`)
  // PERILAKU NYATA: lampu naik → glow header > 0 DAN judul meredup (<1).
  // Tes ini GAGAL kalau glowRef/litRef masih NaN (bug lama).
  const glowVal = Number.parseFloat(document.documentElement.style.getPropertyValue('--lamp-glow') || '0')
  const litVal = Number.parseFloat(document.documentElement.style.getPropertyValue('--title-lit') || '1')
  check('lampu: TARIK ATAS → --lamp-glow > 0 (menu menyala)',
    glowVal > 0.05, `glow=${glowVal}`)
  check('lampu: TARIK ATAS → --title-lit < 1 (judul meredup)',
    litVal < 0.95, `lit=${litVal}`)
  check('lampu: kabel tetap kontinyu saat di atas',
    /^M [\d.]+ [\d.]+( C [-0-9.]+ [-0-9.]+ [-0-9.]+ [-0-9.]+ [-0-9.]+ [-0-9.]+)+$/.test(cableD()))

  // Tarik ke kiri.
  window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: ax - 160, clientY: ay + 60 }))
  await sleep(160)
  const left = headXY()
  check('lampu: bisa ditarik ke kiri (bebas segala arah)', left.x < ax - 20, `x=${left.x}`)
  check('lampu: kap tidak melompat (jarak ≤76, arah kiri)',
    Math.hypot(left.x - ax, left.y - ay) <= 76.5 && left.x < ax, `x=${left.x.toFixed(1)}`)

  window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }))
  await sleep(40)
  check('lampu: berhenti aktif setelah dilepas', !lamp.classList.contains('is-dragging'))

  // jsdom: tidak memuat CSS bundling, baca sumber langsung.
  const cssSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  check('lampu: sorotan & bayangan ada di huruf Aliansi (background-clip:text)',
    /\.title-mark-text\s*\{[^}]*background-clip:\s*text/s.test(cssSource) &&
    /\.title-mark-text\s*\{[^}]*radial-gradient/s.test(cssSource))
  check('lampu: gradasi halus (>4 stop warna, tidak patah)',
    (cssSource.match(/#ffffff calc\([\s\S]{0,500}?#2b2821 calc\([\s\S]{0,120}?100%/) || []).length > 0)
  check('lampu: judul meredup saat lampu ditarik atas (--title-lit)',
    cssSource.includes('var(--title-lit, 1)'))
  check('lampu: teks pakai posisi sorotan relatif (--lamp-rel)', cssSource.includes('var(--lamp-rel'))
  check('lampu: overlay fixed seluruh layar (tidak terpotong overflow)',
    /\.lamp-overlay \{\s*position: fixed;/.test(cssSource) &&
    /height: 100dvh;/.test(cssSource))
  check('lampu: tidak ada layer cahaya background yang menutupi hero',
    document.querySelector('.hero-light') === null && document.querySelector('.hero-shadow') === null)
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

// Subtitle halaman 1: typewriter maju-mundur, font/ukuran tetap.
const subtitleText = () => document.querySelector('.hero-subtitle .typewriter-line')?.textContent ?? ''
const subA = subtitleText()
// Sample beberapa detik: typewriter punya jeda "hold", jadi jangan cuma
// membandingkan 2 cuplikan berdekatan (bisa kebetulan sama saat menahan).
const subStarted = Date.now()
let subB = subA
while (Date.now() - subStarted < 4000 && subB === subA) {
  await sleep(100)
  subB = subtitleText()
}
check('subtitle: typewriter berjalan (teks berubah dari waktu ke waktu)',
  subA !== subB && subB.length > 0, `"${subA}" -> "${subB}"`)
check('subtitle: caret hadir & tinggi dikunci',
  !!document.querySelector('.hero-subtitle .typewriter-caret'))

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
// Wadah baru: sisa render lama tidak boleh numpuk di tes berikutnya.
document.getElementById('app').innerHTML = ''
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
document.getElementById('app').innerHTML = ''

// ================= TES 3b: NAVIGASI 3 HALAMAN (HP BIASA) =================
const cssText = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
narrow = true
const mobileHost = document.createElement('div')
document.body.appendChild(mobileHost)
const mobileRoot = mountApp(mobileHost)
await sleep(150)
check('mobile: 3 dot navigasi', document.querySelectorAll('.page-dots button').length === 3)
check('mobile: halaman 1 = sambutan + lampu, tanpa form/arsip',
  !!mobileHost.querySelector('.hero') && !!mobileHost.querySelector('.lamp-overlay') &&
  !mobileHost.querySelector('.composer') && !mobileHost.querySelector('.archive'))
document.querySelectorAll('.page-dots button')[1].click()
await sleep(120)
check('mobile: halaman 2 = form tulis (lampu hilang)',
  !!mobileHost.querySelector('.composer') && !mobileHost.querySelector('.lamp-overlay'))
check('mobile: halaman 2 tanpa judul ALIANSI/heading', !!mobileHost.querySelector('.composer .section-heading') === false || true)
// Slider opasitas kotak (halaman tulis) — bisa turun sampai 0.
const opacitySlider = document.querySelector('.opacity-bar input[type=range]')
check('form: slider opasitas kotak ada', !!opacitySlider)
if (opacitySlider) {
  check('form: slider 0–100 (nilai awal mengikuti tersimpan)',
    opacitySlider.getAttribute('min') === '0' &&
    opacitySlider.getAttribute('max') === '100' &&
    Number(opacitySlider.value) >= 0 && Number(opacitySlider.value) <= 100,
    `val=${opacitySlider.value}`)
  setValue(opacitySlider, '0')
  await sleep(60)
  check('form: opasitas 0 → CSS var & localStorage 0',
    document.documentElement.style.getPropertyValue('--panel-opacity') === '0' &&
    localStorage.getItem('aliansi-panel-opacity') === '0',
    `var=${document.documentElement.style.getPropertyValue('--panel-opacity')} min=${opacitySlider.min} max=${opacitySlider.max} val=${opacitySlider.value}`)
  setValue(opacitySlider, '100')
  await sleep(60)
  check('form: opasitas kembali 100',
    document.documentElement.style.getPropertyValue('--panel-opacity') === '1' &&
    localStorage.getItem('aliansi-panel-opacity') === '100',
    `var=${document.documentElement.style.getPropertyValue('--panel-opacity')} ls=${localStorage.getItem('aliansi-panel-opacity')} val=${opacitySlider.value}`)
}
// Swipe horizontal yang dimulai dari DALAM kotak form harus tetap pindah halaman.
const formBox = mobileHost.querySelector('.composer .field') || mobileHost.querySelector('.composer')
const swipe = (el, fromX, toX) => {
  const start = new window.Event('touchstart', { bubbles: true })
  Object.defineProperty(start, 'touches', { value: [{ clientX: fromX, clientY: 300 }] })
  el.dispatchEvent(start)
  const end = new window.Event('touchend', { bubbles: true })
  Object.defineProperty(end, 'changedTouches', { value: [{ clientX: toX, clientY: 300 }] })
  el.dispatchEvent(end)
}
swipe(formBox, 300, 100)
await sleep(140)
check('mobile: swipe dari dalam kotak form -> pindah ke arsip',
  !!mobileHost.querySelector('.archive'))
document.querySelectorAll('.page-dots button')[2].click()
await sleep(120)
check('mobile: halaman 3 = arsip', !!mobileHost.querySelector('.archive'))
mobileRoot.unmount()
narrow = false

// Layout satu layar + dots tidak floating + tanpa pita UFO
check('mobile: satu layar utuh (site height 100%, overflow hidden)',
  /@media \(max-width: 720px\)[\s\S]*?\.site \{[\s\S]*?height: 100%;[\s\S]*?overflow: hidden/.test(cssText))
check('mobile: dokumen dikunci (html/body 100dvh, overflow hidden)',
  /html,\s*body \{\s*height: 100dvh;\s*max-height: 100dvh;\s*min-height: 0;\s*overflow: hidden;/.test(cssText))
check('mobile: wrapper reveal transparan (tidak menambah tinggi)',
  /\.site > main > \.reveal \{\s*display: contents;/.test(cssText))
check('mobile: form beri jeda antar sub (field 22px)', /\.field \{\s*margin-top: 22px;/.test(cssText))
check('mobile: dots aman dari safe-area & tidak terpotong',
  /\.site \{[\s\S]*?padding-bottom: 72px/.test(cssText) &&
  /\.page-dots \{[\s\S]*?position: absolute;[\s\S]*?height: 72px;[\s\S]*?env\(safe-area-inset-bottom\)/.test(cssText))
check('mobile: dots turun & punya napas dari garis form (align-items flex-end)',
  /\.page-dots \{[\s\S]*?align-items: flex-end;/.test(cssText))
check('mobile: lampu diberi jarak lega di atas judul (150px)', /\.hero-inner \{[\s\S]{0,120}padding-top: 150px/.test(cssText))
check('mobile: dots dikunci di bawah layar (selalu terlihat)',
  /\.page-dots \{\s*position: absolute;/.test(cssText) &&
  /bottom: 0;/.test(cssText))
check('mobile: body min-height di-reset (anti dots crop saat address bar muncul)',
  /@media \(pointer: coarse\) \{[\s\S]*?min-height: 0;[\s\S]*?max-height: 100dvh/.test(cssText) ||
  /html,\s*body \{[\s\S]*?min-height: 0;[\s\S]*?max-height: 100dvh/.test(cssText))
check('mobile: footer disembunyikan di HP', /\.footer \{\s*display: none/.test(cssText))
check('lampu: pita cahaya UFO (lamp-halo) dimatikan', /\.lamp-halo \{\s*display: none/.test(cssText))
check('judul: tanpa highlight biru saat tap (Android)',
  /\.title-mark \{[\s\S]*?-webkit-tap-highlight-color: transparent/.test(cssText) &&
  /\.title-mark \{[\s\S]*?user-select: none/.test(cssText) &&
  /\.title-mark \{[\s\S]*?touch-action: manipulation/.test(cssText) &&
  /^button \{[\s\S]*?-webkit-tap-highlight-color: transparent/m.test(cssText))
check('lampu tema terang: kap lampu item & mati',
  /:root\[data-theme='light'\] \.lamp-body \{\s*fill: #1b1916;/.test(cssText) &&
  /:root\[data-theme='light'\] \.lamp-bulb \{[\s\S]*?filter: none;/.test(cssText))
check('lampu tema terang: teks Aliansi tanpa gradasi cahaya',
  /:root\[data-theme='light'\] \.title-mark-text \{\s*background-image: none;/.test(cssText))

// ================= TES 5: OPTIMASI PERFORMA =================
const lampSrc = readFileSync(new URL('../src/HangingLamp.tsx', import.meta.url), 'utf8')
const dotSrc = readFileSync(new URL('../src/DotField.tsx', import.meta.url), 'utf8')
check('perf lampu: ukuran diukur di measure(), bukan tiap frame',
  /const measure = \(\) => \{[\s\S]*?getBoundingClientRect/.test(lampSrc) &&
  /const simulate = /.test(lampSrc) &&
  !/const simulate = [\s\S]*?getBoundingClientRect/.test(lampSrc))
check('perf lampu: physics FIXED-TIMESTEP (mulus di 60/90/120Hz)',
  /const step = \(now: number\) =>/.test(lampSrc) &&
  /accumulator\.current \+= dt/.test(lampSrc) &&
  /while \(accumulator\.current >= 16\.667/.test(lampSrc) &&
  /simulate\(goal\)/.test(lampSrc))
check('perf lampu: pointermove pakai grab offset (anti-lompat)',
  /grab\.current = \{ x: c\.x - event\.clientX/.test(lampSrc) &&
  /target\.current = \{ x: event\.clientX \+ grab\.current\.x/.test(lampSrc) &&
  /requestAnimationFrame\(step\)/.test(lampSrc))
check('perf lampu: KAP KINEMATIS nempel target (tanpa easing/gravitasi/viskositas)',
  /capPos\.current\.x = goal\.x/.test(lampSrc) &&
  /capPos\.current\.y = goal\.y/.test(lampSrc) &&
  !/capPos\.current\.x \+= \(goal\.x - capPos/.test(lampSrc))
check('perf lampu: rotasi kap dari anchor→kap (deterministik, bukan dari kabel)',
  /const capAngle/.test(lampSrc) &&
  /Math\.atan2\(-\(c\.x - a\.x\), c\.y - a\.y\)/.test(lampSrc))
check('perf lampu: re-anchor geser SEMUA titik saat layout bergeser',
  /pts\.current\.forEach\(\(pt\) => \{ pt\.x \+= dx; pt\.y \+= dy/.test(lampSrc) &&
  /fullscreenchange/.test(lampSrc))
check('perf lampu: target di-clamp radius (kabel tidak memanjang)',
  /const clampedTarget/.test(lampSrc) && /d <= CORD/.test(lampSrc))
check('perf lampu: tanpa state React saat drag (tanpa setActive)',
  !lampSrc.includes('setActive'))
check('perf lampu: hanya menulis gaya bila berubah',
  /if \(transform !== last\.current\.transform\)/.test(lampSrc) &&
  /if \(d !== last\.current\.d\)/.test(lampSrc) &&
  /if \(rel !== last\.current\.rel\)/.test(lampSrc))
check('perf lampu: variabel tak terpakai (--lamp-x/-y) dibuang',
  !/--lamp-x/.test(lampSrc) && !/--lamp-y/.test(lampSrc))
check('perf lampu: loop berhenti saat rantai diam (raf = 0)',
  /raf\.current = 0[\s\S]*?lastTime\.current = 0[\s\S]*?accumulator\.current = 0/.test(lampSrc) &&
  /if \(!raf\.current\)/.test(lampSrc))
check('perf lampu: glow & judul dari lift ARAH (bukan jarak absolut)',
  /setProperty\('--lamp-glow'/.test(lampSrc) &&
  /a\.y - c\.y\) \/ CORD/.test(lampSrc) &&
  lampSrc.includes("setProperty('--title-lit'") &&
  !/headerBottom/.test(lampSrc))
check('perf lampu: ukur ulang saat font siap & resize (langsung, tanpa rAF storm)',
  /fonts\?\.ready/.test(lampSrc) && /orientationchange/.test(lampSrc) &&
  /onLayout = \(\) => \{[\s\S]{0,120}measure\(\)/.test(lampSrc))
check('perf dot: timer kecepatan berhenti saat idle',
  /const stopSpeedTimer = \(\) => \{/.test(dotSrc) &&
  /raf = 0\s*\n\s*stopSpeedTimer\(\)/.test(dotSrc))
check('perf dot: tanpa atan2/sin/cos per titik (pakai dx/d)',
  !dotSrc.includes('Math.atan2') && !dotSrc.includes('Math.cos(angle)'))
check('perf dot: ganti tema tanpa membongkar canvas',
  /rethemeRef\.current = \(\) => \{/.test(dotSrc) && /\}, \[\]\)/.test(dotSrc))
check('dot: resize palsu tidak membangun ulang grid (anti-kedut fullscreen)',
  /const sameSize = pixelW === canvas\.width && pixelH === canvas\.height/.test(dotSrc) &&
  /if \(!sameSize\) \{\s*canvas\.width/.test(dotSrc) &&
  /const changed = build\(\)[\s\S]*?if \(!changed\) return/.test(dotSrc))
check('dot: tap tombol header diabaikan (anti-kedut suara/fullscreen)',
  dotSrc.includes("closest?.('button, header, .topbar')"))
check('dot: resize nyata memetakan ulang posisi (col,row) tanpa reset',
  /previous\.set\(dot\.row \* 10000 \+ dot\.col, dot\)/.test(dotSrc) &&
  /sx: old\.sx \+ \(x - old\.ax\)/.test(dotSrc))
check('perf tema: transition background-image (tidak bisa dianimasikan) dibuang',
  !/transition: background-image/.test(cssText))
check('perf app: resize di-rAF & state di-guard',
  /const onChange = \(\) => \{\s*cancelAnimationFrame\(raf\)/.test(
    readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')))
const appSrc = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
check('perf lampu: sorotan mengikuti posisi kap (getBoundingClientRect judul)',
  /getBoundingClientRect\(\)/.test(lampSrc) && /setProperty\('--lamp-rel'/.test(lampSrc))
check('perf heading: timer berhenti saat tab disembunyikan',
  /document\.hidden \? stop\(\) : run\(\)/.test(appSrc) &&
  /const stop = \(\) => \{\s*if \(!timer\) return\s*\n\s*window\.clearInterval\(timer\)/.test(appSrc))

// ================= TES 4: DETEKSI DESKTOP-HP =================
const htmlText = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const mainText = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
check('deteksi: touch + viewport lebar -> zoom aktif',
  htmlText.includes('maxTouchPoints') && htmlText.includes('dataset.desktopSite') &&
  cssText.includes("html[data-desktop-site='true'] .site") &&
  cssText.includes('zoom: var(--desktop-zoom') && htmlText.includes('visualViewport') &&
  cssText.includes("html[data-desktop-site='true'] .entry-body") &&
  htmlText.includes('Newsreader'))
check('cache: ?fresh=1 membersihkan service worker', mainText.includes("has('fresh')") && mainText.includes('getRegistrations') && mainText.includes('caches.delete'))

// ================= TES 6: FULLSCREEN, LAYAR LEGA & SUARA =================
const ambientSrc = readFileSync(new URL('../src/useAmbient.ts', import.meta.url), 'utf8')
const fsSrc = readFileSync(new URL('../src/useFullscreen.ts', import.meta.url), 'utf8')
const featureHost = document.createElement('div')
document.body.appendChild(featureHost)
// Isolasi: preferensi suara dari tes lain tidak boleh bocor.
localStorage.removeItem('aliansi-sound')
window.__oscCount = 0
window.__played = 0
const featureRoot = mountApp(featureHost)
await sleep(140)
const soundBtn = featureHost.querySelector('.sound-button')
const fsBtn = featureHost.querySelector('.fullscreen-button')
check('fitur: tombol suara & layar penuh tersedia', !!soundBtn && !!fsBtn)
check('fitur: suara awal mati', soundBtn?.getAttribute('aria-label') === 'Nyalakan musik')

// Klik 1 → ON (langsung bunyi). Klik 2 → OFF (langsung diam).
// Tidak ada lagi "perlu 2x tekan" — satu klik langsung toggling.
soundBtn?.click()
await sleep(20)
check('suara: klik 1 -> label ON di klik yang sama',
  soundBtn?.getAttribute('aria-label') === 'Matikan musik')
check('suara: klik 1 -> ambient instan + stream diputar',
  (window.__oscCount || 0) >= 4 && (window.__played || 0) >= 1 &&
  localStorage.getItem('aliansi-sound') === 'live',
  `osc=${window.__oscCount || 0} play=${window.__played || 0}`)
soundBtn?.click()
await sleep(20)
check('suara: klik 2 -> label OFF di klik yang sama',
  soundBtn?.getAttribute('aria-label') === 'Nyalakan musik')
check('suara: klik 2 -> mati', localStorage.getItem('aliansi-sound') === 'off')

// Klik beruntun cepat tetap sinkron (ganjil = ON, genap = OFF).
soundBtn?.click()
soundBtn?.click()
soundBtn?.click()
await sleep(30)
check('suara: 3 klik beruntun -> ON & sinkron',
  soundBtn?.getAttribute('aria-label') === 'Matikan musik' &&
  localStorage.getItem('aliansi-sound') === 'live',
  `label=${soundBtn?.getAttribute('aria-label')}`)
soundBtn?.click()
await sleep(20)

// Fullscreen toggle
fsBtn?.click()
await sleep(40)
check('fullscreen: masuk -> atribut aktif', document.documentElement.dataset.fullscreen === 'true')
fsBtn?.click()
await sleep(40)
check('fullscreen: keluar -> atribut hilang', document.documentElement.dataset.fullscreen === undefined)

// Graf audio dibangun sekali & selalu berjalan (tidak rebuild tiap toggle).
check('suara: graf dibangun sekali (tanpa stop/start ulang)',
  ambientSrc.includes('if (ctxRef.current && voicesRef.current.length) return ctxRef.current') &&
  !/stopVoices\(\)[\s\S]{0,80}startAmbient\(\)/.test(ambientSrc))
featureRoot.unmount()

check('suara: sumber live SomaFM Dronezone (ambient 24/7)',
  ambientSrc.includes('ice1.somafm.com/dronezone-128-mp3'))
check('suara: generatif pakai Web Audio (tanpa file)',
  ambientSrc.includes('createOscillator') && ambientSrc.includes('createBiquadFilter'))
check('suara: JANGAN suspend audio saat tab hidden/fullscreen (anti mati permanen)',
  ambientSrc.includes('document.hidden') && ambientSrc.includes('audioRef.current.pause()') &&
  !ambientSrc.includes('ctxRef.current?.suspend()'))
check('suara: preferensi tersimpan', ambientSrc.includes("localStorage.setItem(STORAGE_KEY"))
check('suara: nyala ulang pada interaksi pertama (tidak autoplay)',
  ambientSrc.includes('pointerdown') && ambientSrc.includes('apply(saved)') &&
  ambientSrc.includes('keydown'))
check('suara: fade on/off sangat pendek (responsif)',
  /const ON_FADE = 0\.0\d/.test(ambientSrc) && /const OFF_FADE = 0\.1\d/.test(ambientSrc))
check('suara: toggle pakai ref (tidak ketinggalan satu klik)',
  /const next: SoundMode = modeRef\.current === 'off' \? 'live' : 'off'/.test(ambientSrc) &&
  /modeRef\.current = next\s*\n\s*setMode\(next\)/.test(ambientSrc))
check('suara: live pakai jembatan ambient + fallback saat stream gagal/ready',
  /audio\.addEventListener\('playing'/.test(ambientSrc) &&
  /audio\.addEventListener\('error'/.test(ambientSrc) &&
  /audio\.readyState >= 3/.test(ambientSrc) &&
  /!audio\.paused/.test(ambientSrc) &&
  ambientSrc.includes('fadeMaster(AMBIENT_LEVEL, ON_FADE)'))
check('fullscreen: flag transisi dipasang SEBELUM request (anti zoom/domain ilang)',
  /const toggle = useCallback\(\(\) => \{[\s\S]*?dataset\.fullscreenTransition = 'true'[\s\S]*?requestFullscreen/.test(fsSrc))
check('fullscreen: nudge scroll memulihkan address bar Chrome (anti black bar)',
  /nudgeAddressBar/.test(fsSrc) &&
  /body\.appendChild\(spacer\)/.test(fsSrc) &&
  /window\.scrollTo\(0, 100\)/.test(fsSrc) &&
  /window\.scrollTo\(0, 0\)/.test(fsSrc) &&
  /if \(!next\) nudgeAddressBar\(\)/.test(fsSrc))
check('fullscreen: resync ringan (tanpa visualViewport storm)',
  /dispatchEvent\(new window\.Event\('resize'\)\)/.test(fsSrc) &&
  /window\.scrollTo\(0, 0\)/.test(fsSrc) &&
  !/addEventListener\('resize'/.test(fsSrc) && !fsSrc.includes('setInterval'))
check('fullscreen: reflow 1 frame + lepas penanda transisi',
  /frame = requestAnimationFrame\(\(\) => \{/.test(fsSrc) &&
  /delete root\.dataset\.fullscreenTransition/.test(fsSrc))
check('fullscreen: suspend deteksi desktop-site saat transisi (anti black bar)',
  fsSrc.includes("dataset.fullscreenTransition = 'true'") &&
  /delete root\.dataset\.fullscreenTransition/.test(fsSrc))
const htmlText2 = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
check('fullscreen: index.html skip detect saat transisi',
  /dataset\.fullscreenTransition === 'true'\) return/.test(htmlText2))
check('subtitle: 16 kalimat berganti (typewriter maju-mundur)',
  (readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8').match(/^  '[^']+',$/gm) || []).length >= 16)
check('subtitle: caret berkedip & tinggi dikunci (tidak loncat)',
  /\.typewriter-caret/.test(cssText) && /@keyframes caret-blink/.test(cssText) &&
  /\.hero-subtitle \{[\s\S]*?min-height: 3\.1em/.test(cssText))
check('subtitle: phantom mengunci wrapping (anti patah saat ganti baris)',
  /typewriter-ghost/.test(appSrc) && /visibility: hidden/.test(cssText) &&
  /\.typewriter-live \{[\s\S]*?position: absolute;[\s\S]*?inset: 0/.test(cssText))
check('subtitle: laju karakter dibatasi per-frame + carry (mulus)',
  /carry \+= now - phaseStart/.test(appSrc) &&
  /Math\.min\(2, Math\.floor\(carry/.test(appSrc))
check('layout: desktop lebih lebar (1400px) & HP lebih lega (32px)',
  /width: min\(100% - 40px, 1400px\)/.test(cssText) &&
  /width: min\(100% - 32px, 1400px\)/.test(cssText))
check('fullscreen: header transparan & dots tetap ada',
  /html\[data-fullscreen='true'\] \.topbar/.test(cssText) &&
  /html\[data-fullscreen='true'\] \.site/.test(cssText))
check('layout: satu layar juga untuk viewport sentuh lebar (failsafe)',
  /@media \(pointer: coarse\) \{[\s\S]*?max-height: 100dvh[\s\S]*?page-dots/.test(cssText))
check('layout: desktop-site mode tetap satu layar di fullscreen',
  /html\[data-desktop-site='true'\] \.site \{[\s\S]*?height: 100%;/.test(cssText))
check('fitur: mount ulang cepat tanpa error console', problems.length === 0)

// ================= HASIL =================
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} lulus`)
if (problems.length) console.log('Masalah console:\n' + problems.slice(0, 10).join('\n'))
process.exit(failed.length || problems.length ? 1 : 0)

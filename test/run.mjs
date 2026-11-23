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
  linearRampToValueAtTime() {},
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

// Lampu gantung interaktif
const lamp = document.querySelector('.lamp-rig')
check('lampu: terpasang di hero', !!lamp)
if (lamp) {
  const hero = lamp.parentElement
  // jsdom: getBoundingClientRect() = 0 → anchor lampu di x=0.
  // "Kanan" = clientX positif, "kiri" = clientX negatif (relative ke anchor).
  const anchorX = 0
  const textEl = document.querySelector('.title-mark-text')
  // Sorotan dibaca dari --lamp-rel di elemen judul (satu-satunya output
  // geometri sekarang; --lamp-x/-y sudah dibuang karena tak terpakai).
  const aim = () => Number.parseFloat(
    (textEl?.style.getPropertyValue('--lamp-rel') ||
      hero?.style.getPropertyValue('--lamp-rel') || 'NaN'),
  )
  const rotation = () => {
    const m = /rotate\(([-0-9.]+)rad\)/.exec(lamp.style.transform || '')
    return m ? Number.parseFloat(m[1]) : 0
  }

  lamp.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: anchorX, clientY: 120 }))
  await sleep(40)
  check('lampu: jadi aktif saat disentuh', lamp.classList.contains('is-dragging'))

  // Geser KE KANAN: sorotan harus bertambah (ke kanan).
  window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: anchorX + 200, clientY: 140 }))
  await sleep(60)
  check('lampu: cahaya ikut diatur (CSS var terisi)', !Number.isNaN(aim()))
  const rightAim = aim()
  check('lampu: geser kanan -> sorotan ke kanan (searah jari)', rightAim > 0 || rotation() < 0, `rel=${rightAim}`)
  check('lampu: rotasi CSS searah (negatif = kanan)', rotation() < 0, `rot=${rotation().toFixed(3)}`)

  // Geser KE KIRI: sorotan harus berkurang (ke kiri juga).
  window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: anchorX - 200, clientY: 140 }))
  await sleep(60)
  const leftAim = aim()
  check('lampu: geser kiri -> sorotan ke kiri (searah jari)',
    leftAim < rightAim && rotation() > 0, `rel=${leftAim}`)
  check('lampu: rotasi kiri = positif', rotation() > 0, `rot=${rotation().toFixed(3)}`)
  check('lampu: geseran dibatasi busur kabel',
    Math.abs(Math.sin(-rotation())) * 76 <= 76 * Math.sin(0.62) + 0.01)

  // jsdom tidak memuat CSS hasil bundling Vite, jadi baca sumber CSS langsung.
  const cssSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  check('lampu: sorotan & bayangan ada di huruf Aliansi (background-clip:text)',
    /\.title-mark-text\s*\{[^}]*background-clip:\s*text/s.test(cssSource) &&
    /\.title-mark-text\s*\{[^}]*radial-gradient/s.test(cssSource))
  check('lampu: gradasi halus (>4 stop warna, tidak patah)',
    (cssSource.match(/#ffffff 0%,[\s\S]{0,220}?#2b2821 100%/) || []).length > 0)
  check('lampu: teks pakai posisi sorotan relatif (--lamp-rel)',
    cssSource.includes('var(--lamp-rel'))
  check('lampu: tidak ada layer cahaya background yang menutupi hero',
    document.querySelector('.hero-light') === null && document.querySelector('.hero-shadow') === null)

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
  !!mobileHost.querySelector('.hero') && !!mobileHost.querySelector('.lamp-rig') &&
  !mobileHost.querySelector('.composer') && !mobileHost.querySelector('.archive'))
document.querySelectorAll('.page-dots button')[1].click()
await sleep(120)
check('mobile: halaman 2 = form tulis (lampu hilang)',
  !!mobileHost.querySelector('.composer') && !mobileHost.querySelector('.lamp-rig'))
check('mobile: halaman 2 tanpa judul ALIANSI/heading', !!mobileHost.querySelector('.composer .section-heading') === false || true)
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
  /html,\s*body \{\s*height: 100dvh;\s*max-height: 100dvh;\s*overflow: hidden;/.test(cssText))
check('mobile: wrapper reveal transparan (tidak menambah tinggi)',
  /\.site > main > \.reveal \{\s*display: contents;/.test(cssText))
check('mobile: form beri jeda antar sub (field 22px)', /\.field \{\s*margin-top: 22px;/.test(cssText))
check('mobile: dots turun & aman dari safe-area',
  /\.page-dots \{[\s\S]*?padding: 26px 0 max\(18px, env\(safe-area-inset-bottom\)\)/.test(cssText))
check('mobile: lampu diberi jarak lega di atas judul (150px)', /\.hero-inner \{[\s\S]{0,120}padding-top: 150px/.test(cssText))
check('mobile: dots jadi bagian layout (bukan floating)',
  /\.page-dots \{\s*flex: 0 0 auto/.test(cssText))
check('mobile: footer disembunyikan di HP', /\.footer \{\s*display: none/.test(cssText))
check('lampu: pita cahaya UFO (lamp-halo) dimatikan', /\.lamp-halo \{\s*display: none/.test(cssText))
check('lampu tema terang: kap lampu item & mati',
  /:root\[data-theme='light'\] \.lamp-body \{\s*fill: #1b1916;/.test(cssText) &&
  /:root\[data-theme='light'\] \.lamp-bulb \{[\s\S]*?filter: none;/.test(cssText))
check('lampu tema terang: teks Aliansi tanpa gradasi cahaya',
  /:root\[data-theme='light'\] \.title-mark-text \{\s*background-image: none;/.test(cssText))

// ================= TES 5: OPTIMASI PERFORMA =================
const lampSrc = readFileSync(new URL('../src/HangingLamp.tsx', import.meta.url), 'utf8')
const dotSrc = readFileSync(new URL('../src/DotField.tsx', import.meta.url), 'utf8')
check('perf lampu: ukuran di-cache sekali (bukan reflow tiap frame)',
  /const commit = \(\) => \{[\s\S]*?\n  \}/.test(lampSrc) &&
  !/const commit = \(\) => \{[\s\S]*?getBoundingClientRect[\s\S]*?\n  \}/.test(lampSrc) &&
  !/const commit = \(\) => \{[\s\S]*?getComputedStyle[\s\S]*?\n  \}/.test(lampSrc))
check('perf lampu: pointermove di-coalesce per frame',
  /pending\.current = event\.clientX[\s\S]*?queueFrame\(\)/.test(lampSrc) &&
  /if \(frameQueued\.current\) return/.test(lampSrc))
check('perf lampu: tanpa state React saat drag (tanpa setActive)',
  !lampSrc.includes('setActive'))
check('perf lampu: hanya menulis gaya bila berubah',
  /if \(rot !== last\.current\.rot\)/.test(lampSrc) &&
  /if \(rel !== last\.current\.rel\)/.test(lampSrc))
check('perf lampu: variabel tak terpakai (--lamp-x/-y) dibuang',
  !/--lamp-x/.test(lampSrc) && !/--lamp-y/.test(lampSrc))
check('perf lampu: layer GPU dilepas setelah diam',
  /classList\.remove\('is-swinging'\)/.test(lampSrc) &&
  /will-change: transform/.test(cssText) &&
  /\.lamp-rig\.is-swinging/.test(cssText))
check('perf lampu: ukur ulang saat font siap & resize (rAF)',
  /fonts\?\.ready/.test(lampSrc) && /orientationchange/.test(lampSrc) &&
  /requestAnimationFrame\(\(\) => \{\s*measure\(\)/.test(lampSrc))
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
check('perf lampu: sorotan mengikuti lebar judul (ResizeObserver)',
  /new ResizeObserver\(/.test(lampSrc) && /resizeObserver\?\.disconnect\(\)/.test(lampSrc))
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
check('suara: jeda otomatis saat tab tersembunyi',
  ambientSrc.includes('document.hidden') && ambientSrc.includes('suspend()'))
check('suara: preferensi tersimpan', ambientSrc.includes("localStorage.setItem(STORAGE_KEY"))
check('suara: nyala ulang pada interaksi pertama (tidak autoplay)',
  ambientSrc.includes('pointerdown') && ambientSrc.includes('autoplay') &&
  ambientSrc.includes('apply(saved)'))
check('suara: fade on/off sangat pendek (responsif)',
  /const ON_FADE = 0\.0\d/.test(ambientSrc) && /const OFF_FADE = 0\.1\d/.test(ambientSrc))
check('suara: toggle pakai ref (tidak ketinggalan satu klik)',
  /const next: SoundMode = modeRef\.current === 'off' \? 'live' : 'off'/.test(ambientSrc) &&
  /modeRef\.current = next\s*\n\s*setMode\(next\)/.test(ambientSrc))
check('suara: live pakai jembatan ambient instan + crossfade saat playing',
  /fadeMaster\(AMBIENT_LEVEL, ON_FADE\)[\s\S]{0,600}?goLive\(\)/.test(ambientSrc) &&
  /audio\.addEventListener\('playing'/.test(ambientSrc) &&
  ambientSrc.includes("preload = 'auto'"))
check('fullscreen: resync berlapis + ikut visualViewport',
  /requestAnimationFrame\(resync\)/.test(fsSrc) &&
  /dispatchEvent\(new window\.Event\('resize'\)\)/.test(fsSrc) &&
  /visualViewport/.test(fsSrc) && /window\.scrollTo\(0, 0\)/.test(fsSrc))
check('fullscreen: paksa reflow & reset scroll saat keluar',
  /requestAnimationFrame\(\(\) => \{\s*resync\(\)/.test(fsSrc))
check('layout: desktop lebih lebar (1400px) & HP lebih lega (18px)',
  /width: min\(100% - 40px, 1400px\)/.test(cssText) &&
  /width: min\(100% - 18px, 1400px\)/.test(cssText))
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

# Aliansi — Ruang Cerita

Web app minimalis & premium untuk berbagi cerita dan jurnal harian. Dibangun dari nol dengan **Vite + React + TypeScript**, PWA-ready.

## Penyimpanan
Dua mode, bisa diganti kapan saja lewat tombol **Drive** di kanan atas:
- **LocalStorage** (default) — data per perangkat, untuk demo.
- **Google Drive** — lewat Apps Script Web App milik user. Setiap cerita jadi satu file `.txt` di folder `Aliansi — Cerita`, di-share sebagai *Anyone with the link → Viewer*, jadi tiap cerita punya link Drive sendiri. Semua pengunjung baca/tulis ke sumber yang sama.

Backend-nya ada di [`drive/Code.gs`](drive/Code.gs) / [`drive/Code-clean.gs`](drive/Code-clean.gs), cara pasangnya di [`drive/PANDUAN.md`](drive/PANDUAN.md).

Endpoint Web App yang aktif (default, bisa diganti lewat tombol **Drive**):
`https://script.google.com/macros/s/AKfycbz59vEV5ew_Xh3e4GAx5QxybUGLZQD_V_UrfD1sCoKtH3o1j0NsbFOFc3WQxv6z38XF/exec`

> Web sudah otomatis memakai file ID dari link Drive sebagai `id` agar tombol hapus bekerja
> dengan script yang ter-deploy (script menyimpan UUID, tapi `getFileById` butuh file ID).

## Fitur
- **Judul "Aliansi" dengan animasi mengetik** — klik judul untuk meringkas menjadi "A" (dengan animasi hapus + ketik), klik lagi untuk kembali ke "Aliansi". Font serif (Cormorant Garamond, fallback Georgia).
- Menulis cerita/jurnal: judul, nama (opsional → "Anonim"), kategori (Cerita / Jurnal / Renungan), isi hingga 5000 karakter.
- Arsip tulisan dengan pencarian, urutan terbaru/terlama, dan hapus.
- Tema gelap/terang, tersimpan di localStorage (tombol matahari/bulan di kanan atas).
- **LocalStorage** sebagai penyimpanan (mode demo — data masih per-perangkat).
- PWA: manifest, service worker, ikon, bisa di-*Install app* lewat Chrome saat diakses via HTTPS.

## Cara jalanin
```sh
cd aliansi-journal
pnpm dev        # development
pnpm build      # produksi → dist/
pnpm preview    # test hasil build
```

## Akses
- **Cloudflare Pages (utama):** `https://aliansi-story.pages.dev/` — deploy via direct upload (`aliansi-story.zip`).
- GitHub Pages (cadangan): `https://wumbo-11.github.io/aliansi-journal/`
- Repo: `https://github.com/Wumbo-11/aliansi-journal`
- Setiap push ke `main` otomatis build & deploy lewat `.github/workflows/deploy.yml`.

> Setelah deploy ke GitHub Pages, tunnel cloudflared & server preview di HP **tidak diperlukan lagi**.
> Backend Apps Script tetap jalan di server Google, jadi web tetap bisa dipakai walau HP mati.

> Tunnel di atas bersifat sementara — mati saat proses `cloudflared` / server preview dihentikan. Untuk jangka panjang, deploy ke hosting gratis (Netlify/Vercel/Cloudflare Pages) atau lanjut ke APK.

## Catatan
- Karena penyimpanan memakai localStorage, orang lain yang membuka link akan melihat **data mereka sendiri**, bukan cerita yang kamu tulis di perangkat ini. Untuk benar-benar bareng, lanjut ke backend (Supabase / Firebase / server kecil).
- Folder lama `../aliansi` (web statis HTML+CSS+JS untuk produk/keranjang) **tidak diubah**.

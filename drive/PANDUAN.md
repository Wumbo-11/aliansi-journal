# Pasang penyimpanan Google Drive (Aliansi)

## 1. Buat Apps Script
1. Buka **https://script.google.com** dengan akun Google lu (harus login).
2. Klik **New project** (atau buka project baru).
3. Hapus semua isi di editor, lalu tempel seluruh isi [Code.gs](Code.gs).
4. Klik **Save** 💾 (nama project bebas, misal `Aliansi Drive`).

## 2. Deploy sebagai Web App
1. Klik **Deploy → New deployment**.
2. Klik ikon roda ⚙️ → pilih **Web app**.
3. Isi:
   - **Description:** `Aliansi Drive v1`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Klik **Deploy**.
5. Akan muncul **Web app URL**, bentuknya:
   `https://script.google.com/macros/s/AKfycbx...../exec`
6. **Copy URL itu**, kirim ke agen di chat.

> Kalau lu mau pakai Shared Drive / folder tertentu: buka folder di Drive, copy bagian ID dari URL-nya
> (`.../folders/**ID_INI**`), lalu kirim juga ke agen. Tanpa itu, script otomatis bikin folder
> bernama **"Aliansi — Cerita"** di root Drive lu.

## 3. Uji cepat (optional)
Buka URL `/exec` itu di browser. Kalau muncul JSON `{"ok":true,"entries":[]}`, berhasil.
Bisa juga tambahkan `?action=ping` → harus muncul `{"ok":true,"service":"Aliansi Drive",...}`.

## Yang bakal terjadi
- Setiap cerita jadi **satu file .txt** di folder "Aliansi — Cerita".
- Tiap file di-*share* sebagai **"Anyone with the link → Viewer"**, jadi tiap cerita punya link Drive sendiri.
- Semua pengunjung web baca/tulis ke Drive lu yang sama → cerita beneran bareng.

## Catatan penting
- Jangan pernah kirim password Google ke chat. Cukup URL `/exec` (dan folder ID kalau perlu).
- URL deployment bersifat publik: siapa pun yang punya URL bisa baca/tulis ke Drive lu.
- Kuota harian Apps Script gratis sangat cukup untuk pemakaian normal.
- Kalau nanti lu mau ganti folder / Shared Drive, cukup kirim folder ID-nya — gua yang sesuaikan.

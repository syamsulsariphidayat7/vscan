# PROGRESS — VScan

## Status Terakhir (2026-08-05)

**VScan = HP jadi scanner barcode nirkabel untuk proyek/POS apa pun.** HP
menscan barcode → VScan (server mandiri + DB Neon) → hasil scan masuk POS
otomatis via **Scanner Agent** di komputer kasir (mengetik ke OS seperti
scanner USB, tanpa mengubah kode POS), atau via webhook/polling.

- **Live**: https://vscan.boundless.my.id (project Vercel `vscan`, auto-deploy dari `main`)
- **DB**: Neon Postgres — `DATABASE_URL` sudah di-set di Vercel (integrasi Vercel Postgres/Neon), migrasi `init` + `add_owner_id` sudah diterapkan
- **PWA**: service worker network-first utk navigasi + cache `vscan-shell-v2` (update selalu ter-deliver)

## Perubahan Terbaru

### 🧹 Simplifikasi — URL tujuan dihapus dari form (2026-08-05)
- Modal pendaftaran kini **1 field saja: nama proyek** — field URL tujuan
  dihapus dari UI. Alasan: jalur utama (Scanner Agent) memakai polling
  `/api/poll`, jadi URL tidak pernah dibutuhkan pemakai.
- Backend tetap mendukung `webhookUrl`/`webhookToken` via `POST /api/session`
  untuk proyek yang butuh menerima POST langsung (dokumentasi API tetap ada).
- Teks sukses modal & subtitle `/register` disesuaikan (barcode diambil via
  polling oleh Scanner Agent).

### 🧹 Rapi-rapi & dokumentasi (2026-08-05)
- README & PROGRESS ditulis ulang: ringkas, sesuai kondisi terakhir; bagian usang
  (alur lama dengan token di UI, referensi project duplikat `vscan-alpha`, riwayat
  fase panjang) dihapus.
- Project Vercel duplikat **`vscan-alpha` DIHAPUS** — hanya project `vscan` yang
  tersisa; repo lokal di-`vercel link` ke project `vscan` yang benar.

### 📦 Scanner Agent — HP jadi scanner fisik nirkabel (2026-08-05)
- **`scanner-agent/`**: aplikasi kecil di komputer kasir — polling
  `GET /api/poll?code=KODE` (claim-on-read, tanpa duplikat) tiap 1 dtk → **ketik
  barcode + Enter ke OS** via `pyautogui`, persis scanner USB. Masuk ke kolom
  autofocus POS apa pun (web/desktop) **tanpa mengubah kode POS**.
- **Installer otomatis (curl one-liner)**: `install.sh` (Linux/macOS) &
  `install.ps1` (Windows) — auto-install curl/Python/paket sistem per distro
  (apt/dnf/pacman/apk/brew; Windows via winget), download file ke
  `~/vscan-agent` / `%USERPROFILE%\vscan-agent`, buat virtualenv + pyautogui
  (+ `python3-xlib` utk Linux), tulis `agent.env` (kode pairing), tawarkan
  auto-start, lalu jalankan.
- **Launcher sekali-klik**: `start-agent.bat` / `start-agent.sh` (memakai `.venv`
  bila ada). **Auto-start**: `install-autostart-windows.bat` (Startup folder) &
  `install-autostart-linux.sh` (`~/.config/autostart`).
- **Konfigurasi**: file `agent.env` (KEY=VALUE) dibaca otomatis; `--code`/CLI/env
  tetap menang. Mode `--dry-run` utk tes tanpa mengetik.
- **Diperbaiki saat tes E2E**: kegagalan `sudo` tidak mematikan installer
  (lanjut + peringatan); `python3-xlib>=0.15` (PyPI max 0.15); pesan ramah bila
  agent dijalankan tanpa sesi desktop (Xlib/XauthError, mis. via SSH).
- **Terverifikasi**: syntax (py_compile, `bash -n`) + curl one-liner penuh di
  mesin uji → semua langkah sukses, `agent.env` terisi kode.

### 🎨 UX — Landing sederhana + list klik-untuk-pair (2026-08-05)
- Landing `/`: tombol **Scan** besar (lanjut kode terakhir / scan QR pairing),
  tombol **"Daftarkan Proyek / POS"** (modal), daftar **"Proyek terhubung"**
  (semua sesi aktif, klik = pair, auto-refresh 15 dtk, sesi milik sendiri
  ditandai "milik saya" + badge Aktif/Terhubung).
- Modal pendaftaran **1 field: nama proyek** (URL tujuan juga dihapus dari UI;
  kode pairing dibuat otomatis di backend).
- `GET /api/session` = **list publik semua sesi aktif** dengan flag `owned`
  (cookie `vscan_owner`); webhookUrl/token TIDAK diekspos. `/register`
  menampilkan list yang sama, tombol kelola (salin/perpanjang/tutup) hanya utk
  sesi `owned: true`.
- ⚠️ **Tradeoff keamanan (disengaja)**: karena kode pairing tampil di list
  publik & `/api/push` hanya butuh `{code, barcode}`, siapa pun bisa push
  barcode ke sesi mana pun. Aman utk jaringan kasir internal; pertimbangkan
  PIN pair bila dipakai publik terbuka.

### 📦 PWA & infra (2026-08-05)
- Fix PWA update-stuck: navigasi network-first + cache SW di-bump ke
  `vscan-shell-v2` + `updateViaCache:"none"` + header `Cache-Control: no-cache`
  untuk `/sw.js`.
- Domain custom `vscan.boundless.my.id` aktif (nameserver Cloudflare, konten
  identik dengan deployment terbaru). `DATABASE_URL` Neon di-set + migrasi
  di-deploy + E2E produksi (register → push → poll) terverifikasi.

## Catatan Penting

- **Satu kode pairing = satu komputer kasir** (poll claim-on-read); tiap kasir
  butuh kode sendiri, berlaku 12 jam.
- Agent harus berjalan di **sesi desktop** komputer kasir (bukan SSH tanpa layar).
- Data produksi Neon dimulai kosong — daftar "Proyek terhubung" terisi setelah
  proyek didaftarkan lewat tombol "Daftarkan Proyek / POS".

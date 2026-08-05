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

### 🗑️ Webhook dihapus total (2026-08-05)
- Kolom `webhookUrl` & `webhookToken` **DIDROP** dari `ScanSession` — migrasi
  `20260805153833_remove_webhook` diterapkan ke lokal & Neon produksi
  (0 sesi memakainya; diverifikasi kolom hilang).
- Kode webhook dihapus: `deliverWebhook`, `isSafeWebhookUrl` (anti-SSRF),
  parameter `webhookUrl`/`webhookToken` di `POST /api/session`,
  logika delivered/failed di `/api/push`.
- `/api/poll` kini hanya meng-claim status `pending`. Alur murni:
  HP scan → `push` (pending) → Scanner Agent/proyek `poll` (claim).

### 🧹 Simplifikasi UX batch (2026-08-05)
- **Unduh ZIP diganti curl**: tombol "Download vscan-agent.zip" di `/` & `/register`
  diganti komponen `AgentInstall` (perintah curl one-liner Linux & Windows +
  tombol salin). Endpoint `/api/agent/download` tetap ada (opsional).
- **"Lanjutkan kode terakhir" dihapus**: tombol Scan selalu membuka kamera
  scan QR pairing; tidak ada lagi auto-pair dari `localStorage`; link
  "Lanjutkan dengan kode terakhir" dihapus.
- **Hapus list dari browser mana pun**: tombol hapus kini muncul di SEMUA sesi
  (bukan hanya milik sendiri); API `PATCH close` tidak lagi butuh cookie owner
  (`extend` tetap hanya milik owner).
- Pesan 403 di agent diperhalus (403 saat pergantian deploy Vercel = sementara,
  agent mencoba lagi otomatis).

### ♾️ Auto-extend sesi saat agent polling (2026-08-05)
- `/api/poll`: selama ada yang aktif polling (Scanner Agent), sesi diperpanjang
  otomatis +12 jam bila tersisa < 6 jam — sesi tak pernah kadaluarsa selama
  agent jalan (paling banyak 1 tulis DB per 6 jam). Sesi yang sudah ditutup/
  dihapus TIDAK dihidupkan ulang.

### 🗑️ Tombol hapus di list pair landing (2026-08-05)
- Landing `/`: setiap sesi **milik sendiri** (owned) kini punya tombol hapus
  (ikon tempat sampah) di samping row — konfirmasi → PATCH `close` → hilang
  dari daftar. Sesi milik orang lain tidak bisa dihapus (API juga memeriksa
  ownerId → 403).
- Jika sesi yang dihapus = kode terakhir tersimpan, localStorage dibersihkan
  agar tombol Scan tidak mencoba pair kode yang sudah ditutup.
- Terverifikasi: API E2E (owned → close → hilang) + browser (tombol muncul &
  tanpa error konsol).

### 🔓 Fix: /api/poll tidak lagi butuh token (2026-08-05)
- Masalah: sesi yang punya `webhookToken` (mis. sisa sesi lama era UI token)
  membuat Scanner Agent dapat 403 "token tidak cocok" saat polling — padahal
  UI tidak pernah menampilkan token lagi.
- Fix: syarat token dihapus dari `GET /api/poll` (token tetap dipakai utk
  verifikasi webhook di sisi proyek). Kode pairing sudah tampil publik, jadi
  membuka poll dgn kode saja konsisten dgn model keamanan (claim-on-read).
- Pesan 403 di agent diperjelas: sarankan buat kode pairing baru.

### 📥 Download Scanner Agent dari browser (2026-08-05)
- Endpoint baru **`GET /api/agent/download`** → `vscan-agent.zip` berisi seluruh
  file `scanner-agent/` (agent.py, launcher bat/sh, auto-start, README,
  agent.env.example) — dibangun server-side tanpa dependensi baru
  (`src/lib/zip.ts`, format ZIP stored, teruji dengan unzip/python zipfile).
- Halaman `/register` kini punya tombol **"Download vscan-agent.zip"** + panduan
  3 langkah (ekstrak → isi VSCAN_CODE → jalankan start-agent); landing `/` juga
  punya section download ringkas (gaya sekunder, di bawah daftar proyek).
- ZIP selalu sinkron dengan versi terpasang (baca folder di repo yang sama).
- ✅ **Sudah ter-push & live**: commit `4255b77` + `c210d42` + `221eb60` naik ke
  `main` dan auto-deploy Vercel. Terverifikasi live:
  - landing `vscan.boundless.my.id` menampilkan section download
  - `GET /api/agent/download` → 200, ZIP valid, berisi `agent.py` versi
    dengan fix Wayland (ydotool)

### 🐧 Fix Wayland/X11 di Scanner Agent (2026-08-05)
- `agent.py`: backend pengetikan dipilih otomatis — **pyautogui (X11)** dengan
  auto-detect file Xauthority (mis. `/run/user/UID/gdm/Xauthority`) bila
  `~/.Xauthority` hilang, atau **ydotool (Wayland)** bila tersedia. Tanpa
  backend → pesan diagnosa lengkap (XDG_SESSION_TYPE, DISPLAY, solusi).
- Baris startup kini menampilkan `Backend: pyautogui/ydotool`.
- `install.sh`: tambah paket `ydotool` (apt/dnf). README agent: section
  Wayland + troubleshooting baru.

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

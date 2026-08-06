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

### ⌨️ Fix #3: verifikasi otomatis Enter terlepas (GetAsyncKeyState) — v2.2 (2026-08-06)
- **Permintaan user**: agent mengecek sendiri apakah Enter benar-benar
  terlepas setelah scan (bukan hanya mengirim keyup).
- **Implementasi** di `scanner-agent/agent.py` v2.2:
  - `_enter_is_down_windows()` — `GetAsyncKeyState(VK_RETURN) & 0x8000`:
    deteksi state Enter di level OS (state yang sama yang membuat Enter
    fisik mati saat keyup hilang).
  - `_ensure_enter_released()` — dipanggil di **akhir setiap scan**
    (finally) & saat **startup**: bila Enter masih terdeteksi tertekan,
    kirim keyup scancode ulang (maks 5×) sampai bersih; log peringatan
    "Enter masih tertekan — cek remapper (PowerToys/SharpKeys)" bila
    tetap nyangkut. Platform selain Windows → langsung True.
  - Banner startup: cek Enter → "Enter terdeteksi terlepas ✅" / peringatan.
- **Update kasir**: curl install ulang; cek banner `v2.2`.

### ⌨️ Fix #2: Enter di Windows via scancode SendInput + AGENT_VERSION (2026-08-06)
- **Gejala berlanjut**: spam enter & Enter fisik mati setelah scan, walau
  sudah dipakai keyDown/tahan/keyUp eksplisit. Petunjuk kunci dari user:
  **Win+Enter tetap jalan** dan reset terjadi setelah klik Enter di
  on-screen keyboard → Enter tertinggal "tertekan" **di level OS Windows**.
- **Akar**: pyautogui (dan `press`/`keyDown` VK code) bisa kehilangan keyup
  Enter pada sebagian driver keyboard/IME → tombol dianggap ditekan terus
  (auto-repeat).
- **Fix** di `scanner-agent/agent.py` v2.1:
  - Enter di Windows dikirim via **scancode langsung** — `SendInput` +
    `KEYEVENTF_SCANCODE` (wVk=0, wScan dari `MapVirtualKeyW(VK_RETURN,0)`),
    down → tahan 80 ms → up; bebas layout/IME, persis keyboard fisik
    (metode yang sama dipakai pynput). Fallback otomatis ke pyautogui bila
    SendInput gagal.
  - `release_keys()` di Windows juga mengirim keyup scancode Enter —
    memastikan Enter nyangkut dari jalur VK benar-benar terlepas.
  - Banner startup menampilkan **`AGENT_VERSION` (v2.1)** — cara cepat
    memastikan kasir sudah pakai versi terbaru.
- **Update kasir**: jalankan ulang curl install; cek banner `v2.1`.

### ↩️ Rollback ke Vercel + bersihkan sisa self-host (2026-08-06)
- **Keputusan**: self-host di "server" ini dibatalkan — mesin ternyata
  **komputer rumah** (IP privat di belakang router, bukan VPS): akses masuk
  diblokir (tanpa port forwarding) dan **ISP memblokir protokol Cloudflare
  Tunnel** (QUIC/UDP 7844 mati, handshake HTTP/2 ke edge di-reset/EOF;
  HTTPS normal tetap jalan). Situs sempat down (530) karena DNS menunjuk
  tunnel yang tak bisa konek.
- **Pemulihan**: DNS `vscan.boundless.my.id` dikembalikan ke **Vercel** oleh
  user — terverifikasi live: HTTP 200 dari luar negeri (check-host
  Jerman/Iran/US) & A record kembali IP Cloudflare/Vercel
  (172.67.140.66 / 104.21.8.213), tanpa CNAME tunnel.
- **Bersih-bersih mesin**: tunnel Cloudflare `vscan` DIHAPUS dari akun;
  service systemd `vscan.service` & `cloudflared-vscan.service` di-stop /
  disable / unit dihapus; binary `cloudflared`, `~/.cloudflared/`,
  `~/.config/vscan/` (env Neon) dihapus; proses di :3000/:5353 & log /tmp
  dibersihkan.
- **Repo**: folder `scripts/selfhost/` (setup.sh, unit service, dns-proxy.py)
  dihapus; section self-host di README diganti catatan rollback singkat.
- **Status akhir**: hanya **Vercel + Neon** yang dipakai (seperti sebelum
  percobaan). Latensi 2–7 dtk di Vercel Hobby tetap ada; bila butuh lebih
  cepat → VPS sungguhan (bukan komputer rumah).

### ⌨️ Fix: Enter spam (auto-repeat) + keyboard nyangkut tiap scan (2026-08-06)
- **Gejala baru**: setelah scan barcode, POS menerima **Enter berulang**
  (spam) dan tombol Enter fisik ikut mati. Server sudah diverifikasi aman
  (claim-on-read atomic — tidak ada pengiriman ulang), jadi ini murni di
  sisi pengetikan agent.
- **Akar**: `pyautogui.press("enter")` mengirim keydown+keyup nyaris tanpa
  jeda → OS kadang meng-coalesce sehingga **keyup Enter hilang** → tombol
  tertinggal "tertekan" → auto-repeat (spam Enter) + Enter fisik ditelan.
- **Fix** di `scanner-agent/agent.py`:
  - Enter ditekan **eksplisit**: `keyDown("enter")` → tahan **80 ms** →
    `keyUp("enter")` (jauh di bawah batas auto-repeat ~500 ms, jadi tanpa
    spam; cukup lama agar aplikasi melihat penekanan yang jelas).
  - `release_keys()` kini dipanggil **sebelum** mengetik (bersihkan sisa
    scan sebelumnya) + **sesudahnya** (finally) + tetap saat start/exit.
  - Jeda settle 50 ms setelah ketik barcode sebelum Enter, interval ketikan
    0,01 → 0,02 s.
- **Update komputer kasir**: jalankan ulang curl install (idempoten).
  Workaround cepat: Shift 5×, klik tombol di On-Screen Keyboard, atau restart.

### ⌨️ Fix: keyboard fisik "nyangkut" setelah agent berhenti (2026-08-06)
- **Gejala**: setelah agent berhenti (Ctrl+C / ditutup / auto-start mematikan
  proses) kadang di tengah pengetikan, tombol di keyboard fisik — mis. Enter —
  tidak berfungsi; baru jalan setelah menekan tombol di **on-screen/virtual
  keyboard**.
- **Akar**: proses berhenti saat sebuah tombol masih "tertekan" (key-down tanpa
  key-up terkirim) → OS menganggap tombol itu masih ditekan → penekanan fisik
  berikutnya ditelan. On-screen keyboard mengirim siklus key baru sehingga
  state ter-reset.
- **Fix** di `scanner-agent/agent.py`:
  - `release_keys()` — kirim key-up untuk semua tombol potensial (enter,
    shift, ctrl, alt, win, tab, space, dll); dipanggil saat (1) agent **mulai**
    (reset dari sesi/crash sebelumnya), (2) **akhir tiap ketikan**
    (try/finally), (3) **saat keluar** (atexit + SIGINT/SIGTERM).
  - Interval ketikan 2 ms → 10 ms untuk keandalan.
- **Update komputer kasir**: jalankan ulang curl install (idempoten,
  `agent.env` dipertahankan). Workaround cepat: tekan tombol mana pun di
  On-Screen Keyboard, Shift 5×, atau restart.

### 🏠 Self-host: Cloudflare Tunnel + systemd (2026-08-05)
- **Keputusan user**: pindah dari Vercel ke server sendiri untuk latensi
  (fungsi Vercel Hobby di AS + Neon Singapura = 2–7 dtk; tak bisa ganti
  region di plan Hobby).
- **App produksi** jalan di server sendiri: port 3000, systemd `--user`
  (`vscan.service`, auto-restart). Env Neon di `~/.config/vscan/env`
  (di luar repo, tanpa secret ke git).
- **Cloudflare Tunnel** (`cloudflared` binary tanpa root):
  `vscan.boundless.my.id` → `localhost:3000` — tidak perlu root/port 80,
  tidak perlu ubah TLS mode. DNS di-route otomatis oleh tunnel.
- `scripts/selfhost/`: `setup.sh` (idempoten) + unit `vscan-app.service` &
  `cloudflared-vscan.service`.
- **Latensi terukur di server baru**: poll ~0,2 dtk (vs 1,6 dtk), push ~0,3
  dtk (vs 1,5–5 dtk), E2E scan→POS ~0,5–1 dtk.
- ⚠️ **DIBATALKAN & di-rollback ke Vercel** (2026-08-06): mesin ini ternyata
  komputer rumah (bukan VPS) — akses masuk diblokir & ISP memblokir protokol
  Cloudflare Tunnel. Semua artefak self-host sudah dibersihkan (lihat entri
  terbaru di atas).

### ⚡ Long-poll di /api/poll — barcode terdeteksi ~0,3 dtk (2026-08-05)
- **Masalah**: delay scan→POS ~2–4,5 dtk. Fungsi Vercel Hobby di-pin ke
  `iad1` (US) & tidak bisa ganti region (fitur Pro), Neon di Singapura →
  tiap request ~1,6 dtk (2× lintas Pasifik). Siklus agent lama = poll
  1,6 dtk + sleep 1 dtk = barcode baru ketahuan paling cepat 2,6 dtk.
- **Fix**: `/api/poll?longpoll=1` — server menahan koneksi 6 dtk & cek DB
  tiap 250 ms; membalas seketika begitu barcode masuk (batas fungsi Hobby
  10 dtk → hold 6 dtk aman). Agent memakai long-poll: kosong → jeda 0,3 dtk
  (bukan 1 dtk); berhasil → jeda interval normal. Tanpa param → perilaku
  lama (balas seketika), kompatibel mundur.
- **Hasil**: deteksi barcode 2,6 dtk → **~0,3 dtk**; total dirasakan turun ke
  ~1,8–2 dtk (dominasi push network 1,5 dtk yang tak bisa dihilangkan tanpa
  region Pro / self-host dekat kasir). Beban request turun ~85%
  (1 koneksi tahan ~6 dtk vs request tiap detik).
- **Update kasir**: jalankan ulang curl install (idempoten).

### 🔓 Fix: 403 Cloudflare — agent pakai User-Agent browser (2026-08-05)
- **Gejala**: agent terus log "Polling ditolak (403)" meski sesi aktif &
  `/api/poll` tidak punya jalur 403 lagi (kode lama sudah dihapus).
- **Akar masalah**: `vscan.boundless.my.id` di belakang **Cloudflare**, dan
  Cloudflare memblokir User-Agent default Python (`Python-urllib/x.y` — bot
  detection). Terverifikasi live: 10/10 poll UA Python → 403; 5/5 poll UA
  browser → 200 (header `server: cloudflare`, `cf-ray`).
- **Fix**: `fetch_scans` di `agent.py` mengirim header `User-Agent` browser
  (Chrome) tiap request.
- **Update komputer kasir**: jalankan ulang perintah curl install yang sama
  (instalasi idempoten — `agent.py` ditimpa versi terbaru, `agent.env` kode
  pairing tetap dipertahankan).

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

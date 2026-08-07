# AGENTS.md — Panduan Agent AI untuk VScan

Dokumen ini untuk agen AI (dan kontributor) yang mengerjakan repo ini. **Baca
PROGRESS.md dulu** — itu catatan status & riwayat keputusan terbaru; lanjutkan
dari status terakhir di sana.

## Apa ini

VScan = **HP jadi scanner barcode nirkabel** untuk proyek/POS apa pun. HP
menscan barcode → VScan (server) → **Scanner Agent** di komputer kasir mengetik
barcode + Enter ke OS persis seperti scanner USB (tanpa mengubah kode POS),
atau proyek mengambil via polling `/api/poll`.

```
HP (kamera) ──push──► VScan (vscan.boundless.my.id) ──poll──► Komputer kasir
                         │ DB Neon: ScanSession + PendingScan   ├─ Scanner Agent (ketik ke OS)
                         └──────────────────────────────────────┴─ atau polling /api/poll
```

- **Live**: https://vscan.boundless.my.id · Deploy: **Vercel** (auto-deploy dari `main`)
- **DB**: **Neon Postgres** (`DATABASE_URL` di-set di Vercel)
- ⚠️ Self-host (Cloudflare Tunnel) **sudah dicoba & di-rollback** — mesin rumah
  tidak bisa akses masuk; jangan usulkan lagi tanpa alasan kuat.

## Stack & konvensi

- **Next.js 16 (App Router, `src/`) + TypeScript + Tailwind v4 + lucide-react + sonner**
- **Prisma 6** (PostgreSQL). Migrasi: `pnpm db:migrate` (dev) / `pnpm db:deploy` (produksi).
- Bahasa UI & komentar: **Bahasa Indonesia** (konsisten dengan seluruh codebase).
- Semua halaman & komponen interaktif pakai `"use client"`. Route API pakai
  `export const dynamic = "force-dynamic"` (data real-time, hindari cache).
- **Jangan menambah dependensi tanpa kebutuhan nyata** — proyek ini minimalis.
- Konfigurasi: `pnpm install` → `cp .env.example .env` (isi `DATABASE_URL`) →
  `pnpm dev` di `http://localhost:3000`. Build: `pnpm build` · lint: `pnpm lint`.

## Arsitektur & alur data

- **Sesi pairing** (`ScanSession`): label + kode 6 karakter (alfabet tanpa
  karakter ambigu `0/O/1/I/L`), berlaku **12 jam**, di-auto-extend **+12 jam**
  selama ada yang aktif polling (tersisa < 6 jam). Status `active | closed`.
- **Antrean barcode** (`PendingScan`): status `pending | polled | delivered |
  failed`, maks **200 pending/sesi**. `push` (HP) → simpan `pending` → `poll`
  (kasir) meng-*claim* → `polled`. **Claim-on-read atomic** (transaction +
  `updateMany` dengan guard status) — dua poller tidak mendapat barcode sama.
- **Long-poll** (`/api/poll?longpoll=1`): server menahan koneksi 6 dtk, cek DB
  tiap 250 ms, balas seketika saat barcode masuk (batas fungsi Vercel Hobby
  10 dtk). Tanpa param → perilaku lama (balas seketika).
- **Rate limit** `POST /api/session`: 20 sesi/jam/IP (in-memory, per instance
  Vercel). Cookie `vscan_owner` (HttpOnly, 1 tahun) menandai sesi milik browser.
- **Model keamanan (disengaja)**: kode pairing tampil publik & `push`/`poll`
  terbuka dengan kode saja → siapa pun bisa push ke sesi mana pun, dan
  `PATCH close` (**hard delete** sejak 2026-08-07) bisa dipanggil siapa pun
  yang tahu `id` sesi. Aman utk jaringan kasir internal; kalau dipakai
  publik terbuka, pertimbangkan PIN pair.

### API ringkas

| Endpoint | Fungsi |
|---|---|
| `POST /api/session` `{label}` | Daftar proyek → `201 {id, code, label, expiresAt}` + cookie owner |
| `GET /api/session` | List publik semua sesi aktif `{sessions:[{..., owned}]}` |
| `PATCH /api/session` `{id, action}` | `extend` (hanya owner, 403 utk non-owner) / `close` = **hard delete** (hapus permanen sesi + antrean barcode via cascade, boleh siapa pun) |
| `POST /api/check` `{code}` | Validasi kode HP → `{valid, reason, expiresAt?}` |
| `POST /api/push` `{code, barcode}` | Simpan scan HP → `201 {ok, id}` (validasi barcode `[A-Za-z0-9]{3,64}`) |
| `GET /api/poll?code=KODE&longpoll=1` | Claim-on-read barcode → `{scans:[{id, barcode}]}` + auto-extend |
| `GET /api/agent/download` | ZIP `vscan-agent.zip` dari folder `scanner-agent/` (whitelist tetap) |

## Scanner Agent (`scanner-agent/agent.py`)

Python murni (std-lib + pyautogui), polling long-poll → ketik barcode + Enter
ke OS. **Ini bagian paling rapuh proyek — riwayat bug panjang soal Enter.**

- **Versi**: `AGENT_VERSION = "2.5"` (tampil di banner startup). **Naikkan
  patch tiap perubahan perilaku**; update kasir = jalankan ulang curl install
  (idempoten, `agent.env` dipertahankan). Cek versi via banner.
- **Input kode pairing tanpa edit manual (v2.5+)**: saat start tanpa kode &
  stdin interaktif, agent meminta kode, memvalidasi ke `POST /api/check`,
  lalu **menyimpan otomatis ke `agent.env`** (`save_code_to_env` — baris lain
  dipertahankan). Non-tty (auto-start) → prompt dilewati, error lama tetap.
- **Auto-start Linux (v2.5)**: `install-autostart-linux.sh` default mode
  **senyap** — `.desktop` `Terminal=false` menjalankan `start-agent.sh
  --autostart` (log ke `agent.log`, retry 8× jeda 15 dtk saat login, berhenti
  bila kode pairing kosong). Opsi `--terminal` (jendela log live) &
  `--uninstall`. `agent.env`/`agent-state.json`/`agent.log` di-gitignore
  (per-mesin).
- **Backend ketik dipilih otomatis**:
  - **Wayland** → `ydotool` (uinput): ketik `type --key-delay 10`, Enter pakai
    `key -d 80 28` (down→jeda→up) + safety-net `key 28:0`. `_ydotool_ready()`
    mengecek daemon **benar-benar merespons** (bukan cuma socket). Gagal →
    fallback **permanen** ke pyautogui (bukan coba ulang tiap scan).
  - **X11 / Windows** → pyautogui (X11: auto-detect Xauthority; Windows:
    Enter via **scancode SendInput** `KEYEVENTF_SCANCODE`, bukan VK code).
- **Anti "keyboard nyangkut"** (masalah inti, jangan di-regresi): Enter ditahan
  eksplisit `ENTER_HOLD_S=0.08` (keyDown→tahan→keyUp; `press()` di-coalesce OS
  → keyup hilang → auto-repeat spam + Enter fisik mati). `release_keys()`
  dipanggil saat start, akhir tiap ketikan (finally), dan keluar
  (atexit + SIGINT/SIGTERM). Verifikasi Enter terlepas setelah scan:
  Windows `GetAsyncKeyState`, X11 `XQueryKeymap` (koneksi X di-cache), dengan
  keyup ulang maks 5×.
- **PENTING**: agent harus jalan di **sesi desktop** kasir (bukan SSH tanpa
  layar). User-Agent browser wajib dikirim (Cloudflare memblokir
  `Python-urllib` → 403).
- Test cepat: `python agent.py --code KODE --dry-run` (tidak mengetik).
  **Smoke test** (mock server lokal, tanpa internet): `pnpm smoke:agent`
  atau `python3 scanner-agent/smoke_test.py` — verifikasi syntax, banner
  versi, round-trip barcode via /api/poll, dan exit bersih. Jangan
  me-regresi Enter fix saat mengubah agent.py.

## Workflow yang disepakati

1. Baca **PROGRESS.md** → lanjut dari status terakhir. Jika ada keputusan
   penting (arsitektur, hosting, fitur besar), tanya user dulu.
2. Setelah perubahan: perbarui **PROGRESS.md** (entri baru di atas) dan
   **README.md** bila perilaku publik berubah.
3. Commit dengan pesan konvensi repo:
   `fix(agent) vX.Y: ...` / `feat(...): ...` / `perf(...)` / `chore(...)` —
   Indonesia, jelaskan akar masalah + fix.
4. Validasi sebelum commit: `pnpm build` + `pnpm lint` (web),
   `pnpm smoke:agent` (agent, dry-run).
5. Push ke `main` → Vercel auto-deploy. Perubahan agent = user harus re-install
   di kasir (curl one-liner).

## Gotcha yang sering muncul

- **Cloudflare 403** pada request tanpa User-Agent browser (Python urllib).
- **Enter spam / Enter fisik mati** — hampir selalu keyup hilang di sisi
  pengetikan agent; jangan asumsikan masalah di server (claim-on-read sudah
  atomic & teruji).
- **Vercel Hobby** di-pin region `iad1` (US) + Neon Singapura → latensi
  ~1,5–7 dtk pada push network; long-poll sudah menutupi sisi deteksi.
- Jangan restore fitur webhook (sudah dihapus total, alur murni push→poll).

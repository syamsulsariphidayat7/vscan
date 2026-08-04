# PROGRESS — VScan

## Fase Aktif

**VScan = layanan mandiri** (2026-08-05): HP jadi scanner barcode wireless, dan proyek apa pun
(POS apotek, toko, kafe, dll.) menerima hasil scan **tanpa mengubah kode proyek** — cukup
**mendaftarkan URL tujuan** (webhook) atau polling. Server VScan punya **database sendiri**
(Neon di produksi, Postgres lokal di dev). Production live di Vercel: **https://vscan-alpha.vercel.app**
(sementara pakai domain default; env `DATABASE_URL` Neon **belum di-set** — menunggu user membuat
Neon + migrasi). **Menunggu user**: (1) buat project Neon → set `DATABASE_URL` di Vercel, (2)
`pnpm db:deploy` ke Neon (migrasi terbaru `add_owner_id` juga ikut), (3) buka `/register` untuk
kode pairing pertama.

## Riwayat Fase

### UX — Simplifikasi Landing (2026-08-05) [✔]
- **Indikator aktif di daftar**: tiap sesi aktif ditandai titik hijau berdenyut + badge
  "Aktif" (landing `/` & `/register`); sesi yang sedang dipakai (kode terakhir di HP)
  disorot + badge "Terhubung". README: panduan lengkap deploy Neon (pooled/non-pooled,
  env Vercel, migrate deploy, troubleshooting)
- **Landing `/` dirombak jadi super sederhana**: tombol besar **Scan** (pakai kode terakhir /
  scan QR pairing bila belum ada kode), tombol **Daftarkan Proyek / POS** (modal), dan daftar
  **"Proyek terhubung"** — semua sesi aktif, tinggal KLIK untuk pair langsung (auto-refresh
  15 dtk; item dari browser sendiri ditandai "milik saya")
- **`GET /api/session` = list publik semua sesi aktif** (id, code, label, status, expiresAt,
  createdAt + flag `owned` dari cookie vscan_owner). Info sensitif (webhookUrl, webhookToken)
  TIDAK diekspos. `/register` memakai list yang sama tapi tombol kelola (perpanjang/tutup)
  hanya muncul untuk sesi `owned: true`
- **Modal pendaftaran disederhanakan**: hanya 2 field — nama proyek/POS + URL tujuan
  (contoh `https://apotek.boundless.my.id/hook`); field token rahasia dihapus dari UI,
  kode pairing dibuat otomatis di backend
- **Catatan keamanan (tradeoff disengaja)**: karena kode pairing kini tampil di list publik
  dan `/api/push` hanya butuh `{code, barcode}`, siapa pun yang bisa memanggil `GET /api/session`
  bisa menyuntikkan barcode ke sesi mana pun & melihat label proyek. Ini persis permintaan user
  (klik-untuk-pair); aman untuk jaringan kasir internal, perlu dipikirkan ulang bila dipakai
  publik terbuka (mis. tambah PIN pair)
- **Diperbaiki dari review**: teks kontrak di modal tak lagi menyebut token (konsisten dgn
  form tanpa token); pesan fallback QR di landing kini menunjuk ke daftar proyek (bukan
  "ketik kode" yang sudah tidak ada)
- **E2E (dev server + curl + browser)**: buat 2 sesi dari browser berbeda → GET dari browser A
  menampilkan 2 sesi (owned benar); klik "Apotek Sehat" → `/scan?code=…`; modal daftar punya
  tepat 2 input, tanpa field token; data uji dibersihkan
- Validasi: lint bersih, build sukses

### UX — User-Friendly Pass (2026-08-05) [✔]
- **Pendaftaran proyek = modal (tidak pindah halaman)**: komponen bersama `RegisterModal`
  (`src/components/register-modal.tsx`) berisi form (label + URL + token) → tampilan sukses
  (kode besar + QR + salin + kontrak webhook). Dipakai di landing `/` (link "Daftarkan proyek"
  kini tombol yang membuka modal, tanpa navigasi) DAN halaman `/register` (kini hanya header +
  tombol "Buat Kode Pairing Baru" + daftar sesi). Modal tutup via X / backdrop / Escape /
  Selesai; scroll body terkunci; animasi fade/pop; state di-reset tiap dibuka
- **Tampilan sesi baru sebagai modal**: halaman `/register` tidak lagi berpindah ke layar penuh
  "Sesi siap!" — kode pairing + QR tampil di **modal overlay** (backdrop blur, animasi
  fade/pop, tutup via tombol X / klik backdrop / tombol Escape / tombol Selesai; kunci scroll
  body saat terbuka). Form tetap terlihat di belakang modal
- **QR code pairing**: halaman `/register` menampilkan QR (lib `qrcode`) berisi kode pairing —
  kasir tidak perlu ketik; landing `/` punya mode **Scan QR** (pakai `useBarcodeDetector` yang
  sama, format `qr_code`) → ketik manual tetap tersedia sebagai fallback
- **Auto-submit kode**: input kode di landing langsung cek begitu 6 karakter lengkap (guard ref
  mencegah submit ganda; di-reset saat input berubah)
- **Kelola sesi sendiri**: `ScanSession.ownerId` (migrasi `add_owner_id`) + cookie `vscan_owner`
  (httpOnly, SameSite=Lax, 1 tahun). API baru di `/api/session`: `GET` (daftar sesi milik
  browser, take 50) & `PATCH { id, action: extend|close }` (perpanjang 12 jam / tutup; 403 bila
  bukan milik browser). `/register` menampilkan daftar sesi aktif dengan tombol salin/perpanjang/
  tutup + muat ulang
- **Scan page**: **Wake Lock** (layar tidak mati saat scan, re-acquire on visibilitychange),
  **senter/torch** (`applyConstraints advanced torch`, deteksi dukungan + fallback), **countdown
  sisa sesi** (dari `expiresAt` `/api/check`, tick 1 dtk), **log scan persist** ke localStorage
  (per-kode; id lanjut dari max id agar tak bentrok; tombol Bersihkan hapus permanen)
- **Aksesibilitas**: hapus `userScalable:false`/`maximumScale` (zoom diperbolehkan), tema ikut
  `prefers-color-scheme` via `next/script` beforeInteractive (tidak lagi paksa dark), label suara
  jelas (ikon Volume2/VolumeX + aria-pressed), tombol senter disabled saat tidak didukung
- **Perbaikan dari code review**: (1) sesi pertama tanpa cookie kini tetap masuk daftar (ownerId
  dibangkitkan SEBELUM create & dipakai utk cookie), (2) auto-submit tidak dobel API call, (3) id
  log tidak bentrok dengan entri lama
- **E2E (dev server + curl)**: GET tanpa cookie → set cookie + `[]`; POST → 201; GET → sesi
  muncul; PATCH extend → aktif + expiresAt baru; PATCH close → closed; PATCH tanpa cookie → 403;
  push ke sesi tertutup → 404; data uji dibersihkan
- Validasi: lint bersih, build sukses. Catatan keamanan: kepemilikan sesi berbasis cookie
  (bisa dipalsukan utk menutup sesi orang lain) — dampak rendah utk skala ini, pantau bila
  dipakai publik

### VScan Mandiri — Server + DB Sendiri, Integrasi via URL (2026-08-05) [✔]
- **Keputusan user (mengubah arah)**: VScan TIDAK boleh bergantung pada proyek lain (semula
  numpang DB & API apotek). Konsep baru: **HP = client/scanner · VScan server = penampung scan ·
  proyek apa pun konek dengan mendaftarkan URL tujuan** (\"daftarkan via url\")
- **Database mandiri** (`prisma/schema.prisma` + migrasi `init`): `ScanSession` (code unik 6
  karakter, label, webhookUrl, webhookToken, status active/closed, expiresAt 12 jam) +
  `PendingScan` (sessionId, barcode, status pending/delivered/failed/polled, attempts,
  lastError, deliveredAt) — DB lokal `vscan`, produksi Neon
- **API server**:
  - `POST /api/session` — daftarkan proyek (label + URL tujuan + token) → `201 { code, expiresAt }`
  - `POST /api/check` — validasi kode HP (`valid`/`reason: invalid|not_found|inactive|expired`)
  - `POST /api/push` — terima scan HP → simpan + kirim webhook → `201`
  - `GET /api/poll?code=&token=` — fallback ambil barcode, claim-on-read atomic (pending + failed)
- **Webhook**: `POST { code, scanId, barcode, token, timestamp }` ke URL tujuan; timeout 3 dtk;
  gagal → status `failed` (tetap bisa diambil via poll — tidak ada data nyangkut)
- **UI**: halaman `/register` (form label + URL + token → kode pairing besar + kontrak webhook +
  tombol salin); landing `/` (input kode HP + tautan daftar proyek); `/scan` (kamera + log +
  banner sesi mati + input manual)
- **Client HP**: kamera `BarcodeDetector` (EAN/UPC/CODE128/QR), haptic + beep, log per-scan,
  kode terakhir di localStorage, re-scan barcode identik (gap detection), status sesi mati
- **Keamanan (review)**:
  - **SSRF dicegah**: `isSafeWebhookUrl` menolak localhost / IP privat (10/8, 172.16/12,
    192.168/16, 169.254/16, 127/8, CGNAT) / link-local IPv6 / `*.local`, `*.internal`,
    `metadata.google.internal`
  - **Rate limit** pembuatan sesi: 20/jam per IP (in-memory)
  - Poll wajib token bila sesi memakai token (403 jika salah/kosong)
  - Panjang label/URL/token dibatasi; barcode 3–64 alfanumerik; antrean maks 200/sesi
- **E2E terverifikasi (dev server + receiver webhook nyata)**: daftar proyek → check valid/salah →
  push → **webhook menerima** `{code, scanId, barcode, token, timestamp}` (status delivered) →
  sesi tanpa webhook → push 2 barcode → poll (403 tanpa/salah token, 2 barcode FIFO, claim-on-read,
  poll kedua kosong) → push kode salah 404 → webhook gagal → scan tetap ter-poll → SSRF localhost/
  IP privat/metadata ditolak 400 → data uji dibersihkan
- Validasi: lint bersih, build sukses (route `/api/session` `/api/check` `/api/push` `/api/poll` +
  `/register` `/scan`), code review (semua temuan diperbaiki: SSRF, dead code, failed unrecoverable,
  timeout 5→3 dtk, rate limit)

### Versi Awal — Bergantung pada Apotek (DIGANTI 2026-08-05)
- ~~VScan sebagai klien PWA yang numpang DB & API apotek (`/api/vscan/*`) + proxy server VScan ke
  apotek~~ → **DIBATALKAN** atas keputusan user (lihat entri \"VScan Mandiri\" di atas): VScan harus
  mandiri, proyek mana pun cukup daftar URL tujuan. Riwayat lengkap arsitektur lama tersimpan di
  commit git (apotek: 00ea696 → 8f234c5; vscan: a19b183 → 4b8f7c6)

### Init & Deploy Awal (2026-08-04) [✔]
- Proyek Next.js 16 (App Router) + Tailwind v4 + TypeScript + PWA (manifest + service worker)
  + lucide-react + sonner; struktur `src/app` (landing/scan), `src/hooks/use-barcode-detector`,
  `src/lib/api`
- Repo GitHub `syamsulsariphidayat7/vscan` dibuat & di-push (SSH); project Vercel `vscan`
  auto-deploy dari `main` → https://vscan-alpha.vercel.app
- `pnpm-workspace.yaml`: + `packages: ['.']` (kompatibel pnpm 9+) + `allowBuilds` prisma

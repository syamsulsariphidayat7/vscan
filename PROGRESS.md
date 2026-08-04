# PROGRESS — VScan

## Fase Aktif

**VScan = layanan mandiri** (2026-08-05): HP jadi scanner barcode wireless, dan proyek apa pun
(POS apotek, toko, kafe, dll.) menerima hasil scan **tanpa mengubah kode proyek** — cukup
**mendaftarkan URL tujuan** (webhook) atau polling. Server VScan punya **database sendiri**
(Neon di produksi, Postgres lokal di dev). Production live di Vercel: **https://vscan-alpha.vercel.app**
(sementara pakai domain default; env `DATABASE_URL` Neon **belum di-set** — menunggu user membuat
Neon + migrasi). **Menunggu user**: (1) buat project Neon → set `DATABASE_URL` di Vercel, (2)
`pnpm db:deploy` ke Neon, (3) buka `/register` untuk kode pairing pertama.

## Riwayat Fase

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

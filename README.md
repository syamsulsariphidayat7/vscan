# VScan — Scanner Barcode HP untuk Proyek Apa Pun

**VScan adalah layanan mandiri**: HP menjadi scanner barcode wireless, dan **proyek apa pun**
(POS apotek, toko, kafe, aplikasi lain) bisa menerima hasil scan **tanpa mengubah kode proyek**
untuk urusan pairing — cukup **mendaftarkan URL tujuan** ke VScan.

```
┌──────────────────┐   ketik kode + scan    ┌─────────────────────────────┐   POST webhook   ┌──────────────────┐
│  HP (client/PWA) │ ─────────────────────► │   VSCAN SERVER (mandiri)     │ ────────────────► │  PROYEK APA PUN  │
│  kamera          │  POST /api/push        │  ├─ Database sendiri (Neon) │   {code, scanId,  │  URL yang         │
│  BarcodeDetector │                        │  │   scan_sessions          │    barcode, token,│  didaftarkan      │
└──────────────────┘                        │  │   pending_scans           │    timestamp}     └──────────────────┘
                                            │  └─ kirim ke URL tujuan     │
                                            └──────────────┬──────────────┘
                                                           │ fallback polling
                                                           ▼
                                              GET /api/poll?code=…&token=…
```

## Alur

1. **Daftarkan proyek**: buka `/register` → isi nama proyek + **URL tujuan** (+ token rahasia opsional)
   → VScan membuat **kode pairing 6 karakter** (berlaku 12 jam) → tampilkan di layar kasir.
2. **HP scan**: buka VScan di HP → ketik kode → arahkan kamera ke barcode.
3. **VScan terima**: barcode disimpan (`pending_scans`) lalu **dikirim ke URL tujuan** via
   `POST { code, scanId, barcode, token, timestamp }`.
4. **Proyek terima**: URL tujuan menerima barcode (atau polling `GET /api/poll?code=…&token=…`
   bila tidak memakai webhook) → diproses sesuai kebutuhan proyek.

> HP hanya butuh kode pairing — tidak tahu proyek apa yang menerima. Satu VScan melayani
> banyak proyek sekaligus (banyak sesi).

## API

| Endpoint | Auth | Deskripsi |
|---|---|---|
| `POST /api/session` | — | Daftarkan proyek. Body `{ label, webhookUrl?, webhookToken? }` → `201 { id, code, expiresAt }` |
| `POST /api/check` | — | Validasi kode HP. Body `{ code }` → `{ valid, reason: invalid\|not_found\|inactive\|expired }` |
| `POST /api/push` | kode pairing | Terima scan HP. Body `{ code, barcode }` → simpan + kirim webhook → `201 { ok, id, barcode }` |
| `GET /api/poll` | `?code=` + `&token=` | Ambil barcode (claim-on-read, tanpa webhook). Response `{ scans: [{ id, barcode }] }` |

**Kontrak webhook** (`POST webhookUrl`): `{ code, scanId, barcode, token, timestamp }` — proyek
memverifikasi `token` (bila diisi) lalu memproses `barcode`. Sesi tanpa `webhookUrl` → proyek
memakai `/api/poll` (wajib sertakan `token` bila sesi memakainya).

## Menjalankan Lokal

Prasyarat: Node ≥ 20, pnpm, PostgreSQL lokal.

```bash
pnpm install
createdb vscan                              # atau pakai DB lain, sesuaikan .env
cp .env.example .env                        # set DATABASE_URL
pnpm db:migrate                             # prisma migrate dev (buat tabel)
pnpm dev                                    # http://localhost:3000
```

Uji cepat:

```bash
# Daftarkan proyek (URL tujuan = receiver kamu)
curl -X POST localhost:3000/api/session -H 'Content-Type: application/json' \
  -d '{"label":"Kasir 1","webhookUrl":"http://localhost:3999/hook","webhookToken":"rahasia"}'

# Scan dari HP
curl -X POST localhost:3000/api/push -H 'Content-Type: application/json' \
  -d '{"code":"<KODE>","barcode":"8991111111111"}'

# Tanpa webhook → polling
curl "localhost:3000/api/poll?code=<KODE>&token=rahasia"
```

## Env Variables

| Variable | Wajib | Deskripsi |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres VScan sendiri. Lokal: `postgresql://postgres@localhost:5432/vscan` |

## Deploy: GitHub → Vercel + Neon

1. **Push ke GitHub** (sudah: `git@github.com:syamsulsariphidayat7/vscan.git`).
2. **Neon** (console.neon.tech): buat project → salin `DATABASE_URL` (koneksi **pooled** untuk
   runtime, **non-pooled** untuk migrasi).
3. **Vercel**: Add New Project → repo `vscan` → Environment Variables:
   - `DATABASE_URL` = URL Neon
4. **Migrasi DB**: lokal/CI jalankan `pnpm db:deploy` (`prisma migrate deploy`) dengan URL
   non-pooled terhadap database Neon.
5. Push ke `main` → auto-deploy. Buka `/register` untuk membuat kode pairing pertama.

> PWA: buka situs sekali lalu *Add to Home Screen* — VScan bisa dipakai seperti aplikasi.

## Struktur

```
vscan/
├── prisma/schema.prisma      # ScanSession + PendingScan (DB mandiri)
├── src/
│   ├── app/
│   │   ├── page.tsx          # Landing HP: input kode pairing
│   │   ├── register/page.tsx # Daftarkan proyek (label + URL tujuan + token) → kode
│   │   ├── scan/page.tsx     # Scanner kamera + log + status sesi
│   │   ├── api/
│   │   │   ├── session/      # POST — daftar proyek
│   │   │   ├── check/        # POST — validasi kode HP
│   │   │   ├── push/         # POST — terima scan + kirim webhook
│   │   │   └── poll/         # GET  — ambil barcode (fallback)
│   │   ├── layout.tsx / manifest.ts / globals.css
│   ├── hooks/use-barcode-detector.ts
│   └── lib/                  # db.ts (Prisma), vscan.ts (inti), api.ts (klien)
├── public/sw.js / icon.svg
└── .env.example
```

## Stack

Next.js 16 (App Router) · Prisma 6 · PostgreSQL (Neon) · Tailwind v4 · TypeScript ·
BarcodeDetector API (native) · PWA (service worker) · Vercel · lucide-react · sonner

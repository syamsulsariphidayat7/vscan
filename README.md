# VScan — Scanner Barcode HP → POS

Proyek portofolio **Next.js + GitHub + Vercel**: ubah HP jadi scanner barcode wireless untuk POS
[aplikasi apotek](https://github.com/) (repo `apotek`). Kasir cukup membuat **kode pairing** di POS,
HP membuka VScan, memasukkan kode, lalu mengarahkan kamera ke barcode obat — barcode langsung
masuk keranjang POS secara otomatis.

## Arsitektur

```
┌─────────────┐   scan barcode    ┌──────────────┐   POST /api/push (server VScan)   ┌──────────────┐   POST /api/vscan/push   ┌──────────────┐
│   HP (VScan) │ ─────────────────▶ │  kamera HP    │ ────────────────────────────────▶ │  Next.js (Vercel) │ ─────────────────────────▶ │  API apotek   │
│  (PWA)       │                    │ BarcodeDetector│                                │  (proxy server)  │                          │ (Vercel)      │
└─────────────┘                    └──────────────┘                                └──────────────┘                          └──────┬───────┘
                                                                                                                                    │ PendingScan
                                                                                                                                    ▼
┌─────────────┐   GET /api/vscan/poll (auth) setiap 2 dtk   ┌──────────────┐
│  POS apotek  │ ◀─────────────────────────────────────────── │  PostgreSQL  │
└─────────────┘    auto-add ke keranjang                     └──────────────┘
```

- **Pairing berbasis kode**: POS membuat `ScanSession` (kode 6 karakter tanpa karakter ambigu, TTL 12 jam).
- **Pairing berbasis kode**: POS membuat `ScanSession` (kode 6 karakter tanpa karakter ambigu, TTL 12 jam).
- **Server proxy VScan**: browser HP HANYA memanggil route VScan sendiri — `POST /api/push` (terusan ke
  `POST /api/vscan/push` apotek) dan `POST /api/check` (validasi kode via `/api/vscan/check`). CORS apotek
  tidak relevan; base URL apotek disembunyikan dari browser (`src/lib/server.ts`).
- **Push**: `POST /api/push` cukup kode pairing — HP tidak perlu login apotek.
- **Poll (POS)**: `GET /api/vscan/poll` terautentikasi, *claim-on-read* (barcode langsung ditandai
  consumed agar tidak dobel diproses), POS polling tiap 2 detik lalu memanggil handler barcode yang
  sama persis dengan scanner USB.
- **Scanner kamera**: native [Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)
  (`BarcodeDetector`, format EAN/UPC/CODE128/QR) dengan fallback input manual. Tanpa dependency pihak ketiga.

## Struktur

```
vscan/
├── src/
│   ├── app/
│   │   ├── page.tsx        # Landing: input kode pairing + validasi → /scan
│   │   ├── scan/page.tsx   # Scanner kamera + log scan + status sesi
│   │   ├── api/
│   │   │   ├── check/route.ts   # Server: validasi kode pairing (proxy apotek)
│   │   │   └── push/route.ts    # Server: terusan push barcode (proxy apotek)
│   │   ├── layout.tsx      # Metadata PWA (manifest, theme, viewport)
│   │   ├── manifest.ts     # Web App Manifest (standalone, ikon SVG)
│   │   └── globals.css     # Tailwind v4 + style scan line
│   ├── components/pwa-register.tsx   # Register service worker (hanya produksi)
│   ├── hooks/use-barcode-detector.ts # Hook kamera → BarcodeDetector
│   └── lib/
│       ├── api.ts          # Klien: pushBarcode() + checkPairingCode() → /api/*
│       └── server.ts       # Server-only: base URL apotek
├── public/
│   ├── sw.js               # Service worker: cache shell (offline siap)
│   └── icon.svg
└── .env.example
```

## Menjalankan Lokal

Prasyarat: Node ≥ 20, pnpm.

```bash
pnpm install
cp .env.example .env.local      # set NEXT_PUBLIC_APOTEK_API_URL
pnpm dev                        # http://localhost:3001
```

> Aplikasi apotek harus jalan di `http://localhost:3000` (lihat repo `apotek`), atau arahkan
> `NEXT_PUBLIC_APOTEK_API_URL` ke instance apotek lain.

### Alur uji manual

1. Login di POS apotek → halaman POS → klik ikon scanner di baris pencarian → **Buat Sesi**.
2. Buka VScan di HP (atau browser desktop) → masukkan kode pairing → **Hubungkan**.
3. Arahkan kamera ke barcode obat → barcode muncul di log VScan **dan** otomatis masuk keranjang POS.

## Env Variables

| Variable | Wajib | Deskripsi |
|---|---|---|
| `APOTEK_API_URL` | ✅ | Base URL API apotek (dipakai route server VScan). Produksi: `https://apotek.boundless.my.id` |

> Dipakai **server-side** (route `/api/check` & `/api/push`), jadi browser tidak perlu tahu URL
> apotek dan CORS apotek tidak relevan. Di Vercel: Settings → Environment Variables (non-`NEXT_PUBLIC`).

## Deploy: GitHub → Vercel

VScan dirancang sebagai proyek frontend murni (tidak butuh server/database sendiri) — paling mulus
di Vercel free tier.

1. **Buat repo GitHub** (public/private, mis. `vscan`), lalu push:
   ```bash
   git init && git add . && git commit -m "VScan: scanner barcode HP ke POS"
   git remote add origin https://github.com/<user>/vscan.git
   git branch -M main && git push -u origin main
   ```
2. **Import di Vercel**: vercel.com → *Add New → Project* → pilih repo `vscan` (atau `vercel link`
   dari CLI). Framework terdeteksi otomatis: **Next.js**.
3. **Environment variables** (Settings → Environment Variables, Production + Preview):
   - `APOTEK_API_URL` = `https://apotek.boundless.my.id`
4. **Deploy** — tiap push ke `main` auto-deploy, setiap PR dapat preview deployment otomatis.
5. **PWA** bekerja di HTTPS Vercel. Setelah buka situs sekali, VScan bisa **Add to Home Screen**
   (Android Chrome / iOS Safari) dan dibuka standalone seperti aplikasi.

### Catatan keamanan produksi

- Di repo apotek, set `VSCAN_CORS_ORIGIN` = origin VScan (mis. `https://vscan.vercel.app`) sehingga
  hanya origin VScan yang boleh push barcode.
- Kode pairing TTL 12 jam dan sesi hanya satu per user — tutup sesi dari panel POS setelah selesai.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · TypeScript · BarcodeDetector API (native) ·
Service Worker (PWA) · Vercel · lucide-react · sonner

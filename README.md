# VScan — HP jadi Scanner Barcode Nirkabel

VScan adalah layanan mandiri yang mengubah **HP menjadi scanner barcode** dan
mengirim hasilnya ke **proyek/POS apa pun** — tanpa mengubah kode proyek.
Barcode masuk otomatis lewat **Scanner Agent** di komputer kasir (ketik ke OS
seperti scanner USB), atau via webhook/polling.

```
HP (kamera) ──scan──► VScan (vscan.boundless.my.id) ──► Komputer kasir
                         │  DB Neon: sesi + antrean barcode   ├─ Scanner Agent (ketik ke POS)
                         └────────────────────────────────────┴─ atau webhook / polling
```

**Live:** https://vscan.boundless.my.id · Deploy: Vercel (auto dari `main`) · DB: Neon Postgres

---

## 🚀 Cara pakai singkat

### 1. Daftarkan proyek/POS (sekali, dari komputer)
- Buka **vscan.boundless.my.id** → klik **"Daftarkan Proyek / POS"**
- Isi **1 field**: nama proyek (mis. "Apotek Sehat")
- VScan membuat **kode pairing 6 karakter** (berlaku **12 jam**)

> URL tujuan tidak lagi ditanyakan di form — barcode diambil komputer kasir
> lewat polling (`/api/poll`). Webhook tetap didukung via API untuk proyek yang
> butuh menerima POST langsung (lihat bagian API).

### 2. Pasang Scanner Agent di komputer kasir (sekali, ~1 menit)
```bash
# Linux / macOS
curl -sSL https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent/install.sh | bash
```
```bat
:: Windows (Command Prompt)
curl -sSL https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent/install.ps1 -o %TEMP%\vscan-install.ps1 && powershell -ExecutionPolicy Bypass -File %TEMP%\vscan-install.ps1
```
Installer otomatis: install Python + paket sistem → download agent ke
`~/vscan-agent` (Linux) / `%USERPROFILE%\vscan-agent` (Windows) → minta kode
pairing → tulis `agent.env` → (opsional) auto-start → langsung jalan.
Panduan lengkap: [`scanner-agent/README.md`](scanner-agent/README.md).

### 3. Setiap hari
- **Komputer kasir**: buka POS, kursor di kolom pencarian (agent sudah jalan di background)
- **HP**: buka vscan.boundless.my.id → tombol **Scan** → pilih proyek dari daftar (sekali per shift)
- **Scan** barcode → **detik itu juga** barcode diketik + Enter di POS → barang masuk keranjang

> Kode pairing kadaluarsa 12 jam → buat kode baru di halaman depan, ganti
> `VSCAN_CODE` di `agent.env`, restart agent.

---

## 📄 Halaman

| Halaman | Fungsi |
|---|---|
| `/` (landing HP) | Tombol **Scan** besar (lanjut kode terakhir / scan QR pairing) + daftar **"Proyek terhubung"** (klik = pair, auto-refresh 15 dtk) + tombol daftarkan proyek + **download Scanner Agent** |
| `/register` | Daftar sesi pairing aktif — salin kode, **perpanjang / tutup** (hanya sesi milik browser ini) + **Download Scanner Agent** (ZIP untuk komputer kasir) |
| `/scan` | Kamera scanner + log + status sesi + senter + wake lock |

## 🔌 API

| Endpoint | Deskripsi |
|---|---|
| `POST /api/session` | Daftarkan proyek. Body `{ label, webhookUrl?, webhookToken? }` → `201 { id, code, expiresAt }` |
| `GET /api/session` | List **semua sesi aktif** (publik): `{ sessions: [{ id, code, label, status, expiresAt, owned }] }` — info sensitif (webhookUrl/token) tidak diekspos |
| `PATCH /api/session` | Kelola sesi milik sendiri. Body `{ id, action: "extend"\|"close" }` |
| `POST /api/check` | Validasi kode HP. Body `{ code }` → `{ valid, reason }` |
| `POST /api/push` | Terima scan HP. Body `{ code, barcode }` → simpan + kirim webhook → `201` |
| `GET /api/poll` | Ambil barcode (claim-on-read). `?code=` → `{ scans: [{ id, barcode }] }` — token tidak diperlukan (webhookToken hanya utk verifikasi webhook) |
| `GET /api/agent/download` | Unduh **Scanner Agent** sebagai ZIP (`vscan-agent.zip`) — isi = folder `scanner-agent/` di repo, selalu sinkron dengan versi terpasang |

**Webhook** (bila `webhookUrl` diisi): VScan kirim `POST { code, scanId, barcode, token, timestamp }`
ke URL tujuan; gagal → barcode tetap tersimpan dan bisa diambil via `/api/poll`.
Keamanan: URL `localhost`/IP privat ditolak (anti-SSRF), rate limit 20 sesi/jam/IP,
antrean maks 200 barcode/sesi.

---

## 💻 Menjalankan lokal

```bash
pnpm install
createdb vscan                       # Prasyarat: Node ≥20, pnpm, PostgreSQL
cp .env.example .env                 # set DATABASE_URL
pnpm db:migrate                      # prisma migrate dev
pnpm dev                             # http://localhost:3000
```

## 🚢 Deploy (Vercel + Neon)

1. Push ke `main` → Vercel auto-deploy.
2. **DB**: buat project **Neon** (console.neon.tech) → salin string **pooled**.
3. Vercel → project `vscan` → Settings → Environment Variables → `DATABASE_URL` = string pooled.
4. Migrasi sekali dari lokal (pakai string **non-pooled**):
   ```bash
   DATABASE_URL="postgresql://user:pass@ep-xxx...neon.tech/vscan?sslmode=require" pnpm db:deploy
   ```
5. Custom domain: Vercel → project `vscan` → **Domains** → tambah `vscan.boundless.my.id` (arahkan DNS/CNAME).

## 🗂 Struktur

```
vscan/
├── prisma/schema.prisma        # ScanSession + PendingScan
├── scanner-agent/              # Aplikasi komputer kasir (polling + ketik ke OS)
│   ├── agent.py                #   program utama
│   ├── install.sh / install.ps1#   installer otomatis (curl one-liner)
│   └── start-agent.bat/.sh     #   launcher sekali-klik
├── src/
│   ├── app/
│   │   ├── page.tsx            # Landing HP: Scan + daftar proyek + modal daftar
│   │   ├── register/page.tsx   # Kelola sesi pairing
│   │   ├── scan/page.tsx       # Scanner kamera
│   │   └── api/{session,check,push,poll,agent}/
│   ├── components/register-modal.tsx
│   ├── hooks/use-barcode-detector.ts
│   └── lib/{db,vscan,api}.ts
└── public/sw.js                # PWA (network-first untuk navigasi)
```

## 🧰 Stack

Next.js 16 (App Router) · Prisma 6 · PostgreSQL (Neon) · Tailwind v4 · TypeScript ·
BarcodeDetector API · PWA · Vercel · lucide-react · sonner

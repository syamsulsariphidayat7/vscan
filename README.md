# VScan — HP jadi Scanner Barcode Nirkabel

VScan adalah layanan mandiri yang mengubah **HP menjadi scanner barcode** dan
mengirim hasilnya ke **proyek/POS apa pun** — tanpa mengubah kode proyek.
Barcode masuk otomatis lewat **Scanner Agent** di komputer kasir (ketik ke OS
seperti scanner USB) atau via polling `/api/poll`.

```
HP (kamera) ──scan──► VScan (vscan.boundless.my.id) ──► Komputer kasir
                         │  DB Neon: sesi + antrean barcode   ├─ Scanner Agent (ketik ke POS)
                         └────────────────────────────────────┴─ atau polling /api/poll
```

**Live:** https://vscan.boundless.my.id · Deploy: Vercel (auto dari `main`) · DB: Neon Postgres

---

## 🚀 Cara pakai singkat

### 1. Daftarkan proyek/POS (sekali, dari komputer)
- Buka **vscan.boundless.my.id** → klik **"Daftarkan Proyek / POS"**
- Isi **1 field**: nama proyek (mis. "Apotek Sehat")
- VScan membuat **kode pairing 6 karakter** (berlaku **12 jam**)

> Barcode diambil komputer kasir lewat polling (`/api/poll`) — tidak ada URL
> tujuan/webhook.

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

> ⚡ **Latensi**: versi agent terbaru memakai **long-polling** — barcode
> terdeteksi ~0,3 dtk setelah di-scan (bukan menunggu siklus polling).
> Pastikan agent versi terbaru (jalankan ulang curl install di bawah).

### 🔄 Update agent ke versi terbaru
Jalankan ulang perintah curl install yang sama (idempoten — file agent ditimpa
versi terbaru, **`agent.env` kode pairing tetap dipertahankan**). Versi terbaru:
- mengirim User-Agent browser — tidak lagi kena blokir 403 Cloudflare
  (penyebab umum pesan "Polling ditolak (403)");
- **auto-reset state keyboard** saat mulai, sebelum/sesudah tiap scan & saat
  berhenti — mencegah "tombol Enter fisik tidak berfungsi" dan "Enter spam
  (auto-repeat)". Di Windows, Enter dikirim via **scancode langsung
  (SendInput)** + **verifikasi otomatis** (`GetAsyncKeyState`: setelah tiap
  scan agent memastikan Enter benar-benar terlepas, keyup ulang bila
  perlu); di Linux via keyDown/tahan/keyUp eksplisit. Cek versi di banner:
  harus `v2.2+`.

---

## 📄 Halaman

| Halaman | Fungsi |
|---|---|
| `/` (landing HP) | Tombol **Scan** besar (buka kamera scan QR pairing) + daftar **"Proyek terhubung"** (klik = pair, tombol **hapus** di tiap sesi, auto-refresh 15 dtk) + tombol daftarkan proyek + **perintah curl Scanner Agent** |
| `/register` | Daftar sesi pairing aktif — salin kode, **perpanjang / tutup** (hanya sesi milik browser ini) + **perintah curl Scanner Agent** |
| `/scan` | Kamera scanner + log + status sesi + senter + wake lock |

## 🔌 API

| Endpoint | Deskripsi |
|---|---|
| `POST /api/session` | Daftarkan proyek. Body `{ label }` → `201 { id, code, label, expiresAt }` |
| `GET /api/session` | List **semua sesi aktif** (publik): `{ sessions: [{ id, code, label, status, expiresAt, owned }] }` |
| `PATCH /api/session` | Kelola sesi milik sendiri. Body `{ id, action: "extend"\|"close" }` |
| `POST /api/check` | Validasi kode HP. Body `{ code }` → `{ valid, reason }` |
| `POST /api/push` | Terima scan HP. Body `{ code, barcode }` → simpan + kirim webhook → `201` |
| `GET /api/poll` | Ambil barcode (claim-on-read). `?code=` → `{ scans: [{ id, barcode }] }` — token tidak diperlukan. `?longpoll=1` → server menahan koneksi ~6 dtk & balas seketika saat barcode masuk (dipakai Scanner Agent). **Auto-extend**: selama ada yang aktif polling, sesi diperpanjang +12 jam bila tersisa < 6 jam (sesi ditutup tidak dihidupkan) |
| `GET /api/agent/download` | (Opsional) Unduh **Scanner Agent** sebagai ZIP — cara utama install adalah **curl one-liner** di bagian Scanner Agent halaman `/` & `/register` |

`PATCH /api/session` — `close` (hapus dari daftar) boleh dari browser mana pun;
`extend` (perpanjang) hanya sesi milik browser ini.
Keamanan: rate limit 20 sesi/jam/IP, antrean maks 200 barcode/sesi,
sesi auto-extend selama ada yang aktif polling.

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

> ℹ️ Self-host via Cloudflare Tunnel pernah dicoba (2026-08-05) lalu
> **di-rollback ke Vercel** — ISP rumah memblokir protokol tunnel. Semua
> artefak self-host sudah dibersihkan (lihat PROGRESS.md).

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

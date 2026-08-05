# VScan Scanner Agent — panduan pemasangan
# =========================================
# Mengubah HP menjadi scanner barcode nirkabel: agent ini berjalan di komputer
# kasir, menerima barcode dari server VScan, lalu MENGETIK barcode ke sistem
# operasi persis seperti scanner USB fisik — masuk ke kolom autofocus POS apa
# pun (web maupun desktop) TANPA mengubah kode POS.

## Isi folder ini

| File | Fungsi |
|---|---|
| `agent.py` | Program utama (polling VScan + mengetik ke OS) |
| `start-agent.bat` | **Launcher sekali-klik Windows** (double-click) |
| `start-agent.sh` | **Launcher sekali-klik Linux** (`./start-agent.sh`) |
| `agent.env.example` | Contoh konfigurasi → salin jadi `agent.env` lalu isi kode pairing |
| `install-autostart-windows.bat` | Auto-start Windows (jalankan sekali) |
| `install-autostart-linux.sh` | Auto-start Linux (jalankan sekali) |
| `requirements.txt` | Dependensi Python (`pyautogui`) |

## Langkah 1 — Konfigurasi (sekali)

1. Salin `agent.env.example` menjadi **`agent.env`** (di folder yang sama).
2. Buka `agent.env` dengan Notepad/editor, isi kode pairing:
   ```
   VSCAN_CODE=ZE7962
   ```
   (Kode dari tombol **"Daftarkan Proyek / POS"** di vscan.boundless.my.id.)

## Langkah 2 — Install (sekali)

### 🪟 Windows
1. Install Python 3.10+ dari https://python.org/downloads — **centang "Add python.exe to PATH"**.
2. Double-click **`start-agent.bat`** — dependensi di-install otomatis, lalu agent berjalan.

### 🐧 Linux
```bash
sudo apt install -y python3-pip scrot xdotool python3-tk
./start-agent.sh        # install dependensi + jalankan
```

## Langkah 3 — Auto-start saat boot (opsional, disarankan)

Agar kasir tidak perlu membuka apa pun saat nyalakan komputer:

- **Windows**: double-click **`install-autostart-windows.bat`** (sekali saja).
- **Linux**: jalankan `./install-autostart-linux.sh` (sekali saja).

Setelah itu agent otomatis berjalan setiap login. 💡 Verifikasi dulu sekali dengan
`start-agent` manual supaya yakin kode pairing sudah benar.

## Uji dulu (disarankan)

```bash
python agent.py --dry-run        # atau: python agent.py --dry-run --code KODE
```
Scan dari HP → muncul `📥 [DRY-RUN] barcode diterima: 8991...` → berhenti (Ctrl+C) → jalankan `start-agent`.

## Cara pakai di kasir (rutinitas harian)

1. Buka aplikasi POS di komputer kasir, kursor di kolom autofocus (mis. kolom pencarian).
2. HP kasir: buka vscan.boundless.my.id → tombol **Scan** → masukkan kode pairing (tersimpan otomatis).
3. Scan barcode dari HP → **detik itu juga** barcode diketik + Enter di kolom yang fokus → barang masuk keranjang.

> Agent cukup dijalankan/di-minimize; tidak perlu dilihat terus.

## Opsi lanjutan

| Opsi | Fungsi |
|---|---|
| `--interval 0.5` | Polling lebih cepat (default 1 detik) |
| `--no-enter` | Jangan tekan Enter setelah barcode |
| `--dry-run` | Mode tes: cetak barcode tanpa mengetik ke OS |
| `--code KODE` | Kode pairing (mengalahkan `agent.env`) |
| `--url URL` | Server VScan (default https://vscan.boundless.my.id) |

## Troubleshooting

| Masalah | Solusi |
|---|---|
| "Python tidak ditemukan" (Windows) | Install Python & centang "Add to PATH", lalu jalankan ulang |
| `pyautogui` gagal install di Linux | `sudo apt install -y python3-pip scrot xdotool python3-tk` |
| Agent jalan tapi tidak mengetik (Linux) | Pastikan dijalankan dari sesi desktop (bukan SSH tanpa X) |
| Tidak ada barcode masuk | Cek `VSCAN_CODE` di `agent.env` masih benar & sesi aktif (12 jam) |
| Barcode dobel di 2 komputer | Satu kode pairing = satu komputer kasir; buat kode baru untuk kasir lain |
| Jendela POS tidak terisi | Pastikan jendela POS adalah yang aktif (scanner fisik juga begitu) |

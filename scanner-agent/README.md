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

## ⚡ Cara TERCEPAT — install via curl (auto semua)

### 🐧 Linux / macOS
```bash
curl -sSL https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent/install.sh | bash
```
Installer otomatis: install curl & Python & paket sistem (scrot, xdotool, tk) →
download agent ke `~/vscan-agent` → buat virtualenv + pyautogui → minta kode
pairing → (opsional) auto-start → langsung jalankan.

### 🪟 Windows
```bat
curl -sSL https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent/install.ps1 -o %TEMP%\vscan-install.ps1 && powershell -ExecutionPolicy Bypass -File %TEMP%\vscan-install.ps1
```
Installer otomatis: cek Python (auto-install via winget bila belum ada) → download
agent ke `%USERPROFILE%\vscan-agent` → virtualenv + pyautogui → kode pairing →
(opsional) auto-start → langsung jalankan.

> Kode pairing didapat dari tombol **"Daftarkan Proyek / POS"** di vscan.boundless.my.id.
> Satu kode berlaku 12 jam; bila kadaluarsa buat kode baru lalu ubah `VSCAN_CODE` di `agent.env`.

## Cara manual (tanpa curl)

### Langkah 1 — Konfigurasi (sekali)

1. Salin `agent.env.example` menjadi **`agent.env`** (di folder yang sama).
2. Buka `agent.env` dengan Notepad/editor, isi kode pairing:
   ```
   VSCAN_CODE=ZE7962
   ```

### Langkah 2 — Install (sekali)

**🪟 Windows**: Install Python 3.10+ dari https://python.org/downloads (centang
"Add python.exe to PATH"), lalu double-click **`start-agent.bat`**.

**🐧 Linux**: `sudo apt install -y python3-pip scrot xdotool python3-tk`, lalu
`./start-agent.sh`.

### Langkah 3 — Auto-start saat boot (opsional, disarankan)

- **Windows**: double-click **`install-autostart-windows.bat`** (sekali saja).
- **Linux**: jalankan `./install-autostart-linux.sh` (sekali saja).

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
| ❌ `~/.Xauthority: No such file or directory` | Cek sesi: `echo $XDG_SESSION_TYPE`. Di **X11**: jalankan dari terminal di desktop (bukan SSH); agent mencari file Xauthority otomatis (mis. `/run/user/UID/gdm/Xauthority`). Di **Wayland**: install `ydotool` (di bawah) |
| ❌ "Tidak ada backend pengetikan" di **Wayland** | `sudo apt install ydotool && sudo systemctl enable --now ydotool`, lalu jalankan ulang agent (backend terdeteksi otomatis) |
| Agent jalan tapi tidak mengetik (Linux) | Pastikan dijalankan dari sesi desktop (bukan SSH tanpa X) |
| Tidak ada barcode masuk | Cek `VSCAN_CODE` di `agent.env` masih benar & sesi aktif (12 jam) |
| Barcode dobel di 2 komputer | Satu kode pairing = satu komputer kasir; buat kode baru untuk kasir lain |
| Jendela POS tidak terisi | Pastikan jendela POS adalah yang aktif (scanner fisik juga begitu) |

## Wayland (GNOME/KDE modern) — cara khusus

Sesi Wayland tidak punya file `~/.Xauthority`, jadi `pyautogui` tidak bisa
mengetik. Agent otomatis memakai **`ydotool`** sebagai pengganti:

```bash
sudo apt install ydotool
sudo systemctl enable --now ydotool   # daemon ydotool harus berjalan
```

Lalu jalankan ulang agent — baris `Backend: ydotool (Wayland)` menandakan
berhasil. Bila pakai distro lain tanpa paket `ydotool`, gunakan sesi **X11**
untuk login (pilih "GNOME on Xorg" di layar login) — backend `pyautogui`
langsung jalan.

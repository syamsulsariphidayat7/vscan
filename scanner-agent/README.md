# VScan Scanner Agent — panduan pemasangan
# =========================================
# Mengubah HP menjadi scanner barcode nirkabel: agent ini berjalan di komputer
# kasir, menerima barcode dari server VScan, lalu MENGETIK barcode ke sistem
# operasi persis seperti scanner USB fisik — masuk ke kolom autofocus POS apa
# pun (web maupun desktop) TANPA mengubah kode POS.

## Persiapan sekali (Windows & Linux sama)
# 1. Install Python 3.10+  → https://python.org/downloads
#    (Windows: centang "Add python.exe to PATH" saat install)
# 2. Install dependensi:
#       pip install -r requirements.txt
# 3. Catatan Linux: pyautogui butuh beberapa paket sistem:
#       sudo apt install -y python3-pip scrot xdotool python3-tk
#    (Windows tidak perlu langkah ini)

## Jalankan
#      python agent.py --code KODE_PAIRING
#
# Contoh dengan server produksi:
#      python agent.py --code ZE7962 --url https://vscan.boundless.my.id
#
# Contoh dengan server lokal (dev):
#      python agent.py --code ZE7962 --url http://localhost:3000

## Cara pakai di kasir
# 1. Jalankan agent (biarkan terbuka / minimize).
# 2. Buka aplikasi POS di komputer kasir, arahkan kursor ke kolom autofocus
#    (mis. kolom pencarian barang di halaman transaksi).
# 3. Scan barcode dari HP lewat VScan → barcode otomatis diketik + Enter,
#    persis seperti scanner USB. Kolom autofocus apa pun, proyek apa pun.

## Opsi lanjutan
#   --interval 0.5     Polling lebih cepat (default 1 detik)
#   --no-enter         Jangan tekan Enter setelah barcode
#   --dry-run          Mode tes: cetak barcode tanpa mengetik ke OS
#   --state FILE       File state lokal (default agent-state.json di folder ini)

## Bisa juga via environment variable (tanpa argumen):
#   VSCAN_URL=http://localhost:3000 VSCAN_CODE=ZE7962 python agent.py

## Troubleshooting
# - "pyautogui belum terpasang" → pip install -r requirements.txt
# - Di Linux tidak mengetik → pastikan paket sistem terpasang (lihat atas) dan
#   agent dijalankan dari sesi desktop (bukan SSH tanpa X).
# - Dua komputer memakai kode sama → barcode hanya diketik oleh SATU komputer
#   (poll claim-on-read di server). Setiap komputer butuh kode pairing sendiri.
# - Agent tidak bisa mengetik saat jendela POS bukan yang aktif → pastikan
#   jendela POS di depan (scanner fisik juga begitu).

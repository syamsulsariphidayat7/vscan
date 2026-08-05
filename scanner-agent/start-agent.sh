#!/usr/bin/env bash
# ============================================
#  VScan Scanner Agent — launcher Linux
#  Jalankan:  ./start-agent.sh
#  Konfigurasi dibaca otomatis dari agent.env.
# ============================================
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
    echo "[ERROR] python3 tidak ditemukan. Install: sudo apt install python3"
    exit 1
fi

# Cek dependensi sekali (cepat jika sudah ada)
if ! python3 -c "import pyautogui" >/dev/null 2>&1; then
    echo "Menginstall dependensi pyautogui ..."
    pip3 install -r requirements.txt
fi

echo "Memulai VScan Scanner Agent (Ctrl+C untuk berhenti) ..."
exec python3 agent.py

#!/usr/bin/env bash
# ============================================
#  VScan Scanner Agent — launcher Linux
#  Jalankan:  ./start-agent.sh
#  Konfigurasi dibaca otomatis dari agent.env.
#  Memakai virtualenv (.venv) bila ada.
# ============================================
set -e
cd "$(dirname "$0")"

# Pilih interpreter: .venv dulu (dibuat installer), fallback python3
if [[ -x ".venv/bin/python" ]]; then
    PY=".venv/bin/python"
else
    PY="python3"
fi

if ! command -v "$PY" >/dev/null 2>&1; then
    echo "[ERROR] Python tidak ditemukan. Jalankan: curl -sSL https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent/install.sh | bash"
    exit 1
fi

# Cek dependensi (jika bukan venv, install sekali)
if [[ "$PY" == "python3" ]] && ! "$PY" -c "import pyautogui" >/dev/null 2>&1; then
    echo "Menginstall dependensi pyautogui ..."
    pip3 install --user -r requirements.txt 2>/dev/null || pip3 install -r requirements.txt
fi

echo "Memulai VScan Scanner Agent (Ctrl+C untuk berhenti) ..."
exec "$PY" agent.py

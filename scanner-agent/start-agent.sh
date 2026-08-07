#!/usr/bin/env bash
# ============================================
#  VScan Scanner Agent — launcher Linux
#  Jalankan:  ./start-agent.sh
#  Auto-start senyap: ./start-agent.sh --autostart
#    (tanpa jendela, log ke agent.log, retry otomatis)
#  Konfigurasi dibaca otomatis dari agent.env.
#  Memakai virtualenv (.venv) bila ada.
# ============================================
set -e
cd "$(dirname "$0")"

AUTOSTART=0
if [[ "${1:-}" == "--autostart" ]]; then
    AUTOSTART=1
    shift
fi

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

# -----------------------------------------------------------
# Mode AUTO-START (dipakai file .desktop autostart, Terminal=false)
# -----------------------------------------------------------
if [[ "$AUTOSTART" == "1" ]]; then
    LOG="$PWD/agent.log"
    stamp() { date '+%F %T'; }

    # Tanpa kode pairing, agent tidak bisa jalan dari background
    # (prompt interaktif butuh terminal). Minta user isi dulu.
    if ! grep -q '^VSCAN_CODE=.' agent.env 2>/dev/null; then
        echo "[$(stamp)] AUTO-START: agent.env belum berisi VSCAN_CODE." >> "$LOG"
        echo "[$(stamp)] AUTO-START: Jalankan './start-agent.sh' sekali dari terminal untuk mengisi kode pairing." >> "$LOG"
        exit 1
    fi

    # Anti-duplikat: jangan jalankan proses kedua bila agent sudah hidup
    # (mis. proses lama masih jalan saat login berikutnya → dobel scan).
    if pgrep -f 'agent\.py' >/dev/null 2>&1; then
        echo "[$(stamp)] AUTO-START: agent sudah berjalan (PID $(pgrep -f 'agent\.py' | head -1)) — lewati." >> "$LOG"
        exit 0
    fi

    echo "[$(stamp)] AUTO-START: mulai agent (log: $LOG) ..." >> "$LOG"
    # Retry: saat login jaringan/daemon ydotool kadang belum siap.
    # Keluar dengan exit 0 (SIGTERM/Ctrl+C via system) TIDAK diulang;
    # hanya crash/error yang dicoba lagi.
    for i in $(seq 1 8); do
        if "$PY" agent.py "$@" >> "$LOG" 2>&1; then
            echo "[$(stamp)] AUTO-START: agent keluar normal (exit 0) — berhenti." >> "$LOG"
            exit 0
        fi
        echo "[$(stamp)] AUTO-START: agent berhenti tidak normal (percobaan $i/8) — coba lagi 15 dtk ..." >> "$LOG"
        sleep 15
    done
    echo "[$(stamp)] AUTO-START: gagal 8x berturut-turut — berhenti. Periksa $LOG" >> "$LOG"
    exit 1
fi

# -----------------------------------------------------------
# Mode interaktif (dari terminal)
# -----------------------------------------------------------
echo "Memulai VScan Scanner Agent (Ctrl+C untuk berhenti) ..."
exec "$PY" agent.py "$@"

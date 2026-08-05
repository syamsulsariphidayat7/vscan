#!/usr/bin/env bash
# ============================================================================
#  VScan Scanner Agent — installer otomatis (Linux / macOS)
# ----------------------------------------------------------------------------
#  Satu perintah, semuanya beres:
#    curl -sSL https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent/install.sh | bash
#
#  Yang dilakukan:
#    1. Install Python + paket sistem yang dibutuhkan (otomatis per distro)
#    2. Download file agent ke ~/vscan-agent
#    3. Buat virtualenv + install pyautogui
#    4. Minta kode pairing → tulis agent.env
#    5. (opsional) Pasang auto-start saat login
#    6. Jalankan agent
# ============================================================================
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent"
AGENT_DIR="${VSAN_AGENT_DIR:-$HOME/vscan-agent}"
VSCAN_CODE="${VSCAN_CODE:-}"

echo "═══════════════════════════════════════════════════"
echo "  VScan Scanner Agent — installer otomatis"
echo "═══════════════════════════════════════════════════"
echo "  Target folder : $AGENT_DIR"

# -----------------------------------------------------------
# 0. Butuh curl untuk download
# -----------------------------------------------------------
if ! command -v curl >/dev/null 2>&1; then
    echo "[1/6] curl belum ada — menginstall curl ..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -qq && sudo apt-get install -y -qq curl || true
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y curl || true
    elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -Sy --noconfirm curl || true
    elif command -v apk >/dev/null 2>&1; then
        sudo apk add --no-cache curl || true
    elif command -v brew >/dev/null 2>&1; then
        brew install curl || true
    fi
    if ! command -v curl >/dev/null 2>&1; then
        echo "❌ Tidak bisa menginstall curl otomatis. Install manual lalu jalankan ulang."
        exit 1
    fi
fi

# -----------------------------------------------------------
# 1. Python 3
# -----------------------------------------------------------
echo "[1/6] Memastikan Python 3 tersedia ..."
if ! command -v python3 >/dev/null 2>&1; then
    echo "  → Menginstall python3 ..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -qq && sudo apt-get install -y -qq python3 python3-pip python3-venv
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y python3 python3-pip
    elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -Sy --noconfirm python python-pip
    elif command -v apk >/dev/null 2>&1; then
        sudo apk add --no-cache python3 py3-pip
    elif command -v brew >/dev/null 2>&1; then
        brew install python@3
    else
        echo "❌ Tidak bisa menginstall Python otomatis. Install Python 3.10+ manual."
        exit 1
    fi
fi
PYTHON="$(command -v python3)"
echo "  ✅ Python: $($PYTHON --version)"

# -----------------------------------------------------------
# 2. Paket sistem untuk pyautogui (Linux hanya)
# -----------------------------------------------------------
if [[ "$(uname -s)" == "Linux" ]]; then
    echo "[2/6] Menginstall paket sistem pyautogui (scrot, xdotool, tk) ..."
    # Kegagalan di sini TIDAK mematikan instalasi: Python sudah ada & venv
    # tetap dibuat; paket sistem hanya diperlukan agar pyautogui bisa mengetik.
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -qq && sudo apt-get install -y -qq scrot xdotool python3-tk python3-venv python3-xlib || \
            echo "  ⚠️  Gagal install paket sistem (butuh sudo?) — lanjut; pyautogui mungkin tidak bisa mengetik."
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y scrot xdotool python3-tkinter || echo "  ⚠️  Gagal install paket sistem — lanjut."
    elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -Sy --noconfirm scrot xdotool tk || echo "  ⚠️  Gagal install paket sistem — lanjut."
    elif command -v apk >/dev/null 2>&1; then
        sudo apk add --no-cache scrot xdotool tk || echo "  ⚠️  Gagal install paket sistem — lanjut."
    else
        echo "  ⚠️  Paket sistem otomatis tidak tersedia — pyautogui mungkin butuh scrot/xdotool."
    fi
else
    echo "[2/6] macOS — lewati paket sistem (pyautogui siap pakai)."
fi

# -----------------------------------------------------------
# 3. Download file agent
# -----------------------------------------------------------
echo "[3/6] Mengunduh file agent ke $AGENT_DIR ..."
mkdir -p "$AGENT_DIR"
for f in agent.py requirements.txt start-agent.sh install-autostart-linux.sh agent.env.example; do
    curl -fsSL "$REPO_RAW/$f" -o "$AGENT_DIR/$f" \
        || { echo "❌ Gagal mengunduh $f — cek koneksi internet."; exit 1; }
done
chmod +x "$AGENT_DIR/start-agent.sh" "$AGENT_DIR/install-autostart-linux.sh"

# -----------------------------------------------------------
# 4. Virtualenv + pyautogui
# -----------------------------------------------------------
echo "[4/6] Membuat virtualenv + install pyautogui ..."
if [[ ! -d "$AGENT_DIR/.venv" ]]; then
    "$PYTHON" -m venv "$AGENT_DIR/.venv"
fi
"$AGENT_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$AGENT_DIR/.venv/bin/pip" install --quiet -r "$AGENT_DIR/requirements.txt"
echo "  ✅ pyautogui terinstall di virtualenv"

# -----------------------------------------------------------
# 5. agent.env (kode pairing)
# -----------------------------------------------------------
if [[ -f "$AGENT_DIR/agent.env" ]] && grep -q "VSCAN_CODE=." "$AGENT_DIR/agent.env"; then
    echo "[5/6] agent.env sudah ada dengan kode pairing — tidak diubah."
else
    if [[ -z "$VSCAN_CODE" ]]; then
        echo -n "[5/6] Kode pairing VScan (dari tombol \"Daftarkan Proyek / POS\"): "
        read -r VSCAN_CODE
    fi
    VSCAN_CODE="$(echo "$VSCAN_CODE" | tr -d '[:space:]' | tr 'a-z' 'A-Z')"
    if [[ -z "$VSCAN_CODE" ]]; then
        echo "  ⚠️  Kode kosong — tulis nanti di $AGENT_DIR/agent.env"
        cp "$AGENT_DIR/agent.env.example" "$AGENT_DIR/agent.env"
    else
        cat > "$AGENT_DIR/agent.env" <<EOF
# VScan Scanner Agent — konfigurasi (dibuat otomatis oleh installer)
VSCAN_CODE=$VSCAN_CODE
VSCAN_URL=https://vscan.boundless.my.id
VSCAN_INTERVAL=1
EOF
        echo "  ✅ Kode pairing $VSCAN_CODE tersimpan di agent.env"
    fi
fi

# -----------------------------------------------------------
# 6. Auto-start (opsional) + jalankan
# -----------------------------------------------------------
echo "[6/6] Selesai! Agent terpasang di $AGENT_DIR"
if [[ -f "$AGENT_DIR/agent.env" ]] && grep -q "VSCAN_CODE=." "$AGENT_DIR/agent.env"; then
    echo -n "Pasang auto-start saat login? [y/N]: "
    read -r ANS
    if [[ "${ANS,,}" == "y" ]]; then
        "$AGENT_DIR/install-autostart-linux.sh"
    fi
    echo "Menjalankan agent ... (Ctrl+C untuk berhenti)"
    cd "$AGENT_DIR" && ./start-agent.sh
else
    echo "⚠️  Isi dulu VSCAN_CODE di $AGENT_DIR/agent.env, lalu jalankan:"
    echo "      cd $AGENT_DIR && ./start-agent.sh"
fi

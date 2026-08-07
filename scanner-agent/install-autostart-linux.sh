#!/usr/bin/env bash
# ============================================
#  VScan Scanner Agent — auto-start Linux
#  Jalankan SEKALI dari folder agent:
#      ./install-autostart-linux.sh          # mode SENYAP (default)
#      ./install-autostart-linux.sh --terminal  # jendela terminal saat login
#      ./install-autostart-linux.sh --uninstall # hapus auto-start
#  Agar agent otomatis berjalan setiap kali
#  user login ke sesi desktop (GNOME/KDE/XFCE).
# ============================================
set -e
cd "$(dirname "$0")"
AGENT_DIR="$(pwd)"

AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/vscan-agent.desktop"

MODE="quiet"
if [[ "${1:-}" == "--terminal" ]]; then
    MODE="terminal"
elif [[ "${1:-}" == "--uninstall" ]]; then
    rm -f "$DESKTOP_FILE"
    echo "[OK] Auto-start dihapus: $DESKTOP_FILE"
    exit 0
fi

mkdir -p "$AUTOSTART_DIR"

if [[ "$MODE" == "quiet" ]]; then
    # Senyap: tanpa jendela, output agent ke agent.log (via --autostart).
    cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=VScan Scanner Agent
Comment=HP jadi scanner barcode nirkabel (ketik ke OS)
Exec=$AGENT_DIR/start-agent.sh --autostart
Path=$AGENT_DIR
Terminal=false
X-GNOME-Autostart-enabled=true
X-KDE-autostart-after=panel
EOF
else
    # Terminal terbuka: log agent terlihat live di jendela terminal.
    cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=VScan Scanner Agent
Comment=HP jadi scanner barcode nirkabel (ketik ke OS)
Exec=$AGENT_DIR/start-agent.sh
Path=$AGENT_DIR
Terminal=true
X-GNOME-Autostart-enabled=true
X-KDE-autostart-after=panel
EOF
fi

chmod +x "$AGENT_DIR/start-agent.sh"
echo "[OK] Auto-start terpasang di: $DESKTOP_FILE"
if [[ "$MODE" == "quiet" ]]; then
    echo "     Mode  : SENYAP (tanpa jendela) — log di $AGENT_DIR/agent.log"
    echo "     Ganti ke jendela terminal: ./install-autostart-linux.sh --terminal"
else
    echo "     Mode  : jendela terminal terbuka saat login (log live)"
    echo "     Ganti ke senyap: ./install-autostart-linux.sh"
fi
echo "     Hapus : ./install-autostart-linux.sh --uninstall"
echo
echo "Catatan: pastikan agent.env sudah berisi VSCAN_CODE"
echo "         (isi sekali lewat terminal: ./start-agent.sh lalu ketik kode pairing)."
echo "Tes sekarang? Jalankan:  ./start-agent.sh --autostart"

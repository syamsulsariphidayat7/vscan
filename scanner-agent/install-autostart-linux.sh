#!/usr/bin/env bash
# ============================================
#  VScan Scanner Agent — auto-start Linux
#  Jalankan SEKALI:  ./install-autostart-linux.sh
#  agar agent otomatis berjalan setiap kali
#  user login ke sesi desktop (GNOME/KDE/XFCE).
# ============================================
set -e
cd "$(dirname "$0")"
AGENT_DIR="$(pwd)"

AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
mkdir -p "$AUTOSTART_DIR"

DESKTOP_FILE="$AUTOSTART_DIR/vscan-agent.desktop"
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

chmod +x "$AGENT_DIR/start-agent.sh"
echo "[OK] Auto-start terpasang di: $DESKTOP_FILE"
echo "     VScan Agent akan berjalan otomatis setiap login desktop."
echo
echo "Catatan: pastikan agent.env sudah berisi VSCAN_CODE."
echo "Tes sekarang? Jalankan:  ./start-agent.sh"

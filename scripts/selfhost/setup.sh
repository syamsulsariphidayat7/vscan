#!/usr/bin/env bash
# ============================================================================
#  VScan — setup self-host (Cloudflare Tunnel)
# ----------------------------------------------------------------------------
#  Menjadikan server ini host produksi VScan tanpa perlu root/port 80:
#    vscan.boundless.my.id  →  Cloudflare  →  (tunnel)  →  localhost:3000
#
#  Prasyarat (sekali saja, dari user):
#    1) Login Cloudflare sekali (buka browser, pilih akun pemilik boundless.my.id):
#         ~/.local/bin/cloudflared tunnel login
#    2) (Disarankan) agar service tetap hidup setelah logout/reboot:
#         sudo loginctl enable-linger anaya
#
#  Lalu jalankan:
#     bash scripts/selfhost/setup.sh
#
#  Skrip idempoten — aman dijalankan ulang.
# ============================================================================
set -euo pipefail

CF="~/.local/bin/cloudflared"
CF="${CF/#\~/$HOME}"
TUNNEL="vscan"
HOST="vscan.boundless.my.id"
APP_DIR="/srv/http/vscan"
APP_PORT="3000"

echo "═══════════════════════════════════════════════════════════"
echo "  VScan self-host setup (Cloudflare Tunnel)"
echo "═══════════════════════════════════════════════════════════"

# ---------------------------------------------------------------
# 0. cloudflared binary
# ---------------------------------------------------------------
if [[ ! -x "$CF" ]]; then
    echo "[0/7] Mengunduh cloudflared ..."
    mkdir -p "$(dirname "$CF")"
    curl -sL -o "$CF" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    chmod +x "$CF"
fi
echo "[0/7] cloudflared: $($CF --version 2>/dev/null | head -1)"

# ---------------------------------------------------------------
# 1. Login Cloudflare (harus oleh user — butuh browser)
# ---------------------------------------------------------------
if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
    echo ""
    echo "❌ Belum login Cloudflare. Jalankan SEKARANG (browser akan terbuka):"
    echo ""
    echo "    $CF tunnel login"
    echo ""
    echo "Pilih domain boundless.my.id, lalu jalankan ulang: bash scripts/selfhost/setup.sh"
    exit 1
fi
echo "[1/7] Sudah login Cloudflare ✅"

# ---------------------------------------------------------------
# 2. Env produksi (DATABASE_URL Neon)
# ---------------------------------------------------------------
mkdir -p "$HOME/.config/vscan"
if [[ -f "$HOME/.config/vscan/env" ]] && grep -q "DATABASE_URL=." "$HOME/.config/vscan/env"; then
    echo "[2/7] DATABASE_URL sudah ada di ~/.config/vscan/env ✅"
else
    if [[ -f "$APP_DIR/.env.selfhost" ]]; then
        cp "$APP_DIR/.env.selfhost" "$HOME/.config/vscan/env"
        echo "[2/7] DATABASE_URL disalin dari .env.selfhost"
    else
        echo "[2/7] Tidak ada ~/.config/vscan/env dan .env.selfhost."
        echo "      Isi DATABASE_URL (Neon) ke ~/.config/vscan/env lalu jalankan ulang:"
        echo "        echo 'DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require' > ~/.config/vscan/env"
        exit 1
    fi
fi

# ---------------------------------------------------------------
# 3. Service app (systemd user, port 3000)
# ---------------------------------------------------------------
mkdir -p "$HOME/.config/systemd/user"
cp "$APP_DIR/scripts/selfhost/vscan-app.service" "$HOME/.config/systemd/user/vscan.service"
echo "[3/7] Unit app: ~/.config/systemd/user/vscan.service"

# ---------------------------------------------------------------
# 4. Buat/reuse tunnel + config ingress
# ---------------------------------------------------------------
if ! "$CF" tunnel list 2>/dev/null | grep -q "^$TUNNEL"; then
    echo "[4/7] Membuat tunnel '$TUNNEL' ..."
    "$CF" tunnel create "$TUNNEL"
else
    echo "[4/7] Tunnel '$TUNNEL' sudah ada — dipakai ulang"
fi
TUNNEL_ID=$("$CF" tunnel list 2>/dev/null | awk -v t="$TUNNEL" '$2==t {print $1}')
mkdir -p "$HOME/.cloudflared"
cat > "$HOME/.cloudflared/vscan.yml" <<EOF
tunnel: $TUNNEL
credentials-file: $HOME/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $HOST
    service: http://localhost:$APP_PORT
  - service: http_status:404
EOF
echo "[4/7] Config tunnel: ~/.cloudflared/vscan.yml"

# ---------------------------------------------------------------
# 5. Arahkan DNS vscan.boundless.my.id ke tunnel
# ---------------------------------------------------------------
echo "[5/7] Route DNS $HOST → tunnel ..."
"$CF" tunnel route dns "$TUNNEL" "$HOST" || echo "  (bisa jadi sudah ter-route)"

# ---------------------------------------------------------------
# 6. Service tunnel (systemd user)
# ---------------------------------------------------------------
cp "$APP_DIR/scripts/selfhost/cloudflared-vscan.service" "$HOME/.config/systemd/user/cloudflared-vscan.service"
echo "[6/7] Unit tunnel: ~/.config/systemd/user/cloudflared-vscan.service"

# ---------------------------------------------------------------
# 7. Aktifkan kedua service
# ---------------------------------------------------------------
systemctl --user daemon-reload
systemctl --user enable --now vscan cloudflared-vscan
echo "[7/7] Service aktif."

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Status:"
systemctl --user is-active vscan cloudflared-vscan
echo ""
echo "  💡 Supaya tetap hidup setelah logout/reboot, jalankan sekali (pakai password sudo):"
echo "      sudo loginctl enable-linger anaya"
echo ""
echo "  Verifikasi (tunggu ~1 menit setelah DNS propagasi):"
echo "      curl -sI https://$HOST | head -3"
echo "═══════════════════════════════════════════════════════════"

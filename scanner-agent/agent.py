#!/usr/bin/env python3
"""
VScan Scanner Agent
===================
Mengubah HP menjadi scanner barcode nirkabel: agent ini berjalan di komputer
kasir, melakukan polling barcode dari server VScan, lalu MENGETIK barcode ke
sistem operasi persis seperti scanner USB fisik — jadi masuk ke kolom autofocus
aplikasi POS apa pun (web maupun desktop) tanpa mengubah kode POS.

Cara pakai:
    python agent.py --code KODE
    python agent.py --code KODE --url https://vscan.boundless.my.id --interval 1
    python agent.py --code KODE --dry-run        # cetak barcode, tanpa mengetik

Konfigurasi juga bisa lewat env: VSCAN_URL, VSCAN_CODE, VSCAN_INTERVAL.

Backend pengetikan (dipilih otomatis):
  - pyautogui  → sesi X11 / XWayland (membutuhkan akses X; file Xauthority
                 dicari otomatis di lokasi umum bila ~/.Xauthority tidak ada)
  - ydotool    → sesi Wayland (install: sudo apt install ydotool, lalu
                 sudo systemctl enable --now ydotool)
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

POLL_TIMEOUT = 10  # detik, timeout HTTP tiap polling


def load_env_file(path: str) -> None:
    """Baca file konfigurasi agent.env (KEY=VALUE, # = komentar) ke env.
    Nilai env OS / argumen CLI tetap menang (setdefault)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                if key:
                    os.environ.setdefault(key, value.strip())
    except FileNotFoundError:
        pass  # agent.env opsional


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def detect_xauthority() -> str | None:
    """Cari file Xauthority yang valid untuk sesi X11 saat ini (mis. di
    /run/user/UID/gdm/Xauthority), lalu set env XAUTHORITY. Mengembalikan path
    bila ditemukan, selain None. Ini menyelesaikan error umum
    '~/.Xauthority: No such file or directory' di desktop Linux."""
    home = os.path.expanduser("~")
    uid = os.getuid() if hasattr(os, "getuid") else 1000
    candidates = [
        os.environ.get("XAUTHORITY"),
        os.path.join(home, ".Xauthority"),
        f"/run/user/{uid}/gdm/Xauthority",
        f"/run/user/{uid}/xauth/Xauthority",
        "/var/run/gdm3-for-dm/Xauthority",
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            os.environ["XAUTHORITY"] = c
            return c
    return None


def describe_session() -> str:
    """Diagnosa sesi saat ini — dipakai saat tidak ada backend pengetikan."""
    keys = (
        "XDG_SESSION_TYPE",
        "XDG_SESSION_DESKTOP",
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "XAUTHORITY",
    )
    lines = []
    for k in keys:
        v = os.environ.get(k)
        lines.append(f"  {k} = {v!r}" if v else f"  {k} = (kosong)")
    return "\n".join(lines)


def _type_with_pyautogui(pyautogui, barcode: str, enter: bool) -> None:
    """Ketik via pyautogui (X11/XWayland) — kecepatan seperti scanner USB."""
    pyautogui.typewrite(barcode, interval=0.002)
    if enter:
        pyautogui.press("enter")


def _type_with_ydotool(barcode: str, enter: bool) -> None:
    """Ketik via ydotool (Wayland). Butuh daemon ydotool berjalan:
    sudo systemctl enable --now ydotool"""
    subprocess.run(["ydotool", "type", "--key-delay", "10", barcode], check=True)
    if enter:
        subprocess.run(["ydotool", "key", "28"], check=True)  # KEY_ENTER


# Backend terpilih (diisi select_typing_backend)
_typing_impl = None
_typing_name = ""


def select_typing_backend(dry_run: bool) -> None:
    """Pilih backend ketik otomatis: pyautogui (X11) → ydotool (Wayland).
    Bila tidak ada yang bisa mengakses layar, cetak diagnosa & keluar."""
    global _typing_impl, _typing_name
    if dry_run:
        _typing_name = "dry-run (tidak mengetik)"
        return

    # 1) pyautogui (X11 / XWayland)
    try:
        import pyautogui

        _typing_impl = lambda b, e: _type_with_pyautogui(pyautogui, b, e)
        _typing_name = "pyautogui (X11)"
        return
    except ImportError:
        pass  # belum terinstall — lanjut ke ydotool / pesan jelas
    except Exception:
        # Xlib/XauthError: coba temukan Xauthority lalu import ulang.
        found = detect_xauthority()
        try:
            import pyautogui

            _typing_impl = lambda b, e: _type_with_pyautogui(pyautogui, b, e)
            _typing_name = f"pyautogui (X11, XAUTHORITY={found})" if found else "pyautogui (X11)"
            return
        except Exception:
            pass  # tetap gagal → coba ydotool

    # 2) ydotool (Wayland)
    if shutil.which("ydotool"):
        _typing_impl = lambda b, e: _type_with_ydotool(b, e)
        _typing_name = "ydotool (Wayland)"
        return

    # 3) Tidak ada backend — diagnosa yang bisa ditindaklanjuti.
    print("❌ Tidak ada backend pengetikan yang bisa mengakses layar.", file=sys.stderr)
    print(describe_session(), file=sys.stderr)
    print(
        "\nSolusi:",
        file=sys.stderr,
    )
    print(
        "  • Sesi X11  — jalankan agent dari terminal DI DESKTOP (bukan SSH).",
        file=sys.stderr,
    )
    print(
        "    File Xauthority dicari otomatis; cek manual:  echo $DISPLAY $XAUTHORITY",
        file=sys.stderr,
    )
    print(
        "  • Sesi Wayland — install ydotool agar agent bisa mengetik:",
        file=sys.stderr,
    )
    print(
        "      sudo apt install ydotool && sudo systemctl enable --now ydotool",
        file=sys.stderr,
    )
    print(
        "  • Library 'pyautogui' belum terpasang — install sekali:",
        file=sys.stderr,
    )
    print("      pip install -r requirements.txt", file=sys.stderr)
    sys.exit(2)


# UA browser: Cloudflare di depan vscan.boundless.my.id MEMBLOKIR default
# "Python-urllib/x.y" (bot detection → 403). Tanpa UA ini agent selalu 403.
_BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def fetch_scans(url: str, code: str) -> list[dict]:
    """Ambil barcode baru dari VScan (claim-on-read di server, jadi aman
    di-poll berulang tanpa duplikat)."""
    params = urllib.parse.urlencode({"code": code})
    endpoint = f"{url.rstrip('/')}/api/poll?{params}"
    req = urllib.request.Request(
        endpoint,
        method="GET",
        headers={"User-Agent": _BROWSER_UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=POLL_TIMEOUT) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            log("⚠️  Polling ditolak (403) — biasanya blokir sesaat Cloudflare, "
                "mencoba lagi otomatis. Tidak perlu ganti kode.")
        elif e.code == 400:
            log("⚠️  Kode pairing tidak valid.")
        else:
            log(f"⚠️  Server VScan menjawab HTTP {e.code} — coba lagi.")
        return []
    except urllib.error.URLError as e:
        log(f"⚠️  Tidak bisa terhubung ke VScan ({e.reason}) — coba lagi.")
        return []
    except (json.JSONDecodeError, ValueError):
        log("⚠️  Respons VScan tidak terbaca — coba lagi.")
        return []

    scans = data.get("scans") if isinstance(data, dict) else None
    if not isinstance(scans, list):
        return []
    return [s for s in scans if isinstance(s, dict) and isinstance(s.get("barcode"), str)]


def load_known(path: str) -> set[str]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return set(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def save_known(path: str, known: set[str]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(sorted(known), f)


def main() -> None:
    # Baca agent.env di folder script SEBELUM args (default-nya).
    load_env_file(os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.env"))

    default_url = os.environ.get("VSCAN_URL", "https://vscan.boundless.my.id")
    default_interval = float(os.environ.get("VSCAN_INTERVAL", "1.0"))

    parser = argparse.ArgumentParser(description="VScan Scanner Agent")
    parser.add_argument("--code", default=os.environ.get("VSCAN_CODE", ""),
                        help="Kode pairing VScan (contoh: ZE7962)")
    parser.add_argument("--url", default=default_url,
                        help=f"Base URL VScan (default: {default_url})")
    parser.add_argument("--interval", type=float, default=default_interval,
                        help=f"Interval polling detik (default: {default_interval})")
    parser.add_argument("--enter", action="store_true", default=True,
                        help="Tekan Enter setelah barcode (default: aktif)")
    parser.add_argument("--no-enter", dest="enter", action="store_false",
                        help="Jangan tekan Enter setelah barcode")
    parser.add_argument("--dry-run", action="store_true",
                        help="Hanya cetak barcode, tanpa mengetik ke OS (untuk tes)")
    parser.add_argument("--state", default=os.path.join(os.path.dirname(__file__),
                        "agent-state.json"),
                        help="File state lokal (melacak barcode yang sudah diproses)")
    args = parser.parse_args()

    if not args.code:
        parser.error("Wajib isi kode pairing: --code KODE (atau env VSCAN_CODE)")

    # Pilih backend ketik SEBELUM loop (gagal di sini = pesan jelas, bukan crash).
    select_typing_backend(args.dry_run)

    log("─" * 56)
    log(f"VScan Scanner Agent — mode {'DRY-RUN (tidak mengetik)' if args.dry_run else 'MENGETIK KE OS'}")
    log(f"  Server : {args.url}")
    log(f"  Kode   : {args.code}")
    log(f"  Interval: {args.interval}s")
    log(f"  Backend: {_typing_name}")
    log("  ✅ Arahkan kursor ke kolom autofocus POS (mis. kolom pencarian).")
    log("─" * 56)

    known = load_known(args.state)
    last_seen_warn = 0.0
    empty_streak = 0

    while True:
        scans = fetch_scans(args.url, args.code)
        if not scans:
            empty_streak += 1
            # Beri tahu sekali saja kalau sesi tidak ditemukan (bukan spam tiap detik).
            if empty_streak == 3:
                log("ℹ️  Belum ada barcode baru / sesi tidak aktif — menunggu…")
            time.sleep(args.interval)
            continue

        empty_streak = 0
        for scan in scans:
            barcode = scan["barcode"]
            scan_id = str(scan.get("id", barcode))
            if scan_id in known:
                continue  # sudah diproses (jaga-jaga server kirim ulang)
            known.add(scan_id)
            if args.dry_run:
                log(f"📥 [DRY-RUN] barcode diterima: {barcode}")
            else:
                log(f"📥 Ketik barcode: {barcode}")
                try:
                    _typing_impl(barcode, args.enter)
                    log("   ✅ Dikirim ke OS")
                except Exception as e:  # pragma: no cover - OS-specific
                    log(f"❌ Gagal mengetik: {e}")
                    known.discard(scan_id)  # biar bisa dicoba lagi

        save_known(args.state, known)
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nScanner Agent dihentikan.")

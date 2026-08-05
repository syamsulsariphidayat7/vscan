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
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

DEFAULT_URL = os.environ.get("VSCAN_URL", "https://vscan.boundless.my.id")
DEFAULT_INTERVAL = float(os.environ.get("VSCAN_INTERVAL", "1.0"))
POLL_TIMEOUT = 10  # detik, timeout HTTP tiap polling


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def fetch_scans(url: str, code: str) -> list[dict]:
    """Ambil barcode baru dari VScan (claim-on-read di server, jadi aman
    di-poll berulang tanpa duplikat)."""
    params = urllib.parse.urlencode({"code": code})
    endpoint = f"{url.rstrip('/')}/api/poll?{params}"
    req = urllib.request.Request(endpoint, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=POLL_TIMEOUT) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            log("⚠️  Kode pairing benar tapi token tidak cocok (sesi memakai token).")
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


def type_barcode(barcode: str, enter: bool) -> None:
    """Ketik barcode ke OS seperti scanner fisik: teks + Enter (agar POS
    langsung menambahkan item / submit field yang sedang fokus)."""
    try:
        import pyautogui

        # Kecepatan ketik sangat cepat, persis karakter scanner USB.
        pyautogui.typewrite(barcode, interval=0.002)
        if enter:
            pyautogui.press("enter")
    except ImportError:
        print(
            "❌ Library 'pyautogui' belum terpasang.\n"
            "   Install sekali:  pip install -r requirements.txt",
            file=sys.stderr,
        )
        sys.exit(2)


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
    parser = argparse.ArgumentParser(description="VScan Scanner Agent")
    parser.add_argument("--code", default=os.environ.get("VSCAN_CODE", ""),
                        help="Kode pairing VScan (contoh: ZE7962)")
    parser.add_argument("--url", default=DEFAULT_URL,
                        help=f"Base URL VScan (default: {DEFAULT_URL})")
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL,
                        help=f"Interval polling detik (default: {DEFAULT_INTERVAL})")
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

    log("─" * 56)
    log(f"VScan Scanner Agent — mode {'DRY-RUN (tidak mengetik)' if args.dry_run else 'MENGETIK KE OS'}")
    log(f"  Server : {args.url}")
    log(f"  Kode   : {args.code}")
    log(f"  Interval: {args.interval}s")
    log("  ✅ Arahkan kursor ke kolom autofocus POS (mis. kolom pencarian).")
    log("─" * 56)

    if not args.dry_run:
        try:
            import pyautogui  # noqa: F401  (cek keberadaan di awal)
        except ImportError:
            print(
                "❌ Library 'pyautogui' belum terpasang.\n"
                "   Install sekali:  pip install -r requirements.txt",
                file=sys.stderr,
            )
            sys.exit(2)

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
                    type_barcode(barcode, args.enter)
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

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
import atexit
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

AGENT_VERSION = "2.2"  # tampil di banner startup; naikkan tiap update penting

_VK_RETURN = 0x0D  # VK code tombol Enter (Windows)

POLL_TIMEOUT = 15  # detik, timeout HTTP tiap polling (long-poll menahan ~6s)
TYPEWRITE_INTERVAL = 0.02  # detik antar karakter barcode
ENTER_SETTLE_S = 0.05  # jeda setelah ketik barcode, sebelum Enter
ENTER_HOLD_S = 0.08  # durasi tombol Enter ditahan (<< batas auto-repeat ~0,5s)

# Kirim scancode di Windows (diisi _get_win_sender saat pertama dipakai).
# False = Windows API tidak tersedia / gagal inisialisasi.
_win32_send = None


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


def _get_win_sender():
    """(Windows) Siapkan pengirim scancode via SendInput — dipakai untuk
    Enter & reset keyboard. Scancode = tombol FISIK (bebas layout/IME),
    cara yang sama dipakai pynput; jauh lebih andal daripada VK code ala
    pyautogui yang bisa kehilangan keyup pada sebagian driver/IME.
    Mengembalikan fungsi (scan:int, down:bool)->bool, atau False bila
    API Windows tidak tersedia."""
    global _win32_send
    if _win32_send is not None:
        return _win32_send
    try:
        import ctypes
        from ctypes import wintypes

        ULONG_PTR = ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_ulong

        class _KEYBDINPUT(ctypes.Structure):
            _fields_ = [
                ("wVk", wintypes.WORD),
                ("wScan", wintypes.WORD),
                ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD),
                ("dwExtraInfo", ULONG_PTR),
            ]

        class _INPUT(ctypes.Structure):
            class _U(ctypes.Union):
                _fields_ = [("ki", _KEYBDINPUT)]

            _anonymous_ = ("u",)
            _fields_ = [("type", wintypes.DWORD), ("u", _U)]

        user32 = ctypes.windll.user32
        user32.MapVirtualKeyW.argtypes = [wintypes.UINT, wintypes.UINT]
        user32.MapVirtualKeyW.restype = wintypes.UINT
        user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(_INPUT), ctypes.c_int]
        user32.SendInput.restype = wintypes.UINT

        KEYEVENTF_SCANCODE = 0x0008
        KEYEVENTF_KEYUP = 0x0002
        INPUT_KEYBOARD = 1
        size = ctypes.sizeof(_INPUT)

        def _send(scan: int, down: bool) -> bool:
            inp = _INPUT()
            inp.type = INPUT_KEYBOARD
            inp.u.ki.wVk = 0
            inp.u.ki.wScan = scan
            inp.u.ki.dwFlags = KEYEVENTF_SCANCODE | (0 if down else KEYEVENTF_KEYUP)
            return user32.SendInput(1, ctypes.byref(inp), size) == 1

        _win32_send = _send
        return _send
    except Exception:
        _win32_send = False
        return False


def _enter_scan_code() -> int:
    """Scancode tombol Enter (0x1C pada keyboard standar)."""
    try:
        import ctypes

        return int(ctypes.windll.user32.MapVirtualKeyW(_VK_RETURN, 0))
    except Exception:
        return 0x1C  # fallback: scancode Enter keyboard standar


def _press_enter_windows() -> bool:
    """(Windows) Tekan Enter via scancode: down → tahan → up.
    Mengembalikan True bila berhasil dikirim."""
    sender = _get_win_sender()
    if not sender:
        return False
    try:
        scan = _enter_scan_code()
        if not sender(scan, True):
            return False
        time.sleep(ENTER_HOLD_S)
        return sender(scan, False)
    except Exception:
        return False


def _press_enter(pyautogui) -> None:
    """Tekan Enter sekali dengan andal (anti stuck/spam).

    Windows → scancode via SendInput (fisik, bebas layout/IME). Selain itu
    → keyDown/tahan/keyUp via pyautogui, dengan keyup sebagai event
    terpisah (bukan press() yang di-coalesce OS sehingga keyup hilang)."""
    if sys.platform == "win32" and _press_enter_windows():
        return
    pyautogui.keyDown("enter")
    time.sleep(ENTER_HOLD_S)
    pyautogui.keyUp("enter")


def _enter_is_down_windows() -> bool:
    """(Windows) True bila tombol Enter masih terdeteksi 'tertekan' oleh OS
    (GetAsyncKeyState). Ini state yang sama yang membuat Enter fisik mati
    saat keyup sebelumnya hilang."""
    try:
        import ctypes

        return bool(ctypes.windll.user32.GetAsyncKeyState(_VK_RETURN) & 0x8000)
    except Exception:
        return False


def _ensure_enter_released(log_fail: bool = True) -> bool:
    """(Windows) Verifikasi Enter benar-benar terlepas setelah pengetikan.

    Bila keyup sebelumnya hilang (tombol masih 'tertekan' → spam enter &
    Enter fisik mati), kirim keyup scancode berulang sampai bersih, lalu
    log peringatan bila masih nyangkut. Di platform selain Windows selalu
    mengembalikan True.
    """
    if sys.platform != "win32":
        return True
    sender = _get_win_sender()
    if not sender:
        return True  # tidak bisa diperiksa → jangan ganggu alur normal
    scan = _enter_scan_code()
    time.sleep(0.05)  # tunggu event keyup sebelumnya benar-benar diproses
    # Catatan: bila kasir sedang FISIK memegang tombol Enter saat cek ini,
    # keyup scancode akan melepasnya — kasus sangat jarang, loop dibatasi 5×.
    for _attempt in range(5):
        if not _enter_is_down_windows():
            return True
        sender(scan, False)  # keyup ulang via scancode
        time.sleep(0.05)
    if log_fail:
        log("⚠️  Enter masih terdeteksi 'tertekan' setelah 5× keyup — kemungkinan "
            "ada software keyboard remapper (PowerToys/SharpKeys) atau driver "
            "keyboard bermasalah di komputer kasir.")
    return False


def _type_with_pyautogui(pyautogui, barcode: str, enter: bool) -> None:
    """Ketik via pyautogui (X11/XWayland/Windows) — seperti scanner USB.

    Enter ditekan lewat _press_enter(): di Windows pakai scancode
    (SendInput), selain itu keyDown/tahan/keyUp eksplisit. Tanpa ini,
    keyup Enter bisa hilang → tombol tertinggal 'tertekan' → auto-repeat
    (SPAM Enter) dan tombol Enter fisik ikut mati. Tahan ~80 ms masih jauh
    di bawah batas auto-repeat (~500 ms), jadi aman.
    """
    try:
        # Bersihkan sisa state keyboard dari scan sebelumnya (jaga-jaga).
        release_keys(pyautogui)
        pyautogui.typewrite(barcode, interval=TYPEWRITE_INTERVAL)
        if enter:
            # Jeda singkat: pastikan karakter terakhir barcode selesai
            # diproses aplikasi sebelum Enter ditekan.
            time.sleep(ENTER_SETTLE_S)
            _press_enter(pyautogui)
    finally:
        # Jamin tidak ada tombol tertahan (mis. proses berhenti di tengah
        # ketikan) — mencegah keyboard fisik 'nyangkut' setelah ini.
        release_keys(pyautogui)
        # Windows: verifikasi Enter benar-benar terlepas (cek state OS).
        _ensure_enter_released()


def _type_with_ydotool(barcode: str, enter: bool) -> None:
    """Ketik via ydotool (Wayland). Butuh daemon ydotool berjalan:
    sudo systemctl enable --now ydotool"""
    subprocess.run(["ydotool", "type", "--key-delay", "10", barcode], check=True)
    if enter:
        subprocess.run(["ydotool", "key", "28"], check=True)  # KEY_ENTER


# Backend terpilih (diisi select_typing_backend)
_typing_impl = None
_typing_name = ""

# Tombol yang berpotensi 'tertinggal' dalam keadaan tertekan bila proses
# berhenti di tengah pengetikan (crash, Ctrl+C, ditutup paksa, auto-start
# mematikan proses). Dipakai utk me-reset state keyboard.
_STUCK_KEYS = (
    "enter", "return", "tab", "space", "delete", "backspace", "capslock",
    "shift", "shiftleft", "shiftright",
    "ctrl", "ctrlleft", "ctrlright",
    "alt", "altleft", "altright", "altgr",
    "win", "winleft", "winright",
)


def release_keys(pyautogui=None) -> None:
    """Lepas semua kemungkinan tombol yang masih tertahan (keyboard bersih).

    Dipanggil saat start (reset dari sesi/crash sebelumnya), di akhir setiap
    pengetikan (try/finally), dan saat keluar (atexit + SIGINT/SIGTERM).
    Aman dipanggil kapan saja: keyUp untuk tombol yang tidak tertahan tidak
    berdampak apa pun. Ini mencegah masalah klasik 'keyboard nyangkut' —
    mis. tombol Enter fisik tidak berfungsi sampai ditekan di on-screen
    keyboard."""
    if pyautogui is None:
        try:
            import pyautogui
        except Exception:
            return  # tidak ada backend → tidak ada yang perlu di-reset
    for key in _STUCK_KEYS:
        try:
            pyautogui.keyUp(key)
        except Exception:
            pass  # sebagian nama key tidak tersedia di semua platform/versi
    # Windows: keyup Enter via scancode — memastikan Enter yang 'nyangkut'
    # dari keyup yang hilang di jalur VK benar-benar terlepas.
    if sys.platform == "win32":
        try:
            sender = _get_win_sender()
            if sender:
                sender(_enter_scan_code(), False)
        except Exception:
            pass


def select_typing_backend(dry_run: bool) -> None:
    """Pilih backend ketik otomatis: pyautogui (X11) → ydotool (Wayland).
    Bila tidak ada yang bisa mengakses layar, cetak diagnosa & keluar."""
    global _typing_impl, _typing_name
    if dry_run:
        _typing_name = "dry-run (tidak mengetik)"
        return

    # 1) pyautogui (X11 / XWayland / Windows)
    try:
        import pyautogui

        # PAUSE bawaan pyautogui = 0,1 s PER panggilan — membuat release_keys
        # (~20 keyUp) makan ~2 s tiap scan. Kecilkan agar tidak menambah delay.
        try:
            pyautogui.PAUSE = 0.01
        except Exception:
            pass
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


def fetch_scans(url: str, code: str, longpoll: bool = True) -> list[dict]:
    """Ambil barcode baru dari VScan (claim-on-read di server, jadi aman
    di-poll berulang tanpa duplikat).

    longpoll=True: server menahan koneksi ~6 detik dan langsung membalas
    begitu ada barcode baru — barcode terdeteksi hampir seketika tanpa
    menunggu siklus polling berikutnya."""
    params = urllib.parse.urlencode({"code": code, "longpoll": "1" if longpoll else "0"})
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
    log(f"VScan Scanner Agent v{AGENT_VERSION} — mode {'DRY-RUN (tidak mengetik)' if args.dry_run else 'MENGETIK KE OS'}")
    log(f"  Server : {args.url}")
    log(f"  Kode   : {args.code}")
    log(f"  Interval: {args.interval}s")
    log(f"  Versi  : v{AGENT_VERSION}")
    log(f"  Backend: {_typing_name}")
    log("  ✅ Arahkan kursor ke kolom autofocus POS (mis. kolom pencarian).")
    if not args.dry_run and _typing_name.startswith("pyautogui"):
        # Bersihkan state keyboard dari sesi sebelumnya yang berhenti di
        # tengah ketikan (penyebab tombol Enter fisik kadang 'nyangkut').
        release_keys()
        log("⌨️  State keyboard di-reset (tombol yang mungkin nyangkut dibersihkan).")
        if sys.platform == "win32":
            if _ensure_enter_released(log_fail=False):
                log("   Enter terdeteksi terlepas ✅")
            else:
                log("   ⚠️  Enter masih 'tertekan' — cek software keyboard remapper "
                    "(PowerToys/SharpKeys) di komputer kasir.")
    log("─" * 56)

    known = load_known(args.state)
    last_seen_warn = 0.0
    empty_streak = 0

    while True:
        # Long-poll: saat kosong server menahan koneksi ~6 detik, jadi jeda
        # pendek saja (barcode baru terdeteksi ~0,3 detik setelah di-push).
        scans = fetch_scans(args.url, args.code, longpoll=True)
        if not scans:
            empty_streak += 1
            # Beri tahu sekali saja kalau sesi tidak ditemukan (bukan spam tiap detik).
            if empty_streak == 3:
                log("ℹ️  Belum ada barcode baru / sesi tidak aktif — menunggu…")
            time.sleep(0.3)
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
        time.sleep(args.interval)  # jeda antar-gelombang scan


def _stop(_signum=None, _frame=None) -> None:
    """Keluar bersih: reset state keyboard dulu, baru berhenti."""
    release_keys()
    sys.exit(0)


if __name__ == "__main__":
    # Reset keyboard saat interpreter selesai (Ctrl+C, error, keluar normal).
    atexit.register(release_keys)
    # SIGINT (Ctrl+C) & SIGTERM (auto-start/systemd mematikan proses) →
    # lepas semua tombol sebelum berhenti supaya keyboard tidak 'nyangkut'.
    for _sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(_sig, _stop)
        except (ValueError, AttributeError):  # pragma: no cover - platform
            pass

    try:
        main()
    except KeyboardInterrupt:
        release_keys()
        print("\nScanner Agent dihentikan — state keyboard sudah di-reset.")

#!/usr/bin/env python3
"""Smoke test untuk VScan Scanner Agent (mode dry-run, tanpa internet).

Mengecek end-to-end alur polling agent terhadap MOCK server lokal:
  1. Syntax agent.py valid (py_compile).
  2. Banner startup menampilkan versi & mode dry-run.
  3. Round-trip barcode: barcode di-"push" ke mock → agent menerimanya
     lewat /api/poll → log "[DRY-RUN] barcode diterima: <barcode>".
  4. Agent berhenti bersih (exit 0) setelah SIGINT/SIGTERM.

Tidak mengetik ke OS (mode dry-run) dan tidak butuh koneksi internet /
server VScan produksi. Jalankan:
    python3 scanner-agent/smoke_test.py

Exit code 0 = lulus, 1 = ada yang gagal (detail di output).

Catatan: alat dev untuk Linux/macOS (memakai SIGINT via send_signal &
perintah python3) — jalankan di mesin pengembangan, bukan di kasir.
"""

import http.server
import json
import os
import queue
import signal
import subprocess
import sys
import tempfile
import threading
import time

AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
AGENT_PY = os.path.join(AGENT_DIR, "agent.py")
TEST_CODE = "SMOKE01"
TEST_BARCODE = "8991234500017"

_failures: list[str] = []


def check(ok: bool, msg: str) -> None:
    print(f"  [{'PASS' if ok else 'FAIL'}] {msg}")
    if not ok:
        _failures.append(msg)


def wait_for(cond, timeout: float, label: str) -> bool:
    """Tunggu sampai `cond()` True atau timeout (maks 10×/detik).
    Hanya mengembalikan bool — pemanggil yang mencatat kegagalan via
    `check()` supaya tidak dobel-hitung."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if cond():
            return True
        time.sleep(0.1)
    print(f"  [FAIL] timeout menunggu: {label}")
    return False


# --- Mock server /api/poll -------------------------------------------------
class MockHandler(http.server.BaseHTTPRequestHandler):
    scans: "queue.Queue[dict]" = queue.Queue()

    def do_GET(self) -> None:
        if not self.path.startswith("/api/poll"):
            self.send_error(404)
            return
        try:
            item = self.scans.get_nowait()
            scans = [item]
        except queue.Empty:
            scans = []
        body = json.dumps({"scans": scans}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:  # heningkan log request
        pass


def main() -> int:
    print(f"Smoke test Scanner Agent ({AGENT_PY})")
    print("1. Syntax check (py_compile)")
    r = subprocess.run(
        [sys.executable, "-m", "py_compile", AGENT_PY],
        capture_output=True,
        text=True,
    )
    check(r.returncode == 0, "agent.py lolos py_compile")
    if r.returncode != 0:
        print(r.stderr)

    print("2. Jalankan agent --dry-run terhadap mock /api/poll")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), MockHandler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()

    state_file = os.path.join(tempfile.gettempdir(), "vscan-smoke-state.json")
    if os.path.exists(state_file):
        os.remove(state_file)

    proc = subprocess.Popen(
        [
            sys.executable, AGENT_PY,
            "--code", TEST_CODE,
            "--url", f"http://127.0.0.1:{port}",
            "--interval", "0.2",
            "--dry-run",
            "--state", state_file,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=AGENT_DIR,
    )

    # Baca stdout agent di thread agar bisa cek kondisi sambil jalan.
    lines: list[str] = []
    lock = threading.Lock()

    def reader() -> None:
        assert proc.stdout is not None
        for raw in proc.stdout:
            with lock:
                lines.append(raw.rstrip())

    threading.Thread(target=reader, daemon=True).start()

    def snapshot() -> str:
        with lock:
            return "\n".join(lines)

    # Reset queue antar run (sisa item dari run sebelumnya bisa membuat
    # cek round-trip palsu-lulus).
    while True:
        try:
            MockHandler.scans.get_nowait()
        except queue.Empty:
            break

    try:
        # 2a. Banner startup: versi + mode dry-run + backend dry-run.
        ok = wait_for(
            lambda: "mode DRY-RUN" in snapshot() and "Backend: dry-run" in snapshot(),
            10,
            "banner startup (mode DRY-RUN + Backend: dry-run)",
        )
        snap = snapshot()
        check(ok, "banner startup muncul")
        if ok:
            check(
                any("v2." in l for l in lines if "Scanner Agent v" in l),
                "banner menampilkan versi (v2.x)",
            )
            check("Versi  : v2." in snap, "baris 'Versi : v2.x' tampil")
        else:
            print(snap)

        # 2b. Push barcode ke mock → agent harus menerimanya via poll.
        MockHandler.scans.put({"id": "smoke-1", "barcode": TEST_BARCODE})
        ok = wait_for(
            lambda: f"[DRY-RUN] barcode diterima: {TEST_BARCODE}" in snapshot(),
            10,
            f"barcode {TEST_BARCODE} diterima (dry-run)",
        )
        check(ok, "round-trip barcode via /api/poll (claim-on-read)")
        if not ok:
            print(snapshot())

        # 2c. State file ditulis (id scan yang diproses tercatat) — tunggu
        # sampai file muncul SEBELUM menghentikan agent (menghindari race
        # antara deteksi log dan save_known di sisi agent).
        def state_has_scan() -> bool:
            try:
                with open(state_file, "r", encoding="utf-8") as f:
                    return "smoke-1" in f.read()
            except (FileNotFoundError, json.JSONDecodeError):
                return False

        ok = wait_for(state_has_scan, 5, "state file berisi id scan")
        check(ok, "state file ditulis (id scan tercatat)")

        # 2d. Berhenti bersih via SIGINT → exit 0 (state keyboard di-reset).
        proc.send_signal(signal.SIGINT)
        try:
            rc = proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            rc = proc.wait(timeout=5)
        check(rc == 0, f"agent berhenti bersih setelah SIGINT (exit {rc})")
    finally:
        server.shutdown()
        server.server_close()
        if proc.poll() is None:
            proc.kill()

    print("─" * 56)
    if _failures:
        print(f"❌ SMOKE TEST GAGAL ({len(_failures)} masalah)")
        for f in _failures:
            print(f"   - {f}")
        return 1
    print("✅ SMOKE TEST LULUS — agent.py dry-run berfungsi.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

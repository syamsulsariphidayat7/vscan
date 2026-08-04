"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ScanLine,
  Loader2,
  CameraOff,
  WifiOff,
  CheckCircle2,
  XCircle,
  Trash2,
  ArrowLeft,
  Keyboard,
  Vibrate,
} from "lucide-react";
import { toast } from "sonner";
import { useBarcodeDetector, type ScanState } from "@/hooks/use-barcode-detector";
import {
  pushBarcode,
  checkPairingCode,
  checkReasonMessage,
} from "@/lib/api";

interface ScanLogEntry {
  id: number;
  barcode: string;
  status: "sent" | "error";
  error?: string;
  time: string;
}

function ScanPageInner() {
  const params = useSearchParams();
  const initialCode = (params.get("code") || "").trim().toUpperCase();

  // Kode pairing dibaca sekali dari URL — tidak berubah selama halaman scan.
  const [code] = useState(initialCode);
  const [scanActive, setScanActive] = useState(Boolean(initialCode));
  const [checking, setChecking] = useState(Boolean(initialCode));
  const [codeValid, setCodeValid] = useState<boolean | null>(null);
  // Sesi mati (ditutup/kedaluwarsa) saat sedang scan → hentikan & minta kode baru.
  const [sessionDead, setSessionDead] = useState(false);
  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const logIdRef = useRef(0);

  const handleDetect = async (barcode: string) => {
    // Getaran + bunyi sebagai feedback scan.
    if ("vibrate" in navigator) navigator.vibrate?.(80);
    if (soundOn) playBeep();
    await sendScan(barcode);
  };

  const { videoRef, canvasRef, state, reset } = useBarcodeDetector({
    active: scanActive && codeValid !== false,
    onDetect: handleDetect,
  });

  // Validasi kode pairing saat masuk halaman / saat kode diubah.
  useEffect(() => {
    if (!code) {
      setCodeValid(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    setCodeValid(null);
    setSessionDead(false);
    checkPairingCode(code).then((result) => {
      if (cancelled) return;
      setCodeValid(result.valid);
      setChecking(false);
      if (!result.valid) {
        const message = checkReasonMessage(result.reason);
        toast.error(message);
        setScanActive(false);
        if (result.reason === "inactive") setSessionDead(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const sendScan = async (barcode: string) => {
    const entry: ScanLogEntry = {
      id: ++logIdRef.current,
      barcode,
      status: "sent",
      time: new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };
    setSending(true);
    const result = await pushBarcode(code, barcode);
    setSending(false);

    if (result.ok) {
      setLog((prev) => [entry, ...prev].slice(0, 50));
    } else {
      const failed: ScanLogEntry = {
        id: entry.id,
        barcode: entry.barcode,
        time: entry.time,
        status: "error",
        error: result.error,
      };
      setLog((prev) => [failed, ...prev].slice(0, 50));
      toast.error(result.error || "Gagal mengirim barcode");
      // Sesi ditutup/kedaluwarsa di tengah pemakaian → hentikan kamera.
      if (result.status === 410) {
        setSessionDead(true);
        setScanActive(false);
        setCodeValid(false);
      }
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = manualInput.trim();
    if (!value) return;
    setManualInput("");
    if ("vibrate" in navigator) navigator.vibrate?.(80);
    if (soundOn) playBeep();
    await sendScan(value);
  };

  const retryEntry = async (entry: ScanLogEntry) => {
    if (entry.status === "sent") return;
    const result = await pushBarcode(code, entry.barcode);
    if (result.ok) {
      setLog((prev) =>
        prev.map((l) =>
          l.id === entry.id ? { ...l, status: "sent", error: undefined } : l
        )
      );
    } else {
      toast.error(result.error || "Gagal kirim ulang");
    }
  };

  const stateLabel: Record<ScanState, string> = {
    idle: "Kamera siap",
    starting: "Menyiapkan kamera…",
    active: "Arahkan ke barcode",
    unsupported: "Browser tidak mendukung scan kamera",
    error: "Tidak bisa mengakses kamera",
  };

  const connected = codeValid === true && !sessionDead;
  const statusColor = sessionDead
    ? "bg-red-400"
    : codeValid === false
      ? "bg-red-400"
      : connected && state === "active"
        ? "bg-emerald-400"
        : "bg-amber-400";

  return (
    <main className="flex min-h-dvh flex-col bg-black text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2 font-mono text-sm tracking-widest text-teal-300">
          <span className="relative flex h-2 w-2">
            <span
              className={
                "absolute inline-flex h-full w-full rounded-full animate-ping " + statusColor
              }
            />
            <span
              className={"relative inline-flex h-2 w-2 rounded-full " + statusColor}
            />
          </span>
          {code || "—"}
        </div>
        <button
          type="button"
          onClick={() => setSoundOn((s) => !s)}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20"
          aria-label={soundOn ? "Matikan bunyi" : "Nyalakan bunyi"}
        >
          {soundOn ? (
            <Vibrate className="h-4 w-4" />
          ) : (
            <span className="text-xs font-bold text-white/50">OFF</span>
          )}
        </button>
      </header>

      {/* Viewport kamera */}
      <div className="relative mx-4 overflow-hidden rounded-2xl bg-black">
        <div className="relative aspect-[3/4] w-full">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-white/10" />

          {/* Overlay status */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {sessionDead ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-black/70 px-6 py-5 text-center backdrop-blur-sm">
                <XCircle className="h-8 w-8 text-red-400" aria-hidden="true" />
                <p className="text-sm font-medium text-white">Sesi VScan tidak aktif</p>
                <p className="text-xs text-white/70">
                  Minta kasir membuat kode baru di POS.
                </p>
                <Link
                  href="/"
                  className="pointer-events-auto mt-1 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-teal-400"
                >
                  Ganti Kode
                </Link>
              </div>
            ) : state !== "active" ? (
              <div className="flex flex-col items-center gap-3 text-center px-8">
                {state === "starting" && (
                  <Loader2 className="h-8 w-8 animate-spin text-teal-300" aria-hidden="true" />
                )}
                {state === "error" && (
                  <CameraOff className="h-8 w-8 text-red-400" aria-hidden="true" />
                )}
                {state === "unsupported" && (
                  <WifiOff className="h-8 w-8 text-amber-400" aria-hidden="true" />
                )}
                {codeValid === false && (
                  <XCircle className="h-8 w-8 text-red-400" aria-hidden="true" />
                )}
                <p className="text-sm text-white/90">
                  {codeValid === false
                    ? "Kode pairing tidak valid"
                    : stateLabel[state]}
                </p>
              </div>
            ) : null}
          </div>

          {/* Garis scan */}
          {state === "active" && connected && (
            <div className="pointer-events-none absolute inset-x-8">
              <div className="absolute h-0.5 w-full rounded bg-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.9)] animate-scanline" />
            </div>
          )}

          {/* Sudut frame */}
          {state === "active" && connected && (
            <div className="pointer-events-none absolute inset-6">
              <div className="absolute left-0 top-0 h-10 w-10 rounded-tl-xl border-l-4 border-t-4 border-teal-400" />
              <div className="absolute right-0 top-0 h-10 w-10 rounded-tr-xl border-r-4 border-t-4 border-teal-400" />
              <div className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-xl border-b-4 border-l-4 border-teal-400" />
              <div className="absolute bottom-0 right-0 h-10 w-10 rounded-br-xl border-b-4 border-r-4 border-teal-400" />
            </div>
          )}
        </div>
      </div>

      {/* Label status bawah viewport */}
      <p className="px-4 pt-3 text-center text-xs text-white/60">
        {sessionDead
          ? "Sesi tidak aktif — ganti kode untuk melanjutkan"
          : state === "active" && codeValid !== false
            ? "Arahkan kamera ke barcode produk"
            : stateLabel[state]}
        {checking && " · Memeriksa kode…"}
      </p>

      {/* Tombol aksi */}
      <div className="flex gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={() => {
            setManualOpen((o) => !o);
          }}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-medium transition-colors hover:bg-white/20"
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" />
          {manualOpen ? "Tutup Input" : "Ketik Manual"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (scanActive) {
              setScanActive(false);
            } else {
              reset();
              setScanActive(true);
            }
          }}
          className={
            "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] " +
            (scanActive
              ? "bg-white/10 text-white hover:bg-white/20"
              : "bg-teal-500 text-black hover:bg-teal-400")
          }
        >
          <ScanLine className="h-4 w-4" aria-hidden="true" />
          {scanActive ? "Hentikan" : "Mulai Kamera"}
        </button>
      </div>

      {/* Input manual */}
      {manualOpen && (
        <form onSubmit={handleManualSubmit} className="px-4 pt-3">
          <div className="flex gap-2">
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Ketik barcode lalu Enter"
              className="h-11 flex-1 rounded-xl border border-white/20 bg-white/10 px-4 font-mono text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-teal-400"
              autoFocus
            />
            <button
              type="submit"
              disabled={!manualInput.trim() || sending}
              className="h-11 rounded-xl bg-teal-500 px-4 text-sm font-semibold text-black transition-all hover:bg-teal-400 active:scale-[0.98] disabled:opacity-50"
            >
              Kirim
            </button>
          </div>
        </form>
      )}

      {/* Log hasil scan */}
      <div className="mt-4 flex-1 overflow-y-auto px-4 pb-6">
        <div className="flex items-center justify-between pb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-white/50">
            Hasil Scan ({log.length})
          </p>
          {log.length > 0 && (
            <button
              type="button"
              onClick={() => setLog([])}
              className="flex items-center gap-1 text-xs text-white/50 transition-colors hover:text-white"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Bersihkan
            </button>
          )}
        </div>
        {log.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 py-10 text-center">
            <ScanLine className="mx-auto h-6 w-6 text-white/30" aria-hidden="true" />
            <p className="mt-2 text-xs text-white/40">
              Barcode yang di-scan akan muncul di sini
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {log.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{entry.barcode}</p>
                  <p className="text-[10px] text-white/40">{entry.time}</p>
                  {entry.error && (
                    <p className="truncate text-[10px] text-red-400">{entry.error}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {entry.status === "sent" ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Terkirim
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => retryEntry(entry)}
                      className="rounded-lg bg-white/10 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20"
                    >
                      Ulangi
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {sending && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-white/50">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Mengirim…
          </div>
        )}
      </div>
    </main>
  );
}

function playBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Audio gagal — abaikan, getar tetap jalan.
  }
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-black text-white">
          <Loader2 className="h-6 w-6 animate-spin text-teal-300" aria-hidden="true" />
        </div>
      }
    >
      <ScanPageInner />
    </Suspense>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ScanLine,
  Loader2,
  CameraOff,
  Plus,
  Store,
  ChevronRight,
  QrCode,
  RefreshCw,
  History,
  Download,
  HardDriveDownload,
} from "lucide-react";
import { toast } from "sonner";
import { checkPairingCode, checkReasonMessage } from "@/lib/api";
import { useBarcodeDetector } from "@/hooks/use-barcode-detector";
import { RegisterModal } from "@/components/register-modal";

const LAST_CODE_KEY = "vscan-last-code";

interface ProjectSession {
  id: string;
  code: string;
  label: string;
  status: string;
  expiresAt: string;
  owned: boolean;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function HomePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ProjectSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  // Mode scan QR kode pairing (fallback bila kode tidak ada di daftar).
  const [qrMode, setQrMode] = useState(false);
  const [qrDetected, setQrDetected] = useState(false);
  const qrDetectedRef = useRef(false);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/session");
      const data = await res.json().catch(() => ({}));
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      // daftar gagal dimuat — tampilkan kosong
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    setLastCode(localStorage.getItem(LAST_CODE_KEY));
    loadSessions();
  }, [loadSessions]);

  // Auto-refresh daftar agar proyek baru langsung muncul.
  useEffect(() => {
    const t = setInterval(loadSessions, 15000);
    return () => clearInterval(t);
  }, [loadSessions]);

  const pair = async (code: string) => {
    if (!code || connecting) return;
    setConnecting(true);
    try {
      const result = await checkPairingCode(code);
      if (!result.valid) {
        toast.error(checkReasonMessage(result.reason));
        return;
      }
      localStorage.setItem(LAST_CODE_KEY, code);
      router.push(`/scan?code=${encodeURIComponent(code)}`);
    } finally {
      setConnecting(false);
    }
  };

  // Tombol Scan: lanjutkan kode terakhir; tanpa kode → scan QR pairing.
  const handleScan = () => {
    if (lastCode) {
      pair(lastCode);
    } else {
      qrDetectedRef.current = false;
      setQrDetected(false);
      setQrMode(true);
    }
  };

  const handleQrDetect = (value: string) => {
    if (qrDetectedRef.current) return;
    const candidate = value.trim().toUpperCase();
    const match = candidate.match(/[A-Z0-9]{4,8}/);
    const target = (match ? match[0] : candidate).slice(0, 8);
    if (!target) return;
    qrDetectedRef.current = true;
    setQrDetected(true);
    setQrMode(false);
    pair(target);
  };

  const { videoRef, canvasRef, state, reset } = useBarcodeDetector({
    active: qrMode,
    onDetect: handleQrDetect,
  });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md space-y-6">
        {/* Branding */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-strong shadow-lg shadow-primary/30">
            <ScanLine className="h-8 w-8 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">VScan</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              HP jadi scanner barcode — pilih proyek, lalu scan
            </p>
          </div>
        </div>

        {/* Mode scan QR (kode pairing) */}
        {qrMode && (
          <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-sm">
            <div className="relative aspect-square w-full">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                {state === "starting" && (
                  <div className="flex items-center gap-2 rounded-xl bg-black/70 px-4 py-3 text-sm text-white">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Menyiapkan kamera…
                  </div>
                )}
                {state === "unsupported" && (
                  <div className="flex flex-col items-center gap-2 rounded-xl bg-black/70 px-5 py-4 text-center text-sm text-white">
                    <CameraOff className="h-6 w-6 text-amber-400" aria-hidden="true" />
                    Browser ini tidak mendukung scan QR.
                    <span className="text-xs text-white/70">
                      Pilih proyek dari daftar di bawah.
                    </span>
                  </div>
                )}
                {state === "error" && (
                  <div className="flex flex-col items-center gap-2 rounded-xl bg-black/70 px-5 py-4 text-center text-sm text-white">
                    <CameraOff className="h-6 w-6 text-red-400" aria-hidden="true" />
                    Tidak bisa mengakses kamera.
                    <span className="text-xs text-white/70">
                      Periksa izin kamera, atau pilih proyek dari daftar.
                    </span>
                  </div>
                )}
                {state === "active" && (
                  <p className="rounded-xl bg-black/60 px-4 py-2 text-xs text-white/80">
                    Arahkan kamera ke QR code di layar kasir
                  </p>
                )}
              </div>
              {qrDetected && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <div className="flex flex-col items-center gap-2 text-white">
                    <Loader2 className="h-8 w-8 animate-spin text-teal-300" aria-hidden="true" />
                    <p className="text-sm">Kode ditemukan — menghubungkan…</p>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                qrDetectedRef.current = false;
                setQrMode(false);
                reset();
              }}
              className="flex w-full items-center justify-center gap-2 bg-white/10 py-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Tutup kamera
            </button>
          </div>
        )}

        {/* Aksi utama */}
        {!qrMode && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleScan}
              disabled={connecting}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary-strong text-white text-lg font-bold shadow-md shadow-primary/30 transition-all hover:bg-primary-hover hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
            >
              {connecting ? (
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              ) : (
                <ScanLine className="h-6 w-6" aria-hidden="true" />
              )}
              {connecting ? "Menghubungkan…" : lastCode ? "Scan" : "Scan (QR Kode)"}
            </button>

            <button
              type="button"
              onClick={() => setRegisterOpen(true)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground transition-all hover:bg-muted active:scale-[0.98]"
            >
              <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
              Daftarkan Proyek / POS
            </button>
          </div>
        )}

        {/* Daftar proyek terdaftar — klik untuk pair */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between pb-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Store className="h-4 w-4 text-primary" aria-hidden="true" />
              Proyek terhubung
            </h2>
            <button
              type="button"
              onClick={loadSessions}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Muat ulang daftar"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>

          {!loaded ? (
            <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Memuat proyek…
            </p>
          ) : sessions.length === 0 ? (
            <div className="py-4 text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                Belum ada proyek terdaftar.
              </p>
              <button
                type="button"
                onClick={() => setRegisterOpen(true)}
                className="mx-auto flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-muted/70"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Daftarkan proyek pertama
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => {
                const isConnected = lastCode === s.code;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pair(s.code)}
                      disabled={connecting}
                      className={
                        "group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all active:scale-[0.99] disabled:opacity-60 " +
                        (isConnected
                          ? "border-primary/50 bg-primary/5 hover:bg-primary/10"
                          : "border-border bg-muted/50 hover:border-primary/40 hover:bg-muted")
                      }
                    >
                      <div
                        className={
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg " +
                          (isConnected ? "bg-primary text-white" : "bg-primary-strong/10 text-primary")
                        }
                      >
                        <Store className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <span
                            className="relative flex h-2 w-2 shrink-0"
                            aria-hidden="true"
                          >
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                          </span>
                          {s.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Kode {s.code} · hingga {formatExpiry(s.expiresAt)}
                          {s.owned && (
                            <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary">
                              milik saya
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                          Aktif
                        </span>
                        {isConnected && (
                          <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-white">
                            Terhubung
                          </span>
                        )}
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Download Scanner Agent untuk komputer kasir */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-1.5 pb-1">
            <HardDriveDownload className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Scanner Agent — komputer kasir</h2>
          </div>
          <p className="pb-3 text-xs text-muted-foreground">
            Install sekali di komputer kasir agar barcode hasil scan HP otomatis
            diketik ke POS.
          </p>
          <a
            href="/api/agent/download"
            download="vscan-agent.zip"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/50 text-sm font-semibold text-foreground transition-all hover:bg-muted active:scale-[0.98]"
          >
            <Download className="h-4 w-4 text-primary" aria-hidden="true" />
            Download vscan-agent.zip
          </a>
        </section>

        {lastCode && !qrMode && (
          <button
            type="button"
            onClick={() => pair(lastCode)}
            disabled={connecting}
            className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <History className="h-3 w-3" aria-hidden="true" />
            Lanjutkan dengan kode terakhir:{" "}
            <span className="font-mono font-semibold tracking-wider">{lastCode}</span>
          </button>
        )}

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <QrCode className="h-3 w-3" aria-hidden="true" />
          Kode pairing otomatis dibuat — tidak perlu mengetik apa pun.
        </p>
      </div>

      <RegisterModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onCreated={() => loadSessions()}
      />
    </main>
  );
}

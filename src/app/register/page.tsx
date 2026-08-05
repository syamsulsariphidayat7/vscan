"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Copy,
  ScanLine,
  RefreshCw,
  PowerOff,
  QrCode,
  Plus,
  Download,
  HardDriveDownload,
} from "lucide-react";
import { toast } from "sonner";
import { RegisterModal } from "@/components/register-modal";

interface SessionInfo {
  id: string;
  code: string;
  label: string;
  status: string;
  expiresAt: string;
  /** True bila sesi dibuat dari browser ini → boleh dikelola. */
  owned: boolean;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function RegisterPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // Muat daftar sesi milik browser ini (cookie owner) setelah render.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSessionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/session");
      const data = await res.json().catch(() => ({}));
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      toast.error("Gagal memuat ulang sesi");
    }
  }, []);

  // Setelah sesi dibuat di modal → tampilkan di daftar.
  const handleCreated = useCallback(
    () => {
      void refreshSessions();
    },
    [refreshSessions]
  );

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Kode disalin!");
    } catch {
      toast.error("Gagal menyalin — salin manual dari kotak kode");
    }
  };

  const actOnSession = useCallback(
    async (id: string, action: "extend" | "close") => {
      setActingId(id);
      try {
        const res = await fetch("/api/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(typeof data.error === "string" ? data.error : "Gagal");
          return;
        }
        toast.success(action === "extend" ? "Sesi diperpanjang 12 jam" : "Sesi ditutup");
        setSessions((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  status: data.session.status,
                  expiresAt: data.session.expiresAt,
                }
              : s
          )
        );
      } finally {
        setActingId(null);
      }
    },
    []
  );

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-strong shadow-lg shadow-primary/30">
            <ScanLine className="h-8 w-8 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Daftarkan Proyek</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Daftarkan proyek/POS — dapat kode pairing untuk HP scan barcode
            </p>
          </div>
        </div>

        {/* Buka modal pendaftaran */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-strong text-white font-semibold shadow-sm transition-all hover:bg-primary-hover hover:shadow-md active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Buat Kode Pairing Baru
        </button>

        {/* Download Scanner Agent untuk komputer kasir */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-1.5 pb-1">
            <HardDriveDownload className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Scanner Agent — komputer kasir</h2>
          </div>
          <p className="pb-3 text-xs text-muted-foreground">
            Install sekali di komputer kasir agar barcode hasil scan HP otomatis
            diketik ke kolom POS — tanpa mengubah kode POS.
          </p>
          <a
            href="/api/agent/download"
            download="vscan-agent.zip"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-strong text-white font-semibold shadow-sm transition-all hover:bg-primary-hover hover:shadow-md active:scale-[0.98]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download vscan-agent.zip
          </a>
          <ol className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-mono font-semibold text-foreground">1.</span>
              Download &amp; ekstrak ZIP di komputer kasir.
            </li>
            <li className="flex gap-2">
              <span className="font-mono font-semibold text-foreground">2.</span>
              Salin <span className="font-mono">agent.env.example</span> jadi{" "}
              <span className="font-mono">agent.env</span>, isi{" "}
              <span className="font-mono">VSCAN_CODE</span> dengan kode pairing di atas.
            </li>
            <li className="flex gap-2">
              <span className="font-mono font-semibold text-foreground">3.</span>
              Windows: double-click{" "}
              <span className="font-mono">start-agent.bat</span> · Linux:{" "}
              <span className="font-mono">./start-agent.sh</span>
            </li>
          </ol>
        </section>

        {/* Daftar sesi aktif milik browser ini */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between pb-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <QrCode className="h-4 w-4 text-primary" aria-hidden="true" />
              Sesi pairing aktif
            </h2>
            {sessionsLoaded && sessions.length > 0 && (
              <button
                type="button"
                onClick={refreshSessions}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Muat ulang
              </button>
            )}
          </div>

          {!sessionsLoaded ? (
            <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Memuat sesi…
            </p>
          ) : sessions.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">
              Belum ada proyek terdaftar. Klik &ldquo;Buat Kode Pairing Baru&rdquo; —
              sesi akan muncul di sini dan bisa dikelola (perpanjang / tutup).
            </p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-border bg-muted/50 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
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
                      <p className="font-mono text-xs tracking-widest text-primary">
                        {s.code}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => copyCode(s.code)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={`Salin kode ${s.code}`}
                        title="Salin kode"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      {s.owned ? (
                        <>
                          <button
                            type="button"
                            onClick={() => actOnSession(s.id, "extend")}
                            disabled={actingId === s.id}
                            className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            title="Perpanjang 12 jam"
                          >
                            {actingId === s.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Perpanjang
                          </button>
                          {s.status === "active" && (
                            <button
                              type="button"
                              onClick={() => actOnSession(s.id, "close")}
                              disabled={actingId === s.id}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
                              aria-label={`Tutup sesi ${s.code}`}
                              title="Tutup sesi"
                            >
                              <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          dari browser lain
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {s.status === "active" ? (
                      <>
                        <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Aktif
                        </span>
                        Berlaku hingga{" "}
                        <span className="font-medium">{formatExpiry(s.expiresAt)}</span>
                      </>
                    ) : (
                      <span className="text-red-500">Sesi ditutup</span>
                    )}
                    {s.owned && (
                      <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary">
                        milik saya
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-center text-xs text-muted-foreground">
          Mau scan barcode?{" "}
          <Link href="/" className="font-medium text-primary hover:underline">
            Masuk sebagai HP →
          </Link>
        </p>
      </div>

      <RegisterModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </main>
  );
}

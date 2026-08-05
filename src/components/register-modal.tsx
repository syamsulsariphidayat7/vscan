"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Copy,
  Check,
  Globe,
  PartyPopper,
  X,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

export interface CreatedSession {
  code: string;
  label: string;
  expiresAt: string;
}

/** Render QR (data URL) dari teks — dipakai untuk kode pairing. */
function useQrData(text: string | null) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!text) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(text, { width: 200, margin: 1, color: { dark: "#0f172a" } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);
  return dataUrl;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Modal pendaftaran proyek (POS/kasir): form nama proyek → setelah dibuat,
 * tampilkan kode pairing besar + QR tanpa pindah halaman.
 * Dipakai bersama oleh landing `/` dan halaman `/register`.
 */
export function RegisterModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Dipanggil setelah sesi berhasil dibuat (untuk refresh daftar sesi). */
  onCreated?: (session: CreatedSession) => void;
}) {
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedSession | null>(null);
  const [copied, setCopied] = useState(false);

  const qrData = useQrData(created ? created.code : null);

  // Reset state tiap modal dibuka, supaya tidak membawa sesi lama.
  useEffect(() => {
    if (open) {
      setCreated(null);
      setError(null);
      setCopied(false);
    }
  }, [open]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  // Tutup dengan tombol Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Kunci scroll body saat modal terbuka.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Gagal membuat sesi"
        );
        return;
      }
      setCreated(data);
      onCreated?.(data);
      toast.success("Sesi pairing dibuat!");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Gagal menyalin — salin manual dari kotak kode");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-modal-fade"
        onClick={close}
        aria-hidden="true"
      />

      {/* Konten modal */}
      <div className="animate-modal-pop relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Tutup"
          title="Tutup"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {!created ? (
          /* ---- Form pendaftaran ---- */
          <div className="space-y-4 pt-2">
            <div className="space-y-2 text-center">
              <h2
                id="register-modal-title"
                className="text-xl font-bold tracking-tight"
              >
                Daftarkan Proyek
              </h2>
              <p className="text-sm text-muted-foreground">
                Daftarkan proyek/kasir — HP langsung bisa scan barcode ke sesi ini
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="rm-label" className="flex items-center gap-1.5 text-sm font-medium">
                  <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
                  Nama proyek / kasir
                </label>
                <input
                  id="rm-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="contoh: Kasir 1 — Apotek Sehat"
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !label.trim()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-strong text-white font-semibold shadow-sm transition-all hover:bg-primary-hover hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Membuat sesi…
                  </>
                ) : (
                  "Buat Kode Pairing"
                )}
              </button>
            </form>
          </div>
        ) : (
          /* ---- Sesi berhasil dibuat ---- */
          <div className="space-y-4 pt-2 text-center">
            <div className="space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-strong shadow-lg shadow-primary/30">
                <PartyPopper className="h-7 w-7 text-white" aria-hidden="true" />
              </div>
              <h2 id="register-modal-title" className="text-2xl font-bold tracking-tight">
                Sesi siap!
              </h2>
              <p className="text-sm text-muted-foreground">
                Proyek <span className="font-medium text-foreground">{created.label}</span>{" "}
                terdaftar. Tampilkan kode ini di layar kasir.
              </p>
            </div>

            {/* Kode pairing + QR */}
            <div className="rounded-2xl border border-border bg-muted/40 p-5 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Kode Pairing
              </p>
              <button
                type="button"
                onClick={() => copyCode(created.code)}
                className="mx-auto block font-mono text-5xl font-bold tracking-[0.25em] text-foreground transition-transform hover:scale-[1.02] active:scale-95"
                aria-label="Salin kode pairing"
                title="Klik untuk salin"
              >
                {created.code}
              </button>
              {qrData && (
                <div className="mx-auto w-fit rounded-xl border border-border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrData}
                    alt={`QR kode pairing ${created.code}`}
                    className="h-40 w-40"
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Scan QR ini dengan HP (tombol QR di halaman depan), atau ketik
                kode manual.
              </p>
              <button
                type="button"
                onClick={() => copyCode(created.code)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/70"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                    Tersalin!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Salin kode
                  </>
                )}
              </button>
              <p className="text-xs text-muted-foreground">
                Berlaku hingga {formatExpiry(created.expiresAt)}
              </p>
            </div>

            {/* Cara pakai */}
            <div className="space-y-2 text-left text-sm text-muted-foreground">
              <p className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">1.</span>
                Pasang Scanner Agent di komputer kasir (sekali) — agent mengambil
                barcode via{" "}
                <span className="font-mono text-xs">GET /api/poll</span> dan
                mengetik ke kolom POS seperti scanner USB.
              </p>
              <p className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">2.</span>
                Kasir membuka VScan di HP, scan QR atau mengetik kode di atas, lalu
                scan barcode.
              </p>
              <p className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">3.</span>
                Detik itu juga barcode masuk ke kolom POS yang sedang fokus — tanpa
                mengubah kode POS.
              </p>
            </div>

            <button
              type="button"
              onClick={close}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-strong text-white font-semibold shadow-sm transition-all hover:bg-primary-hover hover:shadow-md active:scale-[0.98]"
            >
              Selesai
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

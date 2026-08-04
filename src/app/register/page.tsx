"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Link2,
  Loader2,
  ArrowLeft,
  Copy,
  Check,
  ScanLine,
  Globe,
  KeyRound,
  PartyPopper,
} from "lucide-react";
import { toast } from "sonner";

interface CreatedSession {
  code: string;
  label: string;
  webhookUrl: string | null;
  expiresAt: string;
}

export default function RegisterPage() {
  const [label, setLabel] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedSession | null>(null);
  const [copied, setCopied] = useState(false);

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
          webhookUrl: webhookUrl.trim() || undefined,
          webhookToken: token.trim() || undefined,
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
      toast.success("Sesi pairing dibuat!");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Gagal menyalin — salin manual dari kotak kode");
    }
  };

  if (created) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-md space-y-6">
          <Link
            href="/register"
            onClick={() => setCreated(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Daftar sesi lain
          </Link>

          <div className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-strong shadow-lg shadow-primary/30">
              <PartyPopper className="h-7 w-7 text-white" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Sesi siap!</h1>
            <p className="text-sm text-muted-foreground">
              Proyek <span className="font-medium text-foreground">{created.label}</span>{" "}
              terdaftar. Tampilkan kode ini di layar kasir.
            </p>
          </div>

          {/* Kode pairing */}
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Kode Pairing
            </p>
            <button
              type="button"
              onClick={copyCode}
              className="mx-auto block font-mono text-5xl font-bold tracking-[0.25em] text-foreground transition-transform hover:scale-[1.02] active:scale-95"
              aria-label="Salin kode pairing"
              title="Klik untuk salin"
            >
              {created.code}
            </button>
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/70"
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
              Berlaku hingga{" "}
              {new Date(created.expiresAt).toLocaleString("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>

          {/* Info tujuan */}
          <div className="rounded-xl border border-border bg-card/60 px-4 py-3 text-sm space-y-2">
            <p className="flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="text-muted-foreground">Barcode dikirim ke:</span>
            </p>
            <p className="break-all font-mono text-xs">
              {created.webhookUrl ?? "— (tidak ada webhook; pakai GET /api/poll)"}
            </p>
          </div>

          {/* Cara pakai */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex gap-2">
              <span className="font-mono font-semibold text-foreground">1.</span>
              Kasir membuka VScan di HP, mengetik kode di atas, lalu scan barcode.
            </p>
            <p className="flex gap-2">
              <span className="font-mono font-semibold text-foreground">2.</span>
              Tiap scan dikirim ke URL tujuan{" "}
              <span className="font-mono text-xs">POST {created.webhookUrl}</span>{" "}
              dengan body{" "}
              <span className="font-mono text-xs">
                {"{ code, scanId, barcode, token, timestamp }"}
              </span>
              .
            </p>
            <p className="flex gap-2">
              <span className="font-mono font-semibold text-foreground">3.</span>
              Tanpa webhook, polling{" "}
              <span className="font-mono text-xs">GET /api/poll?code=…&token=…</span>.
            </p>
          </div>
        </div>
      </main>
    );
  }

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
              VScan mandiri — proyek apa pun cukup mendaftarkan URL tujuan
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <label htmlFor="label" className="flex items-center gap-1.5 text-sm font-medium">
              <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
              Nama proyek / kasir
            </label>
            <input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="contoh: Kasir 1 — Apotek Sehat"
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="webhookUrl" className="flex items-center gap-1.5 text-sm font-medium">
              <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
              URL tujuan (webhook)
            </label>
            <input
              id="webhookUrl"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://projek-anda.com/api/terima-scan"
              inputMode="url"
              className="h-11 w-full rounded-xl border border-border bg-background px-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              Barcode hasil scan HP dikirim ke URL ini via POST. Kosongkan untuk memakai polling.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="token" className="flex items-center gap-1.5 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              Token rahasia (opsional)
            </label>
            <input
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="secret untuk verifikasi webhook / polling"
              className="h-11 w-full rounded-xl border border-border bg-background px-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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

        <p className="text-center text-xs text-muted-foreground">
          Mau scan barcode?{" "}
          <Link href="/" className="font-medium text-primary hover:underline">
            Masuk sebagai HP →
          </Link>
        </p>
      </div>
    </main>
  );
}

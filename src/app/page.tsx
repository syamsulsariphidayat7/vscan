"use client";

import { useState } from "react";
import Link from "next/link";
import { ScanLine, Smartphone, ShieldCheck, Wifi, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const CODE_PATTERN = /^[A-Z0-9]{4,8}$/;

export default function HomePage() {
  const [code, setCode] = useState("");

  const normalized = code.trim().toUpperCase();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md space-y-8">
        {/* Branding */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-strong shadow-lg shadow-primary/30">
            <ScanLine className="h-10 w-10 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              VScan
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ubah HP jadi scanner barcode wireless untuk POS
            </p>
          </div>
        </div>

        {/* Form kode pairing */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <label htmlFor="pairing-code" className="block text-sm font-medium">
            Kode Pairing
          </label>
          <input
            id="pairing-code"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="contoh: 8FK2QX"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && normalized) {
                if (!CODE_PATTERN.test(normalized)) {
                  toast.error("Kode pairing tidak valid");
                  return;
                }
                window.location.href = `/scan?code=${encodeURIComponent(normalized)}`;
              }
            }}
            className="h-14 w-full rounded-xl border border-border bg-background px-4 text-center font-mono text-2xl font-bold tracking-[0.3em] uppercase focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground text-center">
            Kode ada di panel <span className="font-medium text-foreground">VScan</span> di
            halaman POS kasir — buka, lalu ketik kodenya di sini.
          </p>
          <Link
            href={
              normalized && CODE_PATTERN.test(normalized)
                ? `/scan?code=${encodeURIComponent(normalized)}`
                : "#"
            }
            aria-disabled={!normalized || !CODE_PATTERN.test(normalized)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-strong text-white font-semibold shadow-sm transition-all hover:bg-primary-hover hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            Mulai Scan
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Cara kerja */}
        <div className="space-y-3">
          {[
            {
              icon: Wifi,
              title: "Wireless",
              desc: "Tanpa kabel — HP dan kasir cukup terhubung internet.",
            },
            {
              icon: ShieldCheck,
              title: "Aman",
              desc: "Kode pairing unik + sesi kedaluwarsa otomatis.",
            },
            {
              icon: Smartphone,
              title: "PWA",
              desc: "Pasang ke layar utama HP untuk akses sekali sentuh.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3 rounded-xl border border-border bg-card/60 px-4 py-3"
            >
              <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { Copy, Check, HardDriveDownload } from "lucide-react";
import { toast } from "sonner";

const LINUX_CMD =
  "curl -sSL https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent/install.sh | bash";
const WIN_CMD =
  'curl -sSL https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent/install.ps1 -o %TEMP%\\vscan-install.ps1 && powershell -ExecutionPolicy Bypass -File %TEMP%\\vscan-install.ps1';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Gagal menyalin — salin manual dari kotak perintah");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Salin perintah"
      title="Salin perintah"
    >
      {copied ? (
        <Check className="h-4 w-4 text-primary" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

function CmdRow({ label, cmd }: { label: string; cmd: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-stretch gap-1.5">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-xl border border-border bg-muted/60 px-3 py-2.5 font-mono text-[11px] leading-relaxed">
          {cmd}
        </code>
        <CopyButton text={cmd} />
      </div>
    </div>
  );
}

/** Kartu install Scanner Agent — tampilkan perintah curl (bukan tombol unduh ZIP). */
export function AgentInstall() {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 pb-1">
        <HardDriveDownload className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Scanner Agent — komputer kasir</h2>
      </div>
      <p className="pb-3 text-xs text-muted-foreground">
        Install sekali di komputer kasir agar barcode hasil scan HP otomatis
        diketik ke POS. Salin perintah sesuai sistem operasi komputer kasir:
      </p>
      <div className="space-y-3">
        <CmdRow label="🐧 Linux / macOS" cmd={LINUX_CMD} />
        <CmdRow label="🪟 Windows (Command Prompt)" cmd={WIN_CMD} />
      </div>
    </section>
  );
}

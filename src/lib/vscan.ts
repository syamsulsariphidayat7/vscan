import { isIP } from "node:net";
import { prisma } from "./db";
import type { PendingScan, ScanSession } from "@prisma/client";

// Alfabet tanpa karakter ambigu (0/O, 1/I/L) agar mudah diketik dari HP.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam
export const MAX_PENDING_PER_SESSION = 200;

export function randomPairingCode(length = 6): string {
  let code = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export type SessionLookup =
  | { ok: true; session: ScanSession }
  | { ok: false; reason: "not_found" | "inactive" | "expired" };

/** Ambil sesi aktif dari kode pairing + lazy-close sesi kedaluwarsa. */
export async function lookupActiveSession(
  code: string
): Promise<SessionLookup> {
  const session = await prisma.scanSession.findUnique({ where: { code } });
  if (!session) return { ok: false, reason: "not_found" };
  if (session.status !== "active") return { ok: false, reason: "inactive" };
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.scanSession.update({
      where: { id: session.id },
      data: { status: "closed" },
    });
    return { ok: false, reason: "expired" };
  }
  return { ok: true, session };
}

export interface DeliveryResult {
  delivered: boolean;
  /** true bila sesi tidak punya webhookUrl (proyek harus pakai /api/poll). */
  skipped?: boolean;
  error?: string;
}

/**
 * Cegah SSRF: tolak webhookUrl yang mengarah ke localhost / IP privat /
 * link-local / nama host internal. URL tujuan diisi user lewat endpoint publik
 * /api/session, dan VScan melakukan fetch server-side saat ada barcode.
 */
export function isSafeWebhookUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host === "metadata.google.internal"
  ) {
    return false;
  }

  const ipv = isIP(host);
  if (ipv === 4) {
    const [a, b] = host.split(".").map(Number);
    if (
      a === 127 || // loopback
      a === 10 || // 10/8
      a === 0 ||
      a === 169 || // link-local 169.254/16
      (a === 172 && b >= 16 && b <= 31) || // 172.16/12
      (a === 192 && b === 168) || // 192.168/16
      (a === 100 && b >= 64 && b <= 127) // CGNAT 100.64/10
    ) {
      return false;
    }
    return true;
  }
  if (ipv === 6) {
    if (host === "::1" || host === "::") return false;
    // ULA fc00::/7 & link-local fe80::/10
    if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8")) {
      return false;
    }
    return true;
  }
  return true;
}

/**
 * Kirim barcode ke URL tujuan proyek (webhook). Satu percobaan sinkron dengan
 * timeout 3 dtk; hasil dicatat ke PendingScan (delivered/failed). Bila gagal,
 * proyek tetap bisa mengambil via /api/poll (status failed ikut di-claim).
 * Body: { code, scanId, barcode, token, timestamp }.
 */
export async function deliverWebhook(
  session: ScanSession,
  scan: PendingScan
): Promise<DeliveryResult> {
  if (!session.webhookUrl) return { delivered: false, skipped: true };
  try {
    const res = await fetch(session.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: session.code,
        scanId: scan.id,
        barcode: scan.barcode,
        token: session.webhookToken ?? null,
        timestamp: new Date().toISOString(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { delivered: false, error: `HTTP ${res.status}` };
    return { delivered: true };
  } catch (e) {
    return {
      delivered: false,
      error: e instanceof Error ? e.message : "network error",
    };
  }
}

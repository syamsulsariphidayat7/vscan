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
 * Kirim barcode ke URL tujuan proyek (webhook). Satu percobaan sinkron dengan
 * timeout 5 dtk; hasilnya dicatat ke PendingScan (delivered/failed).
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
      signal: AbortSignal.timeout(5000),
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

/** Bersihkan sesi yang kedaluwarsa (dipanggil berkala — housekeeping ringan). */
export async function cleanupExpiredSessions() {
  await prisma.scanSession.updateMany({
    where: { status: "active", expiresAt: { lt: new Date() } },
    data: { status: "closed" },
  });
}

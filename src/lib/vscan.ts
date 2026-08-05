import { prisma } from "./db";
import type { ScanSession } from "@prisma/client";

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



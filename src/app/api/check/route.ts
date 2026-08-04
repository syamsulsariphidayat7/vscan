import { NextResponse } from "next/server";
import { lookupActiveSession } from "@/lib/vscan";

export const dynamic = "force-dynamic";

/**
 * Validasi kode pairing (server VScan sendiri).
 * POST /api/check  Body: { code }
 * Response: { valid: true, expiresAt? } | { valid: false, reason }
 * reason: invalid | not_found | inactive | expired
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

  if (!code) {
    return NextResponse.json({ valid: false, reason: "invalid" });
  }

  const found = await lookupActiveSession(code);
  if (!found.ok) {
    return NextResponse.json({ valid: false, reason: found.reason });
  }

  return NextResponse.json({
    valid: true,
    expiresAt: found.session.expiresAt.toISOString(),
  });
}

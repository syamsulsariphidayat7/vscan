import { NextResponse } from "next/server";
import { APOTEK_API_URL } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Validasi kode pairing (server-side): terusan ke POST /api/vscan/check
 * apotek. Browser memanggil route sendiri (tanpa CORS) — lebih andal.
 */
export async function POST(req: Request) {
  let code = "";
  try {
    const body = await req.json();
    if (typeof body.code === "string") {
      code = body.code.trim().toUpperCase();
    }
  } catch {
    // body tidak valid — fallback ke reason invalid di bawah
  }
  if (!code) {
    return NextResponse.json({ valid: false, reason: "invalid" });
  }
  try {
    const res = await fetch(`${APOTEK_API_URL}/api/vscan/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return NextResponse.json({
        valid: data.valid === true,
        reason: typeof data.reason === "string" ? data.reason : undefined,
        expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : undefined,
      });
    }
    return NextResponse.json({ valid: false, reason: "server_error" });
  } catch {
    return NextResponse.json({ valid: false, reason: "offline" });
  }
}

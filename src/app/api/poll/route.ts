import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lookupActiveSession } from "@/lib/vscan";

export const dynamic = "force-dynamic";

/**
 * Pengambilan barcode oleh PROYEK (fallback saat tidak memakai webhook).
 *
 * GET /api/poll?code=KODE&token=TOKEN
 *  - code  — kode pairing
 *  - token — harus cocok dgn webhookToken sesi bila sesi punya token
 *
 * Claim-on-read atomic: barcode diambil lalu langsung ditandai `polled`,
 * jadi dua poller tidak memproses barcode yang sama.
 * Response: { scans: [{ id, barcode }] }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();
  const token = url.searchParams.get("token") || "";

  if (!code) {
    return NextResponse.json({ error: "Param code wajib diisi" }, { status: 400 });
  }

  const found = await lookupActiveSession(code);
  if (!found.ok) {
    return NextResponse.json({ scans: [] });
  }
  const session = found.session;

  // Verifikasi token bila sesi memakainya.
  if (session.webhookToken && token !== session.webhookToken) {
    return NextResponse.json({ error: "Token tidak valid" }, { status: 403 });
  }

  const scans = await prisma.$transaction(async (tx) => {
    const pending = await tx.pendingScan.findMany({
      where: { sessionId: session.id, status: "pending" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    if (pending.length === 0) return [];

    const claimed = await tx.pendingScan.updateMany({
      where: { id: { in: pending.map((s) => s.id) }, status: "pending" },
      data: { status: "polled" },
    });
    if (claimed.count === 0) return [];

    return tx.pendingScan.findMany({
      where: { id: { in: pending.map((s) => s.id) } },
      select: { id: true, barcode: true },
      orderBy: { createdAt: "asc" },
    });
  });

  return NextResponse.json({ scans });
}

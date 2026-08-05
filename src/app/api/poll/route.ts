import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lookupActiveSession } from "@/lib/vscan";

export const dynamic = "force-dynamic";

/**
 * Pengambilan barcode oleh PROYEK / Scanner Agent (fallback saat tidak
 * memakai webhook).
 *
 * GET /api/poll?code=KODE
 *  - code — kode pairing
 *
 * Catatan: webhookToken TIDAK diperlukan di sini. Token itu hanya untuk
 * verifikasi webhook di sisi proyek; kode pairing sendiri sudah tampil
 * publik, jadi membuka poll hanya dgn kode konsisten dgn model keamanan
 * (claim-on-read mencegah duplikat).
 *
 * Claim-on-read atomic: barcode diambil lalu langsung ditandai `polled`,
 * jadi dua poller tidak memproses barcode yang sama.
 * Response: { scans: [{ id, barcode }] }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "Param code wajib diisi" }, { status: 400 });
  }

  const found = await lookupActiveSession(code);
  if (!found.ok) {
    return NextResponse.json({ scans: [] });
  }
  const session = found.session;

  // Claim pending ATAU failed (webhook sempat gagal) — biar tidak ada scan
  // yang "nyangkut" selamanya ketika URL tujuan down.
  const CLAIMABLE: ("pending" | "failed")[] = ["pending", "failed"];
  const scans = await prisma.$transaction(async (tx) => {
    const pending = await tx.pendingScan.findMany({
      where: { sessionId: session.id, status: { in: CLAIMABLE } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    if (pending.length === 0) return [];

    const claimed = await tx.pendingScan.updateMany({
      where: { id: { in: pending.map((s) => s.id) }, status: { in: CLAIMABLE } },
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

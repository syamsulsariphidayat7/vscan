import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lookupActiveSession, SESSION_TTL_MS } from "@/lib/vscan";

export const dynamic = "force-dynamic";

// Auto-extend: selama Scanner Agent aktif polling, sesi tidak pernah kadaluarsa.
// Perpanjang +12 jam bila tersisa < 6 jam → paling banyak 1x tulis DB per 6 jam
// (agent polling tiap detik, tapi threshold membuat penulisan jarang).
const EXTEND_BELOW_MS = 6 * 60 * 60 * 1000;

async function maybeAutoExtend(session: { id: string; expiresAt: Date }) {
  if (session.expiresAt.getTime() - Date.now() >= EXTEND_BELOW_MS) return;
  await prisma.scanSession.update({
    where: { id: session.id },
    data: {
      status: "active",
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
}

/**
 * Pengambilan barcode oleh PROYEK / Scanner Agent (fallback saat tidak
 * memakai webhook).
 *
 * GET /api/poll?code=KODE
 *  - code — kode pairing
 *
 * Catatan: kode pairing sudah tampil publik, jadi membuka poll hanya dgn
 * kode konsisten dgn model keamanan (claim-on-read mencegah duplikat).
 *
 * Auto-extend: selama ada yang aktif polling (Scanner Agent), sesi dijaga
 * tetap hidup — diperpanjang +12 jam bila tersisa < 6 jam. Sesi yang sudah
 * ditutup (close/hapus) TIDAK dihidupkan ulang.
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

  // Selama ada yang aktif polling (agent kasir), sesi dijaga tetap hidup.
  await maybeAutoExtend(session);

  // Claim barcode pending (belum diambil siapa pun).
  const CLAIMABLE: ("pending")[] = ["pending"];
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

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
 * Long-poll (?longpoll=1): Scanner Agent menahan koneksi ~6 detik; server
 * membalas seketika begitu barcode masuk (bukan menunggu siklus berikutnya).
 *
 * Claim-on-read atomic: barcode diambil lalu langsung ditandai `polled`,
 * jadi dua poller tidak memproses barcode yang sama.
 * Response: { scans: [{ id, barcode }] }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();
  const longpoll = url.searchParams.get("longpoll") === "1";

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

  // Claim barcode pending (belum diambil siapa pun). Claim-on-read atomic:
  // dua poller tidak memproses barcode yang sama.
  const CLAIMABLE: ("pending")[] = ["pending"];
  const claim = async () =>
    prisma.$transaction(async (tx) => {
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

  // Long-poll (?longpoll=1): saat tidak ada barcode, TAHAN koneksi dan cek DB
  // tiap 250ms sampai ada barcode baru (atau timeout 6 detik). Scanner Agent
  // memakai mode ini: barcode terdeteksi ~0,3 detik setelah di-push (bukan
  // menunggu siklus polling berikutnya), dan beban request turun drastis
  // (1 koneksi tahan ~6s vs request tiap detik). Batas fungsi Hobby 10s,
  // jadi hold 6s aman. Tanpa param ini perilaku lama (balas seketika).
  const LONGPOLL_HOLD_MS = 6000;
  const LONGPOLL_CHECK_MS = 250;
  const deadline = Date.now() + LONGPOLL_HOLD_MS;

  while (true) {
    const scans = await claim();
    if (scans.length > 0) return NextResponse.json({ scans });
    if (!longpoll || Date.now() >= deadline) {
      return NextResponse.json({ scans: [] });
    }
    await new Promise((r) => setTimeout(r, LONGPOLL_CHECK_MS));
  }
}

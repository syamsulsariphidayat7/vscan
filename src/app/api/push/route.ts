import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lookupActiveSession, MAX_PENDING_PER_SESSION } from "@/lib/vscan";

export const dynamic = "force-dynamic";

/**
 * Terima scan dari HP (client).
 * POST /api/push  Body: { code, barcode }
 *
 * Alur: validasi sesi → simpan PendingScan. Scanner Agent / proyek mengambil
 * barcode via GET /api/poll (claim-on-read).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const barcode = typeof body.barcode === "string" ? body.barcode.trim() : "";

  if (!code || !barcode) {
    return NextResponse.json(
      { ok: false, error: "Kode pairing dan barcode wajib diisi" },
      { status: 400 }
    );
  }
  if (!/^[A-Za-z0-9]{3,64}$/.test(barcode)) {
    return NextResponse.json(
      { ok: false, error: "Barcode harus 3–64 karakter alfanumerik" },
      { status: 400 }
    );
  }

  const found = await lookupActiveSession(code);
  if (!found.ok) {
    const reason =
      found.reason === "not_found"
        ? "Kode pairing tidak ditemukan"
        : "Sesi VScan sudah ditutup atau kedaluwarsa";
    return NextResponse.json({ ok: false, error: reason }, { status: 404 });
  }
  const session = found.session;

  // Batasi antrean agar kode tidak bisa dibanjiri.
  const pendingCount = await prisma.pendingScan.count({
    where: { sessionId: session.id, status: "pending" },
  });
  if (pendingCount >= MAX_PENDING_PER_SESSION) {
    return NextResponse.json(
      { ok: false, error: "Antrean VScan penuh — tunggu proyek memproses" },
      { status: 429 }
    );
  }

  const scan = await prisma.pendingScan.create({
    data: { sessionId: session.id, barcode },
  });

  return NextResponse.json(
    { ok: true, id: scan.id, barcode: scan.barcode },
    { status: 201 }
  );
}

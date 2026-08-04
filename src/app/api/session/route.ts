import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomPairingCode, SESSION_TTL_MS } from "@/lib/vscan";

export const dynamic = "force-dynamic";

/**
 * Daftarkan proyek (POS/kasir apa pun) ke VScan → dapat kode pairing.
 *
 * POST /api/session
 * Body: { label, webhookUrl?, webhookToken? }
 *  - label         — nama proyek/kasir (wajib)
 *  - webhookUrl    — URL tujuan: VScan mengirim barcode ke sini (opsional;
 *                    tanpa ini proyek ambil via GET /api/poll)
 *  - webhookToken  — secret bersama utk verifikasi di sisi proyek (opsional)
 *
 * Response 201: { id, code, label, webhookUrl, expiresAt }
 * Sesi aktif 12 jam; buat sesi baru saat kedaluwarsa.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const webhookUrl =
    typeof body.webhookUrl === "string" && body.webhookUrl.trim()
      ? body.webhookUrl.trim()
      : null;
  const webhookToken =
    typeof body.webhookToken === "string" && body.webhookToken.trim()
      ? body.webhookToken.trim()
      : null;

  if (!label) {
    return NextResponse.json(
      { error: "Label proyek wajib diisi" },
      { status: 400 }
    );
  }
  if (label.length > 80) {
    return NextResponse.json(
      { error: "Label terlalu panjang (maks 80 karakter)" },
      { status: 400 }
    );
  }
  if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
    return NextResponse.json(
      { error: "URL tujuan harus http(s)://…" },
      { status: 400 }
    );
  }

  const session = await prisma.scanSession.create({
    data: {
      code: randomPairingCode(),
      label,
      webhookUrl,
      webhookToken,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return NextResponse.json(
    {
      id: session.id,
      code: session.code,
      label: session.label,
      webhookUrl: session.webhookUrl,
      expiresAt: session.expiresAt.toISOString(),
    },
    { status: 201 }
  );
}

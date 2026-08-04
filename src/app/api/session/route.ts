import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomPairingCode, SESSION_TTL_MS, isSafeWebhookUrl } from "@/lib/vscan";

export const dynamic = "force-dynamic";

// Rate limit sederhana per IP (in-memory): maks 20 sesi per jam per IP —
// mencegah spam pembuatan sesi / registrasi SSRF target.
const RATE_LIMIT_PER_HOUR = 20;
const rateLimit = new Map<string, number[]>();

function allowSessionCreation(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const times = (rateLimit.get(ip) || []).filter((t) => now - t < windowMs);
  if (times.length >= RATE_LIMIT_PER_HOUR) {
    rateLimit.set(ip, times);
    return false;
  }
  times.push(now);
  rateLimit.set(ip, times);
  return true;
}

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

  // Rate limit per IP (dari header proxy — Vercel/Next.js menyediakan).
  const ip = (req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  if (!allowSessionCreation(ip)) {
    return NextResponse.json(
      { error: "Terlalu banyak sesi dibuat — coba lagi nanti" },
      { status: 429 }
    );
  }

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
  if (webhookUrl && webhookUrl.length > 500) {
    return NextResponse.json(
      { error: "URL tujuan terlalu panjang (maks 500 karakter)" },
      { status: 400 }
    );
  }
  if (webhookUrl && !isSafeWebhookUrl(webhookUrl)) {
    return NextResponse.json(
      { error: "URL tujuan tidak diizinkan (localhost / IP privat tidak boleh)" },
      { status: 400 }
    );
  }
  if (webhookToken && webhookToken.length > 200) {
    return NextResponse.json(
      { error: "Token terlalu panjang (maks 200 karakter)" },
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

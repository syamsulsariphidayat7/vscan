import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomPairingCode, SESSION_TTL_MS } from "@/lib/vscan";

export const dynamic = "force-dynamic";

// Rate limit sederhana per IP (in-memory): maks 20 sesi per jam per IP —
// mencegah spam pembuatan sesi / registrasi SSRF target.
const RATE_LIMIT_PER_HOUR = 20;
const rateLimit = new Map<string, number[]>();

const OWNER_COOKIE = "vscan_owner";
const OWNER_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 tahun

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

function getClientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
}

function getOwnerId(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${OWNER_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Ambil/muat cookie pemilik untuk respons (buat baru bila belum ada). */
function ownerCookie(ownerId: string | null): string {
  const id = ownerId || randomPairingCode(12);
  return `${OWNER_COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${OWNER_COOKIE_MAX_AGE}`;
}

/**
 * Daftarkan proyek (POS/kasir apa pun) ke VScan → dapat kode pairing.
 *
 * POST /api/session
 * Body: { label }
 *  - label — nama proyek/kasir (wajib)
 *
 * Response 201: { id, code, label, expiresAt }
 * Sesi aktif 12 jam (auto-extend selama ada yang polling); buat sesi baru
 * saat kedaluwarsa. Set cookie `vscan_owner` agar sesi bisa dilihat/dikelola
 * di halaman /register.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim() : "";

  if (!allowSessionCreation(getClientIp(req))) {
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

  // Owner id dipastikan ADA sebelum create: sesi pertama (tanpa cookie) harus
  // tetap masuk daftar milik browser, jadi pakai id yang sama untuk cookie.
  const ownerId = getOwnerId(req) ?? randomPairingCode(12);
  const session = await prisma.scanSession.create({
    data: {
      code: randomPairingCode(),
      label,
      ownerId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return NextResponse.json(
    {
      id: session.id,
      code: session.code,
      label: session.label,
      expiresAt: session.expiresAt.toISOString(),
    },
    { status: 201, headers: { "Set-Cookie": ownerCookie(ownerId) } }
  );
}

/**
 * Daftar SEMUA sesi aktif (publik) — dipakai landing `/` agar HP tinggal
 * klik proyek untuk pair, dan halaman /register untuk mengelola milik sendiri.
 *
 * GET /api/session
 * Response 200: { sessions: [{ id, code, label, status, expiresAt, owned }] }
 *  - owned: true bila sesi dibuat dari browser ini (cookie vscan_owner) →
 *    halaman /register hanya menampilkan tombol kelola utk sesi owned.
 */
export async function GET(req: Request) {
  const ownerId = getOwnerId(req);
  const sessions = await prisma.scanSession.findMany({
    where: { status: "active", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      label: true,
      status: true,
      ownerId: true,
      expiresAt: true,
      createdAt: true,
    },
    take: 50,
  });
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      code: s.code,
      label: s.label,
      status: s.status,
      expiresAt: s.expiresAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      owned: ownerId != null && s.ownerId === ownerId,
    })),
  });
}

/**
 * Kelola sesi: perpanjang atau HAPUS PERMANEN.
 *
 * PATCH /api/session
 * Body: { id, action: "extend" | "close" }
 *  - extend — perpanjang 12 jam dari sekarang (hanya sesi milik browser ini)
 *  - close  — HAPUS PERMANEN sesi + seluruh antrean barcode-nya (cascade).
 *             Boleh dari browser mana pun: kode pairing sudah tampil publik
 *             & push/poll terbuka, jadi hapus konsisten dgn model keamanan
 *             tersebut. TIDAK BISA DIBATALKAN.
 * Response 200: { ok: true, session: {...} } (extend)
 *             | { ok: true, deleted: true, id } (close) | 404 | 403
 */
export async function PATCH(req: Request) {
  const ownerId = getOwnerId(req);
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action;

  if (!id || (action !== "extend" && action !== "close")) {
    return NextResponse.json(
      { error: "Body harus berisi id dan action (extend | close)" },
      { status: 400 }
    );
  }

  const session = await prisma.scanSession.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
  }

  // Perpanjang hanya boleh pemilik sesi (aksi pengelolaan milik sendiri).
  if (action === "extend" && (!ownerId || session.ownerId !== ownerId)) {
    return NextResponse.json(
      { error: "Perpanjang hanya untuk sesi milik browser ini" },
      { status: 403 }
    );
  }

  if (action === "extend") {
    const updated = await prisma.scanSession.update({
      where: { id },
      data: {
        status: "active",
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return NextResponse.json({
      ok: true,
      session: {
        id: updated.id,
        code: updated.code,
        label: updated.label,
        status: updated.status,
        expiresAt: updated.expiresAt.toISOString(),
      },
    });
  }

  // close → HARD DELETE. PendingScan terhapus otomatis via ON DELETE CASCADE
  // (FK PendingScan.sessionId di migrasi init sudah cascade). Pakai deleteMany
  // agar idempoten: kalau sesi sudah dihapus request lain (double-click, dua
  // tab), tidak throw P2025 → cukup balas 404.
  const deleted = await prisma.scanSession.deleteMany({ where: { id } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, deleted: true, id });
}

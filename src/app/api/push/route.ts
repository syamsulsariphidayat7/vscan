import { NextResponse } from "next/server";
import { APOTEK_API_URL } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Terusan push barcode ke POST /api/vscan/push apotek (server-side).
 * Status & body apotek diteruskan apa adanya agar klien bisa membedakan
 * 201 (ok), 404 (kode tak dikenal), 410 (sesi ditutup/kedaluwarsa),
 * 429 (antrean penuh).
 */
export async function POST(req: Request) {
  let code = "";
  let barcode = "";
  try {
    const body = await req.json();
    if (typeof body.code === "string") code = body.code.trim().toUpperCase();
    if (typeof body.barcode === "string") barcode = body.barcode.trim();
  } catch {
    // body tidak valid — fallback ke error di bawah
  }
  if (!code || !barcode) {
    return NextResponse.json(
      { ok: false, error: "Kode pairing dan barcode wajib diisi" },
      { status: 400 }
    );
  }
  try {
    const res = await fetch(`${APOTEK_API_URL}/api/vscan/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, barcode }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Tidak bisa terhubung ke server apotek" },
      { status: 502 }
    );
  }
}

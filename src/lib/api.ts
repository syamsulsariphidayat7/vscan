/**
 * Klien API VScan.
 * `NEXT_PUBLIC_APOTEK_API_URL` = base URL aplikasi apotek yang punya endpoint
 * /api/vscan/push (lihat .env.example). Endpoint ini publik + CORS, jadi HP
 * tidak perlu login apotek — cukup kode pairing dari POS.
 */
export const APOTEK_API_URL =
  process.env.NEXT_PUBLIC_APOTEK_API_URL || "http://localhost:3000";

export interface PushResult {
  ok: boolean;
  error?: string;
  id?: string;
}

/** Kirim satu barcode hasil scan HP ke sesi pairing POS. */
export async function pushBarcode(
  code: string,
  barcode: string
): Promise<PushResult> {
  try {
    const res = await fetch(`${APOTEK_API_URL}/api/vscan/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, barcode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof data.error === "string"
            ? data.error
            : `Server ${APOTEK_API_URL} menolak (${res.status})`,
      };
    }
    return { ok: true, id: typeof data.id === "string" ? data.id : undefined };
  } catch {
    return {
      ok: false,
      error: `Tidak bisa terhubung ke ${APOTEK_API_URL}. Pastikan apotek online.`,
    };
  }
}

/** Cek apakah kode pairing valid (sesi aktif di server). */
export async function checkPairingCode(code: string): Promise<boolean> {
  try {
    // Barcode KOSONG sengaja dikirim: server menolak 400 untuk kode valid &
    // aktif (tanpa membuat PendingScan), dan menolak 404/410 untuk kode yang
    // tidak dikenal/kedaluwarsa.
    const res = await fetch(`${APOTEK_API_URL}/api/vscan/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, barcode: "" }),
    });
    if (res.status === 400) return true;
    if (res.status === 404 || res.status === 410) return false;
    // Jaringan error / 5xx — anggap valid agar user tetap bisa coba scan.
    return true;
  } catch {
    return true;
  }
}

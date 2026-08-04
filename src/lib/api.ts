/**
 * Klien API VScan.
 *
 * Browser HANYA memanggil route VScan sendiri (/api/push, /api/check) yang
 * meneruskan permintaan ke apotek secara server-side — tanpa CORS, dan base
 * URL apotek tidak perlu diketahui browser (lihat src/lib/server.ts).
 */

export interface PushResult {
  ok: boolean;
  error?: string;
  id?: string;
  /** Status HTTP dari apotek (via proxy): 201 ok · 404 kode tak dikenal · 410 sesi mati · 429 penuh. */
  status?: number;
}

export type CheckReason =
  | "invalid"
  | "not_found"
  | "inactive"
  | "offline"
  | "server_error";

export interface CheckResult {
  valid: boolean;
  reason?: CheckReason;
  expiresAt?: string;
}

/** Kirim satu barcode hasil scan HP ke sesi pairing POS. */
export async function pushBarcode(
  code: string,
  barcode: string
): Promise<PushResult> {
  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, barcode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          typeof data.error === "string"
            ? data.error
            : `Gagal mengirim barcode (${res.status})`,
      };
    }
    return { ok: true, id: typeof data.id === "string" ? data.id : undefined };
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Tidak bisa terhubung ke VScan. Pastikan HP online.",
    };
  }
}

/** Cek apakah kode pairing valid & sesi masih aktif di apotek. */
export async function checkPairingCode(code: string): Promise<CheckResult> {
  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      valid: data.valid === true,
      reason:
        typeof data.reason === "string" ? (data.reason as CheckReason) : undefined,
      expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : undefined,
    };
  } catch {
    return { valid: false, reason: "offline" };
  }
}

/** Pesan ramah pengguna per reason hasil cek kode. */
export function checkReasonMessage(reason?: CheckReason): string {
  switch (reason) {
    case "not_found":
      return "Kode pairing tidak ditemukan. Periksa kode di panel VScan POS.";
    case "inactive":
      return "Sesi VScan sudah ditutup atau kedaluwarsa. Buat sesi baru di POS.";
    case "offline":
      return "Tidak bisa terhubung ke server. Pastikan HP online, lalu coba lagi.";
    case "server_error":
      return "Server apotek sedang bermasalah. Coba lagi sebentar lagi.";
    case "invalid":
      return "Kode pairing tidak valid.";
    default:
      return "Kode pairing tidak valid atau sesi tidak aktif.";
  }
}

/**
 * Konfigurasi sisi server (hanya dipakai route /api/check & /api/push).
 * Browser TIDAK pernah menyentuh apotek langsung — semua permintaan lewat
 * proxy VScan, jadi CORS apotek tidak relevan untuk aplikasi ini.
 *
 * Prioritas: APOTEK_API_URL (server-only) → NEXT_PUBLIC_APOTEK_API_URL
 * (fallback lama) → localhost untuk dev lokal.
 */
export const APOTEK_API_URL =
  process.env.APOTEK_API_URL ||
  process.env.NEXT_PUBLIC_APOTEK_API_URL ||
  "http://localhost:3000";

// Fail-fast yang jelas di produksi: tanpa env, semua push/check akan gagal
// dengan pesan "offline" yang membingungkan.
if (
  process.env.NODE_ENV === "production" &&
  !process.env.APOTEK_API_URL &&
  !process.env.NEXT_PUBLIC_APOTEK_API_URL
) {
  console.error(
    "[vscan] APOTEK_API_URL belum diset! /api/check & /api/push akan gagal. " +
      "Set APOTEK_API_URL di Vercel (Settings > Environment Variables)."
  );
}

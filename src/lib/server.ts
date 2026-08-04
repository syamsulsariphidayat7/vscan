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

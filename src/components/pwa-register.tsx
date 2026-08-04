"use client";

import { useEffect } from "react";

/** Daftarkan service worker (cache-first untuk shell aplikasi). */
export function PwaRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW gagal registrasi — aplikasi tetap jalan tanpa offline shell.
    });
  }, []);

  return null;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

interface BarcodeDetectorWindow extends Window {
  BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
}

export type ScanState =
  | "idle" // belum mulai
  | "starting" // meminta izin kamera
  | "active" // kamera jalan & deteksi aktif
  | "unsupported" // browser tidak punya BarcodeDetector / kamera ditolak
  | "error";

export interface ScanResult {
  rawValue: string;
}

/**
 * Scanner barcode kamera berbasis native `BarcodeDetector` (didukung Chrome,
 * Edge, Android Chrome, dan iOS Safari 17+). Tidak ada dependency eksternal.
 *
 * - Minta `getUserMedia({ video: { facingMode: "environment" } })`
 * - Loop deteksi tiap frame dari video ke canvas 2D
 * - Debounce: barcode sama tidak di-report 2x dalam `cooldownMs`
 */
export function useBarcodeDetector({
  active,
  onDetect,
  cooldownMs = 1500,
}: {
  active: boolean;
  onDetect: (code: string) => void;
  cooldownMs?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const onDetectRef = useRef(onDetect);
  const lastCodeRef = useRef("");
  const lastDetectedAtRef = useRef(0);
  const rafRef = useRef<number>(0);
  const [state, setState] = useState<ScanState>("idle");

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  // Setup kamera + detector.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const win = window as BarcodeDetectorWindow;
    if (typeof win.BarcodeDetector === "undefined") {
      setState("unsupported");
      return;
    }

    const setup = async () => {
      setState("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        try {
          detectorRef.current = new win.BarcodeDetector!({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
          });
        } catch {
          detectorRef.current = new win.BarcodeDetector!();
        }
        if (!cancelled) setState("active");
      } catch {
        if (!cancelled) setState("error");
      }
    };

    setup();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  // Loop deteksi: video → canvas → BarcodeDetector.
  useEffect(() => {
    if (state !== "active") return;

    const detect = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const detector = detectorRef.current;
      if (video && canvas && detector) {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx && video.readyState >= 2 && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const codes = await detector.detect(canvas);
            const now = Date.now();
            for (const c of codes) {
              if (c.rawValue && c.rawValue !== lastCodeRef.current) {
                if (now - lastDetectedAtRef.current > cooldownMs) {
                  lastCodeRef.current = c.rawValue;
                  lastDetectedAtRef.current = now;
                  onDetectRef.current(c.rawValue);
                }
              }
            }
          } catch {
            // frame gagal dideteksi — lanjut frame berikutnya
          }
        }
      }
      rafRef.current = requestAnimationFrame(detect);
    };

    rafRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state, cooldownMs]);

  // Reset cooldown barcode saat komponen re-mount / kode baru.
  const reset = useCallback(() => {
    lastCodeRef.current = "";
    lastDetectedAtRef.current = 0;
  }, []);

  return { videoRef, canvasRef, state, reset };
}

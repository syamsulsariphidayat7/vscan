import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "VScan — Scanner Barcode HP",
  description:
    "Ubah HP menjadi scanner barcode wireless untuk POS. Scan dari HP, barang langsung masuk keranjang kasir.",
  applicationName: "VScan",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VScan",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Tema mengikuti preferensi sistem (light/dark) — tidak memaksa dark.
const themeScript = `
(function () {
  try {
    var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
      root.classList.toggle("dark", e.matches);
    });
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <Script id="theme-script" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster position="top-center" richColors />
        <PwaRegister />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster position="top-center" richColors />
        <PwaRegister />
      </body>
    </html>
  );
}

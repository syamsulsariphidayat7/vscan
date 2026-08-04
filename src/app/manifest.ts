import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VScan — Scanner Barcode HP",
    short_name: "VScan",
    description:
      "Ubah HP menjadi scanner barcode wireless untuk POS. Scan dari HP, barang langsung masuk keranjang kasir.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0d9488",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

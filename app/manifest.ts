import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VDC Club",
    short_name: "VDC Club",
    description: "Digitale Vereinszentrale des Vestischen Darts Club e.V.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08100f",
    theme_color: "#08100f",
    orientation: "any",
    lang: "de-DE",
    categories: ["sports", "productivity"],
    icons: [
      {
        src: "/api/pwa-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

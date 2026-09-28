import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GOODLIFE Vendor POS",
    short_name: "GL POS",
    description: "High-speed Vendor Point of Sale & Inventory Terminal for GOODLIFE Festivals",
    start_url: "/vendor/sell",
    display: "standalone",
    background_color: "#142B4C",
    theme_color: "#142B4C",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      }
    ]
  };
}

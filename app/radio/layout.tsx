import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "GOODLIFE Radio 254 | Live Playout & Festival Set Vault",
  },
  description:
    "Tune into GOODLIFE Radio 254. Live 24/7 festival airwaves, Sheng DJ drops, and exclusive Afro House master sets from Marara Camp, Thika.",
  alternates: {
    canonical: "/radio",
  },
  openGraph: {
    title: "GOODLIFE Radio 254 | Live Playout & Festival Set Vault",
    description:
      "Tune into GOODLIFE Radio 254. Live 24/7 festival airwaves, Sheng DJ drops, and exclusive Afro House master sets.",
    url: "/radio",
    siteName: "GOODLIFE",
    locale: "en_KE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GOODLIFE Radio 254 | Live Playout & Festival Set Vault",
    description:
      "Tune into GOODLIFE Radio 254. Live 24/7 festival airwaves, Sheng DJ drops, and exclusive Afro House master sets.",
  },
};

export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

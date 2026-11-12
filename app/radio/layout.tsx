import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "GOODLIFE Radio 254 · 24/7 Live Festival Airwaves & DJ Vault",
  },
  description:
    "Listen live to GOODLIFE Radio 254. Uninterrupted 24/7 Afro House, Amapiano, Sheng DJ drops, and exclusive master sets from Nairobi & Marara Camp.",
  alternates: {
    canonical: "/radio",
  },
  openGraph: {
    title: "GOODLIFE Radio 254 · 24/7 Live Festival Airwaves",
    description:
      "Listen live to GOODLIFE Radio 254. 24/7 uninterrupted Afro House, Amapiano, live Sheng DJ drops, and exclusive festival sets.",
    url: "/radio",
    siteName: "GOODLIFE Radio 254",
    locale: "en_KE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GOODLIFE Radio 254 · 24/7 Live Festival Airwaves",
    description:
      "Listen live to GOODLIFE Radio 254. 24/7 uninterrupted Afro House, Amapiano, live Sheng DJ drops, and exclusive festival sets.",
  },
};

export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

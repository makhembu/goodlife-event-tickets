import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#16181D",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  manifest: "/manifests/radio.json",
  title: {
    absolute: "GOODLIFE Radio · 24/7 Live Festival Airwaves & DJ Vault",
  },
  description:
    "Listen live to GOODLIFE Radio. Uninterrupted 24/7 Afro House, Amapiano, Sheng DJ drops, and exclusive master sets from Nairobi & Marara Camp.",
  alternates: {
    canonical: "/radio",
  },
  openGraph: {
    title: "GOODLIFE Radio · 24/7 Live Festival Airwaves",
    description:
      "Listen live to GOODLIFE Radio. 24/7 uninterrupted Afro House, Amapiano, live Sheng DJ drops, and exclusive festival sets.",
    url: "/radio",
    siteName: "GOODLIFE Radio",
    locale: "en_KE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GOODLIFE Radio · 24/7 Live Festival Airwaves",
    description:
      "Listen live to GOODLIFE Radio. 24/7 uninterrupted Afro House, Amapiano, live Sheng DJ drops, and exclusive festival sets.",
  },
};

export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0D0F12] text-[#FBF9F6] min-h-screen w-full">
      {children}
    </div>
  );
}

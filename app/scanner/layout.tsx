import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GOODLIFE Gate Scanner",
  description: "Official Gate Admission & Ticket Verification Scanner for GOODLIFE Festivals",
  manifest: "/manifests/scanner.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GL Scanner",
  },
  icons: {
    apple: "/icons/scanner-192.png",
  },
};

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

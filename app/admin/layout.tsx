import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GOODLIFE Admin Console",
  description: "Executive Festival Management, Ticket Orders, and WAHA Console",
  manifest: "/manifests/admin.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GL Admin",
  },
  icons: {
    apple: "/icon.png",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

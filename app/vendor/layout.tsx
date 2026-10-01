import type { Metadata } from "next";
import VendorShell from "./VendorShell";

export const metadata: Metadata = {
  title: "GOODLIFE Vendor POS",
  description: "Point of Sale & Inventory Terminal for GOODLIFE Festival Vendors",
  manifest: "/manifests/vendor.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GL POS",
  },
  icons: {
    apple: "/icon.png",
  },
};

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return <VendorShell>{children}</VendorShell>;
}

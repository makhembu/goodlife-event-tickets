import React from "react";
import Link from "next/link";
import { Radio } from "lucide-react";

export const metadata = {
  manifest: "/manifests/presenter.json",
  title: "Presenter Portal | GOODLIFE Radio 254",
  description: "GOODLIFE Radio Presenter Studio and Schedule Management",
};

export default function PresenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-brand-off-white text-brand-navy font-mono selection:bg-brand-accent selection:text-brand-navy">
      {children}
    </div>
  );
}

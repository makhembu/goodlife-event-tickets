"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminScannerRedirect() {
  const router = useRouter();

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    router.replace(`/scanner${search}`);
  }, [router]);

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center text-brand-accent font-display text-2xl uppercase tracking-wider animate-pulse font-mono">
      Launching Gate Terminal...
    </div>
  );
}

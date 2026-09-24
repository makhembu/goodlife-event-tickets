"use client";

import React, { useEffect, useState } from "react";
import { Store, Tag, List, Users, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/vendor/login";
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    if (!isLoginPage) {
      fetch("/api/vendor/session")
        .then(res => {
          if (!res.ok) throw new Error("Unauthorized");
          return res.json();
        })
        .then(data => setSession(data.session))
        .catch(() => router.push("/vendor/login"));
    }
  }, [pathname, isLoginPage, router]);

  const handleLogout = async () => {
    await fetch("/api/vendor/logout", { method: "POST" });
    router.push("/vendor/login");
  };

  if (isLoginPage) {
    return <div className="w-full min-h-[100dvh] bg-brand-navy">{children}</div>;
  }

  if (!session) {
    return <div className="w-full min-h-[100dvh] bg-brand-navy flex items-center justify-center text-brand-accent animate-pulse font-display text-2xl uppercase">Loading Terminal...</div>;
  }

  return (
    <div className="w-full min-h-[100dvh] bg-brand-off-white text-brand-navy flex flex-col md:flex-row font-mono">
      {/* Sidebar / Bottom Nav */}
      <nav className="w-full md:w-24 lg:w-48 md:h-[100dvh] bg-brand-navy text-brand-off-white flex md:flex-col justify-between border-t-4 md:border-t-0 md:border-r-4 border-brand-accent order-last md:order-first z-50 fixed md:sticky bottom-0">
        <div className="flex md:flex-col w-full md:w-auto h-16 md:h-auto items-center md:items-stretch overflow-x-auto md:overflow-visible overflow-y-hidden">
          <div className="hidden md:flex p-4 items-center justify-center border-b-2 border-brand-accent/20 mb-2">
            <Store className="w-8 h-8 text-brand-accent" />
          </div>
          
          <Link href="/vendor/sell" className={`flex-1 md:flex-none flex flex-col items-center justify-center md:py-4 px-2 hover:bg-brand-accent hover:text-brand-navy transition-colors ${pathname === "/vendor/sell" ? "bg-brand-accent text-brand-navy" : ""}`}>
            <Tag className="w-6 h-6 mb-1" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest">Sell</span>
          </Link>
          <Link href="/vendor/menu" className={`flex-1 md:flex-none flex flex-col items-center justify-center md:py-4 px-2 hover:bg-brand-accent hover:text-brand-navy transition-colors ${pathname === "/vendor/menu" ? "bg-brand-accent text-brand-navy" : ""}`}>
            <List className="w-6 h-6 mb-1" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest">Menu</span>
          </Link>
          <Link href="/vendor/tabs" className={`flex-1 md:flex-none flex flex-col items-center justify-center md:py-4 px-2 hover:bg-brand-accent hover:text-brand-navy transition-colors ${pathname === "/vendor/tabs" ? "bg-brand-accent text-brand-navy" : ""}`}>
            <Users className="w-6 h-6 mb-1" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest">Tabs</span>
          </Link>
        </div>
        
        <button onClick={handleLogout} className="hidden md:flex flex-col items-center justify-center py-4 px-2 hover:bg-red-500 hover:text-white transition-colors border-t-2 border-brand-accent/20">
          <LogOut className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Logout</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 w-full h-[calc(100dvh-4rem)] md:h-[100dvh] overflow-y-auto">
        <header className="sticky top-0 z-40 bg-brand-off-white border-b-4 border-brand-navy p-3 md:p-4 flex justify-between items-center shadow-(--shadow-brut-xs)">
          <div>
            <h1 className="font-display text-xl md:text-2xl uppercase tracking-wider">{session.vendor_name || "Vendor POS"}</h1>
            <p className="text-[10px] font-bold opacity-60 uppercase">Op: {session.operator_name}</p>
          </div>
          {/* Mobile Logout */}
          <button onClick={handleLogout} className="md:hidden p-2 text-brand-navy hover:bg-red-500 hover:text-white border-2 border-brand-navy shadow-(--shadow-brut-xs) transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </header>
        
        <div className="w-full">
          {children}
        </div>
      </main>
    </div>
  );
}

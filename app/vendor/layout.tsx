"use client";

import React, { useEffect, useState } from "react";
import { Store, Tag, List, Users, LogOut, Receipt, Shield } from "lucide-react";
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
      <nav className="w-full md:w-24 lg:w-48 md:h-[100dvh] bg-brand-navy text-brand-off-white flex md:flex-col justify-between border-t-4 md:border-t-0 md:border-r-4 border-brand-accent order-last md:order-first z-50 fixed md:sticky bottom-0 pb-[env(safe-area-inset-bottom,0px)]">
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
          <Link href="/vendor/sales" className={`flex-1 md:flex-none flex flex-col items-center justify-center md:py-4 px-2 hover:bg-brand-accent hover:text-brand-navy transition-colors ${pathname === "/vendor/sales" ? "bg-brand-accent text-brand-navy" : ""}`}>
            <Receipt className="w-6 h-6 mb-1" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest">Sales</span>
          </Link>
        </div>
        
        {session?.isAdminTakeover && (
          <Link
            href="/admin/vendors"
            className="hidden md:flex flex-col items-center justify-center py-3 px-2 bg-yellow-400 text-brand-navy hover:bg-yellow-300 transition-colors border-t-2 border-brand-navy font-bold text-center"
            title="Exit takeover mode and return to admin"
          >
            <Shield className="w-5 h-5 mb-1" />
            <span className="text-[9px] font-black uppercase tracking-wider leading-tight">Exit Admin</span>
          </Link>
        )}

        <button onClick={handleLogout} className="hidden md:flex flex-col items-center justify-center py-4 px-2 hover:bg-red-500 hover:text-white transition-colors border-t-2 border-brand-accent/20">
          <LogOut className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Logout</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 w-full h-[calc(100dvh-4.25rem)] md:h-[100dvh] overflow-y-auto overscroll-y-contain">
        <header className="sticky top-0 z-40 bg-brand-off-white border-b-4 border-brand-navy p-3 md:p-4 flex justify-between items-center shadow-(--shadow-brut-xs)">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-xl md:text-2xl uppercase tracking-wider">{session.vendorName || "Vendor POS"}</h1>
              {session.isAdminTakeover && (
                <span className="bg-yellow-400 text-brand-navy text-[9px] md:text-[10px] font-black uppercase px-1.5 py-0.5 border border-brand-navy tracking-widest shadow-(--shadow-brut-xs)">
                  ADMIN TAKEOVER
                </span>
              )}
            </div>
            <p className="text-[10px] font-bold opacity-60 uppercase">Op: {session.operatorName}</p>
          </div>
          <div className="flex items-center gap-2">
            {session.isAdminTakeover && (
              <Link
                href="/admin/vendors"
                className="px-2.5 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-brand-navy border-2 border-brand-navy text-[10px] md:text-xs font-black uppercase flex items-center gap-1 shadow-(--shadow-brut-xs) transition-all"
                title="Return to Admin Vendors panel"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit to Admin</span>
                <span className="sm:hidden">Exit</span>
              </Link>
            )}
            {/* Mobile Logout */}
            <button onClick={handleLogout} className="md:hidden p-2 text-brand-navy hover:bg-red-500 hover:text-white border-2 border-brand-navy shadow-(--shadow-brut-xs) transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>
        
        <div className="w-full">
          {children}
        </div>
      </main>
    </div>
  );
}

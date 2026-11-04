import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, FileText, RefreshCw, Lock, MapPin, Mail, Phone, ExternalLink } from "lucide-react";

interface LegalLayoutProps {
  currentTab: "terms" | "privacy" | "refunds";
  title: string;
  subtitle: string;
  lastUpdated?: string;
  children: React.ReactNode;
}

export default function LegalLayout({
  currentTab,
  title,
  subtitle,
  lastUpdated = "November 2026",
  children,
}: LegalLayoutProps) {
  const tabs = [
    {
      id: "terms",
      label: "Terms & Entry Rules",
      href: "/terms",
      icon: FileText,
    },
    {
      id: "privacy",
      label: "Privacy Policy",
      href: "/privacy",
      icon: Lock,
    },
    {
      id: "refunds",
      label: "Refund & Cancellation",
      href: "/refunds",
      icon: RefreshCw,
    },
  ];

  return (
    <div className="min-h-screen bg-brand-bg py-8 px-4 sm:px-6 md:px-12 text-brand-navy font-sans selection:bg-brand-accent selection:text-brand-navy">
      {/* Background subtle dot pattern */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(rgba(20,43,76,0.18) 1px, transparent 1px), radial-gradient(rgba(199,154,86,0.12) 1px, transparent 1px)",
          backgroundSize: "24px 24px, 48px 48px",
          backgroundPosition: "0 0, 12px 12px",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-4xl mx-auto space-y-6">
        {/* Header navigation */}
        <header className="w-full flex items-center justify-between border-b-4 border-brand-navy pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2.5 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent transition-colors shadow-(--shadow-brut-sm) flex items-center gap-2 group"
              title="Return to Event Tickets"
            >
              <ArrowLeft className="w-4 h-4 text-brand-navy group-hover:-translate-x-0.5 transition-transform" />
              <span className="font-mono text-xs uppercase font-bold tracking-wider hidden sm:inline">
                Back to Tickets
              </span>
            </Link>
            <div className="h-6 w-px bg-brand-navy/30 mx-1 hidden sm:block" />
            <span className="font-display text-xl sm:text-2xl tracking-wider uppercase text-brand-navy">
              GOODLIFE TICKETING
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono uppercase font-bold bg-brand-accent/20 border border-brand-navy text-brand-navy">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-navy" />
              Official Policy
            </span>
          </div>
        </header>

        {/* Tab switcher */}
        <nav
          className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2"
          aria-label="Legal Documents Navigation"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`p-3 border-2 border-brand-navy flex items-center gap-2.5 font-mono text-xs uppercase tracking-wider font-bold transition-all shadow-(--shadow-brut-xs) ${
                  isActive
                    ? "bg-brand-accent text-brand-navy shadow-(--shadow-brut-sm) translate-x-[1px] translate-y-[1px]"
                    : "bg-brand-off-white text-brand-navy/80 hover:bg-brand-accent/30 hover:text-brand-navy"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-brand-navy" : "text-brand-navy/70"}`} />
                <span className="truncate">{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Policy document header */}
        <section className="border-4 border-brand-navy bg-brand-off-white p-6 sm:p-8 shadow-(--shadow-brut-md)">
          <div className="border-b-2 border-brand-navy/20 pb-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-brand-navy/60 font-semibold">
                SMWHR INC · MARARA CAMP VENTURES
              </span>
              <span className="font-mono text-[11px] uppercase bg-brand-navy/10 px-2 py-0.5 border border-brand-navy/30 text-brand-navy font-bold">
                Last Updated: {lastUpdated}
              </span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-brand-navy uppercase tracking-wide leading-tight">
              {title}
            </h1>
            <p className="font-mono text-xs sm:text-sm text-brand-navy/75 mt-1 font-medium">
              {subtitle}
            </p>
          </div>

          {/* Policy Body */}
          <div className="prose prose-brand max-w-none text-brand-navy leading-relaxed text-sm sm:text-base space-y-6">
            {children}
          </div>

          {/* Support & Dispute Resolution Box */}
          <div className="mt-10 pt-6 border-t-2 border-brand-navy/20 bg-brand-accent/10 border-2 border-brand-navy p-5 shadow-(--shadow-brut-xs)">
            <h3 className="font-display text-lg uppercase tracking-wider text-brand-navy mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brand-navy" />
              Disputes, Inquiries & Customer Support
            </h3>
            <p className="font-mono text-xs text-brand-navy/80 mb-3">
              Need assistance with an M-Pesa STK transaction, failed ticket delivery, or admission question? Our team is available to assist you promptly:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
              <div className="flex items-center gap-2 bg-white/70 p-2.5 border border-brand-navy/30">
                <Mail className="w-4 h-4 text-brand-navy shrink-0" />
                <span className="truncate">Email: <strong>support@goodlife.smwhr.space</strong></span>
              </div>
              <div className="flex items-center gap-2 bg-white/70 p-2.5 border border-brand-navy/30">
                <Phone className="w-4 h-4 text-brand-navy shrink-0" />
                <span>WhatsApp: <strong>+254 700 000 000</strong></span>
              </div>
            </div>
            <p className="font-mono text-[11px] text-brand-navy/60 mt-3 uppercase">
              Operated by SMWHR INC · Physical Venue: Marara Camp, Thika, Kiambu County, Kenya
            </p>
          </div>
        </section>

        {/* Global Footer */}
        <footer className="w-full text-center pb-8 pt-4 border-t-4 border-brand-navy mt-8">
          <p className="font-display text-xl uppercase tracking-widest text-brand-navy">
            © 2026 GOODLIFE TICKETING · ALL RIGHTS RESERVED
          </p>
          <p className="font-mono text-[11px] uppercase mt-1 text-brand-navy/60">
            MARARA CAMP, THIKA · STRICTLY 18+ · SECURE PAYHERO M-PESA CHECKOUT
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase mt-3 text-brand-navy/70">
            <Link href="/terms" className="underline hover:text-brand-navy transition-colors">
              Terms of Service
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy" className="underline hover:text-brand-navy transition-colors">
              Privacy Policy
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/refunds" className="underline hover:text-brand-navy transition-colors">
              Refund Policy
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/" className="underline hover:text-brand-navy transition-colors">
              Event Tickets
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

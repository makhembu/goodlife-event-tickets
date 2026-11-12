import Link from "next/link";
import { Compass, Home, Radio, LayoutDashboard } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--brand-bg,#F4F0EA)] flex flex-col items-center justify-center p-4 text-[var(--brand-navy,#142B4C)] selection:bg-[var(--brand-navy,#142B4C)] selection:text-white">
      <div className="w-full max-w-lg border-4 border-[var(--brand-navy,#142B4C)] bg-white p-6 sm:p-8 shadow-(--shadow-brut-lg) text-center relative overflow-hidden">
        {/* Top brutalist bar */}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--brand-accent,#DFBB7D)] border-2 border-[var(--brand-navy,#142B4C)] text-[11px] font-black uppercase tracking-widest text-[var(--brand-navy,#142B4C)] mb-6 shadow-(--shadow-brut-xs)">
          <Compass className="w-3.5 h-3.5 animate-spin" />
          <span>404 // FREQUENCY LOST</span>
        </div>

        <h1 className="font-display text-6xl sm:text-7xl font-black tracking-tight leading-none text-[var(--brand-navy,#142B4C)] mb-3">
          PAGE NOT FOUND
        </h1>

        <p className="font-mono text-xs sm:text-sm text-[var(--brand-navy,#142B4C)]/80 uppercase font-bold tracking-wide mb-6 max-w-sm mx-auto">
          The requested edition, route, or frequency does not exist or has been shifted in the schedule.
        </p>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <Link
            href="/"
            className="w-full py-3 px-4 bg-[var(--brand-navy,#142B4C)] text-[var(--brand-off-white,#F4F0EA)] font-black uppercase text-xs tracking-wider border-2 border-[var(--brand-navy,#142B4C)] flex items-center justify-center gap-2 hover:bg-[var(--brand-accent,#DFBB7D)] hover:text-[var(--brand-navy,#142B4C)] transition-all shadow-(--shadow-brut-xs) active:translate-x-0.5 active:translate-y-0.5"
          >
            <Home className="w-4 h-4" />
            <span>RETURN TO TICKETS &amp; HOMEPAGE</span>
          </Link>

          <Link
            href="/radio"
            className="w-full py-2.5 px-4 bg-white text-[var(--brand-navy,#142B4C)] font-black uppercase text-xs tracking-wider border-2 border-[var(--brand-navy,#142B4C)] flex items-center justify-center gap-2 hover:bg-[var(--brand-accent,#DFBB7D)] transition-all shadow-(--shadow-brut-xs) active:translate-x-0.5 active:translate-y-0.5"
          >
            <Radio className="w-4 h-4 text-brand-navy" />
            <span>TUNE IN TO GOODLIFE RADIO 254</span>
          </Link>

          <Link
            href="/admin/dashboard"
            className="w-full py-2 px-4 bg-transparent text-[var(--brand-navy,#142B4C)]/70 hover:text-[var(--brand-navy,#142B4C)] font-mono text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
          >
            <LayoutDashboard className="w-3 h-3" />
            <span>STAFF &amp; ADMIN PORTAL</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

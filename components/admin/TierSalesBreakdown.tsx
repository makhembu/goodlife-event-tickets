"use client";

import { Tent } from "lucide-react";

interface TierSalesData {
  type: string;
  stats: { sold: number; revenue: number; cap?: number };
}

interface TierDef {
  id: string;
  name: string;
  tag?: string;
}

interface TierSalesBreakdownProps {
  campingTiers: Record<string, { sold: number; revenue: number; cap?: number; name?: string; tag?: string }>;
  totalTicketsSold: number;
  ticketTiers: TierDef[];
}

export default function TierSalesBreakdown({
  campingTiers,
  totalTicketsSold,
  ticketTiers,
}: TierSalesBreakdownProps) {
  const tierSales = Object.entries(campingTiers || {}).map(([type, stats]) => {
    const tierDef = ticketTiers.find((t) => t.id === type || t.name?.toLowerCase() === type.toLowerCase());
    return {
      type,
      stats,
      name: (stats as any).name || tierDef?.name || type,
      tag: (stats as any).tag || tierDef?.tag || "",
    };
  });

  // Sort: tiers with sales first (descending by sold tickets, then revenue), then remaining tiers
  tierSales.sort((a, b) => b.stats.sold - a.stats.sold || b.stats.revenue - a.stats.revenue);

  const best = tierSales.find((t) => t.stats.sold > 0);

  if (tierSales.length === 0) return null;

  return (
    <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-5 relative shadow-(--shadow-brut-md)">
      <span className="text-xs font-black tracking-widest uppercase text-[var(--brand-navy)] block mb-4 border-b-2 border-[var(--brand-navy)] pb-2 flex items-center gap-2">
        <Tent className="w-4 h-4 fill-[var(--brand-navy)]" /> TICKET TIER SALES
      </span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tierSales.map((t) => {
          const pct = totalTicketsSold
            ? Math.round((t.stats.sold / totalTicketsSold) * 100)
            : 0;
          const isBest = best && t.type === best.type && t.stats.sold > 0;
          return (
            <div
              key={t.type}
              className={`space-y-2 p-3 ${
                isBest
                  ? "bg-[var(--brand-warning-bg)] border-2 border-brand-warning"
                  : "border border-transparent"
              }`}
            >
              <div className="flex justify-between items-end">
                <div>
                  <span className="font-black text-xs block">{t.name}</span>
                  <span className="text-caption text-[var(--brand-navy-light)] uppercase font-medium">
                    Sold: {t.stats.sold} tickets &middot; Ksh{" "}
                    {t.stats.revenue.toLocaleString()}
                  </span>
                  {t.tag && (
                    <span className="text-caption ml-1.5 font-bold text-[var(--brand-accent)] uppercase">
                      [{t.tag}]
                    </span>
                  )}
                </div>
                <span className="font-extrabold text-sm">{pct}%</span>
              </div>
              <div className="h-4 w-full bg-[var(--brand-navy)]/5 border-2 border-[var(--brand-navy)] overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 relative overflow-hidden ${
                    isBest
                      ? "bg-brand-warning"
                      : "bg-[var(--brand-navy)]"
                  }`}
                  style={{ width: `${pct}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]" />
                </div>
              </div>
              {isBest && (
                <span className="text-caption font-black uppercase text-brand-warning block flex items-center gap-1">
                  <span aria-hidden="true">&#9733;</span> BEST SELLER
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

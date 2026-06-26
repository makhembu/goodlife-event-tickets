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
  campingTiers: Record<string, { sold: number; revenue: number; cap?: number }>;
  totalTicketsSold: number;
  ticketTiers: TierDef[];
}

export default function TierSalesBreakdown({
  campingTiers,
  totalTicketsSold,
  ticketTiers,
}: TierSalesBreakdownProps) {
  const tierSales = Object.entries(campingTiers).map(([type, stats]) => {
    const tierDef = ticketTiers.find((t) => t.id === type);
    return {
      type,
      stats,
      name: tierDef?.name || type,
      tag: tierDef?.tag || "",
    };
  });

  const best = tierSales.reduce(
    (a, b) => (a.stats.sold > b.stats.sold ? a : b),
    tierSales[0]
  );

  if (tierSales.length === 0) return null;

  return (
    <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-5 relative shadow-[4px_4px_0px_0px_var(--brand-navy)]">
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
                  ? "bg-amber-50 border-2 border-amber-400"
                  : "border border-transparent"
              }`}
            >
              <div className="flex justify-between items-end">
                <div>
                  <span className="font-black text-xs block">{t.name}</span>
                  <span className="text-[10px] text-slate-500 uppercase font-medium">
                    Sold: {t.stats.sold} tickets &middot; Ksh{" "}
                    {t.stats.revenue.toLocaleString()}
                  </span>
                  {t.tag && (
                    <span className="text-[9px] ml-1.5 font-bold text-[var(--brand-accent)] uppercase">
                      [{t.tag}]
                    </span>
                  )}
                </div>
                <span className="font-extrabold text-sm">{pct}%</span>
              </div>
              <div className="h-4 w-full bg-slate-100 border-2 border-[var(--brand-navy)] overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    isBest
                      ? "bg-amber-500"
                      : "bg-[var(--brand-navy)]"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {isBest && (
                <span className="text-[9px] font-black uppercase text-amber-700 block flex items-center gap-1">
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

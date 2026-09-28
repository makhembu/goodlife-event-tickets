"use client";

import { Tent } from "lucide-react";

interface TierStats {
  sold: number;
  revenue: number;
  cap?: number;
  name?: string;
  tag?: string;
}

interface TierDef {
  id: string;
  name: string;
  tag?: string;
}

interface TierSalesBreakdownProps {
  campingTiers: Record<string, TierStats>;
  totalTicketsSold: number;
  ticketTiers: TierDef[];
}

/** Beyond this, the list scrolls instead of pushing the dashboard fold down. */
const MAX_VISIBLE_ROWS = 10;

const BRAND = {
  navy: "var(--brand-navy)",
  navyLight: "var(--brand-navy-light)",
  accent: "var(--brand-accent)",
};

export default function TierSalesBreakdown({
  campingTiers,
  totalTicketsSold,
  ticketTiers,
}: TierSalesBreakdownProps) {
  const allTiers = Object.entries(campingTiers || {}).map(([type, stats]) => {
    const tierDef = ticketTiers.find(
      (t) => t.id === type || t.name?.toLowerCase() === type.toLowerCase()
    );
    const rawCap = Number(stats?.cap);
    return {
      type,
      sold: Number(stats?.sold) || 0,
      revenue: Number(stats?.revenue) || 0,
      cap: rawCap > 0 ? rawCap : undefined,
      name: stats?.name || tierDef?.name || type,
      tag: stats?.tag || tierDef?.tag || "",
    };
  });

  // Selling tiers first (volume, then revenue). Unsold tiers are counted, never rendered.
  const selling = allTiers
    .filter((t) => t.sold > 0)
    .sort((a, b) => b.sold - a.sold || b.revenue - a.revenue);

  if (selling.length === 0) return null;

  const unsoldCount = allTiers.length - selling.length;
  const best = selling[0];
  const totalSold = selling.reduce((sum, t) => sum + t.sold, 0);
  const totalRevenue = selling.reduce((sum, t) => sum + t.revenue, 0);
  const scrollable = selling.length > MAX_VISIBLE_ROWS;

  return (
    <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-4 md:p-5 relative shadow-(--shadow-brut-md)">
      <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b-2 border-[var(--brand-navy)]">
        <span className="flex items-center gap-2 text-xs font-black tracking-widest uppercase text-[var(--brand-navy)]">
          <Tent className="w-4 h-4 fill-[var(--brand-navy)]" /> TICKET TIER SALES
        </span>
        <span className="text-caption font-black uppercase tabular-nums text-[var(--brand-navy-light)] shrink-0">
          {totalSold} sold &middot; Ksh {totalRevenue.toLocaleString()}
        </span>
      </div>

      <div className={scrollable ? "max-h-[320px] overflow-y-auto custom-scrollbar pr-1" : ""}>
        <ul>
          {selling.map((t) => {
            const isBest = t.type === best.type;
            const isCamping = String(t.tag).toUpperCase().includes("CAMP");
            const soldOut = t.cap !== undefined && t.sold >= t.cap;

            // Capped tiers read as progress toward stock; uncapped tiers as share of sales.
            const barPct = t.cap
              ? Math.min(100, Math.round((t.sold / t.cap) * 100))
              : totalTicketsSold > 0
                ? Math.min(100, Math.round((t.sold / totalTicketsSold) * 100))
                : 0;

            const title = t.cap
              ? `${t.sold} of ${t.cap} sold (${barPct}% of cap)`
              : `${t.sold} sold (${barPct}% of all tickets) — Ksh ${t.revenue.toLocaleString()}`;

            return (
              <li
                key={t.type}
                title={title}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-2 border-l-[3px] border-b border-[var(--brand-navy)]/10 last:border-b-0"
                style={{ borderLeftColor: isCamping ? BRAND.accent : BRAND.navy }}
              >
                <span className="min-w-0 flex-1 text-footnote font-black uppercase text-[var(--brand-navy)] truncate">
                  {isBest && (
                    <span aria-hidden="true" className="text-brand-warning">
                      &#9733;
                    </span>
                  )}
                  {t.name}
                  {soldOut && (
                    <span className="ml-1.5 text-caption font-black uppercase text-brand-danger">
                      Sold out
                    </span>
                  )}
                </span>

                <div
                  className="w-full sm:w-48 md:w-64 shrink-0 h-2 bg-[var(--brand-navy)]/8 border border-[var(--brand-navy)] overflow-hidden"
                  role="img"
                  aria-label={title}
                >
                  <div
                    className={`h-full transition-[width] duration-500 relative overflow-hidden ${
                      soldOut ? "bg-brand-danger" : "bg-[var(--brand-navy)]"
                    }`}
                    style={{ width: `${barPct}%` }}
                  >
                    {isBest && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_2s_infinite]" />
                    )}
                  </div>
                </div>

                <span className="w-12 shrink-0 text-footnote font-black tabular-nums text-right text-[var(--brand-navy)]">
                  {t.sold}
                </span>

                <span className="w-28 shrink-0 text-caption font-bold tabular-nums text-right text-[var(--brand-navy-light)]">
                  Ksh {t.revenue.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {unsoldCount > 0 && (
        <p className="pt-2 text-caption font-medium uppercase text-[var(--brand-navy-light)]">
          + {unsoldCount} unsold {unsoldCount === 1 ? "tier" : "tiers"}
        </p>
      )}
    </div>
  );
}

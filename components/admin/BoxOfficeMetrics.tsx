"use client";

import { Coins, Users, TrendingUp, FileCheck2 } from "lucide-react";

interface BoxOfficeMetricsProps {
  totalCashCollected: number;
  totalTicketsSold: number;
  recentSalesAmount: number;
  scanCount: number;
  /** Crew/vendor/comp passes present in the event, excluded unless audience is "all". */
  staffPasses?: number;
  audience?: "customers" | "staff" | "all";
}

export default function BoxOfficeMetrics({
  totalCashCollected,
  totalTicketsSold,
  recentSalesAmount,
  scanCount,
  staffPasses = 0,
  audience = "customers",
}: BoxOfficeMetricsProps) {
  const checkinPct = totalTicketsSold ? Math.round((scanCount / totalTicketsSold) * 100) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      {/* REVENUE */}
      <div className="border-2 sm:border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-2.5 sm:p-4 shadow-(--shadow-brut-xs) sm:shadow-(--shadow-brut-md) relative flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] sm:text-caption tracking-widest font-black uppercase text-[var(--brand-navy-light)] block truncate">REVENUE</span>
            <Coins className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[var(--brand-navy-light)] shrink-0" />
          </div>
          <span className="text-base sm:text-2xl font-black block leading-none">KES {totalCashCollected.toLocaleString()}</span>
        </div>
        <p className="text-[10px] sm:text-caption text-[var(--brand-navy-light)] font-bold uppercase mt-1.5 leading-tight line-clamp-1 sm:line-clamp-none">
          {audience === "customers"
            ? `Paid customer sales${staffPasses > 0 ? " · staff excl." : ""}`
            : audience === "staff"
              ? "Paid on staff tiers"
              : "Confirmed M-Pesa"}
        </p>
      </div>

      {/* PASSES SOLD */}
      <div className="border-2 sm:border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-2.5 sm:p-4 shadow-(--shadow-brut-xs) sm:shadow-(--shadow-brut-md) relative flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] sm:text-caption tracking-widest font-black uppercase text-[var(--brand-navy-light)] block truncate">
              {audience === "staff" ? "STAFF" : audience === "all" ? "ISSUED" : "PASSES"}
            </span>
            <Users className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[var(--brand-navy-light)] shrink-0" />
          </div>
          <span className="text-base sm:text-2xl font-black block leading-none">{totalTicketsSold}</span>
        </div>
        <p className="text-[10px] sm:text-caption text-[var(--brand-navy-light)] font-bold uppercase mt-1.5 leading-tight line-clamp-1 sm:line-clamp-none">
          {audience === "customers"
            ? `Customer sales · ${staffPasses} staff excl.`
            : "Unique receipts"}
        </p>
      </div>

      {/* RECENT SALES */}
      <div className="border-2 sm:border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-2.5 sm:p-4 shadow-(--shadow-brut-xs) sm:shadow-(--shadow-brut-md) relative flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] sm:text-caption tracking-widest font-black uppercase text-[var(--brand-navy-light)] block truncate">RECENT (24H)</span>
            <TrendingUp className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[var(--brand-navy-light)] shrink-0" />
          </div>
          <span className="text-base sm:text-2xl font-black block leading-none">KES {recentSalesAmount.toLocaleString()}</span>
        </div>
        <p className="text-[10px] sm:text-caption text-[var(--brand-navy-light)] font-bold uppercase mt-1.5 leading-tight line-clamp-1 sm:line-clamp-none">Velocity speed</p>
      </div>

      {/* CHECKED-IN GUESTS */}
      <div className="border-2 sm:border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-2.5 sm:p-4 shadow-(--shadow-brut-xs) sm:shadow-(--shadow-brut-md) relative flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] sm:text-caption tracking-widest font-black uppercase text-[var(--brand-navy-light)] block truncate">CHECKED-IN</span>
            <FileCheck2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[var(--brand-navy-light)] shrink-0" />
          </div>
          <span className="text-base sm:text-2xl font-black block leading-none">
            {scanCount}
            <span className="text-xs text-[var(--brand-navy-light)] font-bold"> / {totalTicketsSold}</span>
          </span>
        </div>
        <p className="text-[10px] sm:text-caption text-[var(--brand-navy-light)] font-bold uppercase mt-1.5 leading-tight line-clamp-1 sm:line-clamp-none">
          Check-in: {checkinPct}%
        </p>
      </div>
    </div>
  );
}

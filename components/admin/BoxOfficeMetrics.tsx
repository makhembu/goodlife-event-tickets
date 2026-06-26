"use client";

import { Coins, Users, TrendingUp, FileCheck2 } from "lucide-react";

interface BoxOfficeMetricsProps {
  totalCashCollected: number;
  totalTicketsSold: number;
  recentSalesAmount: number;
  scanCount: number;
}

export default function BoxOfficeMetrics({
  totalCashCollected,
  totalTicketsSold,
  recentSalesAmount,
  scanCount,
}: BoxOfficeMetricsProps) {
  const checkinPct = totalTicketsSold ? Math.round((scanCount / totalTicketsSold) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-4 shadow-[4px_4px_0px_0px_var(--brand-navy)] relative">
        <Coins className="absolute top-4 right-4 w-5 h-5 text-[var(--brand-navy-light)]" />
        <span className="text-[10px] tracking-widest font-black uppercase text-[var(--brand-navy-light)] block">REVENUE</span>
        <span className="text-2xl font-black block mt-2">KES {totalCashCollected.toLocaleString()}</span>
        <p className="text-[9px] text-[var(--brand-navy-light)] font-bold uppercase mt-1">Confirmed M-Pesa Revenue</p>
      </div>

      <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-4 shadow-[4px_4px_0px_0px_var(--brand-navy)] relative">
        <Users className="absolute top-4 right-4 w-5 h-5 text-[var(--brand-navy-light)]" />
        <span className="text-[10px] tracking-widest font-black uppercase text-[var(--brand-navy-light)] block">PASSES SOLD</span>
        <span className="text-2xl font-black block mt-2">{totalTicketsSold}</span>
        <p className="text-[9px] text-[var(--brand-navy-light)] font-bold uppercase mt-1">Unique secure receipts</p>
      </div>

      <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-4 shadow-[4px_4px_0px_0px_var(--brand-navy)] relative">
        <TrendingUp className="absolute top-4 right-4 w-5 h-5 text-[var(--brand-navy-light)]" />
        <span className="text-[10px] tracking-widest font-black uppercase text-[var(--brand-navy-light)] block">RECENT SALES (24H)</span>
        <span className="text-2xl font-black block mt-2">KES {recentSalesAmount.toLocaleString()}</span>
        <p className="text-[9px] text-[var(--brand-navy-light)] font-bold uppercase mt-1">Velocity payment speed</p>
      </div>

      <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-4 shadow-[4px_4px_0px_0px_var(--brand-navy)] relative">
        <FileCheck2 className="absolute top-4 right-4 w-5 h-5 text-[var(--brand-navy-light)]" />
        <span className="text-[10px] tracking-widest font-black uppercase text-[var(--brand-navy-light)] block">CHECKED-IN GUESTS</span>
        <span className="text-2xl font-black block mt-2">
          {scanCount}
          <span className="text-xs text-slate-500 font-bold"> / {totalTicketsSold}</span>
        </span>
        <p className="text-[9px] text-[var(--brand-navy-light)] font-bold uppercase mt-1">
          Check-in: {checkinPct}%
        </p>
      </div>
    </div>
  );
}

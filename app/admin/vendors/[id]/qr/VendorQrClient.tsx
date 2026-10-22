"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Smartphone, QrCode, CheckCircle2, Store } from "lucide-react";

interface VendorQrClientProps {
  vendor: {
    id: number;
    name: string;
    category?: string | null;
    pay_ref_prefix?: string | null;
  };
  tillNumber: string;
  universalQr: string;
  safaricomQr: string;
  webUrl: string;
}

export function VendorQrClient({
  vendor,
  tillNumber,
  universalQr,
  safaricomQr,
  webUrl,
}: VendorQrClientProps) {
  const [qrType, setQrType] = useState<"universal" | "safaricom">("universal");

  const activeQr = qrType === "universal" ? universalQr : safaricomQr;

  return (
    <div className="min-h-screen bg-[var(--brand-off-white)] text-[var(--brand-navy)] flex flex-col items-center justify-center p-4 sm:p-6 print:p-0 print:bg-white">
      {/* Top action toolbar (hidden on print) */}
      <div className="w-full max-w-md flex items-center justify-between mb-4 print:hidden">
        <Link
          href="/admin/dashboard"
          className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Dashboard</span>
        </Link>

        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-brand-navy border-2 border-brand-navy font-mono text-xs font-black uppercase transition-transform active:translate-x-0.5 active:translate-y-0.5 cursor-pointer shadow-(--shadow-brut-xs)"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print Stall Card</span>
        </button>
      </div>

      {/* QR Code Standard Selector (hidden on print) */}
      <div className="w-full max-w-md bg-white border-2 border-[var(--brand-navy)] p-3 mb-4 shadow-(--shadow-brut-xs) print:hidden space-y-2">
        <p className="text-[10px] font-mono font-black uppercase tracking-wider text-[var(--brand-navy-light)]">
          Select QR Code Standard for Printing:
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setQrType("universal")}
            className={`p-2 border-2 border-[var(--brand-navy)] font-mono text-left transition-colors cursor-pointer ${
              qrType === "universal"
                ? "bg-yellow-300 font-black shadow-(--shadow-brut-xs)"
                : "bg-stone-50 hover:bg-stone-100 font-bold opacity-75"
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs uppercase">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Universal (Best)</span>
            </div>
            <p className="text-[9px] text-brand-navy/70 mt-1 leading-tight">
              Scans with ANY phone camera (iPhone/Android). Prompts STK push.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setQrType("safaricom")}
            className={`p-2 border-2 border-[var(--brand-navy)] font-mono text-left transition-colors cursor-pointer ${
              qrType === "safaricom"
                ? "bg-yellow-300 font-black shadow-(--shadow-brut-xs)"
                : "bg-stone-50 hover:bg-stone-100 font-bold opacity-75"
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs uppercase">
              <QrCode className="w-3.5 h-3.5" />
              <span>Safaricom App</span>
            </div>
            <p className="text-[9px] text-brand-navy/70 mt-1 leading-tight">
              Direct EMVCo code for MySafaricom &amp; M-Pesa App scanners only.
            </p>
          </button>
        </div>
      </div>

      {/* The Printable Stall Card */}
      <div className="w-full max-w-md bg-white border-4 border-[var(--brand-navy)] shadow-(--shadow-brut) p-6 sm:p-8 flex flex-col items-center text-center print:border-4 print:shadow-none print:max-w-none print:w-[380px] print:mx-auto">
        {/* Stall Header */}
        <div className="w-full pb-3 border-b-2 border-[var(--brand-navy)] mb-4">
          <div className="inline-flex items-center gap-1 text-[10px] font-mono font-black tracking-widest text-[var(--brand-navy-light)] uppercase">
            <Store className="w-3 h-3" />
            <span>Goodlife Festival • Stall Payment</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-wider mt-1 text-[var(--brand-navy)] leading-tight">
            {vendor.name}
          </h1>
          {vendor.category && (
            <span className="inline-block px-2.5 py-0.5 bg-yellow-300 border border-[var(--brand-navy)] font-mono text-[10px] font-black uppercase mt-1.5 shadow-(--shadow-brut-xs)">
              {vendor.category}
            </span>
          )}
        </div>

        {/* QR Section */}
        <div className="p-3 bg-white border-4 border-[var(--brand-navy)] my-2 shadow-(--shadow-brut-sm)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeQr}
            alt={`M-Pesa QR for ${vendor.name}`}
            className="w-56 h-56 sm:w-60 sm:h-60 mx-auto object-contain"
          />
        </div>

        {/* Dynamic scan badge */}
        <div className="mt-3">
          <div className="inline-flex items-center gap-1.5 bg-stone-100 border border-[var(--brand-navy)] px-2.5 py-1 text-[11px] font-mono font-black uppercase text-[var(--brand-navy)]">
            {qrType === "universal" ? (
              <>
                <Smartphone className="w-3.5 h-3.5 text-green-700" />
                <span>Scan with ANY Phone Camera</span>
              </>
            ) : (
              <>
                <QrCode className="w-3.5 h-3.5 text-green-700" />
                <span>Scan inside M-Pesa App</span>
              </>
            )}
          </div>
        </div>

        {/* Giant Buy Goods Till Number Highlight */}
        <div className="w-full bg-[var(--brand-navy)] text-white py-3 px-4 mt-4 border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs)">
          <p className="text-[10px] font-mono tracking-widest uppercase opacity-80">
            Lipa Na M-Pesa • Buy Goods Till
          </p>
          <p className="font-mono text-2xl sm:text-3xl font-black tracking-widest mt-0.5">
            {tillNumber}
          </p>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="w-full mt-4 p-2.5 bg-stone-50 border border-[var(--brand-navy)]/30 text-left font-mono text-[11px] text-[var(--brand-navy)] space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-[var(--brand-navy)] text-white text-[10px] flex items-center justify-center shrink-0">1</span>
            <span>Scan QR with Camera or M-Pesa App</span>
          </p>
          <p className="font-bold flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-[var(--brand-navy)] text-white text-[10px] flex items-center justify-center shrink-0">2</span>
            <span>Or enter Till <span className="underline font-black">{tillNumber}</span> in SIM Toolkit / *334#</span>
          </p>
          <p className="font-bold flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-[var(--brand-navy)] text-white text-[10px] flex items-center justify-center shrink-0">3</span>
            <span>Confirm merchant name &amp; enter PIN</span>
          </p>
        </div>

        {/* Ref / Footnote */}
        <div className="w-full mt-4 pt-3 border-t-2 border-[var(--brand-navy)]/20 flex items-center justify-between font-mono text-[10px] text-[var(--brand-navy-light)]">
          <span className="font-bold text-[var(--brand-navy)]">
            REF: {vendor.pay_ref_prefix || `VND${vendor.id}`}
          </span>
          <span className="uppercase text-[9px]">Cashier STK Push Available</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HapticFeedback } from "@/components/ui/haptic-feedback";
import {
  Copy,
  CheckCircle2,
  Store,
  Sparkles,
  ArrowLeft,
  Smartphone,
  ShieldCheck,
  Receipt,
  HelpCircle,
} from "lucide-react";
import Link from "next/link";

function PayTillContent() {
  const searchParams = useSearchParams();
  const tillParam = searchParams.get("till") || "";
  const amountParam = searchParams.get("amount") || "";
  const itemParam = searchParams.get("item") || "";
  const vendorParam = searchParams.get("vendor") || "";

  const [tillNumber, setTillNumber] = useState(tillParam || "5761205");
  const [copiedTill, setCopiedTill] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [eventName, setEventName] = useState("GOODLIFE FESTIVAL");

  // Fetch active event from DB if till wasn't passed in query
  useEffect(() => {
    if (!tillParam) {
      fetch("/api/event-details")
        .then((res) => res.json())
        .then((data) => {
          if (data?.till_number) setTillNumber(data.till_number);
          if (data?.title) setEventName(data.title);
        })
        .catch(() => {});
    }
  }, [tillParam]);

  const handleCopyTill = () => {
    HapticFeedback.trigger("confirmation");
    navigator.clipboard.writeText(tillNumber);
    setCopiedTill(true);
    setTimeout(() => setCopiedTill(false), 2500);
  };

  const handleCopyAmount = () => {
    if (!amountParam) return;
    HapticFeedback.trigger("confirmation");
    navigator.clipboard.writeText(amountParam);
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2500);
  };

  const formattedAmount = amountParam ? Number(amountParam).toLocaleString("en-KE") : null;

  return (
    <div className="min-h-screen bg-[var(--brand-off-white)] text-[var(--brand-navy)] p-4 sm:p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        {/* Navigation / Brand header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[var(--brand-navy)] hover:opacity-75 transition-opacity"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{eventName}</span>
          </Link>
          <span className="text-[10px] font-mono font-bold bg-brand-accent px-2 py-0.5 border border-[var(--brand-navy)] uppercase">
            Official Checkout
          </span>
        </div>

        {/* Product / Cart Card (if item specified) */}
        {itemParam && (
          <div className="bg-white border-4 border-[var(--brand-navy)] p-4 shadow-(--shadow-brut) flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase text-brand-navy/60 block">
                {vendorParam ? `${vendorParam} • Item` : "Product"}
              </span>
              <h2 className="text-lg font-black uppercase tracking-tight text-[var(--brand-navy)]">
                {itemParam}
              </h2>
            </div>
            {formattedAmount && (
              <div className="text-right">
                <span className="text-[10px] font-black uppercase text-brand-navy/60 block">Price</span>
                <span className="text-xl font-black font-mono text-[var(--brand-navy)]">
                  KES {formattedAmount}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Big Brutalist Till Number Box */}
        <div className="bg-white border-4 border-[var(--brand-navy)] p-6 shadow-(--shadow-brut-lg) space-y-5 text-center">
          <div className="inline-flex items-center gap-1.5 bg-brand-accent/20 border-2 border-[var(--brand-navy)] px-3 py-1 text-xs font-black uppercase">
            <Store className="w-4 h-4 text-[var(--brand-navy)]" />
            <span>Lipa na M-Pesa • Buy Goods</span>
          </div>

          <div>
            <span className="text-xs font-black uppercase tracking-widest text-brand-navy/70 block mb-1">
              Buy Goods Till Number
            </span>
            <div className="text-4xl sm:text-5xl font-black font-mono tracking-wider py-2 bg-brand-accent/10 border-2 border-dashed border-[var(--brand-navy)] my-2">
              {tillNumber}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleCopyTill}
              className="w-full py-3 px-4 bg-brand-accent text-brand-navy font-black text-xs uppercase border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs) active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2 hover:bg-brand-accent/90 transition-all cursor-pointer"
            >
              {copiedTill ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-700" />
                  <span>Copied Till!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Till #{tillNumber}</span>
                </>
              )}
            </button>

            {formattedAmount ? (
              <button
                onClick={handleCopyAmount}
                className="w-full py-3 px-4 bg-white text-brand-navy font-black text-xs uppercase border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs) active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2 hover:bg-gray-50 transition-all cursor-pointer"
              >
                {copiedAmount ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-700" />
                    <span>Copied KES {formattedAmount}!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy KES {formattedAmount}</span>
                  </>
                )}
              </button>
            ) : (
              <a
                href="tel:*334#"
                className="w-full py-3 px-4 bg-white text-brand-navy font-black text-xs uppercase border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs) active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2 hover:bg-gray-50 transition-all cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                <span>Dial *334#</span>
              </a>
            )}
          </div>
        </div>

        {/* 3-Step Instructions Card */}
        <div className="bg-white border-4 border-[var(--brand-navy)] p-5 shadow-(--shadow-brut) space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider border-b-2 border-[var(--brand-navy)] pb-2 flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            <span>How to pay on your phone</span>
          </h3>

          <ol className="space-y-2.5 text-xs font-bold font-mono">
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[var(--brand-navy)] text-white flex items-center justify-center text-[10px] shrink-0 font-sans font-black">
                1
              </span>
              <span>
                Open M-Pesa $\rightarrow$ Select <strong>Lipa na M-Pesa</strong> $\rightarrow$ <strong>Buy Goods and Services</strong>.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[var(--brand-navy)] text-white flex items-center justify-center text-[10px] shrink-0 font-sans font-black">
                2
              </span>
              <span>
                Enter Till Number: <strong className="bg-brand-accent/40 px-1">{tillNumber}</strong>.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[var(--brand-navy)] text-white flex items-center justify-center text-[10px] shrink-0 font-sans font-black">
                3
              </span>
              <span>
                Enter Amount {formattedAmount ? <strong className="bg-brand-accent/40 px-1">KES {formattedAmount}</strong> : "for your order"} and enter your M-Pesa PIN.
              </span>
            </li>
          </ol>

          <div className="mt-3 p-3 bg-brand-accent/15 border-2 border-[var(--brand-navy)] text-[11px] font-bold text-brand-navy flex items-start gap-2">
            <Receipt className="w-4 h-4 shrink-0 text-brand-navy mt-0.5" />
            <span>
              Show the M-Pesa SMS confirmation code to the cashier/bartender to collect your order!
            </span>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[10px] font-mono text-brand-navy/60 flex items-center justify-center gap-1.5 pt-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Verified Event Merchant • Zero gateway fees on direct till</span>
        </div>
      </div>
    </div>
  );
}

export default function PayTillPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--brand-off-white)]">
          <div className="border-4 border-[var(--brand-navy)] bg-white p-6 shadow-(--shadow-brut) font-black text-xs uppercase font-mono">
            Loading Till...
          </div>
        </div>
      }
    >
      <PayTillContent />
    </Suspense>
  );
}

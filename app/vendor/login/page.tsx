"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Check, Delete, ArrowLeft, Shield } from "lucide-react";
import Link from "next/link";
import { HapticFeedback } from "@/components/ui/haptic-feedback";
import PwaInstallButton from "@/components/ui/PwaInstallButton";

export default function VendorLoginPage() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleKeyPress = (num: string) => {
    HapticFeedback.trigger("confirmation");
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError("");
    }
  };

  const handleDelete = () => {
    HapticFeedback.trigger("confirmation");
    setPin(prev => prev.slice(0, -1));
  };

  const handleSubmit = async () => {
    if (pin.length !== 4) return;
    HapticFeedback.trigger("confirmation");
    setLoading(true);
    try {
      const res = await fetch("/api/vendor/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        HapticFeedback.trigger("success");
        router.push("/vendor/sell");
      } else {
        HapticFeedback.trigger("error");
        setError("Invalid PIN");
        setPin("");
        setLoading(false);
      }
    } catch (err) {
      HapticFeedback.trigger("error");
      setError("Network error");
      setPin("");
      setLoading(false);
    }
  };

  React.useEffect(() => {
    document.documentElement.classList.add("bg-brand-off-white");
    document.body.classList.add("bg-brand-off-white");
    return () => {
      document.documentElement.classList.remove("bg-brand-off-white");
      document.body.classList.remove("bg-brand-off-white");
    };
  }, []);

  React.useEffect(() => {
    if (pin.length === 4) {
      handleSubmit();
    }
  }, [pin]);

  return (
    <div className="fixed inset-0 w-full h-[100dvh] max-h-[100dvh] flex flex-col justify-between p-3 sm:p-4 md:p-6 text-brand-navy font-mono bg-brand-off-white overflow-hidden overscroll-none select-none touch-manipulation">
      {/* Top Header Navigation */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between gap-2 z-10 shrink-0">
        <Link 
          href="/" 
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 border-2 border-brand-navy bg-white text-brand-navy text-[11px] sm:text-xs font-bold uppercase hover:bg-yellow-300 transition-all shadow-(--shadow-brut-xs) active:translate-y-0.5"
        >
          <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Back to Event</span>
        </Link>

        <div className="flex items-center gap-2">
          <PwaInstallButton appName="POS" />
          <Link 
            href="/login" 
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 border-2 border-brand-navy bg-white text-brand-navy text-[11px] sm:text-xs font-bold uppercase hover:bg-yellow-300 transition-all shadow-(--shadow-brut-xs) active:translate-y-0.5"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin Login</span>
          </Link>
        </div>
      </header>

      {/* Main Terminal Box */}
      <main className="w-full max-w-sm mx-auto flex flex-col items-center justify-center my-auto shrink-0">
        <div className="p-2.5 sm:p-3 bg-yellow-300 text-brand-navy border-3 border-brand-navy mb-2 sm:mb-4 shadow-(--shadow-brut-xs)">
          <Store className="w-8 h-8 sm:w-10 sm:h-10 text-brand-navy" strokeWidth={2} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-display uppercase tracking-widest mb-0.5 text-center text-brand-navy">
          Vendor Terminal
        </h1>
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-3 sm:mb-6 text-stone-600">
          Enter 4-Digit Operator PIN
        </p>

        {/* PIN Indicator Dots */}
        <div className="flex gap-3 sm:gap-4 mb-3 sm:mb-6">
          {[0, 1, 2, 3].map(i => (
            <div 
              key={i} 
              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-brand-navy transition-all ${
                i < pin.length 
                  ? 'bg-yellow-300 scale-110 shadow-(--shadow-brut-xs)' 
                  : 'bg-white'
              }`} 
            />
          ))}
        </div>

        {error && (
          <div className="mb-2 sm:mb-4 bg-red-100 text-red-800 px-3 sm:px-4 py-1.5 sm:py-2 border-2 border-red-600 font-bold uppercase text-[11px] sm:text-xs animate-pulse text-center shadow-(--shadow-brut-xs)">
            {error}
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-[240px] sm:max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button 
              key={num} 
              type="button"
              disabled={loading}
              onClick={() => handleKeyPress(num.toString())}
              className="aspect-square flex items-center justify-center text-2xl sm:text-3xl font-display bg-white text-brand-navy border-2 sm:border-3 border-brand-navy hover:bg-yellow-300 active:translate-y-1 active:shadow-none shadow-(--shadow-brut-xs) transition-all disabled:opacity-50 cursor-pointer"
            >
              {num}
            </button>
          ))}
          <div className="aspect-square flex items-center justify-center"></div>
          <button 
            type="button"
            disabled={loading}
            onClick={() => handleKeyPress("0")}
            className="aspect-square flex items-center justify-center text-2xl sm:text-3xl font-display bg-white text-brand-navy border-2 sm:border-3 border-brand-navy hover:bg-yellow-300 active:translate-y-1 active:shadow-none shadow-(--shadow-brut-xs) transition-all disabled:opacity-50 cursor-pointer"
          >
            0
          </button>
          <button 
            type="button"
            disabled={loading || pin.length === 0}
            onClick={handleDelete}
            aria-label="Delete"
            className="aspect-square flex items-center justify-center text-2xl sm:text-3xl font-display bg-white text-brand-navy border-2 sm:border-3 border-brand-navy hover:bg-red-500 hover:text-white active:translate-y-1 active:shadow-none shadow-(--shadow-brut-xs) transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <Delete className="w-5 h-5 sm:w-7 sm:h-7" />
          </button>
        </div>

        {loading && (
          <div className="mt-2 sm:mt-6 text-brand-navy font-black uppercase text-[10px] sm:text-xs tracking-wider animate-pulse">
            Authenticating Operator...
          </div>
        )}
      </main>

      {/* Footer Support Info */}
      <footer className="w-full max-w-sm mx-auto text-center text-[9px] sm:text-[10px] text-stone-500 uppercase mt-1 sm:mt-4 shrink-0 pb-1">
        Goodlife POS System &bull; Need credentials? Contact festival admin
      </footer>
    </div>
  );
}

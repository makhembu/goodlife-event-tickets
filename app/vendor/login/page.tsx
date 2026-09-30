"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Check, Delete, ArrowLeft, Shield } from "lucide-react";
import Link from "next/link";
import { HapticFeedback } from "@/components/ui/haptic-feedback";

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
    if (pin.length === 4) {
      handleSubmit();
    }
  }, [pin]);

  return (
    <div className="flex flex-col justify-between min-h-[100dvh] w-full p-4 md:p-6 text-brand-off-white font-mono bg-brand-navy">
      {/* Top Header Navigation */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between z-10">
        <Link 
          href="/" 
          className="flex items-center gap-2 px-3 py-1.5 border-2 border-brand-off-white/30 text-brand-off-white text-xs font-bold uppercase hover:border-brand-accent hover:text-brand-accent hover:bg-brand-navy/60 transition-all shadow-(--shadow-brut-xs) active:translate-y-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Event</span>
        </Link>

        <Link 
          href="/login" 
          className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-brand-off-white/20 text-brand-off-white/70 text-xs font-bold uppercase hover:border-brand-accent hover:text-brand-accent transition-all"
        >
          <Shield className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Admin Login</span>
        </Link>
      </header>

      {/* Main Terminal Box */}
      <main className="w-full max-w-sm mx-auto flex flex-col items-center my-auto">
        <div className="p-3 bg-brand-accent text-brand-navy border-2 border-brand-navy mb-4 shadow-(--shadow-brut-sm)">
          <Store className="w-10 h-10" strokeWidth={1.75} />
        </div>
        <h1 className="text-2xl md:text-3xl font-display uppercase tracking-widest mb-1 text-center text-brand-accent">
          Vendor Terminal
        </h1>
        <p className="text-xs font-bold uppercase tracking-wider mb-6 opacity-75">
          Enter 4-Digit Operator PIN
        </p>

        {/* PIN Indicator Dots */}
        <div className="flex gap-4 mb-6">
          {[0, 1, 2, 3].map(i => (
            <div 
              key={i} 
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                i < pin.length 
                  ? 'bg-brand-accent border-brand-accent scale-110 shadow-(--shadow-brut-xs)' 
                  : 'bg-transparent border-brand-off-white/30'
              }`} 
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 bg-red-500/20 text-red-400 px-4 py-2 border-2 border-red-500 font-bold uppercase text-xs animate-pulse text-center">
            {error}
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button 
              key={num} 
              type="button"
              disabled={loading}
              onClick={() => handleKeyPress(num.toString())}
              className="aspect-square flex items-center justify-center text-3xl font-display border-2 border-brand-off-white/20 hover:border-brand-accent hover:bg-brand-accent hover:text-brand-navy transition-all shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none disabled:opacity-50"
            >
              {num}
            </button>
          ))}
          <div className="aspect-square flex items-center justify-center"></div>
          <button 
            type="button"
            disabled={loading}
            onClick={() => handleKeyPress("0")}
            className="aspect-square flex items-center justify-center text-3xl font-display border-2 border-brand-off-white/20 hover:border-brand-accent hover:bg-brand-accent hover:text-brand-navy transition-all shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none disabled:opacity-50"
          >
            0
          </button>
          <button 
            type="button"
            disabled={loading || pin.length === 0}
            onClick={handleDelete}
            aria-label="Delete"
            className="aspect-square flex items-center justify-center text-3xl font-display border-2 border-brand-off-white/20 hover:border-red-500 hover:bg-red-500 hover:text-white transition-all shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Delete className="w-7 h-7" />
          </button>
        </div>

        {loading && (
          <div className="mt-6 text-brand-accent font-bold uppercase text-xs tracking-wider animate-pulse">
            Authenticating Operator...
          </div>
        )}
      </main>

      {/* Footer Support Info */}
      <footer className="w-full max-w-sm mx-auto text-center text-[10px] text-brand-off-white/40 uppercase mt-4">
        Goodlife POS System &bull; Need credentials? Contact festival admin
      </footer>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Check, Delete } from "lucide-react";
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
    <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full p-6 text-brand-off-white font-mono bg-brand-navy">
      <div className="w-full max-w-sm flex flex-col items-center">
        <Store className="w-16 h-16 text-brand-accent mb-6" strokeWidth={1.5} />
        <h1 className="text-3xl font-display uppercase tracking-widest mb-2 text-center text-brand-accent">Vendor Terminal</h1>
        <p className="text-sm font-bold uppercase tracking-wider mb-8 opacity-70">Enter Operator PIN</p>

        {/* PIN Dots */}
        <div className="flex gap-4 mb-8">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-6 h-6 rounded-full border-2 transition-all ${i < pin.length ? 'bg-brand-accent border-brand-accent' : 'bg-transparent border-brand-off-white/30'}`} />
          ))}
        </div>

        {error && (
          <div className="mb-4 bg-red-500/20 text-red-400 px-4 py-2 border border-red-500 font-bold uppercase text-sm animate-pulse">
            {error}
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button 
              key={num} 
              onClick={() => handleKeyPress(num.toString())}
              className="aspect-square flex items-center justify-center text-3xl font-display border-2 border-brand-off-white/20 hover:border-brand-accent hover:bg-brand-accent hover:text-brand-navy transition-colors shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none"
            >
              {num}
            </button>
          ))}
          <div className="aspect-square"></div>
          <button 
            onClick={() => handleKeyPress("0")}
            className="aspect-square flex items-center justify-center text-3xl font-display border-2 border-brand-off-white/20 hover:border-brand-accent hover:bg-brand-accent hover:text-brand-navy transition-colors shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none"
          >
            0
          </button>
          <button 
            onClick={handleDelete}
            className="aspect-square flex items-center justify-center text-3xl font-display border-2 border-brand-off-white/20 hover:border-red-500 hover:bg-red-500 hover:text-white transition-colors shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none"
          >
            <Delete className="w-8 h-8" />
          </button>
        </div>

        {loading && <div className="mt-8 text-brand-accent font-bold uppercase animate-pulse">Authenticating...</div>}
      </div>
    </div>
  );
}

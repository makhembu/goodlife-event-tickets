"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, QrCode, ArrowLeft, ArrowRight, Lock, User, Layers, MapPin } from "lucide-react";
import { HapticFeedback } from "@/components/ui/haptic-feedback";

export default function ScannerLoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [stewardName, setStewardName] = useState("");
  const [gateName, setGateName] = useState("Main Gate");
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/events")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Gate scanners should only validate open/active events, exclude closed & archived
          const openEvents = data.filter(
            (e) => (e.status || "").toLowerCase() !== "closed" && (e.status || "").toLowerCase() !== "archived" && !e.archived_at
          );
          setEvents(openEvents);
          const active = openEvents.find((e) => e.is_active) || openEvents[0];
          if (active) setSelectedEventId(active.id);
        }
      })
      .catch(console.error);

    // Check if already authenticated as scanner
    fetch("/api/scanner/session")
      .then((res) => {
        if (res.ok) router.push("/scanner");
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    document.documentElement.classList.add("bg-brand-off-white");
    document.body.classList.add("bg-brand-off-white");
    return () => {
      document.documentElement.classList.remove("bg-brand-off-white");
      document.body.classList.remove("bg-brand-off-white");
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setError("Please enter the 4-digit Gate Access PIN");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/scanner/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: pin.trim(),
          steward_name: stewardName.trim() || "Gate Steward",
          gate_name: gateName.trim() || "Main Gate",
          event_id: selectedEventId
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        HapticFeedback.trigger("success");
        router.push("/scanner");
      } else {
        HapticFeedback.trigger("error");
        setError(data.message || "Invalid Gate PIN. Check with event lead.");
      }
    } catch {
      HapticFeedback.trigger("error");
      setError("Network connection error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-off-white flex flex-col justify-between p-4 md:p-8 font-mono text-brand-navy selection:bg-yellow-300 selection:text-brand-navy">
      
      {/* TOP HEADER */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between pb-4 border-b-3 border-brand-navy">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs font-bold text-brand-navy hover:text-stone-600 uppercase transition-colors px-3 py-1.5 border-2 border-brand-navy bg-white shadow-(--shadow-brut-xs)"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit to Site</span>
        </Link>
        <Link
          href="/login"
          className="flex items-center gap-1.5 text-xs font-bold text-brand-navy hover:bg-yellow-300 uppercase transition-colors px-3 py-1.5 border-2 border-brand-navy bg-white shadow-(--shadow-brut-xs)"
        >
          <span>Admin Portal</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </header>

      {/* LOGIN CARD */}
      <div className="w-full max-w-md mx-auto my-auto py-8">
        <div className="bg-white text-brand-navy border-4 border-brand-navy p-6 md:p-8 shadow-(--shadow-brut-xl) space-y-6">
          
          <div className="text-center space-y-2 border-b-3 border-brand-navy pb-4">
            <div className="w-14 h-14 bg-yellow-300 text-brand-navy border-3 border-brand-navy flex items-center justify-center mx-auto shadow-(--shadow-brut-xs)">
              <QrCode className="w-8 h-8 text-brand-navy" strokeWidth={2} />
            </div>
            <h1 className="font-display text-2xl uppercase tracking-wider text-brand-navy">GATE SCANNER LOGIN</h1>
            <p className="text-xs font-mono font-bold text-stone-600 uppercase">
              Steward Access Terminal • Validation Station
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-100 border-2 border-red-600 text-red-900 text-xs font-bold uppercase animate-shake shadow-(--shadow-brut-xs)">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Event selection */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-brand-navy flex items-center justify-between">
                <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> 1. Select Festival Edition:</span>
                <span className="text-[9px] text-stone-500 font-bold">Boundary Check</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-1">
                {events.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedEventId(e.id)}
                    className={`p-2 border-2 text-left text-xs font-black uppercase transition-all cursor-pointer ${
                      selectedEventId === e.id
                        ? "bg-brand-navy text-yellow-300 border-brand-navy shadow-(--shadow-brut-xs)"
                        : "bg-stone-50 text-brand-navy border-brand-navy hover:bg-yellow-100"
                    }`}
                  >
                    <span className="block truncate">{e.title}</span>
                    <span className="text-[9px] font-mono opacity-70 block">#{e.id} • {e.status?.toUpperCase() || "ACTIVE"}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Gate / Lane Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-brand-navy flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> 2. Gate Station / Lane:
              </label>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {["Main Gate", "VIP Fast-Track", "Camping Gate", "Gate 2"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setGateName(preset)}
                    className={`text-[10px] font-black uppercase px-2 py-0.5 border-2 transition-colors cursor-pointer ${
                      gateName === preset
                        ? "bg-brand-navy text-white border-brand-navy"
                        : "bg-stone-50 text-brand-navy border-brand-navy hover:bg-yellow-100"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={gateName}
                onChange={(e) => setGateName(e.target.value)}
                placeholder="Or custom: e.g. Main Gate, VIP Lane, Camping Gate"
                className="w-full py-2 px-3 bg-stone-50 border-2 border-brand-navy font-mono text-xs font-bold uppercase focus:bg-white focus:outline-none"
              />
            </div>

            {/* Steward Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-brand-navy flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Steward / Operator Name:
              </label>
              <input
                type="text"
                value={stewardName}
                onChange={(e) => setStewardName(e.target.value)}
                placeholder="e.g. Alex M. (optional)"
                className="w-full py-2 px-3 bg-stone-50 border-2 border-brand-navy font-mono text-xs font-bold uppercase focus:bg-white focus:outline-none"
              />
            </div>

            {/* 4-digit Gate PIN */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-black uppercase text-brand-navy flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> Gate Access PIN:
              </label>
              <input
                type="password"
                maxLength={20}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                autoFocus
                className="w-full py-3 px-3 bg-stone-50 border-3 border-brand-navy font-mono text-center tracking-[0.3em] text-xl font-black uppercase focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-yellow-300 text-brand-navy hover:bg-brand-navy hover:text-white border-3 border-brand-navy font-display text-lg uppercase tracking-wider transition-colors shadow-(--shadow-brut-sm) cursor-pointer disabled:opacity-50"
            >
              {loading ? "AUTHENTICATING..." : "START SCANNING SESSION"}
            </button>
          </form>

          <div className="pt-2 text-center text-[10px] text-stone-500 font-bold uppercase">
            No admin credentials required. Get Gate PIN from festival management.
          </div>

        </div>
      </div>

      {/* FOOTER */}
      <footer className="w-full max-w-md mx-auto text-center text-[10px] text-stone-500 uppercase">
        GOODLIFE Event Verification System • Gate Security Protocol
      </footer>

    </div>
  );
}

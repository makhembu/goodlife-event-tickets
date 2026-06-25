"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, Flame, AlertTriangle, Sparkles } from "lucide-react";
import { fetchEventDetails, EventDetails } from "@/lib/supabase-db";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchEventDetails().then(setEventDetails).catch(console.error);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Invalid authentication credentials.");
      }

      router.push("/admin/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Invalid authentication credentials.");
      setLoading(false);
    }
  };

  const title = eventDetails?.title || "GOODLIFE";

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 text-brand-black font-sans selection:bg-brand-accent selection:text-white relative overflow-x-clip">
      
      {/* Decorative Grid Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20" 
           style={{ backgroundImage: 'radial-gradient(#050505 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

      <div className="relative z-10 max-w-md w-full space-y-8 border-4 border-brand-black bg-brand-off-white p-8 shadow-[8px_8px_0px_0px_#FF3300]">
        
        {/* Torn Corner Decorative Element */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-brand-black text-brand-off-white transform rotate-45 translate-x-10 -translate-y-10 flex items-end justify-center pb-2">
          <span className="font-mono font-black text-[9px] tracking-widest uppercase -rotate-45 mb-2 translate-y-1 text-brand-accent">SECURE</span>
        </div>

        <div className="text-center">
          <div className="flex justify-center items-center gap-2 mb-2">
            {eventDetails?.logo_url ? (
              <img src={eventDetails.logo_url} alt="Logo" className="w-8 h-8 object-contain" />
            ) : (
              <Flame className="w-8 h-8 text-brand-black" strokeWidth={2.5} />
            )}
            <span className="font-display tracking-wide text-3xl uppercase pt-1">
              {title}
            </span>
          </div>
          <span className="text-[10px] font-black tracking-widest bg-brand-black text-brand-off-white px-2.5 py-0.5 uppercase">
            ADMIN ACCESS GATEWAY
          </span>
          <h2 className="mt-4 text-4xl font-display uppercase leading-none">
            STAFF SIGN-IN
          </h2>
          <p className="mt-2 text-xs font-mono uppercase tracking-tight opacity-75">
            Authorized security controllers and gate officers only
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4">
            
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email-address" className="text-xs font-bold tracking-wider uppercase text-brand-black block">
                01. EMAIL ADDRESS
              </label>
              <div className="relative flex items-stretch">
                <div className="flex items-center justify-center px-4 border-4 border-r-0 border-brand-black bg-brand-black text-brand-off-white pointer-events-none">
                  <Mail className="h-5 w-5 text-brand-off-white" />
                </div>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="e.g. officer@goodlife.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-4 py-3 font-mono text-sm bg-white border-4 border-brand-black placeholder-brand-black/30 focus:outline-none focus:bg-brand-accent/10 focus:shadow-[4px_4px_0px_0px_#050505] transition-all text-brand-black"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-bold tracking-wider uppercase text-brand-black block">
                02. PASSWORD
              </label>
              <div className="relative flex items-stretch">
                <div className="flex items-center justify-center px-4 border-4 border-r-0 border-brand-black bg-brand-black text-brand-off-white pointer-events-none">
                  <Lock className="h-5 w-5 text-brand-off-white" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-4 py-3 font-mono text-sm bg-white border-4 border-brand-black placeholder-brand-black/30 focus:outline-none focus:bg-brand-accent/10 focus:shadow-[4px_4px_0px_0px_#050505] transition-all text-brand-black"
                />
              </div>
            </div>

          </div>

          {error && (
            <div role="alert" className="text-white text-xs font-mono flex items-center gap-3 bg-red-600 p-4 border-4 border-brand-black shadow-[4px_4px_0px_0px_#050505]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span className="uppercase">{error}</span>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 border-4 border-brand-black font-display text-xl md:text-2xl uppercase tracking-widest flex items-center justify-center gap-3 transition-all duration-100 ${
                loading
                  ? "bg-brand-bg text-brand-black/30 cursor-not-allowed shadow-none"
                  : "bg-brand-accent text-brand-black hover:bg-white shadow-[6px_6px_0px_0px_#050505] hover:shadow-[8px_8px_0px_0px_#050505] active:translate-y-[6px] active:translate-x-[6px] active:shadow-none"
              }`}
            >
              {loading ? (
                <>
                  <div className="animate-spin border-4 border-brand-black border-t-transparent w-5 h-5" />
                  AUTHENTICATING...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-brand-black" />
                  SIGN IN TO CONSOLE
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

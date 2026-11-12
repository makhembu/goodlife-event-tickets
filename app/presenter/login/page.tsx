"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Radio, Lock, Mail, ArrowRight, AlertCircle } from "lucide-react";

export default function PresenterLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/presenter/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      router.push("/presenter/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-brand-off-white font-mono">
      <div className="w-full max-w-md border-4 border-brand-navy bg-white shadow-[6px_6px_0px_#142B4C] p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-brand-accent border-2 border-brand-navy mb-3">
            <Radio className="w-8 h-8 text-brand-navy" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-navy/70 block">
            GOODLIFE RADIO 254
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-black uppercase text-brand-navy">
            Presenter Studio
          </h1>
          <p className="text-xs text-neutral-600 mt-1">
            Sign in to view your timetable slots and manage your profile.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-100 border-2 border-red-700 text-red-900 text-xs font-bold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-700 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase text-brand-navy mb-1">
              Station Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dj@goodlife.co.ke"
                className="w-full border-2 border-brand-navy pl-9 pr-3 py-2 text-sm focus:outline-hidden focus:bg-brand-accent/10"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-brand-navy mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full border-2 border-brand-navy pl-9 pr-3 py-2 text-sm focus:outline-hidden focus:bg-brand-accent/10"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-navy text-brand-off-white hover:bg-brand-accent hover:text-brand-navy font-display text-lg uppercase tracking-wide border-2 border-brand-navy shadow-[3px_3px_0px_#C8A54A] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In to Studio"} <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t-2 border-brand-navy/10 text-center text-xs text-neutral-500">
          <span>Need an account? Contact the station manager or </span>
          <Link href="/radio/schedule" className="underline font-bold text-brand-navy">
            view the timetable
          </Link>
          .
        </div>
      </div>
    </div>
  );
}

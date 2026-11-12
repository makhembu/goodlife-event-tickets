"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Radio, CheckCircle, AlertCircle, Headphones, Send, Sparkles } from "lucide-react";

export default function RadioApplyPage() {
  const [formData, setFormData] = useState({
    full_name: "",
    dj_name: "",
    email: "",
    phone: "",
    bio: "",
    show_concept: "",
    genre: "Afrohouse / Electronic",
    sample_mix_url: "",
    instagram_handle: "",
    twitter_handle: "",
    mixcloud_url: "",
    soundcloud_url: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/radio/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: formData.full_name,
          dj_name: formData.dj_name,
          email: formData.email,
          phone: formData.phone,
          bio: formData.bio,
          show_concept: formData.show_concept,
          genre: formData.genre,
          sample_mix_url: formData.sample_mix_url,
          social_links: {
            instagram: formData.instagram_handle,
            twitter: formData.twitter_handle,
            mixcloud: formData.mixcloud_url,
            soundcloud: formData.soundcloud_url,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit application");
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg py-8 px-4 sm:px-6 md:px-10 text-brand-navy font-sans relative selection:bg-brand-accent selection:text-brand-navy">
      {/* Background Subtle Atmosphere Texture */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(rgba(22,24,29,0.18) 1px, transparent 1px), radial-gradient(rgba(223,187,125,0.15) 1px, transparent 1px)",
          backgroundSize: "28px 28px, 56px 56px",
          backgroundPosition: "0 0, 14px 14px",
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between border-b-4 border-brand-navy pb-3">
          <Link
            href="/radio"
            className="p-2 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent transition-all shadow-(--shadow-brut-xs) flex items-center gap-1.5 font-mono text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4 text-brand-navy" />
            <span>BACK TO RADIO</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-navy/70">
              PRESENTER RECRUITMENT 254
            </span>
          </div>
        </div>

        {/* Hero Header */}
        <div className="border-4 border-brand-navy bg-brand-off-white p-6 shadow-(--shadow-brut-lg) space-y-2">
          <div className="flex items-center gap-2 font-mono text-xs font-black uppercase text-brand-accent">
            <Radio className="w-4 h-4" />
            <span>JOIN THE AIRWAVES</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide text-brand-navy leading-none">
            APPLY AS A RESIDENT PRESENTER
          </h1>
          <p className="font-mono text-xs sm:text-sm text-brand-navy/80">
            GOODLIFE Radio 254 broadcasts 24/7 across Nairobi and the global festival circuit. We are curating our launch roster of weekly and biweekly resident DJs, tastemakers, and music selectors.
          </p>
        </div>

        {/* Success Banner */}
        {submitted ? (
          <div className="border-4 border-brand-navy bg-emerald-100 p-8 shadow-(--shadow-brut-md) space-y-4 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-700 mx-auto" />
            <h2 className="font-display text-2xl uppercase tracking-wide text-emerald-950">
              APPLICATION RECEIVED!
            </h2>
            <p className="font-mono text-sm text-emerald-900 max-w-lg mx-auto">
              Asante! Your application and sample mix have been transmitted directly to the GOODLIFE programming team. If selected for our launch roster, you will receive an invitation email with your Presenter Studio credentials.
            </p>
            <div className="pt-2">
              <Link
                href="/radio/schedule"
                className="inline-block py-2.5 px-6 bg-brand-navy text-brand-off-white hover:bg-brand-accent hover:text-brand-navy font-mono text-xs font-black uppercase border-2 border-brand-navy shadow-(--shadow-brut-xs) transition-all"
              >
                EXPLORE CURRENT TIMETABLE →
              </Link>
            </div>
          </div>
        ) : (
          /* Application Form */
          <form
            onSubmit={handleSubmit}
            className="border-4 border-brand-navy bg-brand-off-white p-6 shadow-(--shadow-brut-md) space-y-5"
          >
            {error && (
              <div className="p-3 bg-red-100 border-2 border-red-600 text-red-800 font-mono text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-xs font-black uppercase text-brand-navy mb-1">
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kelvin Mwangi"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-xs text-brand-navy focus:outline-none focus:bg-brand-bg shadow-(--shadow-brut-xs)"
                />
              </div>

              <div>
                <label className="block font-mono text-xs font-black uppercase text-brand-navy mb-1">
                  DJ / Presenter Moniker *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DJ KMR"
                  value={formData.dj_name}
                  onChange={(e) => setFormData({ ...formData, dj_name: e.target.value })}
                  className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-xs text-brand-navy focus:outline-none focus:bg-brand-bg shadow-(--shadow-brut-xs)"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-xs font-black uppercase text-brand-navy mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="presenter@goodlife.co.ke"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-xs text-brand-navy focus:outline-none focus:bg-brand-bg shadow-(--shadow-brut-xs)"
                />
              </div>

              <div>
                <label className="block font-mono text-xs font-black uppercase text-brand-navy mb-1">
                  Phone (WhatsApp / M-Pesa) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="0712 345 678"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-xs text-brand-navy focus:outline-none focus:bg-brand-bg shadow-(--shadow-brut-xs)"
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-xs font-black uppercase text-brand-navy mb-1">
                Sample Mix or Radio Set URL *
              </label>
              <input
                type="url"
                required
                placeholder="SoundCloud, Mixcloud, YouTube, or Google Drive link"
                value={formData.sample_mix_url}
                onChange={(e) => setFormData({ ...formData, sample_mix_url: e.target.value })}
                className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-xs text-brand-navy focus:outline-none focus:bg-brand-bg shadow-(--shadow-brut-xs)"
              />
              <span className="font-mono text-[10px] text-brand-navy/60 mt-1 block">
                Must be an accessible, streaming URL showcasing your track selection and mixing ability (minimum 30 min).
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-xs font-black uppercase text-brand-navy mb-1">
                  Primary Music Genre *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Afrohouse / 3-Step / Amapiano"
                  value={formData.genre}
                  onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                  className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-xs text-brand-navy focus:outline-none focus:bg-brand-bg shadow-(--shadow-brut-xs)"
                />
              </div>

              <div>
                <label className="block font-mono text-xs font-black uppercase text-brand-navy mb-1">
                  Instagram Handle
                </label>
                <input
                  type="text"
                  placeholder="@djkmr"
                  value={formData.instagram_handle}
                  onChange={(e) => setFormData({ ...formData, instagram_handle: e.target.value })}
                  className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-xs text-brand-navy focus:outline-none focus:bg-brand-bg shadow-(--shadow-brut-xs)"
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-xs font-black uppercase text-brand-navy mb-1">
                Proposed Show Concept & Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Sub-Sahara Grooves · A 2-hour deep dive into African deep house"
                value={formData.show_concept}
                onChange={(e) => setFormData({ ...formData, show_concept: e.target.value })}
                className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-xs text-brand-navy focus:outline-none focus:bg-brand-bg shadow-(--shadow-brut-xs)"
              />
            </div>

            <div>
              <label className="block font-mono text-xs font-black uppercase text-brand-navy mb-1">
                Presenter Biography & Musical Background *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Tell us about yourself, your club or festival experience, and why your sound belongs on Goodlife Radio..."
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-xs text-brand-navy focus:outline-none focus:bg-brand-bg shadow-(--shadow-brut-xs)"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-navy hover:bg-brand-accent text-brand-off-white hover:text-brand-navy font-mono text-xs font-black uppercase tracking-wider border-2 border-brand-navy shadow-(--shadow-brut-md) transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span>SUBMITTING APPLICATION...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>TRANSMIT PRESENTER APPLICATION</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, Send, Music, Sparkles, Check, AlertCircle, Heart } from "lucide-react";
import TipModal from "@/components/radio/TipModal";

interface ShoutoutWallProps {
  className?: string;
}

interface ShoutoutItem {
  id: number;
  sender_name: string;
  message: string;
  request_track?: string | null;
  source: "web" | "whatsapp";
  is_featured: boolean;
  created_at: string;
}

export default function ShoutoutWall({ className = "" }: ShoutoutWallProps) {
  const [shoutouts, setShoutouts] = useState<ShoutoutItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [trackRequest, setTrackRequest] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showTipModal, setShowTipModal] = useState(false);

  // Poll Shoutouts every 15s
  useEffect(() => {
    let isCancelled = false;
    async function loadShoutouts() {
      try {
        const res = await fetch("/api/radio/shoutouts?limit=25");
        if (!res.ok) return;
        const data = await res.json();
        if (!isCancelled && Array.isArray(data)) {
          setShoutouts(data);
        }
      } catch {
        // Soft fail
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    loadShoutouts();
    const interval = setInterval(loadShoutouts, 15000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!message.trim()) {
      setFeedback({ type: "error", text: "Please write a message to the station." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/radio/shoutouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          message: message.trim(),
          trackRequest: trackRequest.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit shoutout.");
      }

      setFeedback({ type: "success", text: data.message || "Shoutout sent to the DJ!" });
      setMessage("");
      setTrackRequest("");
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Failed to submit shoutout." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl p-5 space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-brand-navy/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-navy text-white rounded">
            <MessageSquare className="w-4 h-4 text-brand-accent" />
          </div>
          <div>
            <h3 className="font-display text-xl uppercase tracking-wide text-brand-navy">
              SHOUTOUTS & SONG REQUESTS
            </h3>
            <span className="text-[11px] font-mono text-brand-navy/70 block">
              LIVE AIRWAVE TICKER & ON-AIR DJ QUEUE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTipModal(true)}
            className="flex items-center gap-1.5 bg-[#C8A54A] hover:bg-[#d9b65b] text-[#142B4C] font-mono text-[10px] font-black uppercase px-2.5 py-1 rounded border border-[#142B4C] cursor-pointer shadow-xs transition-transform active:scale-95"
          >
            <Heart className="w-3 h-3 fill-[#142B4C]" />
            <span>TIP STATION</span>
          </button>
          <span className="bg-brand-accent/20 border border-brand-navy text-brand-navy font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded">
            MODERATED LIVE
          </span>
        </div>
      </div>

      {/* Live Shoutout Ticker / Feed */}
      <div className="space-y-2">
        <span className="text-[11px] font-black uppercase font-mono tracking-wider text-brand-navy block">
          ON-AIR TICKER ({shoutouts.length})
        </span>

        {loading ? (
          <div className="p-4 bg-brand-off-white rounded-lg text-center font-mono text-xs text-brand-navy/60">
            Connecting to shoutout ticker...
          </div>
        ) : shoutouts.length === 0 ? (
          <div className="p-4 bg-brand-off-white rounded-lg text-center font-mono text-xs text-brand-navy/70">
            No live shoutouts yet for this slot. Send yours below to be featured on air!
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {shoutouts.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-lg border-2 border-brand-navy text-xs font-mono transition-all ${
                  item.is_featured
                    ? "bg-amber-100 border-amber-800 shadow-xs"
                    : "bg-brand-off-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    {item.is_featured && (
                      <span className="p-0.5 bg-amber-500 text-black rounded text-[9px] font-black uppercase flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> FEATURED
                      </span>
                    )}
                    <span className="font-bold text-brand-navy uppercase truncate">
                      {item.sender_name}
                    </span>
                  </div>
                  <span className="text-[10px] text-brand-navy/50 uppercase">
                    via {item.source}
                  </span>
                </div>

                <p className="text-brand-navy/90 leading-relaxed font-sans text-xs">
                  "{item.message}"
                </p>

                {item.request_track && (
                  <div className="mt-1.5 pt-1.5 border-t border-brand-navy/15 flex items-center gap-1.5 text-[11px] text-brand-navy font-bold">
                    <Music className="w-3 h-3 text-brand-accent shrink-0" />
                    <span className="truncate">Track Request: {item.request_track}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submission Form */}
      <form onSubmit={handleSubmit} className="border-t-2 border-brand-navy/20 pt-4 space-y-3 font-mono text-xs">
        <span className="text-[11px] font-black uppercase font-mono tracking-wider text-brand-navy block">
          DROP A LIVE SHOUTOUT OR REQUEST
        </span>

        {feedback && (
          <div
            className={`p-2.5 rounded border-2 flex items-center gap-2 ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-800 text-emerald-900"
                : "bg-red-50 border-red-800 text-red-900"
            }`}
          >
            {feedback.type === "success" ? (
              <Check className="w-4 h-4 shrink-0 text-emerald-700" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-700" />
            )}
            <span className="font-bold leading-tight">{feedback.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] uppercase font-bold text-brand-navy/70 mb-0.5">
              Your Name / Crew Alias
            </label>
            <input
              type="text"
              placeholder="e.g. DJ Mwasi, Thika Crew"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border-2 border-brand-navy rounded bg-brand-off-white text-brand-navy font-bold focus:bg-white focus:outline-hidden"
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-brand-navy/70 mb-0.5">
              Phone Number (Optional / Masked)
            </label>
            <input
              type="tel"
              placeholder="e.g. 0712345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-2 border-2 border-brand-navy rounded bg-brand-off-white text-brand-navy focus:bg-white focus:outline-hidden"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase font-bold text-brand-navy/70 mb-0.5">
            Your Shoutout Message (Max 280 chars)
          </label>
          <textarea
            rows={2}
            placeholder="Big up Marara Camp festival vibes! Locked in from Nairobi West..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full p-2 border-2 border-brand-navy rounded bg-brand-off-white text-brand-navy focus:bg-white focus:outline-hidden resize-none"
            maxLength={280}
            required
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase font-bold text-brand-navy/70 mb-0.5">
            Optional Song Request
          </label>
          <input
            type="text"
            placeholder="e.g. Kabza De Small - Asambe or Bensoul"
            value={trackRequest}
            onChange={(e) => setTrackRequest(e.target.value)}
            className="w-full p-2 border-2 border-brand-navy rounded bg-brand-off-white text-brand-navy focus:bg-white focus:outline-hidden"
            maxLength={150}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 px-4 bg-brand-navy hover:bg-brand-navy-light text-brand-accent font-mono text-xs font-bold uppercase tracking-wider border-2 border-brand-navy shadow-(--shadow-brut-xs) transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{submitting ? "SENDING SHOUTOUT..." : "SUBMIT TO LIVE AIRWAVES"}</span>
        </button>

        <p className="text-[10px] text-brand-navy/60 text-center">
          Or send via WhatsApp: Message <strong className="text-brand-navy">SHOUT &lt;your message&gt;</strong> to the station number.
        </p>
      </form>

      <TipModal
        isOpen={showTipModal}
        onClose={() => setShowTipModal(false)}
      />
    </div>
  );
}

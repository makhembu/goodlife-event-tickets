"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, Send, Music, Sparkles, Check, AlertCircle, Heart, Lock, ShieldCheck, Clock } from "lucide-react";
import TipModal from "@/components/radio/TipModal";

interface ShoutoutWallProps {
  className?: string;
  isLiveTakeover?: boolean;
  presenterName?: string;
  presenterId?: number;
}

interface ShoutoutItem {
  id: number;
  sender_name: string;
  message: string;
  request_track?: string | null;
  source: "web" | "whatsapp";
  is_featured: boolean;
  status?: string;
  request_status?: string | null;
  created_at: string;
}

interface MySubmission {
  id: number;
  sender_name: string;
  message: string;
  request_track?: string | null;
  status: string;
  is_featured: boolean;
  request_status?: string | null;
  created_at: string;
  presenter_dj_name?: string | null;
}

export default function ShoutoutWall({
  className = "",
  isLiveTakeover = false,
  presenterName = "GOODLIFE DJ",
  presenterId,
}: ShoutoutWallProps) {
  const [shoutouts, setShoutouts] = useState<ShoutoutItem[]>([]);
  const [mySubmissions, setMySubmissions] = useState<MySubmission[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [trackRequest, setTrackRequest] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showTipModal, setShowTipModal] = useState(false);

  // Poll Public Shoutouts every 15s (paused on background tab)
  useEffect(() => {
    let isCancelled = false;

    async function loadShoutouts() {
      if (typeof document !== "undefined" && document.hidden) return;
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

    async function loadMySubmissions() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/radio/shoutouts/mine");
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && Array.isArray(data)) {
            setMySubmissions(data);
          }
        }
      } catch {}
    }

    loadShoutouts();
    loadMySubmissions();

    const interval = setInterval(() => {
      loadShoutouts();
      loadMySubmissions();
    }, 15000);

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
          presenterId: presenterId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit shoutout.");
      }

      setFeedback({ type: "success", text: data.message || "Message transmitted to the booth queue!" });
      setMessage("");
      setTrackRequest("");

      // Refresh sender's own tracked submissions
      const mineRes = await fetch("/api/radio/shoutouts/mine");
      if (mineRes.ok) {
        const mineData = await mineRes.json();
        if (Array.isArray(mineData)) setMySubmissions(mineData);
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Failed to submit shoutout." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-none p-5 space-y-5 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-brand-navy/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-navy text-white rounded-none">
            <MessageSquare className="w-4 h-4 text-brand-accent" />
          </div>
          <div>
            <h3 className="font-display text-xl uppercase tracking-wide text-brand-navy">
              {isLiveTakeover ? `BOOTH HOTLINE · ${presenterName}` : "SHOUTOUTS & SONG REQUESTS"}
            </h3>
            <span className="text-xs font-mono text-brand-navy/70 block">
              {isLiveTakeover ? "DIRECT TO HEADPHONES & ON-AIR TICKER" : "LIVE AIRWAVE TICKER & ON-AIR DJ QUEUE"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTipModal(true)}
            className="flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-vivid text-brand-navy font-mono text-xs font-black uppercase px-3 py-1.5 rounded-none border-2 border-brand-navy cursor-pointer shadow-(--shadow-brut-xs) transition-transform active:translate-x-0.5 active:translate-y-0.5 focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2"
          >
            <Heart className="w-3.5 h-3.5 fill-brand-navy" />
            <span>{isLiveTakeover ? `TIP ${presenterName}` : "TIP STATION"}</span>
          </button>
        </div>
      </div>

      {/* SENDER'S PERSONAL SUBMISSION STATUS TRACKER */}
      {mySubmissions.length > 0 && (
        <div className="p-3 bg-brand-off-white border-2 border-brand-navy rounded-none space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-black uppercase tracking-wider text-brand-navy flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> YOUR SUBMISSION TRACKER
            </span>
            <span className="font-mono text-xs text-brand-navy/60">SAVED TO SESSION</span>
          </div>

          <div className="space-y-1.5">
            {mySubmissions.slice(0, 2).map((sub) => {
              const isRead = sub.status === "read" || sub.is_featured;
              const isSeen = sub.status === "approved" || isRead;

              return (
                <div key={sub.id} className="p-2 bg-white border border-brand-navy text-xs font-mono flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-bold text-brand-navy">"{sub.message}"</span>
                    {sub.request_track && (
                      <span className="text-brand-navy/70 ml-2">♫ {sub.request_track}</span>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {isRead ? (
                      <span className="bg-brand-accent text-brand-navy font-bold px-2 py-0.5 border border-brand-navy flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> READ ON AIR
                      </span>
                    ) : isSeen ? (
                      <span className="bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 border border-emerald-800">
                        SEEN BY DJ
                      </span>
                    ) : (
                      <span className="bg-neutral-100 text-neutral-800 font-bold px-2 py-0.5 border border-neutral-400">
                        IN QUEUE
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Shoutout Ticker / Feed */}
      <div className="space-y-2">
        <span className="text-xs font-black uppercase font-mono tracking-wider text-brand-navy block">
          ON-AIR TICKER ({shoutouts.length})
        </span>

        {loading ? (
          <div className="p-4 bg-brand-off-white rounded-none text-center font-mono text-xs text-brand-navy/60">
            Connecting to shoutout ticker...
          </div>
        ) : shoutouts.length === 0 ? (
          <div className="p-4 bg-brand-off-white rounded-none text-center font-mono text-xs text-brand-navy/70">
            No live shoutouts yet for this slot. Send yours below to be featured on air!
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {shoutouts.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-none border-2 border-brand-navy text-xs font-mono transition-all ${
                  item.is_featured
                    ? "bg-amber-100 border-brand-navy shadow-(--shadow-brut-xs)"
                    : "bg-brand-off-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    {item.is_featured && (
                      <span className="px-1.5 py-0.5 bg-brand-accent text-brand-navy rounded-none text-xs font-black uppercase flex items-center gap-1 border border-brand-navy">
                        <Sparkles className="w-3 h-3" /> READ ON AIR
                      </span>
                    )}
                    <span className="font-bold text-brand-navy uppercase truncate">
                      {item.sender_name}
                    </span>
                  </div>
                  <span className="text-xs text-brand-navy/50 uppercase">
                    via {item.source}
                  </span>
                </div>

                <p className="text-brand-navy/90 leading-relaxed font-sans text-xs">
                  "{item.message}"
                </p>

                {item.request_track && (
                  <div className="mt-1.5 pt-1.5 border-t border-brand-navy/15 flex items-center gap-1.5 text-xs text-brand-navy font-bold">
                    <Music className="w-3.5 h-3.5 text-brand-accent shrink-0" />
                    <span className="truncate">Track Request: {item.request_track}</span>
                    {item.request_status && (
                      <span className="text-[11px] font-mono font-bold uppercase ml-auto text-brand-navy/70">
                        [{item.request_status}]
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submission Form */}
      <form onSubmit={handleSubmit} className="border-t-2 border-brand-navy/20 pt-4 space-y-3 font-mono text-xs">
        <span className="text-xs font-black uppercase font-mono tracking-wider text-brand-navy block">
          {isLiveTakeover ? `DROP A MESSAGE TO ${presenterName}'S BOOTH MONITOR` : "DROP A LIVE SHOUTOUT OR REQUEST"}
        </span>

        {feedback && (
          <div
            className={`p-2.5 rounded-none border-2 flex items-center gap-2 ${
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
            <span className="font-bold text-xs">{feedback.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="shoutout-name" className="block text-xs font-bold uppercase text-brand-navy mb-1">
              YOUR NAME / CREW ALIAS
            </label>
            <input
              id="shoutout-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. DJ Musti, Thika Crew"
              maxLength={50}
              className="w-full h-11 px-3 bg-brand-off-white border-2 border-brand-navy rounded-none text-base font-mono text-brand-navy placeholder:text-brand-navy/60 focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2 transition-all"
            />
          </div>

          <div>
            <label htmlFor="shoutout-phone" className="block text-xs font-bold uppercase text-brand-navy mb-1">
              PHONE NUMBER (OPTIONAL · FOR VIP / FESTIVAL PERKS)
            </label>
            <input
              id="shoutout-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0712345678"
              className="w-full h-11 px-3 bg-brand-off-white border-2 border-brand-navy rounded-none text-base font-mono text-brand-navy placeholder:text-brand-navy/60 focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2 transition-all"
            />
          </div>
        </div>

        <div>
          <label htmlFor="shoutout-message" className="block text-xs font-bold uppercase text-brand-navy mb-1">
            YOUR MESSAGE {isLiveTakeover ? `TO ${presenterName}` : "TO AIRWAVE"} (MAX 280 CHARS) *
          </label>
          <textarea
            id="shoutout-message"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Big up Marara Camp festival vibes! Locked in from Nairobi West..."
            maxLength={280}
            required
            className="w-full p-3 bg-brand-off-white border-2 border-brand-navy rounded-none text-base font-mono text-brand-navy placeholder:text-brand-navy/60 focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2 resize-none transition-all"
          />
        </div>

        <div>
          <label htmlFor="shoutout-track" className="block text-xs font-bold uppercase text-brand-navy mb-1">
            OPTIONAL SONG REQUEST / DUBPLATE
          </label>
          <input
            id="shoutout-track"
            type="text"
            value={trackRequest}
            onChange={(e) => setTrackRequest(e.target.value)}
            placeholder="e.g. Kabza De Small - Asambe or Bensoul"
            maxLength={150}
            className="w-full h-11 px-3 bg-brand-off-white border-2 border-brand-navy rounded-none text-base font-mono text-brand-navy placeholder:text-brand-navy/60 focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2 transition-all"
          />
        </div>

        {/* Privacy Copy (Kenya Data Protection Act Compliance) */}
        <p className="font-mono text-[11px] sm:text-xs text-brand-navy/70 leading-relaxed">
          <Lock className="w-3 h-3 inline mr-1" />
          Phone numbers are private and purged after 30 days under the Kenya Data Protection Act.
        </p>

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[44px] py-3 px-4 bg-brand-navy hover:bg-brand-navy-light text-brand-off-white font-mono text-xs sm:text-sm font-bold uppercase tracking-wider border-2 border-brand-navy rounded-none shadow-(--shadow-brut-xs) transition-all flex items-center justify-center gap-2 cursor-pointer active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2"
        >
          <Send className="w-4 h-4 text-brand-accent" />
          <span>{submitting ? "TRANSMITTING..." : isLiveTakeover ? `TRANSMIT DIRECT TO ${presenterName}` : "SUBMIT TO LIVE AIRWAVES"}</span>
        </button>
      </form>

      {/* Tip Modal Component */}
      <TipModal
        isOpen={showTipModal}
        onClose={() => setShowTipModal(false)}
        presenterId={presenterId}
        presenterName={presenterName}
      />
    </div>
  );
}

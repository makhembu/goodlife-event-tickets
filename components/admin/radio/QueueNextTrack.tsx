"use client";

import React, { useState } from "react";
import { Sparkles, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, Music2 } from "lucide-react";

export default function QueueNextTrack() {
  const [trackUrl, setTrackUrl] = useState("");
  const [voicePreference, setVoicePreference] = useState<"male" | "female">("male");
  const [customDropText, setCustomDropText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    artist: string;
    title: string;
    drop_script: string;
    queued: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackUrl.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/radio/queue-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trackUrl.trim(),
          custom_drop_text: customDropText.trim() || undefined,
          voice_preference: voicePreference,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      setResult({
        artist: data.artist || "Goodlife Selection",
        title: data.title || "Next Track",
        drop_script: data.drop_script || "",
        queued: Boolean(data.queued_as_up_next),
      });
      setTrackUrl("");
      setCustomDropText("");
    } catch (err: any) {
      setError(err.message || "Failed to insert track into queue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) space-y-4">
      <div className="flex items-center gap-2 border-b-2 border-brand-navy pb-2">
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h2 className="font-display text-lg font-black uppercase">
          INSERT AS &quot;UP NEXT&quot; (LIVE AUTO-DJ)
        </h2>
      </div>

      <p className="text-xs text-brand-navy/70">
        Instantly add a track from your phone while another song is airing. The server downloads the track, generates an authentic Kenyan Sheng drop, ducks the song intro by -12dB, and prioritizes it in the AutoDJ queue.
      </p>

      {error && (
        <div className="p-3 border-2 border-red-600 bg-red-50 text-red-800 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="cursor-pointer text-xs font-black">
            ×
          </button>
        </div>
      )}

      {result && (
        <div className="p-4 border-2 border-emerald-600 bg-emerald-50 text-emerald-950 text-xs space-y-2">
          <div className="flex items-center gap-2 font-black">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>✓ Track Queued for Live Playout!</span>
          </div>
          <div className="bg-white p-2.5 border border-emerald-300 font-mono text-[11px] space-y-1">
            <p><span className="font-bold text-emerald-800">Song:</span> {result.artist} - {result.title}</p>
            {result.drop_script && (
              <p><span className="font-bold text-emerald-800">AI Drop:</span> &ldquo;{result.drop_script}&rdquo;</p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-[11px] font-black uppercase tracking-wider text-brand-navy mb-1">
            Track URL (YouTube, SoundCloud, or Direct Audio)
          </label>
          <input
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=... or https://soundcloud.com/..."
            value={trackUrl}
            onChange={(e) => setTrackUrl(e.target.value)}
            className="w-full p-2.5 border-2 border-brand-navy bg-brand-off-white text-xs font-bold focus:outline-none focus:bg-white"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-brand-navy mb-1">
              AI Voice Persona
            </label>
            <select
              value={voicePreference}
              onChange={(e) => setVoicePreference(e.target.value as "male" | "female")}
              className="w-full p-2.5 border-2 border-brand-navy bg-brand-off-white text-xs font-bold focus:outline-none focus:bg-white cursor-pointer"
            >
              <option value="male">Nairobi Sheng DJ (Urban Male)</option>
              <option value="female">Smooth Sunset Host (Urban Female)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-brand-navy mb-1">
              Custom Drop Script (Optional)
            </label>
            <input
              type="text"
              placeholder="Leave blank for AI auto-generation"
              value={customDropText}
              onChange={(e) => setCustomDropText(e.target.value)}
              className="w-full p-2.5 border-2 border-brand-navy bg-brand-off-white text-xs font-bold focus:outline-none focus:bg-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !trackUrl.trim()}
          className="w-full py-3 px-6 border-2 border-brand-navy bg-brand-navy text-white text-xs font-black uppercase tracking-wider hover:bg-brand-navy/90 disabled:opacity-50 transition-colors shadow-(--shadow-brut-xs) flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>PROCESSING AUDIO &amp; DUCKING INTRO...</span>
            </>
          ) : (
            <>
              <ArrowRight className="w-4 h-4" />
              <span>QUEUE AS &quot;UP NEXT&quot;</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

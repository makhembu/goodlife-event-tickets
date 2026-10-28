"use client";

import React, { useState } from "react";
import { Sparkles, Play, Plus, RefreshCw, CheckCircle2, AlertCircle, Mic2, Disc3 } from "lucide-react";

interface DropPreset {
  id: string;
  label: string;
  vibe: string;
  defaultText: string;
}

const PRESETS: DropPreset[] = [
  {
    id: "wazi",
    label: "Wazi 254",
    vibe: "Hype / Sheng",
    defaultText: "Yo Nairobi! You're locked into GOODLIFE Radio 254. Keep it tuned for non-stop festival heat!",
  },
  {
    id: "sunrise",
    label: "Nairobi Sunrise",
    vibe: "Warm / Chill",
    defaultText: "Early vibes with GOODLIFE Radio. Sip your morning brew and vibe with the city's finest selections.",
  },
  {
    id: "sunset",
    label: "Sunset Sessions",
    vibe: "Deep / Afro-House",
    defaultText: "As the sun sets over the Rift Valley, GOODLIFE Radio takes you on a deep Afro-house journey.",
  },
  {
    id: "up_next",
    label: "Next Up Banger",
    vibe: "Transition",
    defaultText: "Brand new heat coming through your speakers right now on GOODLIFE Radio 254!",
  },
];

interface DropStudioProps {
  onDropReady?: (audioUrl: string, dropName: string) => void;
}

export default function DropStudio({ onDropReady }: DropStudioProps) {
  const [selectedPreset, setSelectedPreset] = useState<DropPreset>(PRESETS[0]);
  const [voiceId, setVoiceId] = useState<string>("en-US-Journey-F");
  const [customText, setCustomText] = useState(PRESETS[0].defaultText);
  const [generating, setGenerating] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSelectPreset = (preset: DropPreset) => {
    setSelectedPreset(preset);
    setCustomText(preset.defaultText);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;

    setGenerating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/admin/radio/drops/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_text: customText.trim(),
          voice_id: voiceId,
          theme: selectedPreset.vibe,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Drop generation failed.");
      }

      setGeneratedAudioUrl(data.drop_url);
      setGeneratedScript(data.script || customText);
      setSuccessMsg("✓ Drop synthesized and mastered to -14 LUFS!");

      if (onDropReady) {
        onDropReady(data.drop_url, `${selectedPreset.label} Drop`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate AI drop.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="font-mono text-xs font-black tracking-widest uppercase text-white">
            AI SHENG DROP STUDIO (3-STEP ENGINE)
          </h3>
        </div>
        <span className="font-mono text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
          GEMINI TTS · EBU R128
        </span>
      </div>

      <form onSubmit={handleGenerate} className="space-y-4">
        {/* Step 1: Choose Style Preset */}
        <div>
          <label className="font-mono text-[11px] text-zinc-400 uppercase font-bold block mb-1.5">
            1. Select Drop Style Preset
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESETS.map((p) => {
              const active = selectedPreset.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    active
                      ? "bg-amber-500/10 border-amber-500/50 text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <p className="font-mono text-xs font-bold truncate">{p.label}</p>
                  <p className="font-mono text-[10px] text-zinc-500 truncate">{p.vibe}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Voice & Script Customization */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="font-mono text-[11px] text-zinc-400 uppercase font-bold block mb-1.5">
              Voice Persona
            </label>
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
            >
              <option value="en-US-Journey-F">Amina (Warm Host)</option>
              <option value="en-US-Journey-D">Marcus (Deep Resident)</option>
              <option value="en-US-Casual-K">Kev (Nairobi Sheng Hype)</option>
              <option value="en-GB-Standard-B">Zara (Late Night Afro)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="font-mono text-[11px] text-zinc-400 uppercase font-bold block mb-1.5">
              Spoken Sheng / English Script
            </label>
            <textarea
              rows={2}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500 resize-none"
              placeholder="Enter script for voice drop..."
            />
          </div>
        </div>

        {/* Step 3: Action & Audition */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={generating || !customText.trim()}
              className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{generating ? "SYNTHESIZING..." : "GENERATE DROP"}</span>
            </button>

            {generatedAudioUrl && (
              <button
                type="button"
                onClick={() => {
                  const audio = new Audio(generatedAudioUrl);
                  audio.play();
                }}
                className="px-3 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400 fill-current" />
                <span>AUDITION</span>
              </button>
            )}
          </div>

          {successMsg && (
            <span className="font-mono text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{successMsg}</span>
            </span>
          )}

          {error && (
            <span className="font-mono text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

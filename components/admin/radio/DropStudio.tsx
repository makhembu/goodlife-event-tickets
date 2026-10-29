"use client";

import React, { useState, useRef } from "react";
import { Sparkles, Headphones, Radio, Plus, CheckCircle2, AlertCircle, RefreshCw, Volume2 } from "lucide-react";
import { CueDropItem } from "./CueDock";

interface DropPreset {
  id: string;
  label: string;
  vibe: string;
  defaultText: string;
}

const PRESETS: DropPreset[] = [
  {
    id: "park_chill",
    label: "Park & Chill (Marara)",
    vibe: "Park & Chill / Outdoors",
    defaultText: "Yo, what's good Thika! You know what it is... DJ Fusion the entertainer on the mic. Na sasa, nimecome kuwa plug maze. Every Sunday, we park and chill at Marara Camp, Thika. Good vibes, muziki poa, river views, na ni 200 bob pekee. Come through manzee!",
  },
  {
    id: "park_chill_english",
    label: "Park & Chill (English)",
    vibe: "Warm / Casual",
    defaultText: "Yo, Thika! You know what time it is. It's your boy DJ Fusion in the building. Every Sunday, we park and chill at Marara Camp, Thika. Cold drinks, festival vibes by the river... 200 bob only. We outside!",
  },
  {
    id: "wazi",
    label: "Wazi 254 Hype",
    vibe: "Hype / Sheng",
    defaultText: "Yo Nairobi! You're locked into GOODLIFE Radio 254. Keep it tuned for non-stop festival heat, we outside!",
  },
  {
    id: "sunrise",
    label: "Nairobi Sunrise",
    vibe: "Warm / Chill",
    defaultText: "Early vibes with GOODLIFE Radio 254. Sip your morning brew and vibe with the city's finest selections.",
  },
  {
    id: "sunset",
    label: "Sunset Sessions",
    vibe: "Deep / Afro-House",
    defaultText: "As the sun sets over the Rift Valley, GOODLIFE Radio takes you on a deep Afro-house journey.",
  },
  {
    id: "up_next",
    label: "Up Next Banger",
    vibe: "Transition",
    defaultText: "Brand new heat coming through your speakers right now on GOODLIFE Radio 254!",
  },
];

const EMOTION_TAGS = [
  { label: "[hype]", tag: "[hype] " },
  { label: "[confident]", tag: "[confident] " },
  { label: "[energetic]", tag: "[energetic] " },
  { label: "[relaxed]", tag: "[relaxed] " },
  { label: "[warm tone]", tag: "[warm tone] " },
  { label: "[chuckle]", tag: "[chuckle] " },
];

const VOICES = [
  { id: "dj-fusion", label: "DJ Fusion", role: "Resident (Cloned / 30%)", icon: "🔥" },
  { id: "dj-sudi", label: "DJ Sudi", role: "Swahili DJ Drops", icon: "💿" },
  { id: "dj-sney", label: "DJ Sney", role: "Hype Mixtape MC", icon: "⚡" },
  { id: "mc-cheche", label: "MC Cheche", role: "Urban Sheng", icon: "🎙️" },
  { id: "dj-shax", label: "DJ Shax", role: "Festival Hype", icon: "🔊" },
  { id: "amina", label: "Amina", role: "Sunset Host (Cloned)", icon: "👩" },
  { id: "bwana-mkubwa", label: "Bwana Mkubwa", role: "Baritone Swahili", icon: "📻" },
  { id: "malkia-kenya", label: "Malkia Kenya", role: "Vibrant Presenter", icon: "✨" },
  { id: "wigman", label: "Wigman", role: "Deep Vault Afro-tech", icon: "🎧" },
  { id: "zari", label: "Zari", role: "Coastal Breeze", icon: "🌊" },
  { id: "gemini-aoede", label: "Aoede", role: "Gemini Broadcast (Warm)", icon: "🎙️" },
  { id: "gemini-puck", label: "Puck", role: "Gemini Broadcast (Hype)", icon: "⚡" },
  { id: "gemini-charon", label: "Charon", role: "Gemini Broadcast (Baritone)", icon: "🌙" },
  { id: "gemini-fenrir", label: "Fenrir", role: "Gemini Broadcast (Commander)", icon: "👑" },
  { id: "gemini-kore", label: "Kore", role: "Gemini Broadcast (Melodic)", icon: "🎵" },
];

export interface DropStudioProps {
  onDropReady?: (cueItem: CueDropItem) => void;
  onFireDirect?: (audioUrl: string, dropName: string) => void;
  onAirLive?: (audioUrl: string, dropName: string, persona?: string, script?: string) => Promise<boolean>;
}

export default function DropStudio({ onDropReady, onFireDirect, onAirLive }: DropStudioProps) {
  const [selectedPreset, setSelectedPreset] = useState<DropPreset>(PRESETS[0]);
  const [selectedVoice, setSelectedVoice] = useState<string>("dj-fusion");
  const [scriptText, setScriptText] = useState(PRESETS[0].defaultText);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSelectPreset = (preset: DropPreset) => {
    setSelectedPreset(preset);
    setScriptText(preset.defaultText);
  };

  const handleInsertEmotion = (tag: string) => {
    if (!textareaRef.current) {
      setScriptText((prev) => prev + " " + tag);
      return;
    }
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = scriptText;
    const newText = text.substring(0, start) + tag + text.substring(end);
    setScriptText(newText);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + tag.length, start + tag.length);
      }
    }, 10);
  };

  const handleGenerate = async (destination: "cue" | "air") => {
    if (!scriptText.trim()) return;

    setGenerating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/admin/radio/drops/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_text: scriptText.trim(),
          voice_id: selectedVoice,
          theme: selectedPreset.vibe,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Drop generation failed.");
      }

      const cueItem: CueDropItem = {
        id: `drop_${Date.now()}`,
        title: `${selectedPreset.label}`,
        script: scriptText.trim(),
        audioUrl: data.drop_url,
        persona: VOICES.find((v) => v.id === selectedVoice)?.label,
      };

      setSuccessMsg("✓ Synthesized with Fish Audio s2.1-pro-free (-14 LUFS)!");

      if (destination === "cue" && onDropReady) {
        onDropReady(cueItem);
      } else if (destination === "air") {
        if (onAirLive) {
          await onAirLive(data.drop_url, cueItem.title, cueItem.persona, scriptText.trim());
        }
        if (onFireDirect) {
          onFireDirect(data.drop_url, cueItem.title);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate AI drop.");
    } finally {
      setGenerating(false);
    }
  };

  // Voice Reference & Cadence detection
  const hasPhoneNum = /\b254\b/.test(scriptText);
  const hasYoo = /\b[Yy]ooo+!?\b/.test(scriptText);
  const isClonedVoice = selectedVoice === "dj-fusion" || selectedVoice === "amina" || selectedVoice === "dj-shax";

  return (
    <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-4 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-[#F5C842] text-[#16181D] font-bold">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase text-white">
              AI DROP STUDIO · FISH AUDIO S2.1-PRO-FREE
            </h3>
            <p className="text-[11px] font-mono text-[#DFBB7D]">
              Zero-credit tier active · Cloned Nairobi voices · Expressive emotion markup
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center space-x-1.5 px-2 py-0.5 bg-[#10B981]/20 border border-[#10B981] text-[#10B981] font-mono text-[10px] font-bold">
          <span>● FREE API TIER</span>
        </div>
      </div>

      {/* Preset Selector Pills */}
      <div>
        <label className="block text-[11px] font-mono text-white/60 uppercase tracking-wider mb-1.5">
          Select Drop Theme Preset:
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelectPreset(p)}
              className={`px-2.5 py-1 font-mono text-xs border transition-colors ${
                selectedPreset.id === p.id
                  ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D] font-bold"
                  : "bg-white/5 text-white/70 border-white/10 hover:border-white/30"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Voice Selection Avatars */}
      <div>
        <label className="block text-[11px] font-mono text-white/60 uppercase tracking-wider mb-1.5">
          Station Voice Persona:
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {VOICES.map((v) => {
            const isSelected = selectedVoice === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setSelectedVoice(v.id)}
                className={`p-2 border text-left transition-all flex flex-col justify-between ${
                  isSelected
                    ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D] font-bold shadow-[2px_2px_0px_#16181D]"
                    : "bg-white/5 text-white border-white/10 hover:border-white/30"
                }`}
              >
                <div className="text-xl mb-1">{v.icon}</div>
                <div>
                  <div className="font-mono text-xs font-bold truncate">{v.label}</div>
                  <div className="text-[10px] font-mono opacity-70 truncate">{v.role}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Emotion Chips */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-mono text-white/60 uppercase tracking-wider">
            Insert Emotion & Cadence Tags:
          </label>
          <div className="flex items-center space-x-2">
            {isClonedVoice && (
              <span className="text-[10px] font-mono text-[#10B981] font-bold">
                ● Cloned Reference Attached
              </span>
            )}
            {(hasPhoneNum || hasYoo) && (
              <span className="text-[10px] font-mono text-[#F5C842]">
                Cadence: {hasPhoneNum ? "254 -> 'two five four' " : ""}
                {hasYoo ? "Yooo! -> 'Yo! Yo!' " : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EMOTION_TAGS.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => handleInsertEmotion(t.tag)}
              className="px-2 py-0.5 bg-white/10 hover:bg-[#F5C842] hover:text-[#16181D] text-white font-mono text-xs border border-white/20 transition-colors"
            >
              + {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Script Input Textarea */}
      <div>
        <textarea
          ref={textareaRef}
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          rows={3}
          className="w-full bg-[#1A1D24] text-white font-mono text-xs p-3 border border-white/20 focus:border-[#DFBB7D] focus:outline-none resize-none leading-relaxed"
          placeholder="Type Sheng / Kenyan radio drop script..."
        />
        <div className="flex justify-between items-center text-[11px] font-mono text-white/40 mt-1">
          <span>Character count: {scriptText.length}</span>
          <span>EBU R128 (-14 LUFS mastering)</span>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-2 bg-[#E84855]/20 border border-[#E84855] text-red-200 font-mono text-xs flex items-center space-x-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-2 bg-[#10B981]/20 border border-[#10B981] text-emerald-200 font-mono text-xs flex items-center space-x-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => handleGenerate("cue")}
          disabled={generating || !scriptText.trim()}
          className="px-4 py-2 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-mono text-xs font-bold border border-[#16181D] flex items-center space-x-1.5 shadow-[2px_2px_0px_#16181D]"
        >
          <Headphones className="w-3.5 h-3.5" />
          <span>{generating ? "SYNTHESIZING..." : "✨ GENERATE TO CUE (PREVIEW)"}</span>
        </button>

        <button
          type="button"
          onClick={() => handleGenerate("air")}
          disabled={generating || !scriptText.trim()}
          className="px-4 py-2 bg-[#E84855] hover:bg-red-600 text-white font-mono text-xs font-bold border border-white/20 flex items-center space-x-1.5 shadow-[2px_2px_0px_#DFBB7D]"
        >
          <Radio className="w-3.5 h-3.5" />
          <span>{generating ? "SYNTHESIZING..." : "🔴 FIRE TO LIVE STREAM (MID-SONG)"}</span>
        </button>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useRef } from "react";
import { Sparkles, Play, Pause, Download, Volume2, CheckCircle2, AlertCircle, RefreshCw, Wand2, Radio, Send } from "lucide-react";
import { useSoundboard } from "@/context/SoundboardContext";
import { useRadio } from "@/context/RadioContext";

interface AiDropGeneratorProps {
  onDropGenerated?: (audioUrl: string, dropName: string) => void;
  onSendToCue?: (cueItem: {
    id: string;
    title: string;
    script: string;
    audioUrl: string;
    persona?: string;
  }) => void;
}

const PRESET_VIBES = [
  { label: "Wazi 254 (Hype)", prompt: "High energy Nairobi Sheng hype drop with festival energy" },
  { label: "Nairobi Sunrise", prompt: "Smooth morning sunrise vibes with chilled Swahili warmth" },
  { label: "Sunset Sessions", prompt: "Melodic sunset park and chill Afro-tech festival announcement" },
  { label: "Quiver Madness", prompt: "Peak club hours street banger amapiano energy in Nairobi" },
  { label: "Up Next Banger", prompt: "Hyping the very next track loading up on the decks" },
];

export default function AiDropGenerator({ onDropGenerated, onSendToCue }: AiDropGeneratorProps) {
  const { openAssignModal, refreshSoundboard } = useSoundboard();
  const { airLiveDrop } = useRadio();
  const [firingLive, setFiringLive] = useState<boolean>(false);
  const [selectedPreset, setSelectedPreset] = useState<string>(PRESET_VIBES[0].label);
  const [promptText, setPromptText] = useState<string>(PRESET_VIBES[0].prompt);
  const [customScript, setCustomScript] = useState<string>("");
  const [generating, setGenerating] = useState<boolean>(false);
  const [synthStage, setSynthStage] = useState<{ step: number; title: string; percent: number }>({
    step: 1,
    title: "Connecting to neural speech engine...",
    percent: 15,
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [generatedDrop, setGeneratedDrop] = useState<{
    script: string;
    audioUrl: string;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSelectPreset = (preset: typeof PRESET_VIBES[0]) => {
    setSelectedPreset(preset.label);
    setPromptText(preset.prompt);
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setGenerating(true);
    setStatusMsg(null);
    setSynthStage({
      step: 1,
      title: "Connecting to Fish Audio neural model & voice weights...",
      percent: 15,
    });
    setElapsedTime(0);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsedMs = Date.now() - startTime;
      setElapsedTime(Math.floor(elapsedMs / 100));

      if (elapsedMs < 2000) {
        setSynthStage({
          step: 1,
          title: "Connecting to Fish Audio neural model & voice weights...",
          percent: Math.min(35, 15 + (elapsedMs / 2000) * 20),
        });
      } else if (elapsedMs < 5000) {
        setSynthStage({
          step: 2,
          title: "Synthesizing vocal inflection & audio waveform...",
          percent: Math.min(72, 35 + ((elapsedMs - 2000) / 3000) * 37),
        });
      } else if (elapsedMs < 7500) {
        setSynthStage({
          step: 3,
          title: "Applying broadcast mastering & EBU R128 (-14 LUFS loudness)...",
          percent: Math.min(90, 72 + ((elapsedMs - 5000) / 2500) * 18),
        });
      } else {
        setSynthStage({
          step: 4,
          title: "Finalizing audio stream & buffering...",
          percent: Math.min(96, 90 + ((elapsedMs - 7500) / 3000) * 6),
        });
      }
    }, 150);

    try {
      const res = await fetch("/api/admin/radio/drops/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText.trim() || undefined,
          theme: selectedPreset,
          custom_text: customScript.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Generation failed HTTP ${res.status}`);
      }

      setSynthStage({
        step: 4,
        title: "Complete! Audio waveform ready.",
        percent: 100,
      });

      const finalUrl = data.drop_url || data.mastered_file;
      setGeneratedDrop({
        script: data.script || promptText,
        audioUrl: finalUrl,
      });

      setStatusMsg({
        text: "✓ AI drop synthesized & mastered to -14 LUFS via NVIDIA NIM + Fish Audio!",
        type: "success",
      });

      // Automatically notify parent soundboard
      void refreshSoundboard();
      if (onDropGenerated && finalUrl) {
        onDropGenerated(finalUrl, `AI: ${selectedPreset}`);
      }
    } catch (err: any) {
      setStatusMsg({
        text: err.message || "Failed to generate AI drop",
        type: "error",
      });
    } finally {
      clearInterval(interval);
      setGenerating(false);
    }
  };

  const togglePlay = () => {
    if (!generatedDrop?.audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(generatedDrop.audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.src = generatedDrop.audioUrl;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const assignToPad = () => {
    if (generatedDrop) {
      openAssignModal(generatedDrop.audioUrl, `AI: ${selectedPreset}`);
      if (onDropGenerated) {
        onDropGenerated(generatedDrop.audioUrl, `AI: ${selectedPreset}`);
      }
    }
  };

  return (
    <div className="p-5 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-indigo-600" />
          <h2 className="font-display text-lg font-black uppercase">
            AI KENYAN DROP GENERATOR
          </h2>
        </div>
        <span className="px-2 py-0.5 border border-brand-navy bg-brand-accent text-brand-navy text-[10px] font-black uppercase shadow-(--shadow-brut-xs)">
          GROQ AI + MASTERED VOICE
        </span>
      </div>

      <p className="text-xs text-brand-navy/70">
        Generate instant broadcast-grade Nairobi Sheng drops. Groq LLM writes the live-grounded script, our Kenyan neural voice engine renders it, and ffmpeg loudnorms the master to -14 LUFS.
      </p>

      {/* Preset Pills */}
      <div>
        <label className="block text-[11px] font-black uppercase tracking-wider text-brand-navy mb-1.5">
          Select Drop Theme:
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_VIBES.map((preset) => {
            const isSelected = selectedPreset === preset.label;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`px-2.5 py-1 text-[11px] font-bold border-2 border-brand-navy transition-all cursor-pointer shadow-(--shadow-brut-xs) ${
                  isSelected
                    ? "bg-brand-navy text-white -translate-y-0.5"
                    : "bg-white text-brand-navy hover:bg-brand-off-white"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inputs Form */}
      <form onSubmit={handleGenerate} className="space-y-3">
        <div>
          <label className="block text-[11px] font-black uppercase tracking-wider text-brand-navy mb-1">
            Vibe Prompt (AI Broadcast Writer):
          </label>
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="e.g. High energy club banger intro in Sheng..."
            className="w-full p-2.5 border-2 border-brand-navy bg-brand-off-white text-xs font-bold focus:outline-none focus:bg-white"
          />
        </div>

        <div>
          <label className="block text-[11px] font-black uppercase tracking-wider text-brand-navy mb-1">
            Or Custom Spoken Text (Optional Override):
          </label>
          <input
            type="text"
            value={customScript}
            onChange={(e) => setCustomScript(e.target.value)}
            placeholder="e.g. Wazi 254! Sisi ndio GOODLIFE Radio, weka volume maximum!"
            className="w-full p-2.5 border-2 border-brand-navy bg-brand-off-white text-xs font-bold focus:outline-none focus:bg-white"
          />
        </div>

        <button
          type="submit"
          disabled={generating}
          className={`w-full py-3 px-4 border-2 border-brand-navy font-black text-xs uppercase flex items-center justify-center gap-2 transition-all cursor-pointer shadow-(--shadow-brut-sm) ${
            generating
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-500 text-white active:translate-y-0.5"
          }`}
        >
          {generating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Synthesizing Voice (~2s)...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate Nairobi Drop (0 Credits)</span>
            </>
          )}
        </button>
      </form>

      {/* Synthesis Progress Bar */}
      {generating && (
        <div className="p-3 border-2 border-indigo-600 bg-white shadow-(--shadow-brut-sm) space-y-2">
          <div className="flex items-center justify-between text-xs font-black uppercase">
            <div className="flex items-center gap-1.5 text-indigo-700">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>[Stage {synthStage.step}/4] {synthStage.title}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500 font-mono">
              <span>{(elapsedTime / 10).toFixed(1)}s</span>
              <span className="font-bold text-indigo-700">{Math.round(synthStage.percent)}%</span>
            </div>
          </div>
          <div className="w-full bg-gray-200 h-2 border border-gray-300 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-200"
              style={{ width: `${synthStage.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Status Message */}
      {statusMsg && (
        <div
          className={`p-3 border-2 text-xs font-bold flex items-center gap-2 ${
            statusMsg.type === "success"
              ? "border-emerald-600 bg-emerald-50 text-emerald-950"
              : "border-red-600 bg-red-50 text-red-950"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Generated Drop Result Card */}
      {generatedDrop && (
        <div className="p-4 border-2 border-brand-navy bg-brand-off-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-brand-navy/70 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Mastered Spoken Drop:</span>
            </span>
            <span className="px-1.5 py-0.5 border border-emerald-600 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">
              Ready to Air
            </span>
          </div>

          <blockquote className="p-2.5 bg-white border-l-4 border-indigo-600 text-xs font-bold text-brand-navy italic">
            &ldquo;{generatedDrop.script}&rdquo;
          </blockquote>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={togglePlay}
              className="flex-1 min-w-[130px] py-2 px-3 border-2 border-brand-navy bg-white hover:bg-brand-accent text-brand-navy font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-(--shadow-brut-xs)"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? "Pause Preview" : "Play Preview"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!generatedDrop?.audioUrl) return;
                if (onSendToCue) {
                  onSendToCue({
                    id: `vault_${Date.now()}`,
                    title: selectedPreset || "AI Vault Drop",
                    script: generatedDrop.script,
                    audioUrl: generatedDrop.audioUrl,
                    persona: "AI Vault",
                  });
                  setStatusMsg({
                    text: "Queued in Studio Cue Dock — ready on Deck A!",
                    type: "success",
                  });
                }
              }}
              className="py-2 px-3 border-2 border-brand-navy bg-[#16181D] hover:bg-brand-navy text-[#DFBB7D] font-black text-xs uppercase flex items-center gap-1.5 transition-colors cursor-pointer shadow-(--shadow-brut-xs)"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send to Cue</span>
            </button>

            <button
              type="button"
              disabled={firingLive}
              onClick={async () => {
                if (!generatedDrop?.audioUrl || firingLive) return;
                setFiringLive(true);
                try {
                  const ok = await airLiveDrop({
                    audioUrl: generatedDrop.audioUrl,
                    title: selectedPreset || "AI Vault Drop",
                    persona: "GOODLIFE AI Drop",
                    script: generatedDrop.script,
                  });
                  setStatusMsg({
                    text: ok
                      ? "🔴 FIRED ON AIR: Streaming live to all listeners!"
                      : "Failed to broadcast drop live.",
                    type: ok ? "success" : "error",
                  });
                } finally {
                  setFiringLive(false);
                }
              }}
              className="py-2 px-3 border-2 border-brand-navy bg-[#E84855] hover:bg-red-500 text-white font-black text-xs uppercase flex items-center gap-1.5 transition-colors cursor-pointer shadow-(--shadow-brut-xs) disabled:opacity-50"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{firingLive ? "Airing..." : "Fire On Air"}</span>
            </button>

            <button
              type="button"
              onClick={assignToPad}
              className="py-2 px-3 border-2 border-brand-navy bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs uppercase transition-colors cursor-pointer shadow-(--shadow-brut-xs)"
            >
              Assign to Pad
            </button>

            <a
              href={generatedDrop.audioUrl}
              download="goodlife_drop.mp3"
              target="_blank"
              rel="noreferrer"
              className="p-2 border-2 border-brand-navy bg-white hover:bg-brand-off-white text-brand-navy transition-colors shadow-(--shadow-brut-xs)"
              title="Download MP3"
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

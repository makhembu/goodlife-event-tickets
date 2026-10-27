"use client";

import React, { useState, useRef } from "react";
import { Sparkles, Play, Pause, Download, Volume2, CheckCircle2, AlertCircle, RefreshCw, Wand2 } from "lucide-react";

interface AiDropGeneratorProps {
  onDropGenerated?: (audioUrl: string, dropName: string) => void;
}

const PRESET_VIBES = [
  { label: "Wazi 254 (Hype)", prompt: "High energy Nairobi Sheng hype drop with festival energy" },
  { label: "Nairobi Sunrise", prompt: "Smooth morning sunrise vibes with chilled Swahili warmth" },
  { label: "Sunset Sessions", prompt: "Melodic sunset park and chill Afro-tech festival announcement" },
  { label: "Quiver Madness", prompt: "Peak club hours street banger amapiano energy in Nairobi" },
  { label: "Up Next Banger", prompt: "Hyping the very next track loading up on the decks" },
];

export default function AiDropGenerator({ onDropGenerated }: AiDropGeneratorProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>(PRESET_VIBES[0].label);
  const [promptText, setPromptText] = useState<string>(PRESET_VIBES[0].prompt);
  const [customScript, setCustomScript] = useState<string>("");
  const [generating, setGenerating] = useState<boolean>(false);
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
      if (onDropGenerated && finalUrl) {
        onDropGenerated(finalUrl, `AI: ${selectedPreset}`);
      }
    } catch (err: any) {
      setStatusMsg({
        text: err.message || "Failed to generate AI drop",
        type: "error",
      });
    } finally {
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
    if (generatedDrop && onDropGenerated) {
      onDropGenerated(generatedDrop.audioUrl, `AI: ${selectedPreset}`);
      setStatusMsg({
        text: "✓ Drop bound directly to Soundboard Pad #8!",
        type: "success",
      });
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
          NVIDIA NIM + FISH AUDIO
        </span>
      </div>

      <p className="text-xs text-brand-navy/70">
        Generate instant broadcast-grade Nairobi Sheng drops. NVIDIA NIM writes the street script, Fish Audio synthesizes the authentic Kenyan DJ voice, and ffmpeg loudnorms the master to -14 LUFS.
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
            Vibe Prompt (NVIDIA NIM Llama 3.2):
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

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={togglePlay}
              className="flex-1 py-2 px-3 border-2 border-brand-navy bg-white hover:bg-brand-accent text-brand-navy font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-(--shadow-brut-xs)"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? "Pause Preview" : "Play Preview"}</span>
            </button>

            <button
              onClick={assignToPad}
              className="py-2 px-3 border-2 border-brand-navy bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs uppercase transition-colors cursor-pointer shadow-(--shadow-brut-xs)"
            >
              Assign Pad #8
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

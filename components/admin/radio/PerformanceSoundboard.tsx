"use client";

import React, { useState, useRef, useEffect } from "react";
import { Volume2, VolumeX, Mic, Play, Sparkles, Sliders, Radio, Activity, Square, X, Headphones } from "lucide-react";

export interface SoundPad {
  id: number;
  name: string;
  emoji: string;
  soundType: "synth" | "audio";
  audioUrl?: string;
  category: "FX" | "VOICE" | "STATION" | "CUSTOM";
}

export interface PerformanceSoundboardProps {
  customDropUrl?: string | null;
  customDropName?: string;
  onFireOnAir?: (padName: string, audioUrl?: string) => void;
  onSendToCue?: (pad: SoundPad) => void;
  onChoke?: () => void;
}

export default function PerformanceSoundboard({
  customDropUrl,
  customDropName = "Custom Mic Drop",
  onFireOnAir,
  onSendToCue,
  onChoke,
}: PerformanceSoundboardProps) {
  const [activePad, setActivePad] = useState<number | null>(null);
  const [playingPads, setPlayingPads] = useState<Map<number, HTMLAudioElement>>(new Map());
  const [padCountdowns, setPadCountdowns] = useState<Map<number, number>>(new Map());
  const [volume, setVolume] = useState<number>(0.85);
  const [muted, setMuted] = useState<boolean>(false);
  const [broadcastMode, setBroadcastMode] = useState<"local" | "on_air">("on_air");
  const [activeBank, setActiveBank] = useState<"djs" | "fx">("djs");

  const djPads: SoundPad[] = [
    {
      id: 1,
      name: "DJ Fusion",
      emoji: "🔥",
      soundType: "audio",
      audioUrl: "/drops/samples/dj-fusion_context_drop.mp3",
      category: "VOICE",
    },
    {
      id: 2,
      name: "DJ Sudi",
      emoji: "💿",
      soundType: "audio",
      audioUrl: "/drops/samples/dj-sudi_context_drop.mp3",
      category: "VOICE",
    },
    {
      id: 3,
      name: "DJ Sney",
      emoji: "⚡",
      soundType: "audio",
      audioUrl: "/drops/samples/dj-sney_context_drop.mp3",
      category: "VOICE",
    },
    {
      id: 4,
      name: "MC Cheche",
      emoji: "🎙️",
      soundType: "audio",
      audioUrl: "/drops/samples/mc-cheche_context_drop.mp3",
      category: "VOICE",
    },
    {
      id: 5,
      name: "DJ Shax",
      emoji: "🔊",
      soundType: "audio",
      audioUrl: "/drops/samples/dj-shax_context_drop.mp3",
      category: "VOICE",
    },
    {
      id: 6,
      name: "Amina",
      emoji: "🌅",
      soundType: "audio",
      audioUrl: "/drops/samples/amina_context_drop.mp3",
      category: "VOICE",
    },
    {
      id: 7,
      name: "Bwana Mkubwa",
      emoji: "📻",
      soundType: "audio",
      audioUrl: "/drops/samples/bwana-mkubwa_context_drop.mp3",
      category: "VOICE",
    },
    {
      id: 8,
      name: "Malkia Kenya",
      emoji: "✨",
      soundType: "audio",
      audioUrl: "/drops/samples/malkia-kenya_context_drop.mp3",
      category: "VOICE",
    },
    {
      id: 9,
      name: "Wigman",
      emoji: "🎧",
      soundType: "audio",
      audioUrl: "/drops/samples/wigman_context_drop.mp3",
      category: "VOICE",
    },
    {
      id: 10,
      name: "Zari",
      emoji: "🌊",
      soundType: "audio",
      audioUrl: "/drops/samples/zari_context_drop.mp3",
      category: "VOICE",
    },
    {
      id: 11,
      name: "Gemini Aoede",
      emoji: "🌟",
      soundType: "audio",
      audioUrl: "/drops/sample_aoede.mp3",
      category: "VOICE",
    },
    {
      id: 12,
      name: "Gemini Puck",
      emoji: "🚀",
      soundType: "audio",
      audioUrl: "/drops/sample_puck.mp3",
      category: "VOICE",
    },
    {
      id: 13,
      name: "Gemini Charon",
      emoji: "🌌",
      soundType: "audio",
      audioUrl: "/drops/sample_charon.mp3",
      category: "VOICE",
    },
    {
      id: 14,
      name: "Gemini Fenrir",
      emoji: "⚡",
      soundType: "audio",
      audioUrl: "/drops/sample_fenrir.mp3",
      category: "VOICE",
    },
    {
      id: 15,
      name: "Gemini Kore",
      emoji: "🌸",
      soundType: "audio",
      audioUrl: "/drops/sample_kore.mp3",
      category: "VOICE",
    },
  ];

  const fxPads: SoundPad[] = [
    {
      id: 1,
      name: "DJ Fusion (Marara)",
      emoji: "🔥",
      soundType: "audio",
      audioUrl: "/drops/samples/dj_fusion_marara_drop.mp3",
      category: "VOICE",
    },
    {
      id: 2,
      name: "DJ Fusion (English)",
      emoji: "🎙️",
      soundType: "audio",
      audioUrl: "/drops/samples/dj_fusion_english_drop.mp3",
      category: "VOICE",
    },
    {
      id: 3,
      name: "Nairobi Sunrise",
      emoji: "☀️",
      soundType: "audio",
      audioUrl: "/drops/samples/kenyan_vibes_5.mp3",
      category: "STATION",
    },
    {
      id: 4,
      name: "Festival Heat",
      emoji: "✨",
      soundType: "audio",
      audioUrl: "/drops/samples/kenyan_vibes_2.mp3",
      category: "STATION",
    },
    {
      id: 5,
      name: "Wazi 254 Hype",
      emoji: "🇰🇪",
      soundType: "audio",
      audioUrl: "/drops/wazi-254.mp3",
      category: "STATION",
    },
    {
      id: 6,
      name: customDropUrl ? customDropName : "DIY Recorded Drop",
      emoji: "🎤",
      soundType: "audio",
      audioUrl: customDropUrl || "/drops/samples/kenyan_vibes_6.mp3",
      category: "CUSTOM",
    },
  ];

  const pads = activeBank === "djs" ? djPads : fxPads;

  const stopAllPads = () => {
    playingPads.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    setPlayingPads(new Map());
    setPadCountdowns(new Map());
    setActivePad(null);
    if (onChoke) onChoke();
  };

  const triggerPad = (pad: SoundPad) => {
    // If already playing, choke it
    if (playingPads.has(pad.id)) {
      const existing = playingPads.get(pad.id);
      existing?.pause();
      setPlayingPads((prev) => {
        const next = new Map(prev);
        next.delete(pad.id);
        return next;
      });
      setPadCountdowns((prev) => {
        const next = new Map(prev);
        next.delete(pad.id);
        return next;
      });
      return;
    }

    setActivePad(pad.id);

    if (broadcastMode === "on_air" && onFireOnAir) {
      onFireOnAir(pad.name, pad.audioUrl);
    }

    if (pad.audioUrl) {
      try {
        const audio = new Audio(pad.audioUrl);
        audio.volume = muted ? 0 : volume;

        audio.onloadedmetadata = () => {
          const dur = audio.duration || 4;
          setPadCountdowns((prev) => new Map(prev).set(pad.id, dur));
        };

        audio.ontimeupdate = () => {
          const rem = Math.max(0, (audio.duration || 0) - audio.currentTime);
          setPadCountdowns((prev) => new Map(prev).set(pad.id, rem));
        };

        audio.onended = () => {
          setPlayingPads((prev) => {
            const next = new Map(prev);
            next.delete(pad.id);
            return next;
          });
          setPadCountdowns((prev) => {
            const next = new Map(prev);
            next.delete(pad.id);
            return next;
          });
          setActivePad(null);
        };

        audio.play().then(() => {
          setPlayingPads((prev) => new Map(prev).set(pad.id, audio));
        }).catch((err) => {
          console.warn("Audio playback fallback:", err);
        });
      } catch (err) {
        console.warn("Audio playback error:", err);
      }
    }
  };

  // Keyboard shortcut listener (1-9, 0 for pad 10)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        const pad = pads[idx];
        if (pad) triggerPad(pad);
      } else if (e.key === "0") {
        const pad = pads[9];
        if (pad) triggerPad(pad);
      } else if (e.key === "Escape" || e.key === " ") {
        stopAllPads();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pads, volume, muted, broadcastMode, playingPads]);

  return (
    <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-4 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
      {/* Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-[#DFBB7D] text-[#16181D] font-bold">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase text-white">
              CARTWALL SOUNDBOARD · {activeBank === "djs" ? "15 DJ VOICES ROSTER" : "STATION FX & LIVE MIC"}
            </h3>
            <p className="text-[11px] font-mono text-[#DFBB7D]">
              Keys 1-0 · Mid-song ducking (-12dB) · Esc/Space to Choke
            </p>
          </div>
        </div>

        {/* Bank Switcher & Global Choke */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-white/20 p-0.5 bg-black/40">
            <button
              onClick={() => setActiveBank("djs")}
              className={`px-2.5 py-1 font-mono text-xs font-bold transition-all ${
                activeBank === "djs"
                  ? "bg-[#DFBB7D] text-[#16181D]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              15 DJ DROPS
            </button>
            <button
              onClick={() => setActiveBank("fx")}
              className={`px-2.5 py-1 font-mono text-xs font-bold transition-all ${
                activeBank === "fx"
                  ? "bg-[#DFBB7D] text-[#16181D]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              STATION FX
            </button>
          </div>

          <button
            onClick={stopAllPads}
            title="Choke / Silence All Soundboard Drops Immediately (Esc)"
            className="px-3 py-1 bg-[#E84855] hover:bg-red-600 text-white font-mono text-xs font-bold border border-white/20 flex items-center space-x-1 shadow-[2px_2px_0px_#DFBB7D]"
          >
            <X className="w-3.5 h-3.5" />
            <span>CHOKE ALL</span>
          </button>
        </div>
      </div>

      {/* Cartwall Pads Grid */}
      <div className={`grid gap-2.5 ${activeBank === "djs" ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-3"}`}>
        {pads.map((pad, idx) => {
          const isPlaying = playingPads.has(pad.id);
          const rem = padCountdowns.get(pad.id);
          const isCustom = pad.category === "CUSTOM";
          const isVoice = pad.category === "VOICE";
          const isStation = pad.category === "STATION";

          return (
            <div
              key={pad.id}
              className="relative group"
            >
              <button
                onClick={() => triggerPad(pad)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (onSendToCue) onSendToCue(pad);
                }}
                title={`Pad ${pad.id}: ${pad.name} (Right-click to send to Cue)`}
                className={`w-full h-24 p-2.5 text-left border-2 transition-all flex flex-col justify-between relative overflow-hidden select-none ${
                  isPlaying
                    ? "bg-[#DFBB7D] text-[#16181D] border-[#F5C842] shadow-[0_0_15px_#F5C842]"
                    : isCustom
                    ? "bg-white/5 border-dashed border-[#10B981] hover:border-[#10B981] hover:bg-[#10B981]/10 text-white"
                    : isStation
                    ? "bg-white/5 border-[#F5C842]/40 hover:border-[#F5C842] hover:bg-[#F5C842]/10 text-white"
                    : "bg-white/5 border-[#DFBB7D]/40 hover:border-[#DFBB7D] hover:bg-[#DFBB7D]/10 text-white"
                }`}
              >
                {/* Top Row: Key Number & Emoji */}
                <div className="flex items-center justify-between w-full">
                  <span className={`font-mono text-xs font-bold px-1.5 py-0.5 border ${
                    isPlaying
                      ? "bg-[#16181D] text-[#DFBB7D] border-[#16181D]"
                      : "bg-black/40 text-white/70 border-white/10"
                  }`}>
                    #{pad.id}
                  </span>
                  <span className="text-lg">{pad.emoji}</span>
                </div>

                {/* Bottom Row: Name & State */}
                <div>
                  <div className="font-mono text-xs font-bold truncate leading-tight">
                    {pad.name}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono mt-0.5 opacity-80">
                    <span className="uppercase tracking-wider text-[9px]">
                      {pad.category}
                    </span>
                    {isPlaying && rem !== undefined && (
                      <span className="font-bold text-[#E84855] animate-pulse">
                        {rem.toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>

                {/* Active Playing Indicator Strip */}
                {isPlaying && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#E84855] animate-pulse" />
                )}
              </button>

              {/* Hover Cue Button */}
              {onSendToCue && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendToCue(pad);
                  }}
                  title="Audition in Cue Dock (PFL)"
                  className="absolute top-1 right-1 p-1 bg-black/60 text-[#DFBB7D] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 text-[9px] font-mono"
                >
                  <Headphones className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

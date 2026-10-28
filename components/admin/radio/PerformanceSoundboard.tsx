"use client";

import React, { useState, useRef, useEffect } from "react";
import { Volume2, VolumeX, Mic, Play, Sparkles, Sliders, Radio, Activity } from "lucide-react";

interface SoundPad {
  id: number;
  name: string;
  emoji: string;
  soundType: "synth" | "audio";
  synthParams?: { freq: number; type: OscillatorType; duration: number };
  audioUrl?: string;
  category: "FX" | "VOICE" | "STATION" | "CUSTOM";
}

interface PerformanceSoundboardProps {
  customDropUrl?: string | null;
  customDropName?: string;
  onFireOnAir?: (padName: string, audioUrl?: string) => void;
}

export default function PerformanceSoundboard({
  customDropUrl,
  customDropName = "Custom Mic Drop",
  onFireOnAir,
}: PerformanceSoundboardProps) {
  const [activePad, setActivePad] = useState<number | null>(null);
  const [playingPads, setPlayingPads] = useState<Set<number>>(new Set());
  const [volume, setVolume] = useState<number>(0.85);
  const [muted, setMuted] = useState<boolean>(false);
  const [broadcastMode, setBroadcastMode] = useState<"local" | "on_air">("on_air");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  const pads: SoundPad[] = [
    {
      id: 1,
      name: "Air Horn",
      emoji: "🎺",
      soundType: "synth",
      synthParams: { freq: 440, type: "sawtooth", duration: 0.8 },
      category: "FX",
    },
    {
      id: 2,
      name: "Laser Sweep",
      emoji: "⚡",
      soundType: "synth",
      synthParams: { freq: 1200, type: "sine", duration: 0.6 },
      category: "FX",
    },
    {
      id: 3,
      name: "Siren Alert",
      emoji: "🚨",
      soundType: "synth",
      synthParams: { freq: 880, type: "triangle", duration: 1.2 },
      category: "FX",
    },
    {
      id: 4,
      name: "Rewind Spin",
      emoji: "🔄",
      soundType: "synth",
      synthParams: { freq: 600, type: "sawtooth", duration: 0.7 },
      category: "FX",
    },
    {
      id: 5,
      name: "Sub Bass Drop",
      emoji: "💥",
      soundType: "synth",
      synthParams: { freq: 80, type: "sine", duration: 1.0 },
      category: "FX",
    },
    {
      id: 6,
      name: "Afro Beat Fill",
      emoji: "🥁",
      soundType: "synth",
      synthParams: { freq: 220, type: "triangle", duration: 0.5 },
      category: "FX",
    },
    {
      id: 7,
      name: "Wazi 254 Hype",
      emoji: "🎙️",
      soundType: "audio",
      audioUrl: "/drops/wazi-254.mp3",
      category: "VOICE",
    },
    {
      id: 8,
      name: customDropUrl ? customDropName : "Live Mic Drop",
      emoji: "🎤",
      soundType: customDropUrl ? "audio" : "synth",
      audioUrl: customDropUrl || undefined,
      synthParams: customDropUrl ? undefined : { freq: 520, type: "sine", duration: 0.4 },
      category: "CUSTOM",
    },
  ];

  const getAudioContext = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playSynthesizedFx = (pad: SoundPad) => {
    if (!pad.synthParams) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const { freq, type, duration } = pad.synthParams;

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      if (pad.id === 1) {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(554, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.35);
      } else if (pad.id === 2) {
        osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + duration);
      } else if (pad.id === 3) {
        osc.frequency.linearRampToValueAtTime(1320, ctx.currentTime + duration * 0.5);
        osc.frequency.linearRampToValueAtTime(660, ctx.currentTime + duration);
      } else if (pad.id === 4) {
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + duration);
      } else if (pad.id === 5) {
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + duration);
      }

      const effectiveVolume = muted ? 0 : volume;
      gain.gain.setValueAtTime(effectiveVolume * 0.45, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  };

  const triggerPad = (pad: SoundPad) => {
    setActivePad(pad.id);
    setPlayingPads((prev) => new Set(prev).add(pad.id));

    setTimeout(() => setActivePad(null), 250);
    setTimeout(() => {
      setPlayingPads((prev) => {
        const next = new Set(prev);
        next.delete(pad.id);
        return next;
      });
    }, 1200);

    if (broadcastMode === "on_air" && onFireOnAir) {
      onFireOnAir(pad.name, pad.audioUrl);
    }

    if (pad.soundType === "audio" && pad.audioUrl) {
      if (!customAudioRef.current) {
        customAudioRef.current = new Audio();
      }
      customAudioRef.current.src = pad.audioUrl;
      customAudioRef.current.volume = muted ? 0 : volume;
      customAudioRef.current.currentTime = 0;
      customAudioRef.current.play().catch(() => {});
    } else {
      playSynthesizedFx(pad);
    }
  };

  // Keyboard shortcut listener (1-8)
  const padStateRef = useRef({ pads, triggerPad });
  useEffect(() => {
    padStateRef.current = { pads, triggerPad };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 8) {
        const { pads: currentPads, triggerPad: currentTrigger } = padStateRef.current;
        const targetPad = currentPads.find((p) => p.id === num);
        if (targetPad) currentTrigger(targetPad);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 shadow-xl space-y-4">
      {/* Soundboard Header: Mode Selection & Master Fader */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <h3 className="font-mono text-xs font-black tracking-widest uppercase text-white">
            DJ PERFORMANCE CARTWALL (8 PADS)
          </h3>
        </div>

        {/* Output Mode Switcher & Volume */}
        <div className="flex items-center gap-3">
          {/* Output Mode: Headphones vs On-Air Ducking */}
          <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-zinc-800 text-[11px] font-mono font-bold">
            <button
              type="button"
              onClick={() => setBroadcastMode("local")}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                broadcastMode === "local"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              CUE HEADPHONES
            </button>
            <button
              type="button"
              onClick={() => setBroadcastMode("on_air")}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                broadcastMode === "on_air"
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/30 animate-pulse"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              <span>ON-AIR (DUCK -6dB)</span>
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-zinc-400" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* 8-Pad Hardware Performance Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {pads.map((pad) => {
          const isTriggered = activePad === pad.id;
          const isPlaying = playingPads.has(pad.id);

          return (
            <button
              key={pad.id}
              type="button"
              onClick={() => triggerPad(pad)}
              className={`relative h-24 rounded-xl border p-3 flex flex-col justify-between text-left transition-all duration-100 select-none cursor-pointer active:scale-95 group overflow-hidden ${
                isTriggered
                  ? "bg-emerald-500/20 border-emerald-400 ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/20 translate-y-0.5"
                  : isPlaying
                  ? "bg-zinc-800/80 border-emerald-500/40 shadow-inner"
                  : "bg-zinc-900/90 hover:bg-zinc-800/80 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              {/* Top row: Key code & Category */}
              <div className="flex items-center justify-between w-full font-mono text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 font-bold text-zinc-400 group-hover:text-white">
                  KEY {pad.id}
                </span>
                <span className={`text-[9px] uppercase font-bold tracking-wider ${
                  pad.category === "VOICE" ? "text-cyan-400" : pad.category === "CUSTOM" ? "text-purple-400" : "text-zinc-500"
                }`}>
                  {pad.category}
                </span>
              </div>

              {/* Center row: Name & Emoji */}
              <div className="flex items-center gap-2">
                <span className="text-xl">{pad.emoji}</span>
                <span className="font-mono text-xs font-black text-white uppercase tracking-tight truncate">
                  {pad.name}
                </span>
              </div>

              {/* Bottom row: Status wave / light */}
              <div className="w-full flex items-center justify-between">
                <div className="flex gap-0.5 items-center">
                  <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? "bg-emerald-400 animate-ping" : "bg-zinc-700"}`} />
                  <span className="font-mono text-[9px] text-zinc-500 uppercase">
                    {isPlaying ? "FIRING" : "READY"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

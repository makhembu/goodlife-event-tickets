"use client";

import React, { useState, useRef, useEffect } from "react";
import { Volume2, VolumeX, Mic, Play, Sparkles } from "lucide-react";

interface SoundPad {
  id: number;
  name: string;
  emoji: string;
  soundType: "synth" | "audio";
  synthParams?: { freq: number; type: OscillatorType; duration: number };
  audioUrl?: string;
  color: string;
}

interface CartwallSoundboardProps {
  customDropUrl?: string | null;
  customDropName?: string;
  onFireOnAir?: (padName: string, audioUrl?: string) => void;
}

export default function CartwallSoundboard({
  customDropUrl,
  customDropName = "Custom Mic Drop",
  onFireOnAir,
}: CartwallSoundboardProps) {
  const [activePad, setActivePad] = useState<number | null>(null);
  const [volume, setVolume] = useState<number>(0.85);
  const [muted, setMuted] = useState<boolean>(false);
  const [broadcastMode, setBroadcastMode] = useState<"local" | "on_air">("on_air");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);
  const sampleBufferRef = useRef<Map<number, AudioBuffer>>(new Map());

  // Cleanup AudioContext on unmount
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
      color: "bg-amber-400 hover:bg-amber-300 border-amber-600 text-amber-950",
    },
    {
      id: 2,
      name: "Laser Sweep",
      emoji: "⚡",
      soundType: "synth",
      synthParams: { freq: 880, type: "sine", duration: 0.6 },
      color: "bg-cyan-400 hover:bg-cyan-300 border-cyan-600 text-cyan-950",
    },
    {
      id: 3,
      name: "Wazi 254!",
      emoji: "🇰🇪",
      soundType: "synth",
      synthParams: { freq: 520, type: "triangle", duration: 0.7 },
      color: "bg-emerald-400 hover:bg-emerald-300 border-emerald-600 text-emerald-950",
    },
    {
      id: 4,
      name: "Siren",
      emoji: "🚨",
      soundType: "synth",
      synthParams: { freq: 650, type: "sawtooth", duration: 1.2 },
      color: "bg-red-400 hover:bg-red-300 border-red-600 text-red-950",
    },
    {
      id: 5,
      name: "Rewind",
      emoji: "🔄",
      soundType: "synth",
      synthParams: { freq: 320, type: "sawtooth", duration: 0.9 },
      color: "bg-violet-400 hover:bg-violet-300 border-violet-600 text-violet-950",
    },
    {
      id: 6,
      name: "Bass Drop",
      emoji: "💥",
      soundType: "synth",
      synthParams: { freq: 85, type: "sine", duration: 1.5 },
      color: "bg-orange-400 hover:bg-orange-300 border-orange-600 text-orange-950",
    },
    {
      id: 7,
      name: "Afro Fill",
      emoji: "🥁",
      soundType: "synth",
      synthParams: { freq: 240, type: "triangle", duration: 0.75 },
      color: "bg-fuchsia-400 hover:bg-fuchsia-300 border-fuchsia-600 text-fuchsia-950",
    },
    {
      id: 8,
      name: customDropUrl ? customDropName : "Mic Drop (Empty)",
      emoji: "🎙️",
      soundType: customDropUrl ? "audio" : "synth",
      audioUrl: customDropUrl || undefined,
      synthParams: { freq: 300, type: "sine", duration: 0.5 },
      color: customDropUrl
        ? "bg-rose-500 hover:bg-rose-400 border-rose-700 text-white animate-pulse"
        : "bg-slate-200 border-slate-300 text-slate-500",
    },
  ];

  // Preload sound samples for broadcast-quality FX
  const samplePaths: Record<number, string> = {
    1: "/sfx/air-horn.mp3",
    2: "/sfx/laser.mp3",
    3: "/sfx/wazi-254.mp3",
    4: "/sfx/siren.mp3",
    5: "/sfx/rewind.mp3",
    6: "/sfx/bass-drop.mp3",
    7: "/sfx/afro-fill.mp3",
  };

  // Preload sound samples into memory
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const ctx = getAudioContext();
      Object.entries(samplePaths).forEach(([idStr, path]) => {
        const id = parseInt(idStr, 10);
        if (sampleBufferRef.current.has(id)) return;
        fetch(path)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then((buf) => {
            if (buf) return ctx.decodeAudioData(buf);
            return null;
          })
          .then((decoded) => {
            if (decoded) sampleBufferRef.current.set(id, decoded);
          })
          .catch(() => {}); // Gracefully falls back to synth oscillator
      });
    } catch {}
  }, []);

  // Initialize or get Web Audio Context
  const getAudioContext = (): AudioContext => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playSynthesizedFx = (pad: SoundPad) => {
    if (muted) return;
    try {
      const ctx = getAudioContext();
      const gain = ctx.createGain();
      const effectiveVolume = muted ? 0 : volume;

      // Try playing high-fidelity decoded sample first
      const buffer = sampleBufferRef.current.get(pad.id);
      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        gain.gain.setValueAtTime(effectiveVolume, ctx.currentTime);
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        return;
      }

      // Fallback: Web Audio oscillator synthesis
      const osc = ctx.createOscillator();
      const params = pad.synthParams || { freq: 440, type: "sine", duration: 0.5 };
      osc.type = params.type;
      osc.frequency.setValueAtTime(params.freq, ctx.currentTime);

      // Pitch slides for fx
      if (pad.id === 1) {
        osc.frequency.exponentialRampToValueAtTime(params.freq * 1.5, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(params.freq * 1.2, ctx.currentTime + 0.2);
      } else if (pad.id === 2) {
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + params.duration);
      } else if (pad.id === 5) {
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + params.duration);
      } else if (pad.id === 6) {
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + params.duration);
      }

      gain.gain.setValueAtTime(effectiveVolume * 0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + params.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + params.duration);
    } catch (e) {
      console.warn("AudioContext playback error:", e);
    }
  };

  const triggerPad = (pad: SoundPad) => {
    setActivePad(pad.id);
    setTimeout(() => setActivePad(null), 300);

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

  // Mutable ref to avoid stale closures in stable key listener
  const padStateRef = useRef({ pads, triggerPad });
  useEffect(() => {
    padStateRef.current = { pads, triggerPad };
  });

  // Stable keyboard listener (keys 1 to 8)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
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
    <div className="p-5 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-brand-navy pb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
          <h2 className="font-display text-lg font-black uppercase tracking-wider">
            8-PAD DJ CARTWALL SOUNDBOARD
          </h2>
        </div>

        {/* Volume & Mode controls */}
        <div className="flex items-center gap-3">
          {/* Target Mode Toggle */}
          <div className="flex items-center border-2 border-brand-navy p-0.5 bg-brand-off-white text-[10px] font-black uppercase">
            <button
              type="button"
              onClick={() => setBroadcastMode("local")}
              className={`px-2 py-1 transition-colors ${
                broadcastMode === "local" ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-navy/10"
              }`}
            >
              Headphones
            </button>
            <button
              type="button"
              onClick={() => setBroadcastMode("on_air")}
              className={`px-2 py-1 flex items-center gap-1 transition-colors ${
                broadcastMode === "on_air" ? "bg-red-600 text-white animate-pulse" : "text-brand-navy hover:bg-red-500/20"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              On-Air (Duck -6dB)
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMuted(!muted)}
            className="p-1.5 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent transition-colors cursor-pointer"
            title={muted ? "Unmute Soundboard" : "Mute Soundboard"}
          >
            {muted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 text-brand-navy" />}
          </button>

          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="text-[10px] text-brand-navy/60">VOL</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 accent-brand-navy cursor-pointer"
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-brand-navy/70">
        Trigger instant sound effects, horns, and drops during live shows. Tap on mobile/iPad or press keys <span className="font-black bg-brand-navy text-white px-1 py-0.5 rounded text-[10px]">1-8</span>.
      </p>

      {/* The 8 Pads */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        {pads.map((pad) => {
          const isFired = activePad === pad.id;
          return (
            <button
              key={pad.id}
              type="button"
              onClick={() => triggerPad(pad)}
              className={`relative p-4 h-24 border-3 border-brand-navy font-black rounded-lg flex flex-col items-center justify-center gap-1 transition-all select-none cursor-pointer active:scale-95 shadow-(--shadow-brut-sm) ${
                pad.color
              } ${isFired ? "-translate-y-1 scale-102 ring-4 ring-brand-navy" : "hover:-translate-y-0.5"}`}
            >
              <span className="absolute top-1.5 left-2 text-[10px] opacity-70 font-mono">
                #{pad.id}
              </span>
              <span className="text-2xl">{pad.emoji}</span>
              <span className="text-xs uppercase tracking-tight text-center leading-tight truncate max-w-full">
                {pad.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

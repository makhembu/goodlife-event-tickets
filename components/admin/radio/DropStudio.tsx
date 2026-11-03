"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Headphones,
  Radio,
  Plus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Volume2,
  Play,
  Pause,
  ArrowRight,
  Send,
  Wand2,
} from "lucide-react";
import { CueDropItem } from "./CueDock";
import { useSoundboard } from "@/context/SoundboardContext";

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
  const { openAssignModal } = useSoundboard();
  const [selectedPreset, setSelectedPreset] = useState<DropPreset>(PRESETS[0]);
  const [selectedVoice, setSelectedVoice] = useState<string>("dj-fusion");
  const [scriptText, setScriptText] = useState(PRESETS[0].defaultText);
  const [generating, setGenerating] = useState(false);
  const [activeDrop, setActiveDrop] = useState<{
    id: string;
    title: string;
    script: string;
    audioUrl: string;
    persona?: string;
  } | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [airingStatus, setAiringStatus] = useState<string | null>(null);
  const [synthStage, setSynthStage] = useState<{ step: number; title: string; percent: number }>({
    step: 1,
    title: "Connecting to Fish Audio neural model...",
    percent: 15,
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const promptInputRef = useRef<HTMLInputElement | null>(null);
  const lastFocusedRef = useRef<"prompt" | "script">("prompt");

  const [aiPrompt, setAiPrompt] = useState("");
  const [writingScript, setWritingScript] = useState(false);
  const [broadcastContext, setBroadcastContext] = useState<any>(null);
  const [contextTags, setContextTags] = useState<Array<{ id: string; label: string; value: string }>>([
    { id: "tickets", label: "🎟️ Tickets: goodlife.smwhr.space", value: "tickets on goodlife.smwhr.space" },
    { id: "date", label: "📅 Date: Every Sunday", value: "Every Sunday" },
    { id: "venue", label: "📍 Venue: Marara Camp, Thika", value: "Marara Camp, Thika" },
    { id: "price", label: "💰 Price: 200 bob", value: "200 bob" },
    { id: "station", label: "📻 Station: GOODLIFE Radio 254", value: "GOODLIFE Radio 254" },
  ]);

  // Prepopulate live broadcast tags from server
  useEffect(() => {
    fetch("/api/admin/radio/drops/write-script")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.context) {
          setBroadcastContext(d.context);
          if (d.tags && d.tags.length > 0) {
            setContextTags(d.tags);
          }
        }
      })
      .catch((err) => console.warn("Could not fetch broadcast context tags:", err));
  }, []);

  const handleInsertTag = (tagValue: string) => {
    if (lastFocusedRef.current === "script" && textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const text = scriptText;
      const newText = text.substring(0, start) + " " + tagValue + " " + text.substring(end);
      setScriptText(newText.replace(/\s{2,}/g, " "));
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(start + tagValue.length + 2, start + tagValue.length + 2);
        }
      }, 10);
    } else {
      setAiPrompt((prev) => (prev ? `${prev}, ${tagValue}` : tagValue));
      if (promptInputRef.current) {
        promptInputRef.current.focus();
      }
    }
  };

  const handleWriteScriptWithAi = async (overridePrompt?: string) => {
    const promptToUse = (overridePrompt ?? aiPrompt).trim();
    setWritingScript(true);
    setError(null);
    setSuccessMsg(null);

    const activePersona = VOICES.find((v) => v.id === selectedVoice)?.label || "DJ Fusion";

    try {
      const res = await fetch("/api/admin/radio/drops/write-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToUse || `Hype Sunday Park & Chill tickets for 200 bob at Marara Camp with ${activePersona}`,
          voice_id: selectedVoice,
          voice_persona: activePersona,
          context: broadcastContext,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate script.");
      }

      const returnedScript = data.script?.trim();
      const stripped = returnedScript ? returnedScript.replace(/\[[a-zA-Z\s]+\]/g, "").trim() : "";

      if (returnedScript && stripped.length >= 15) {
        setScriptText(returnedScript);
        setSuccessMsg(`✨ AI script written for ${data.persona || activePersona}! Ready to audition or fire.`);
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      } else {
        throw new Error("AI returned an incomplete script. Please click 'AI WRITE SCRIPT' again.");
      }
    } catch (err: any) {
      setError(err?.message || "AI script generation failed.");
    } finally {
      setWritingScript(false);
    }
  };

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
    setSynthStage({
      step: 1,
      title: "Connecting to Fish Audio neural model & loading voice weights...",
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
          title: "Connecting to Fish Audio neural model & loading voice weights...",
          percent: Math.min(35, 15 + (elapsedMs / 2000) * 20),
        });
      } else if (elapsedMs < 5000) {
        setSynthStage({
          step: 2,
          title: `Synthesizing ${VOICES.find((v) => v.id === selectedVoice)?.label || "DJ"} voice audio waveform...`,
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
          title: destination === "air" ? "Buffering into live broadcast stream..." : "Buffering into Headphone Cue...",
          percent: Math.min(96, 90 + ((elapsedMs - 7500) / 3000) * 6),
        });
      }
    }, 150);

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

      setSynthStage({
        step: 4,
        title: "Complete! Audio waveform ready.",
        percent: 100,
      });

      const cueItem: CueDropItem = {
        id: `drop_${Date.now()}`,
        title: `${selectedPreset.label}`,
        script: scriptText.trim(),
        audioUrl: data.drop_url,
        persona: VOICES.find((v) => v.id === selectedVoice)?.label,
      };

      setActiveDrop(cueItem);
      setSuccessMsg("✓ Synthesized with Fish Audio s2.1-pro-free (-14 LUFS)!");

      // Always populate CueDock with the new drop
      if (onDropReady) {
        onDropReady(cueItem);
      }

      if (destination === "air") {
        if (onAirLive) {
          await onAirLive(data.drop_url, cueItem.title, cueItem.persona, scriptText.trim());
          setAiringStatus("✓ Aired live to broadcast stream!");
          setTimeout(() => setAiringStatus(null), 4000);
        } else if (onFireDirect) {
          onFireDirect(data.drop_url, cueItem.title);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate AI drop.");
    } finally {
      clearInterval(interval);
      setGenerating(false);
    }
  };

  const handleToggleAudition = () => {
    if (!activeDrop?.audioUrl) return;
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(activeDrop.audioUrl);
      previewAudioRef.current.onended = () => setIsPlayingPreview(false);
    } else if (previewAudioRef.current.src !== activeDrop.audioUrl) {
      previewAudioRef.current.src = activeDrop.audioUrl;
    }

    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play().then(() => setIsPlayingPreview(true)).catch(() => setIsPlayingPreview(false));
    }
  };

  const handleReAir = async () => {
    if (!activeDrop?.audioUrl || !onAirLive) return;
    setAiringStatus("Airing to stream...");
    try {
      const ok = await onAirLive(activeDrop.audioUrl, activeDrop.title, activeDrop.persona, activeDrop.script);
      setAiringStatus(ok ? "✓ Fired live to stream!" : "Aired!");
    } catch {
      setAiringStatus("Failed to air drop");
    }
    setTimeout(() => setAiringStatus(null), 3500);
  };

  const handleSendActiveToCue = () => {
    if (activeDrop && onDropReady) {
      onDropReady(activeDrop);
      setAiringStatus("✓ Sent to Cue Dock (PFL)!");
      setTimeout(() => setAiringStatus(null), 3000);
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

      {/* Voice Selection Avatars (Horizontal scroll chip row on mobile, grid on desktop) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-mono text-white/70 uppercase tracking-wider">
            Station Voice Persona:
          </label>
          <span className="text-[10px] font-mono text-[#DFBB7D]">
            Active: {VOICES.find((v) => v.id === selectedVoice)?.label}
          </span>
        </div>

        {/* Mobile: Horizontally Scrollable Compact Chip Row (< sm) */}
        <div className="sm:hidden flex overflow-x-auto gap-1.5 pb-1 no-scrollbar py-0.5">
          {VOICES.map((v) => {
            const isSelected = selectedVoice === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVoice(v.id)}
                className={`px-3 py-2 border rounded font-mono text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0 whitespace-nowrap cursor-pointer touch-manipulation min-h-[44px] ${
                  isSelected
                    ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D] shadow-sm"
                    : "bg-white/5 text-white border-white/10 hover:border-white/30"
                }`}
              >
                <span>{v.icon}</span>
                <span>{v.label}</span>
              </button>
            );
          })}
        </div>

        {/* Desktop: Grid (>= sm) */}
        <div className="hidden sm:grid sm:grid-cols-5 gap-2">
          {VOICES.map((v) => {
            const isSelected = selectedVoice === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVoice(v.id)}
                className={`p-2 border text-left transition-all flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D] font-bold shadow-[2px_2px_0px_#16181D]"
                    : "bg-white/5 text-white border-white/10 hover:border-white/30"
                }`}
              >
                <div className="text-xl mb-1">{v.icon}</div>
                <div className="min-w-0 w-full">
                  <div className="font-mono text-xs font-bold truncate">{v.label}</div>
                  <div className="text-[10px] font-mono opacity-70 truncate">{v.role}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Dynamic Live Broadcast Tags */}
      <div className="bg-[#1A1D24]/80 p-2.5 sm:p-3 border border-[#DFBB7D]/30 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-mono text-[#DFBB7D] uppercase tracking-wider font-bold flex items-center space-x-1.5">
            <Radio className="w-3.5 h-3.5 text-[#DFBB7D]" />
            <span>Pre-Populated Broadcast Tags (Click to Insert):</span>
          </label>
          <span className="text-[10px] font-mono text-white/50 hidden sm:inline">
            Live from Postgres & station rotation
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {contextTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleInsertTag(tag.value)}
              title={`Click to insert "${tag.value}" into AI prompt or script`}
              className="px-2 py-1 bg-black/40 hover:bg-[#DFBB7D] hover:text-[#16181D] text-white/90 font-mono text-[11px] border border-[#DFBB7D]/40 transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <span>+</span>
              <span>{tag.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. AI Script Assistant Bar */}
      <div className="bg-[#1A1D24] p-3 border-2 border-[#DFBB7D]/60 space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-mono text-white/90 uppercase tracking-wider font-bold flex items-center space-x-1.5">
            <Wand2 className="w-3.5 h-3.5 text-[#F5C842]" />
            <span>AI Script Generator · Prompt Engine</span>
          </label>
          <span className="text-[10px] font-mono text-[#10B981]">
            Powered by Gemini & Groq
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              ref={promptInputRef}
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onFocus={() => {
                lastFocusedRef.current = "prompt";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleWriteScriptWithAi();
                }
              }}
              placeholder='e.g. "Hype tickets for Sunday at Marara Camp" or "Shout out Nairobi chillers listening live"...'
              className="w-full bg-black/50 text-white font-mono text-xs px-3 py-2 border border-white/20 focus:border-[#DFBB7D] focus:outline-none"
            />
            {aiPrompt && (
              <button
                type="button"
                onClick={() => setAiPrompt("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleWriteScriptWithAi()}
            disabled={writingScript}
            className="px-4 py-2 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-mono text-xs font-bold transition-all flex items-center justify-center space-x-1.5 shrink-0 disabled:opacity-50 cursor-pointer shadow-[2px_2px_0px_#16181D]"
          >
            {writingScript ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>WRITING SCRIPT...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>✨ AI WRITE SCRIPT</span>
              </>
            )}
          </button>
        </div>

        {/* Quick prompt suggestions */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] font-mono text-white/50 mr-1">Quick Prompts:</span>
          {[
            { label: "⚡ Hype Sunday Park & Chill", prompt: "Hype Sunday Park & Chill at Marara Camp Thika with river vibes" },
            { label: "🎟️ Push 200 Bob Tickets", prompt: "Urge listeners to grab the 200 bob advance tickets on goodlife.smwhr.space" },
            { label: "🎵 Introduce Up Next Track", prompt: "Introduce the upcoming song with high energy and hype" },
            { label: "🔥 Nairobi Sheng Hype Drop", prompt: "Raw energetic Nairobi Sheng DJ drop telling wasee we outside" },
            { label: "📻 Station ID & Shoutout", prompt: "Station ID shoutout for all listeners tuned in across Nairobi and diaspora" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setAiPrompt(item.prompt);
                handleWriteScriptWithAi(item.prompt);
              }}
              className="px-2 py-0.5 bg-white/5 hover:bg-white/20 text-white/80 hover:text-white font-mono text-[10px] border border-white/10 transition-colors cursor-pointer"
            >
              {item.label}
            </button>
          ))}
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
          onFocus={() => {
            lastFocusedRef.current = "script";
          }}
          rows={3}
          className="w-full bg-[#1A1D24] text-white font-mono text-xs p-3 border border-white/20 focus:border-[#DFBB7D] focus:outline-none resize-none leading-relaxed"
          placeholder="Type Sheng / Kenyan radio drop script..."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs font-mono text-white/60 mt-1.5 gap-1">
          <span>Character count: {scriptText.length}</span>
          <span>EBU R128 (-14 LUFS radio broadcast mastering)</span>
        </div>
      </div>

      {/* Dynamic Synthesis Progress Indicator */}
      {generating && (
        <div className="bg-[#1A1D24] p-3.5 border-2 border-[#DFBB7D] shadow-[2px_2px_0px_#DFBB7D] space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-3.5 h-3.5 text-[#DFBB7D] animate-spin shrink-0" />
              <span className="text-[#DFBB7D] font-bold">
                [STAGE {synthStage.step}/4] {synthStage.title}
              </span>
            </div>
            <div className="flex items-center space-x-2 text-white/70">
              <span>{(elapsedTime / 10).toFixed(1)}s</span>
              <span className="font-bold text-[#F5C842]">{Math.round(synthStage.percent)}%</span>
            </div>
          </div>

          {/* Progress Bar Track */}
          <div className="w-full bg-black/60 h-2.5 overflow-hidden border border-white/20 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-[#DFBB7D] via-[#F5C842] to-[#E84855] transition-all duration-200 relative overflow-hidden"
              style={{ width: `${synthStage.percent}%` }}
            >
              <div className="absolute inset-0 bg-white/25 animate-pulse" />
            </div>
          </div>

          <div className="flex justify-between items-center text-[10px] font-mono text-white/50">
            <span>Neural Vocal Engine · Fish Audio s2.1-pro-free</span>
            <span>EBU R128 (-14 LUFS) mastering</span>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="p-2.5 bg-[#E84855]/20 border border-[#E84855] text-red-200 font-mono text-xs flex items-center space-x-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-2.5 bg-[#10B981]/20 border border-[#10B981] text-emerald-200 font-mono text-xs flex items-center space-x-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Active Generated Drop Deck (Instant Audition, Re-air, Cue & Pad Assign) */}
      {activeDrop && (
        <div className="bg-[#1A1D24] border-2 border-[#DFBB7D] p-3.5 shadow-[2px_2px_0px_#DFBB7D] space-y-2.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center space-x-2">
              <span className="px-1.5 py-0.5 bg-[#DFBB7D] text-[#16181D] font-mono text-[10px] font-bold">
                READY DROP
              </span>
              <span className="font-mono text-xs font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                {activeDrop.title} {activeDrop.persona ? `· ${activeDrop.persona}` : ""}
              </span>
            </div>
            {airingStatus && (
              <span className="font-mono text-[11px] text-emerald-400 font-bold animate-pulse">
                {airingStatus}
              </span>
            )}
          </div>

          <p className="font-mono text-xs text-white/80 italic bg-black/40 p-2 border border-white/5">
            &ldquo;{activeDrop.script}&rdquo;
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleToggleAudition}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold border border-white/20 flex items-center space-x-1.5 cursor-pointer"
            >
              {isPlayingPreview ? (
                <Pause className="w-3.5 h-3.5 text-[#DFBB7D]" />
              ) : (
                <Play className="w-3.5 h-3.5 text-[#DFBB7D]" />
              )}
              <span>{isPlayingPreview ? "PAUSE AUDITION" : "AUDITION (LOCAL)"}</span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleSendActiveToCue}
                className="px-2.5 py-1.5 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-mono text-xs font-bold border border-[#16181D] flex items-center space-x-1 cursor-pointer"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>SEND TO CUE</span>
              </button>

              <button
                type="button"
                onClick={handleReAir}
                className="px-3 py-1.5 bg-[#E84855] hover:bg-red-600 text-white font-mono text-xs font-bold border border-white/20 flex items-center space-x-1 shadow-[2px_2px_0px_#DFBB7D] cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>FIRE TO LIVE STREAM</span>
              </button>

              <button
                type="button"
                onClick={() => openAssignModal(activeDrop.audioUrl, activeDrop.title)}
                className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white font-mono text-xs font-bold border border-white/10 flex items-center space-x-1 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5 text-[#DFBB7D]" />
                <span>ASSIGN TO PAD</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons (Stacked & full-width on mobile, balanced on desktop) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2.5 pt-2 w-full">
        <button
          type="button"
          onClick={() => handleGenerate("cue")}
          disabled={generating || !scriptText.trim()}
          className="w-full sm:flex-1 min-h-[44px] px-4 py-2.5 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-mono text-xs font-bold border border-[#16181D] flex items-center justify-center space-x-2 shadow-[2px_2px_0px_#16181D] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
        >
          <Headphones className="w-4 h-4 shrink-0" />
          <span>{generating ? "SYNTHESIZING..." : "✨ GENERATE TO CUE (PREVIEW)"}</span>
        </button>

        <button
          type="button"
          onClick={() => handleGenerate("air")}
          disabled={generating || !scriptText.trim()}
          className="w-full sm:flex-1 min-h-[44px] px-4 py-2.5 bg-[#E84855] hover:bg-red-600 text-white font-mono text-xs font-black border-2 border-red-400 flex items-center justify-center space-x-2 shadow-[0_0_15px_rgba(232,72,85,0.4)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
        >
          <Radio className="w-4 h-4 shrink-0 animate-pulse" />
          <span>{generating ? "SYNTHESIZING..." : "🔴 FIRE TO LIVE STREAM (MID-SONG)"}</span>
        </button>
      </div>
    </div>
  );
}

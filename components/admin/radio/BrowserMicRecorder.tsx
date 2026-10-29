"use client";

import React, { useState, useRef } from "react";
import { Mic, Square, Sparkles, Play, Pause, CheckCircle2, AlertCircle, RefreshCw, Radio, Headphones } from "lucide-react";
import { useAudioRecorder, MAX_RECORDING_SECONDS } from "@/hooks/use-audio-recorder";

export interface BrowserMicRecorderProps {
  onDropMastered?: (audioUrl: string, dropName: string) => void;
  onTalkoverToggle?: (active: boolean) => void;
  onSendToCue?: (cueItem: any) => void;
  onAirLive?: (audioUrl: string, dropName: string, persona?: string, script?: string) => Promise<boolean>;
}

export default function BrowserMicRecorder({
  onDropMastered,
  onTalkoverToggle,
  onSendToCue,
  onAirLive,
}: BrowserMicRecorderProps) {
  const {
    isRecording,
    recordingDuration,
    audioBlob,
    audioUrl,
    error: recorderError,
    startRecording,
    stopRecording,
    resetRecording,
  } = useAudioRecorder();

  const [dropName, setDropName] = useState("Live Mic Shoutout");
  const [mastering, setMastering] = useState(false);
  const [masteredUrl, setMasteredUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTalkoverActive, setIsTalkoverActive] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleTalkoverClick = () => {
    const nextState = !isTalkoverActive;
    setIsTalkoverActive(nextState);
    if (onTalkoverToggle) onTalkoverToggle(nextState);
  };

  const handleStopAndMaster = async () => {
    const blob = await stopRecording();
    if (!blob || blob.size === 0) {
      setStatusMsg({ text: "No audio captured. Try recording again.", type: "error" });
      return;
    }

    setMastering(true);
    setStatusMsg(null);

    try {
      const formData = new FormData();
      formData.append("audio", blob, "mic_drop.webm");
      formData.append("name", dropName.trim() || "Live Mic Shoutout");

      const res = await fetch("/api/admin/radio/drops/diy", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Mastering failed HTTP ${res.status}`);
      }

      const data = await res.json();
      const finalUrl = data.mastered_file || audioUrl;
      setMasteredUrl(finalUrl);
      setStatusMsg({
        text: "✓ Mic drop mastered to -14 LUFS & bound to Cartwall Pad #8!",
        type: "success",
      });

      if (onDropMastered && finalUrl) {
        onDropMastered(finalUrl, dropName);
      }

      if (onSendToCue && finalUrl) {
        onSendToCue({
          id: `mic_${Date.now()}`,
          title: dropName,
          script: "Live Microphone Recording",
          audioUrl: finalUrl,
          persona: "Live Host",
        });
      }
    } catch (err: any) {
      setStatusMsg({
        text: err.message || "Failed to master mic audio",
        type: "error",
      });
    } finally {
      setMastering(false);
    }
  };

  const togglePlayback = () => {
    const urlToPlay = masteredUrl || audioUrl;
    if (!urlToPlay) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(urlToPlay);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.src = urlToPlay;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  return (
    <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-4 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
      {/* Header Strip */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-[#E84855] text-white font-bold">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase text-white">
              LIVE MIC & TALKOVER ENGINE
            </h3>
            <p className="text-[11px] font-mono text-[#DFBB7D]">
              Direct air talkover (-12dB ducking) · High-pass filter & EBU R128 loudness
            </p>
          </div>
        </div>

        {/* Talkover Toggle Badge */}
        {isTalkoverActive && (
          <div className="px-2 py-0.5 bg-[#E84855] text-white font-mono text-xs font-bold animate-pulse">
            🔴 TALKOVER ON AIR
          </div>
        )}
      </div>

      {/* Mic Input Name & Dual Action Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Talkover Air Button */}
        <button
          type="button"
          onClick={handleTalkoverClick}
          className={`p-3 border-2 font-mono text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
            isTalkoverActive
              ? "bg-[#E84855] text-white border-white shadow-[0_0_15px_#E84855]"
              : "bg-white/5 text-white/90 border-white/20 hover:border-[#E84855] hover:bg-[#E84855]/10"
          }`}
        >
          <Radio className={`w-4 h-4 ${isTalkoverActive ? "animate-ping" : ""}`} />
          <span>{isTalkoverActive ? "STOP TALKOVER (RESTORE MUSIC)" : "🔴 LIVE TALKOVER (DUCK MUSIC)"}</span>
        </button>

        {/* Record Drop Button */}
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            className="p-3 bg-white/5 hover:bg-[#DFBB7D]/10 text-white hover:text-[#DFBB7D] border-2 border-white/20 hover:border-[#DFBB7D] font-mono text-xs font-bold transition-all flex items-center justify-center space-x-2"
          >
            <Mic className="w-4 h-4 text-[#DFBB7D]" />
            <span>RECORD DROP FOR LATER</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStopAndMaster}
            disabled={mastering}
            className="p-3 bg-[#E84855] text-white border-2 border-white font-mono text-xs font-bold transition-all flex items-center justify-center space-x-2 animate-pulse"
          >
            <Square className="w-4 h-4 fill-white" />
            <span>{mastering ? "MASTERING (-14 LUFS)..." : `STOP & MASTER (${formatDuration(recordingDuration)})`}</span>
          </button>
        )}
      </div>

      {/* Recording Preview Strip */}
      {(audioUrl || masteredUrl) && !isRecording && (
        <div className="bg-white/5 p-3 border border-white/10 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
          <div className="flex items-center space-x-2">
            <button
              onClick={togglePlayback}
              className="p-1.5 bg-[#DFBB7D] text-[#16181D] hover:bg-[#F5C842]"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <span className="text-white font-bold truncate max-w-xs">{dropName}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                if (onSendToCue && (masteredUrl || audioUrl)) {
                  onSendToCue({
                    id: `mic_${Date.now()}`,
                    title: dropName,
                    script: "Live Mic Recording",
                    audioUrl: masteredUrl || audioUrl,
                    persona: "Live Mic",
                  });
                }
              }}
              className="px-2.5 py-1 bg-white/10 hover:bg-[#DFBB7D] hover:text-[#16181D] text-white border border-white/20 text-[11px] font-bold flex items-center space-x-1"
            >
              <Headphones className="w-3 h-3" />
              <span>SEND TO CUE</span>
            </button>
            <button
              onClick={async () => {
                const targetUrl = masteredUrl || audioUrl;
                if (onAirLive && targetUrl) {
                  const success = await onAirLive(targetUrl, dropName, "Live Host DJ", "Live Mic Shoutout");
                  if (success) {
                    setStatusMsg({
                      text: "🔴 Aired live drop to stream! All listeners are hearing it now.",
                      type: "success",
                    });
                  }
                }
              }}
              className="px-2.5 py-1 bg-[#E84855] hover:bg-red-600 text-white font-bold text-[11px] flex items-center space-x-1 shadow-[2px_2px_0px_#DFBB7D]"
            >
              <Radio className="w-3 h-3" />
              <span>🔴 AIR TO STREAM NOW</span>
            </button>
            <button
              onClick={resetRecording}
              className="text-white/40 hover:text-white text-[11px]"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      {statusMsg && (
        <div className={`p-2 border font-mono text-xs flex items-center space-x-1.5 ${
          statusMsg.type === "success"
            ? "bg-[#10B981]/20 border-[#10B981] text-emerald-200"
            : "bg-[#E84855]/20 border-[#E84855] text-red-200"
        }`}>
          {statusMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}
    </div>
  );
}

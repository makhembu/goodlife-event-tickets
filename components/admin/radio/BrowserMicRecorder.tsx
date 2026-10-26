"use client";

import React, { useState } from "react";
import { Mic, Square, Sparkles, Play, Pause, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useAudioRecorder, MAX_RECORDING_SECONDS } from "@/hooks/use-audio-recorder";

interface BrowserMicRecorderProps {
  onDropMastered?: (audioUrl: string, dropName: string) => void;
}

export default function BrowserMicRecorder({ onDropMastered }: BrowserMicRecorderProps) {
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

  const [dropName, setDropName] = useState("Live Mic Drop");
  const [mastering, setMastering] = useState(false);
  const [masteredUrl, setMasteredUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
      formData.append("audio", blob, "phone_mic.webm");
      formData.append("name", dropName.trim() || "Live Mic Drop");

      const res = await fetch("/api/admin/radio/drops/diy", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Mastering failed HTTP ${res.status}`);
      }

      const data = await res.json();
      // On success, set preview and bind to Pad 8
      const finalUrl = data.mastered_file || audioUrl;
      setMasteredUrl(finalUrl);
      setStatusMsg({
        text: "✓ Mic drop mastered to -14 LUFS & bound to Cartwall Pad #8!",
        type: "success",
      });

      if (onDropMastered && finalUrl) {
        onDropMastered(finalUrl, dropName);
      }
    } catch (err: any) {
      setStatusMsg({
        text: err.message || "Failed to master audio with home daemon",
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
    <div className="p-5 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) space-y-4">
      <div className="flex items-center gap-2 border-b-2 border-brand-navy pb-2">
        <Mic className="w-5 h-5 text-rose-600" />
        <h2 className="font-display text-lg font-black uppercase">
          IN-BROWSER MOBILE MIC RECORDER
        </h2>
      </div>

      <p className="text-xs text-brand-navy/70">
        Record quick hype drops straight from your smartphone or iPad microphone. The system automatically applies a 120Hz high-pass filter, de-esser, and -14 LUFS loudness mastering.
      </p>

      {/* Status Messages */}
      {statusMsg && (
        <div
          className={`p-3 border-2 text-xs font-bold flex items-center justify-between gap-2 ${
            statusMsg.type === "success"
              ? "bg-emerald-50 border-emerald-600 text-emerald-800"
              : "bg-red-50 border-red-600 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-xs font-black hover:opacity-75 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {recorderError && (
        <div className="p-3 border-2 border-red-500 bg-red-50 text-red-700 text-xs font-bold">
          Microphone error: {recorderError}
        </div>
      )}

      {/* Recording Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <input
          type="text"
          value={dropName}
          onChange={(e) => setDropName(e.target.value)}
          placeholder="Drop Label (e.g. DJ Shoutout)"
          className="flex-1 w-full p-2.5 border-2 border-brand-navy bg-brand-off-white text-xs font-bold focus:outline-none focus:bg-white"
        />

        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            className="w-full sm:w-auto px-5 py-2.5 border-2 border-brand-navy bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wider transition-colors shadow-(--shadow-brut-xs) flex items-center justify-center gap-2 cursor-pointer"
          >
            <Mic className="w-4 h-4" />
            <span>RECORD MIC</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStopAndMaster}
            disabled={mastering}
            className={`w-full sm:w-auto px-5 py-2.5 border-2 border-brand-navy ${
              recordingDuration > 90
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-red-600 hover:bg-red-700"
            } text-white text-xs font-black uppercase tracking-wider transition-colors shadow-(--shadow-brut-xs) flex items-center justify-center gap-2 animate-pulse cursor-pointer`}
          >
            <Square className="w-4 h-4 fill-white" />
            <span>
              STOP &amp; MASTER ({formatDuration(recordingDuration)})
              {recordingDuration > 90 && ` — AUTO-STOP IN ${MAX_RECORDING_SECONDS - recordingDuration}s`}
            </span>
          </button>
        )}
      </div>

      {/* Audio Mastered Preview */}
      {(masteredUrl || audioUrl) && !isRecording && (
        <div className="p-3 border-2 border-brand-navy bg-brand-off-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlayback}
              className="p-2 border-2 border-brand-navy bg-brand-navy text-white hover:bg-brand-navy/90 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <span className="text-xs font-bold text-brand-navy">
              {masteredUrl ? "Mastered Audio (-14 LUFS)" : "Raw Recording"}
            </span>
          </div>

          <button
            type="button"
            onClick={resetRecording}
            className="text-xs text-brand-navy/60 hover:text-brand-navy font-bold underline cursor-pointer"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Sparkles, Play, Pause, CheckCircle2, AlertCircle, RefreshCw, Radio, Headphones, ArrowRight, Volume2 } from "lucide-react";
import { useAudioRecorder, MAX_RECORDING_SECONDS } from "@/hooks/use-audio-recorder";
import { useSoundboard } from "@/context/SoundboardContext";

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
  const { openAssignModal } = useSoundboard();
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
  const [talkoverLevel, setTalkoverLevel] = useState(0);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const talkoverStreamRef = useRef<MediaStream | null>(null);
  const talkoverAudioCtxRef = useRef<AudioContext | null>(null);
  const talkoverRecorderRef = useRef<MediaRecorder | null>(null);
  const talkoverChunksRef = useRef<Blob[]>([]);
  const talkoverAnimRef = useRef<number | null>(null);

  // Clean up any open streams on unmount
  useEffect(() => {
    return () => {
      if (talkoverAnimRef.current) cancelAnimationFrame(talkoverAnimRef.current);
      if (talkoverStreamRef.current) {
        talkoverStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (talkoverAudioCtxRef.current) {
        talkoverAudioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Uploads recorded audio blob to broadcast server/R2 so it can be streamed to all listeners
  const uploadAudioBlob = async (blob: Blob, name: string): Promise<string> => {
    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");
    formData.append("name", name);

    const res = await fetch("/api/admin/radio/drops/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Upload failed");
    }

    const data = await res.json();
    return data.audio_url;
  };

  const handleTalkoverClick = async () => {
    if (isTalkoverActive) {
      stopTalkover();
    } else {
      await startTalkover();
    }
  };

  const startTalkover = async () => {
    setStatusMsg(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone is not supported in this browser context (HTTPS required).");
      }

      // Prompt and acquire microphone access
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (err: any) {
        // Fallback to generic audio if constraint rejected
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      talkoverStreamRef.current = stream;

      // Web Audio setup for live filtering & level measurement
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      talkoverAudioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);

      // High-pass filter at 85Hz (eliminates microphone table rumble and low-end pops)
      const highPass = ctx.createBiquadFilter();
      highPass.type = "highpass";
      highPass.frequency.value = 85;

      // Vocal compressor (broadcast voice leveling)
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Analyser for real-time meter display
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;

      source.connect(highPass);
      highPass.connect(compressor);
      compressor.connect(analyser);

      const pcmData = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        if (!talkoverStreamRef.current) return;
        analyser.getByteFrequencyData(pcmData);
        let sum = 0;
        for (let i = 0; i < pcmData.length; i++) {
          sum += pcmData[i];
        }
        const avg = sum / pcmData.length;
        setTalkoverLevel(Math.min(100, Math.round((avg / 128) * 100)));
        talkoverAnimRef.current = requestAnimationFrame(updateMeter);
      };
      talkoverAnimRef.current = requestAnimationFrame(updateMeter);

      // Concurrently record talkover audio in background
      talkoverChunksRef.current = [];
      let mimeType = "audio/webm;codecs=opus";
      if (typeof MediaRecorder !== "undefined") {
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
        }
      }
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) talkoverChunksRef.current.push(e.data);
      };
      talkoverRecorderRef.current = recorder;
      recorder.start(100);

      setIsTalkoverActive(true);
      if (onTalkoverToggle) onTalkoverToggle(true);
    } catch (err: any) {
      console.error("[LiveTalkover] Mic access error:", err);
      let errMsg = "Microphone access denied. Click the site settings lock/tune icon in your address bar to allow mic access, then try again.";
      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        errMsg = "No microphone found on your device. Please plug in a microphone or headset.";
      } else if (err.name === "NotReadableError") {
        errMsg = "Microphone is in use by another application. Please close other audio apps and try again.";
      }
      setStatusMsg({ text: errMsg, type: "error" });
      setIsTalkoverActive(false);
      if (onTalkoverToggle) onTalkoverToggle(false);
    }
  };

  const stopTalkover = () => {
    setIsTalkoverActive(false);
    setTalkoverLevel(0);
    if (onTalkoverToggle) onTalkoverToggle(false);

    if (talkoverAnimRef.current) {
      cancelAnimationFrame(talkoverAnimRef.current);
      talkoverAnimRef.current = null;
    }

    if (talkoverRecorderRef.current && talkoverRecorderRef.current.state !== "inactive") {
      try {
        talkoverRecorderRef.current.stop();
      } catch {}
    }

    if (talkoverStreamRef.current) {
      talkoverStreamRef.current.getTracks().forEach((t) => t.stop());
      talkoverStreamRef.current = null;
    }

    if (talkoverAudioCtxRef.current) {
      talkoverAudioCtxRef.current.close().catch(() => {});
      talkoverAudioCtxRef.current = null;
    }

    setTimeout(async () => {
      if (talkoverChunksRef.current.length > 0) {
        const blob = new Blob(talkoverChunksRef.current, { type: "audio/webm" });
        if (blob.size > 1200) {
          setStatusMsg({
            text: "📡 Broadcasting live talkover to on-air stream...",
            type: "success",
          });
          try {
            const publicUrl = await uploadAudioBlob(blob, "Live Host Talkover");
            setMasteredUrl(publicUrl);
            if (onAirLive) {
              await onAirLive(publicUrl, "Live Talkover", "Live Host", "Host live mic talkover");
            }
            setStatusMsg({
              text: "✓ Live talkover broadcast on air to all listeners!",
              type: "success",
            });
          } catch (uploadErr: any) {
            console.warn("[LiveTalkover] Upload broadcast failed:", uploadErr);
            const localUrl = URL.createObjectURL(blob);
            setMasteredUrl(localUrl);
            setStatusMsg({
              text: "Talkover ended locally (upload failed: " + (uploadErr.message || "network") + ")",
              type: "error",
            });
          }
        }
      }
    }, 150);
  };

  const handleStopAndMaster = async () => {
    const blob = await stopRecording();
    if (!blob || blob.size === 0) {
      setStatusMsg({ text: "No audio captured. Try recording again.", type: "error" });
      return;
    }

    const localBlobUrl = URL.createObjectURL(blob);
    setMasteredUrl(localBlobUrl);
    setMastering(true);
    setStatusMsg(null);

    try {
      const formData = new FormData();
      formData.append("audio", blob, "mic_drop.webm");
      formData.append("name", dropName.trim() || "Live Mic Shoutout");

      let finalUrl = localBlobUrl;
      try {
        finalUrl = await uploadAudioBlob(blob, dropName.trim() || "Live Mic Shoutout");
      } catch {
        const res = await fetch("/api/admin/radio/drops/diy", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          finalUrl = data.drop_url || data.url || data.mastered_file || localBlobUrl;
        }
      }
      setMasteredUrl(finalUrl);
      setStatusMsg({
        text: "✓ Mic drop mastered to -14 LUFS!",
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
          <div className="px-2 py-0.5 bg-[#E84855] text-white font-mono text-xs font-bold animate-pulse flex items-center space-x-1.5">
            <Radio className="w-3.5 h-3.5" />
            <span>MIC LIVE ON AIR (-12dB DUCK)</span>
          </div>
        )}
      </div>

      {/* Mic Input Name & Dual Action Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Talkover Air Button */}
        <button
          type="button"
          onClick={handleTalkoverClick}
          className={`p-3 border-2 font-mono text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-2 cursor-pointer ${
            isTalkoverActive
              ? "bg-[#E84855] text-white border-white shadow-[0_0_15px_#E84855]"
              : "bg-white/5 text-white/90 border-white/20 hover:border-[#E84855] hover:bg-[#E84855]/10"
          }`}
        >
          <div className="flex items-center space-x-2">
            <Radio className={`w-4 h-4 ${isTalkoverActive ? "animate-pulse text-white" : ""}`} />
            <span>{isTalkoverActive ? "STOP TALKOVER (RESTORE MUSIC)" : "🔴 LIVE TALKOVER (DUCK MUSIC)"}</span>
          </div>
          {isTalkoverActive && (
            <div className="flex items-center space-x-1">
              <span className="text-[10px] text-white/70">MIC:</span>
              <div className="w-16 bg-black/60 h-2 border border-white/30 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-75"
                  style={{ width: `${Math.max(8, talkoverLevel)}%` }}
                />
              </div>
            </div>
          )}
        </button>

        {/* Record Drop Button */}
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            className="p-3 bg-white/5 hover:bg-[#DFBB7D]/10 text-white hover:text-[#DFBB7D] border-2 border-white/20 hover:border-[#DFBB7D] font-mono text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Mic className="w-4 h-4 text-[#DFBB7D]" />
            <span>RECORD DROP FOR LATER</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStopAndMaster}
            disabled={mastering}
            className="p-3 bg-[#E84855] text-white border-2 border-white font-mono text-xs font-bold transition-all flex items-center justify-center space-x-2 animate-pulse cursor-pointer"
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
              className="p-1.5 bg-[#DFBB7D] text-[#16181D] hover:bg-[#F5C842] cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <span className="text-white font-bold truncate max-w-xs">{dropName}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                const targetUrl = masteredUrl || audioUrl;
                if (onSendToCue && targetUrl) {
                  onSendToCue({
                    id: `mic_${Date.now()}`,
                    title: dropName,
                    script: "Live Mic Recording",
                    audioUrl: targetUrl,
                    persona: "Live Mic",
                  });
                  setStatusMsg({ text: "✓ Sent to Cue Dock (PFL)!", type: "success" });
                }
              }}
              className="px-2.5 py-1 bg-white/10 hover:bg-[#DFBB7D] hover:text-[#16181D] text-white border border-white/20 text-[11px] font-bold flex items-center space-x-1 cursor-pointer"
            >
              <Headphones className="w-3 h-3" />
              <span>SEND TO CUE</span>
            </button>
            <button
              onClick={() => {
                const targetUrl = masteredUrl || audioUrl;
                if (targetUrl) {
                  openAssignModal(targetUrl, dropName);
                }
              }}
              className="px-2.5 py-1 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold text-[11px] flex items-center space-x-1 cursor-pointer"
            >
              <ArrowRight className="w-3 h-3" />
              <span>ASSIGN TO PAD</span>
            </button>
            <button
              onClick={async () => {
                const targetUrl = masteredUrl || audioUrl;
                if (onAirLive && targetUrl) {
                  const success = await onAirLive(targetUrl, dropName, "Live Host DJ", "Live Mic Shoutout");
                  if (success) {
                    setStatusMsg({ text: "✓ Aired mic shoutout to live stream!", type: "success" });
                  } else {
                    setStatusMsg({ text: "Failed to air mic drop to stream.", type: "error" });
                  }
                }
              }}
              className="px-2.5 py-1 bg-[#E84855] hover:bg-red-600 text-white font-bold text-[11px] flex items-center space-x-1 cursor-pointer shadow-[2px_2px_0px_#DFBB7D]"
            >
              <Radio className="w-3 h-3" />
              <span>AIR TO STREAM NOW</span>
            </button>
            <button
              onClick={() => {
                setMasteredUrl(null);
                resetRecording();
              }}
              className="text-white/40 hover:text-white text-[11px] underline cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {statusMsg && (
        <div
          className={`p-2 font-mono text-xs border flex items-center space-x-2 ${
            statusMsg.type === "success"
              ? "bg-[#10B981]/20 border-[#10B981] text-emerald-200"
              : "bg-[#E84855]/20 border-[#E84855] text-red-200"
          }`}
        >
          {statusMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Recording Alert Banner */}
      {recorderError && (
        <div className="p-2.5 bg-[#E84855]/20 border border-[#E84855] text-red-200 font-mono text-xs flex items-center space-x-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{recorderError}</span>
        </div>
      )}
    </div>
  );
}

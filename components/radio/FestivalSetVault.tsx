"use client";

import React, { useState, useEffect } from "react";
import { Play, Pause, Disc3, Calendar, Clock, Radio } from "lucide-react";
import { useRadio } from "@/context/RadioContext";

export interface ArchivedSet {
  id: number;
  title: string;
  dj_name: string;
  audio_url?: string;
  playback_url?: string;
  duration: number;
  duration_formatted: string;
  genre: string;
  recorded_at: string;
  bitrate: number;
}

export default function FestivalSetVault() {
  const {
    isLive,
    isPlaying: isRadioPlaying,
    currentTime,
    duration,
    progress,
    playSet,
    togglePlay,
    seek,
    snapToBroadcast,
  } = useRadio();

  const [recordings, setRecordings] = useState<ArchivedSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);

  useEffect(() => {
    async function loadRecordings() {
      try {
        const res = await fetch("/api/radio/recordings");
        if (res.ok) {
          const data = await res.json();
          setRecordings(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.warn("Failed to load archived festival recordings:", e);
      } finally {
        setLoading(false);
      }
    }
    loadRecordings();
  }, []);

  const activeSet = recordings.find((r) => r.id === activeSetId);
  const isPlaying = !isLive && isRadioPlaying;

  const handlePlaySet = (set: ArchivedSet) => {
    if (activeSetId === set.id) {
      togglePlay();
    } else {
      setActiveSetId(set.id);
      playSet(set as any);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percent = parseFloat(e.target.value);
    seek(percent);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-KE", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Festival Live";
    }
  };

  if (loading) {
    return (
      <div className="p-8 border border-white/[0.08] bg-[#13151C] shadow-2xl text-center space-y-2">
        <Disc3 className="w-8 h-8 mx-auto animate-spin text-[#DFBB7D]" />
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
          Loading Festival Set Vault...
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6 border border-white/[0.08] bg-[#13151C] shadow-2xl space-y-6 text-[#FBF9F6]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <Disc3 className="w-5 h-5 text-[#DFBB7D]" />
          <h3 className="font-sans text-lg sm:text-xl font-bold uppercase tracking-wider text-white">
            FESTIVAL SET VAULT &amp; RECAPS
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {!isLive && (
            <button
              type="button"
              onClick={snapToBroadcast}
              className="px-3 py-1 font-mono text-xs font-bold uppercase bg-[#E84855] hover:bg-[#d63c49] text-white flex items-center gap-1.5 border border-white/20 transition-colors cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>SNAP TO LIVE BROADCAST</span>
            </button>
          )}
          <span className="font-mono text-xs font-bold px-3 py-1 border border-[#DFBB7D]/40 bg-[#1C2028] text-[#DFBB7D] uppercase">
            {recordings.length} Recorded Sets
          </span>
        </div>
      </div>

      <p className="text-xs font-mono text-neutral-400">
        Replay pristine 320kbps master recordings of live guest DJ takeovers and festival stages from festival editions and club sessions.
      </p>

      {/* Active Set Audio Scrubber Bar (If Playing) */}
      {activeSet && !isLive && (
        <div className="p-4 border border-[#DFBB7D]/40 bg-[#181A22] text-white space-y-3 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] text-[#DFBB7D] font-black tracking-widest uppercase block">
                NOW STREAMING FROM VAULT
              </span>
              <h4 className="font-sans text-base font-bold uppercase truncate text-white">
                {activeSet.title}
              </h4>
              <p className="font-mono text-xs text-neutral-400">
                {activeSet.dj_name} • {activeSet.genre} • Live Recording
              </p>
            </div>

            <button
              type="button"
              onClick={() => handlePlaySet(activeSet)}
              className="w-10 h-10 border border-white/20 bg-[#DFBB7D] text-[#0D0F12] flex items-center justify-center font-black shrink-0 hover:bg-[#edd39d] transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
          </div>

          {/* Interactive Progress Bar */}
          <div className="space-y-1">
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress}
              onChange={handleSeek}
              className="w-full h-2 bg-white/20 accent-[#DFBB7D] cursor-pointer"
            />
            <div className="flex justify-between font-mono text-[10px] text-neutral-400">
              <span>{formatSeconds(currentTime)}</span>
              <span>{formatSeconds(duration || activeSet.duration)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recordings Grid / List */}
      {recordings.length === 0 ? (
        <div className="py-12 border border-dashed border-white/15 text-center font-mono text-xs text-neutral-400 uppercase tracking-widest bg-[#0D0F12]">
          No live session recordings in the vault yet. Next DJ takeover will archive automatically!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto pr-1">
          {recordings.map((rec) => {
            const isThisPlaying = activeSetId === rec.id && isPlaying;
            return (
              <div
                key={rec.id}
                className={`p-3.5 border rounded-none flex items-center justify-between gap-3 transition-all ${
                  isThisPlaying
                    ? "bg-[#DFBB7D]/10 border-[#DFBB7D] shadow-md ring-1 ring-[#DFBB7D]"
                    : "bg-[#181C26]/70 border-white/[0.08] hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handlePlaySet(rec)}
                    className={`w-9 h-9 border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      isThisPlaying
                        ? "bg-[#DFBB7D] text-[#0D0F12] border-[#DFBB7D]"
                        : "bg-[#1C2028] text-white border-white/10 hover:border-white/30"
                    }`}
                  >
                    {isThisPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <h4 className="font-sans text-sm font-bold uppercase truncate text-white">
                      {rec.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-neutral-400">
                      <span className="font-bold text-[#DFBB7D] truncate max-w-[120px]">{rec.dj_name}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-neutral-400" />
                        {formatDate(rec.recorded_at)}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-neutral-400" />
                        {rec.duration_formatted}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 border border-white/10 bg-[#1C2028] font-mono text-[10px] font-bold uppercase text-[#DFBB7D]">
                    {rec.genre}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

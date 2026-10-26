"use client";

import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Disc3, Calendar, Clock, Volume2, VolumeX, Sparkles, Download } from "lucide-react";

export interface ArchivedSet {
  id: number;
  title: string;
  dj_name: string;
  audio_url: string;
  duration: number;
  duration_formatted: string;
  genre: string;
  recorded_at: string;
  bitrate: number;
}

export default function FestivalSetVault() {
  const [recordings, setRecordings] = useState<ArchivedSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    async function loadRecordings() {
      try {
        const res = await fetch("/api/radio/recordings");
        if (res.ok) {
          const data = await res.json();
          setRecordings(data);
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

  const handlePlaySet = (set: ArchivedSet) => {
    if (activeSetId === set.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    } else {
      setActiveSetId(set.id);
      setIsPlaying(true);
      setProgress(0);
      setCurrentTime(0);

      if (audioRef.current) {
        audioRef.current.src = set.audio_url;
        audioRef.current.load();
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    const dur = audioRef.current.duration || (activeSet?.duration || 1);
    setCurrentTime(cur);
    setDuration(dur);
    setProgress(dur > 0 ? (cur / dur) * 100 : 0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current || !audioRef.current.duration) return;
    const percent = parseFloat(e.target.value);
    const target = (percent / 100) * audioRef.current.duration;
    audioRef.current.currentTime = target;
    setProgress(percent);
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
      <div className="p-8 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) text-center space-y-2">
        <Disc3 className="w-8 h-8 mx-auto animate-spin text-brand-navy" />
        <p className="font-mono text-xs uppercase tracking-widest text-brand-navy/60">
          Loading Festival Set Vault...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) space-y-6">
      {/* Hidden audio element for on-demand playback */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        preload="none"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-brand-navy pb-3">
        <div className="flex items-center gap-2">
          <Disc3 className="w-5 h-5 text-amber-500" />
          <h3 className="font-display text-xl font-black uppercase tracking-wider">
            FESTIVAL SET VAULT &amp; RECAPS
          </h3>
        </div>
        <span className="font-mono text-xs font-bold px-2 py-0.5 border border-brand-navy bg-brand-off-white uppercase">
          {recordings.length} Recorded Sets
        </span>
      </div>

      <p className="text-xs text-brand-navy/70">
        Replay pristine 320kbps master recordings of live guest DJ takeovers and festival stages from Marara Camp and club sessions.
      </p>

      {/* Active Set Audio Scrubber Bar (If Playing) */}
      {activeSet && (
        <div className="p-4 border-3 border-brand-navy bg-brand-navy text-white space-y-3 shadow-(--shadow-brut-sm)">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] text-brand-accent font-black tracking-widest uppercase block">
                NOW STREAMING FROM VAULT
              </span>
              <h4 className="font-display text-base font-black uppercase truncate">
                {activeSet.title}
              </h4>
              <p className="font-mono text-xs text-white/70">
                {activeSet.dj_name} • {activeSet.genre} • 320kbps Master
              </p>
            </div>

            <button
              onClick={() => handlePlaySet(activeSet)}
              className="w-10 h-10 border-2 border-white bg-brand-accent text-brand-navy flex items-center justify-center font-black shrink-0 hover:bg-white transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-brand-navy" /> : <Play className="w-5 h-5 fill-brand-navy ml-0.5" />}
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
              className="w-full h-2 bg-white/20 accent-brand-accent cursor-pointer"
            />
            <div className="flex justify-between font-mono text-[10px] text-white/60">
              <span>{formatSeconds(currentTime)}</span>
              <span>{formatSeconds(duration || activeSet.duration)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recordings Grid / List */}
      {recordings.length === 0 ? (
        <div className="py-12 border-2 border-dashed border-brand-navy/30 text-center font-mono text-xs text-brand-navy/60 uppercase tracking-widest">
          No live session recordings in the vault yet. Next DJ takeover will archive automatically!
        </div>
      ) : (
        <div className="divide-y-2 divide-brand-navy/15 max-h-96 overflow-y-auto pr-1">
          {recordings.map((rec) => {
            const isThisPlaying = activeSetId === rec.id && isPlaying;
            return (
              <div
                key={rec.id}
                className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-brand-off-white transition-colors"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <button
                    onClick={() => handlePlaySet(rec)}
                    className={`w-9 h-9 border-2 border-brand-navy flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      isThisPlaying
                        ? "bg-brand-accent text-brand-navy"
                        : "bg-brand-off-white hover:bg-brand-navy hover:text-white"
                    }`}
                  >
                    {isThisPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <h4 className="font-display text-sm font-black uppercase truncate text-brand-navy">
                      {rec.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-brand-navy/60">
                      <span className="font-bold text-brand-navy/80">{rec.dj_name}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(rec.recorded_at)}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {rec.duration_formatted}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span className="px-2 py-0.5 border border-brand-navy/40 bg-white font-mono text-[10px] font-bold uppercase text-brand-navy">
                    {rec.genre}
                  </span>
                  <a
                    href={rec.audio_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 border border-brand-navy bg-brand-off-white hover:bg-brand-accent text-brand-navy transition-colors"
                    title="Download Master MP3"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

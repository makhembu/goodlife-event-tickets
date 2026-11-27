"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Play, Pause, Disc3, Clock, Calendar, ShieldCheck, Radio } from "lucide-react";
import { useRadio } from "@/context/RadioContext";

interface RecordingItem {
  id: number;
  title: string;
  dj_name: string;
  audio_url?: string;
  playback_url?: string;
  duration: number;
  duration_formatted: string;
  genre: string;
  recorded_at: string;
  show_id?: number | null;
  show_title?: string | null;
  show_slug?: string | null;
  presenter_id?: number | null;
  presenter_slug?: string | null;
}

interface CatchUpVaultProps {
  showSlug?: string;
  presenterSlug?: string;
  title?: string;
  className?: string;
}

export default function CatchUpVault({
  showSlug,
  presenterSlug,
  title = "STATION CATCH UP · RECORDED SHOWS",
  className = "",
}: CatchUpVaultProps) {
  const { playSet, isPlaying, currentSet } = useRadio();
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    async function fetchRecordings() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (showSlug) params.set("show", showSlug);
        if (presenterSlug) params.set("presenter", presenterSlug);

        const res = await fetch(`/api/radio/recordings?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (!isCancelled) {
          setRecordings(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.warn("Catch-up vault fetch error:", err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    fetchRecordings();
    return () => {
      isCancelled = true;
    };
  }, [showSlug, presenterSlug]);

  // Group by Show Title
  const groupedByShow = useMemo(() => {
    const map = new Map<string, RecordingItem[]>();
    for (const rec of recordings) {
      const groupKey = rec.show_title || "Special Airwaves & Residencies";
      if (!map.has(groupKey)) {
        map.set(groupKey, []);
      }
      map.get(groupKey)!.push(rec);
    }
    return map;
  }, [recordings]);

  if (loading) {
    return (
      <div className={`border border-white/[0.08] bg-[#13151C] shadow-2xl rounded-none p-5 space-y-3 text-[#FBF9F6] ${className}`}>
        <div className="flex items-center gap-2 border-b border-white/[0.08] pb-2">
          <Disc3 className="w-5 h-5 text-[#DFBB7D] animate-spin motion-reduce:animate-none" />
          <h3 className="font-sans text-lg uppercase tracking-wide text-white font-bold">
            {title}
          </h3>
        </div>
        <p className="font-mono text-xs text-neutral-400 animate-pulse motion-reduce:animate-none">
          Loading approved broadcast vault...
        </p>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className={`border border-white/[0.08] bg-[#13151C] shadow-2xl rounded-none p-5 space-y-2 text-[#FBF9F6] ${className}`}>
        <div className="flex items-center gap-2 border-b border-white/[0.08] pb-2">
          <Disc3 className="w-5 h-5 text-[#DFBB7D]" />
          <h3 className="font-sans text-lg uppercase tracking-wide text-white font-bold">
            {title}
          </h3>
        </div>
        <p className="font-mono text-xs text-neutral-400">
          No publicly approved recordings available yet for this selection. All recorded live sets undergo strict licensing verification before public release.
        </p>
      </div>
    );
  }

  return (
    <div className={`border border-white/[0.08] bg-[#13151C] shadow-2xl rounded-none p-5 space-y-5 text-[#FBF9F6] ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#1C2028] text-white rounded-none border border-white/10">
            <Radio className="w-4 h-4 text-[#DFBB7D]" />
          </div>
          <div>
            <h3 className="font-sans text-xl font-bold uppercase tracking-wide text-white">
              {title}
            </h3>
            <span className="text-xs font-mono text-neutral-400 block">
              OFFICIAL ARCHIVED BROADCASTS · {recordings.length} EPISODES
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold uppercase rounded-none">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>LICENSED &amp; APPROVED ONLY</span>
        </div>
      </div>

      {/* Shows Groups */}
      <div className="space-y-6">
        {Array.from(groupedByShow.entries()).map(([showGroup, showRecordings]) => (
          <div key={showGroup} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-[#DFBB7D] border border-white/20 inline-block" />
              <h4 className="font-sans text-base uppercase tracking-wider text-white font-bold">
                {showGroup}
              </h4>
              <span className="text-[10px] font-mono text-neutral-400">
                ({showRecordings.length})
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {showRecordings.map((rec) => {
                const isThisPlaying = isPlaying && currentSet?.id === rec.id;

                const handleTogglePlay = () => {
                  playSet({
                    id: rec.id,
                    title: rec.title,
                    dj_name: rec.dj_name,
                    audio_url: rec.audio_url || rec.playback_url || "",
                    playback_url: rec.playback_url,
                    cover_url: "/radio-pass-3d.png",
                    genre: rec.genre || "Festival Live Set",
                    duration_sec: rec.duration || 0,
                    file_size: 0,
                    bitrate: 192,
                    source_type: "r2",
                    processing_status: "ready",
                    display_order: 0,
                    is_active: true,
                    play_count: 0,
                    created_at: rec.recorded_at || new Date().toISOString(),
                  });
                };

                return (
                  <div
                    key={rec.id}
                    className={`border p-3.5 rounded-none flex items-center justify-between gap-3 transition-all ${
                      isThisPlaying
                        ? "bg-[#DFBB7D]/10 border-[#DFBB7D] shadow-md ring-1 ring-[#DFBB7D]"
                        : "bg-[#181C26]/70 border-white/[0.08] hover:border-white/20"
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isThisPlaying && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        )}
                        <h5 className="font-sans text-base font-bold uppercase text-white truncate">
                          {rec.title}
                        </h5>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-neutral-400">
                        <span className="font-bold text-[#DFBB7D]">{rec.dj_name}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-neutral-400" />
                          {rec.duration_formatted}
                        </span>
                        {rec.recorded_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-neutral-400" />
                            {new Date(rec.recorded_at).toLocaleDateString("en-KE", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      className={`p-2.5 rounded-none border cursor-pointer transition-transform active:scale-95 shrink-0 ${
                        isThisPlaying
                          ? "bg-[#DFBB7D] text-[#0D0F12] border-[#DFBB7D]"
                          : "bg-[#1C2028] hover:bg-[#252B36] text-white border-white/10"
                      }`}
                      title={isThisPlaying ? "Playing" : "Listen to broadcast"}
                    >
                      {isThisPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

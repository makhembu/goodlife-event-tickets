"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Play, Pause, Disc3, Clock, Calendar, ShieldCheck, Radio, Music } from "lucide-react";
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
      <div className={`border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl p-5 space-y-3 ${className}`}>
        <div className="flex items-center gap-2 border-b-2 border-brand-navy/15 pb-2">
          <Disc3 className="w-5 h-5 text-brand-navy animate-spin" />
          <h3 className="font-display text-lg uppercase tracking-wide text-brand-navy">
            {title}
          </h3>
        </div>
        <p className="font-mono text-xs text-brand-navy/60 animate-pulse">
          Loading approved broadcast vault...
        </p>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className={`border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl p-5 space-y-2 ${className}`}>
        <div className="flex items-center gap-2 border-b-2 border-brand-navy/15 pb-2">
          <Disc3 className="w-5 h-5 text-brand-navy" />
          <h3 className="font-display text-lg uppercase tracking-wide text-brand-navy">
            {title}
          </h3>
        </div>
        <p className="font-mono text-xs text-brand-navy/70">
          No publicly approved recordings available yet for this selection. All recorded live sets undergo strict licensing verification before public release.
        </p>
      </div>
    );
  }

  return (
    <div className={`border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl p-5 space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-brand-navy/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-navy text-white rounded">
            <Radio className="w-4 h-4 text-brand-accent" />
          </div>
          <div>
            <h3 className="font-display text-xl uppercase tracking-wide text-brand-navy">
              {title}
            </h3>
            <span className="text-[11px] font-mono text-brand-navy/70 block">
              OFFICIAL ARCHIVED BROADCASTS · {recordings.length} EPISODES
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 border border-emerald-700 text-emerald-800 text-[10px] font-mono font-bold uppercase rounded">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>LICENSED & APPROVED ONLY</span>
        </div>
      </div>

      {/* Shows Groups */}
      <div className="space-y-6">
        {Array.from(groupedByShow.entries()).map(([showGroup, showRecordings]) => (
          <div key={showGroup} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-brand-accent border border-brand-navy inline-block" />
              <h4 className="font-display text-base uppercase tracking-wider text-brand-navy">
                {showGroup}
              </h4>
              <span className="text-[10px] font-mono text-brand-navy/50">
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
                    cover_url: "/flyer.png",
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
                    className={`border-2 border-brand-navy p-3.5 rounded-lg flex items-center justify-between gap-3 transition-all ${
                      isThisPlaying
                        ? "bg-brand-accent/20 border-brand-navy shadow-xs ring-2 ring-brand-navy"
                        : "bg-brand-off-white hover:bg-white hover:shadow-xs"
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isThisPlaying && (
                          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                        )}
                        <h5 className="font-display text-base uppercase text-brand-navy truncate">
                          {rec.title}
                        </h5>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-brand-navy/75">
                        <span className="font-bold text-brand-navy">{rec.dj_name}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-brand-navy/60" />
                          {rec.duration_formatted}
                        </span>
                        {rec.recorded_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-brand-navy/60" />
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
                      className={`p-2.5 rounded-full border-2 border-brand-navy cursor-pointer transition-transform active:scale-95 shrink-0 ${
                        isThisPlaying
                          ? "bg-brand-navy text-brand-accent"
                          : "bg-brand-accent hover:bg-amber-400 text-brand-navy shadow-xs"
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

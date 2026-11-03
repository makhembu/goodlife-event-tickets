"use client";

import React, { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Music2,
  Radio,
  Zap,
  Search,
  ExternalLink,
  Play,
  ListPlus,
  X,
  Check,
} from "lucide-react";
import { formatTrackTitle } from "@/lib/radio/media-helpers";

interface SearchResultItem {
  id?: number;
  video_id: string;
  title: string;
  artist: string;
  duration_sec: number;
  thumbnail_url: string;
  source: "library" | "invidious" | "youtube";
  url: string;
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function QueueNextTrack() {
  const [inputValue, setInputValue] = useState("");
  const [voicePreference, setVoicePreference] = useState<"male" | "female">("male");
  const [includeIntroDrop, setIncludeIntroDrop] = useState(true);
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState<"queue" | "play_now">("queue");
  const [result, setResult] = useState<{
    artist: string;
    title: string;
    drop_script: string;
    queued: boolean;
    played_now?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<SearchResultItem | null>(null);

  const isDirectUrl = (str: string) => {
    return /^https?:\/\//i.test(str.trim());
  };

  const handleSearch = async (queryToSearch?: string) => {
    const q = (queryToSearch ?? inputValue).trim();
    if (!q) return;

    // If it's a direct URL, no need to search YouTube
    if (isDirectUrl(q)) {
      setSelectedTrack({
        video_id: "direct_url",
        title: "Direct Media Link",
        artist: "Web Audio Stream",
        duration_sec: 0,
        thumbnail_url: "",
        source: "youtube",
        url: q,
      });
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setSearching(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/admin/radio/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Search failed (${res.status})`);
      }
      const data = await res.json();
      const items = Array.isArray(data) ? data : [];
      setSearchResults(items);
      setHasSearched(true);
      if (items.length > 0 && !selectedTrack) {
        setSelectedTrack(items[0]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to search audio tracks.");
      setSearchResults([]);
      setHasSearched(true);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!isDirectUrl(inputValue)) {
        handleSearch();
      }
    }
  };

  const handleSelectTrack = (track: SearchResultItem) => {
    setSelectedTrack(track);
    setInputValue(track.url);
  };

  const handleAction = async (action: "queue" | "play_now", overrideTrack?: SearchResultItem) => {
    const track = overrideTrack || selectedTrack;
    const urlToUse = track?.url || (isDirectUrl(inputValue) ? inputValue.trim() : "");

    if (!urlToUse && !track?.id) {
      setError("Please search for a track or enter a valid URL first.");
      return;
    }

    setActionType(action);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/radio/queue-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlToUse,
          track_id: track?.id,
          title: track?.title,
          artist: track?.artist,
          duration_sec: track?.duration_sec,
          thumbnail_url: track?.thumbnail_url,
          voice_preference: voicePreference,
          include_intro_drop: includeIntroDrop,
          play_now: action === "play_now",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      setResult({
        artist: data.artist || track?.artist || "Goodlife Ingest",
        title: data.title || track?.title || "Track Added",
        drop_script: data.drop_script || "",
        queued: Boolean(data.queued_as_up_next),
        played_now: Boolean(data.played_now),
      });

      // Clear search states on success
      setInputValue("");
      setSelectedTrack(null);
      setSearchResults([]);
      setHasSearched(false);
    } catch (err: any) {
      setError(err.message || "Failed to insert track into radio queue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-4 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-[#DFBB7D] text-[#16181D] font-bold">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase text-white">
              QUICK INSERT TRACK · ON THE FLY
            </h3>
            <p className="text-[11px] font-mono text-[#DFBB7D]">
              Search song name or paste link · Auto-master Sheng intro · Queue or Cut
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-2.5 bg-[#E84855]/20 border border-[#E84855] text-red-200 font-mono text-xs flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-white/60 hover:text-white">
            ×
          </button>
        </div>
      )}

      {result && (
        <div className="p-3 bg-[#10B981]/20 border border-[#10B981] text-emerald-200 font-mono text-xs space-y-1.5">
          <div className="flex items-center space-x-1.5 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {result.played_now
                ? "⚡ Track is now playing live on broadcast!"
                : "✓ Track successfully queued as UP NEXT!"}
            </span>
          </div>
          <div className="bg-black/30 p-2 border border-emerald-500/30 text-[11px]">
            <p>
              <span className="text-emerald-400 font-bold">Track:</span> {result.artist} - {formatTrackTitle(result.title)}
            </p>
            {result.drop_script && (
              <p className="text-white/80 mt-1 italic">&ldquo;{result.drop_script}&rdquo;</p>
            )}
          </div>
        </div>
      )}

      {/* Input Form */}
      <div className="space-y-3 font-mono text-xs">
        <div>
          <label className="block text-[11px] text-white/60 uppercase tracking-wider mb-1">
            Search Track / Artist Name OR Paste Media URL:
          </label>
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (isDirectUrl(e.target.value)) {
                    setSelectedTrack({
                      video_id: "direct_url",
                      title: "Direct Media Link",
                      artist: "Web Audio Stream",
                      duration_sec: 0,
                      thumbnail_url: "",
                      source: "youtube",
                      url: e.target.value.trim(),
                    });
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type 'Kanye', 'Banyana', or paste https://..."
                className="w-full bg-[#1A1D24] text-white p-2.5 pl-8 border border-white/20 focus:border-[#DFBB7D] focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-3.5" />
              {inputValue && (
                <button
                  type="button"
                  onClick={() => {
                    setInputValue("");
                    setSelectedTrack(null);
                    setSearchResults([]);
                    setHasSearched(false);
                  }}
                  className="absolute right-2.5 top-3 text-white/40 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleSearch()}
              disabled={searching || !inputValue.trim()}
              className="px-3.5 py-2.5 bg-[#DFBB7D] hover:bg-[#F5C842] disabled:opacity-50 text-[#16181D] font-bold border border-[#16181D] flex items-center space-x-1 shadow-[2px_2px_0px_#16181D]"
            >
              {searching ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>SEARCHING...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>SEARCH</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Selected Track Banner */}
        {selectedTrack && (
          <div className="p-2.5 bg-black/40 border border-[#DFBB7D]/50 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              {selectedTrack.thumbnail_url ? (
                <img
                  src={selectedTrack.thumbnail_url}
                  alt={selectedTrack.title}
                  className="w-10 h-10 object-cover border border-white/10 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 bg-[#DFBB7D]/20 text-[#DFBB7D] flex items-center justify-center border border-[#DFBB7D]/30 shrink-0 font-bold">
                  <Music2 className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-[9px] uppercase px-1 py-0.5 bg-[#DFBB7D] text-[#16181D] font-bold">
                    {selectedTrack.source === "library" ? "STATION LIBRARY" : "ONLINE AUDIO"}
                  </span>
                  {selectedTrack.duration_sec > 0 && (
                    <span className="text-[10px] text-white/50">
                      {formatDuration(selectedTrack.duration_sec)}
                    </span>
                  )}
                </div>
                <p className="text-white font-bold truncate text-[11px] mt-0.5">
                  {formatTrackTitle(selectedTrack.title)}
                </p>
                <p className="text-white/60 text-[10px] truncate">{selectedTrack.artist}</p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedTrack(null)}
                className="text-[10px] text-white/50 hover:text-white underline px-1"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Search Results List */}
        {searchResults.length > 0 && (
          <div className="border border-white/10 bg-black/30 p-2 space-y-1.5 max-h-56 overflow-y-auto">
            <div className="flex items-center justify-between text-[10px] text-white/40 pb-1 border-b border-white/10">
              <span>FOUND {searchResults.length} RESULTS:</span>
              <span>CLICK TO SELECT OR INSERT</span>
            </div>
            {searchResults.map((item, idx) => {
              const isSelected = selectedTrack?.video_id === item.video_id;
              return (
                <div
                  key={`${item.video_id}_${idx}`}
                  onClick={() => handleSelectTrack(item)}
                  className={`p-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors border ${
                    isSelected
                      ? "bg-[#DFBB7D]/20 border-[#DFBB7D]"
                      : "bg-white/5 hover:bg-white/10 border-white/5"
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    {item.thumbnail_url ? (
                      <img
                        src={item.thumbnail_url}
                        alt=""
                        className="w-8 h-8 object-cover shrink-0 border border-white/10"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-white/10 text-white/60 flex items-center justify-center shrink-0">
                        <Music2 className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">
                        {formatTrackTitle(item.title)}
                      </p>
                      <p className="text-[10px] text-white/50 truncate flex items-center space-x-1.5">
                        <span>{item.artist}</span>
                        {item.duration_sec > 0 && (
                          <span>· {formatDuration(item.duration_sec)}</span>
                        )}
                        <span className="text-[9px] uppercase px-1 bg-white/10 text-[#DFBB7D]">
                          {item.source}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      title="Queue as Up Next"
                      disabled={loading}
                      onClick={() => handleAction("queue", item)}
                      className="p-1 px-1.5 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold text-[10px] flex items-center space-x-1"
                    >
                      <ListPlus className="w-3 h-3" />
                      <span>QUEUE</span>
                    </button>
                    <button
                      type="button"
                      title="Play Now Live"
                      disabled={loading}
                      onClick={() => handleAction("play_now", item)}
                      className="p-1 px-1.5 bg-[#E84855] hover:bg-red-600 text-white font-bold text-[10px] flex items-center space-x-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>CUT</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasSearched && searchResults.length === 0 && !searching && (
          <div className="p-3 text-center text-white/50 text-[11px] border border-dashed border-white/20">
            No audio tracks found matching &ldquo;{inputValue}&rdquo;. Try another name or paste a direct YouTube link.
          </div>
        )}

        {/* Options Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
          <label className="flex items-center space-x-2 cursor-pointer select-none text-white/80">
            <input
              type="checkbox"
              checked={includeIntroDrop}
              onChange={(e) => setIncludeIntroDrop(e.target.checked)}
              className="accent-[#DFBB7D] w-3.5 h-3.5"
            />
            <span>Auto-generate Sheng Intro Drop (-12dB Ducking)</span>
          </label>

          <div className="flex items-center space-x-1 text-white/60">
            <span>Voice:</span>
            <button
              type="button"
              onClick={() => setVoicePreference("male")}
              className={`px-2 py-0.5 border ${
                voicePreference === "male"
                  ? "bg-[#DFBB7D] text-[#16181D] font-bold border-[#DFBB7D]"
                  : "bg-white/5 text-white/60 border-white/10"
              }`}
            >
              Male (Shax)
            </button>
            <button
              type="button"
              onClick={() => setVoicePreference("female")}
              className={`px-2 py-0.5 border ${
                voicePreference === "female"
                  ? "bg-[#DFBB7D] text-[#16181D] font-bold border-[#DFBB7D]"
                  : "bg-white/5 text-white/60 border-white/10"
              }`}
            >
              Female (Amina)
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => handleAction("queue")}
            disabled={loading || (!selectedTrack && !isDirectUrl(inputValue))}
            className="px-4 py-2 bg-[#DFBB7D] hover:bg-[#F5C842] disabled:opacity-40 text-[#16181D] font-bold border border-[#16181D] flex items-center space-x-1.5 shadow-[2px_2px_0px_#16181D]"
          >
            <Music2 className="w-3.5 h-3.5" />
            <span>{loading && actionType === "queue" ? "INGESTING..." : "▶ QUEUE AS UP NEXT"}</span>
          </button>

          <button
            type="button"
            onClick={() => handleAction("play_now")}
            disabled={loading || (!selectedTrack && !isDirectUrl(inputValue))}
            className="px-4 py-2 bg-[#E84855] hover:bg-red-600 disabled:opacity-40 text-white font-bold border border-white/20 flex items-center space-x-1.5 shadow-[2px_2px_0px_#DFBB7D]"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>{loading && actionType === "play_now" ? "INGESTING..." : "⚡ PLAY NOW (CROSSFADE)"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

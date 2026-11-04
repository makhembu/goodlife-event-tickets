"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Search,
  ExternalLink,
  Plus,
  CheckCircle2,
  AlertCircle,
  Radio,
  Music2,
  Zap,
  Layers,
  ArrowRight,
  X,
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

interface PlaylistOption {
  id: number;
  name: string;
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LibraryIngestDock({
  onTrackAdded,
  showBanner,
}: {
  onTrackAdded?: () => void;
  showBanner?: (msg: string, type: "success" | "error") => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [targetPlaylistId, setTargetPlaylistId] = useState<number | "">("");
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [voicePreference, setVoicePreference] = useState<"male" | "female">("male");
  const [includeIntroDrop, setIncludeIntroDrop] = useState(true);

  // Search state
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<SearchResultItem | null>(null);

  // Ingest state
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/admin/radio/playlists")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.playlists)) {
          setPlaylists(data.playlists.map((p: any) => ({ id: p.id, name: p.name })));
        }
      })
      .catch(() => {});
  }, []);

  const isDirectUrl = (str: string) => /^https?:\/\//i.test(str.trim());

  const handleSearch = async (queryToSearch?: string) => {
    const q = (queryToSearch ?? inputValue).trim();
    if (!q) return;

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
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSuccess(false);

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
      setErrorMessage(err.message || "Failed to search tracks.");
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

  const handleIngest = async () => {
    const track = selectedTrack;
    const urlToUse = track?.url || (isDirectUrl(inputValue) ? inputValue.trim() : "");

    if (!urlToUse && !track?.id) {
      setErrorMessage("Please select a track or enter a valid URL first.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setStatusMessage("⚡ Initiating audio ingest & Cloudflare R2 broadcast mirror (-14 LUFS)...");
    setIsSuccess(false);

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
          playlist_id: typeof targetPlaylistId === "number" ? targetPlaylistId : undefined,
          play_now: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      if (data.status === "success") {
        setIsSuccess(true);
        setStatusMessage(`✓ Added "${data.title || "Track"}" to radio library!`);
        if (showBanner) showBanner(`Added "${data.title}" to library!`, "success");
        if (onTrackAdded) onTrackAdded();
        setLoading(false);
        return;
      }

      if (data.status === "ingesting") {
        setStatusMessage(data.message || "Downloading stream & mastering loudness (-14 LUFS)...");
        const targetVideoId = data.video_id;
        const targetTrackId = data.track_id;
        let attempts = 0;

        const pollTimer = setInterval(async () => {
          attempts++;
          if (attempts > 30) {
            clearInterval(pollTimer);
            setLoading(false);
            setErrorMessage("Ingestion timed out in background. Check library table in a moment.");
            return;
          }

          try {
            const pollParam = targetVideoId ? `video_id=${targetVideoId}` : `track_id=${targetTrackId}`;
            const pollRes = await fetch(`/api/admin/radio/queue-next?${pollParam}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.is_ready) {
                clearInterval(pollTimer);
                setLoading(false);
                setIsSuccess(true);
                setStatusMessage("✓ Broadcast audio mastered & ready on Cloudflare R2!");
                if (showBanner) showBanner("✓ Track mastered & added to library!", "success");
                if (onTrackAdded) onTrackAdded();
                setInputValue("");
                setSelectedTrack(null);
                setSearchResults([]);
              }
            }
          } catch {}
        }, 3000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to add track to library.");
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-5 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-3 gap-2">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-[#DFBB7D]/10 border border-[#DFBB7D]/30 flex items-center justify-center text-[#DFBB7D]">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-mono text-xs font-black uppercase text-white tracking-wider flex items-center gap-2">
              QUICK INSERT TRACK · ON THE FLY
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#DFBB7D] text-[#16181D] font-mono font-bold">
                STREAM & MASTER
              </span>
            </h3>
            <p className="text-[11px] text-white/50 font-mono">
              Search track name or paste link · Auto-master Sheng intro · Add to Library & Playlist
            </p>
          </div>
        </div>
      </div>

      {/* Input Row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search Track / Artist Name OR Paste Media URL..."
            className="w-full bg-[#1A1D24] border border-white/20 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D] transition-colors pr-8"
          />
          {inputValue && (
            <button
              onClick={() => {
                setInputValue("");
                setSelectedTrack(null);
                setSearchResults([]);
                setHasSearched(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => handleSearch()}
          disabled={searching || !inputValue.trim()}
          className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-mono font-bold uppercase rounded-xl transition-all border border-white/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Search className="w-3.5 h-3.5" />
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Search Results Dropdown List */}
      {hasSearched && searchResults.length > 0 && (
        <div className="p-2 bg-[#1A1D24] border border-white/15 rounded-xl max-h-48 overflow-y-auto space-y-1">
          <div className="text-[10px] font-mono text-white/40 px-2 py-0.5 uppercase tracking-wider">
            Search Matches ({searchResults.length})
          </div>
          {searchResults.map((item) => {
            const isSelected = selectedTrack?.video_id === item.video_id;
            return (
              <div
                key={item.video_id}
                onClick={() => {
                  setSelectedTrack(item);
                  setInputValue(item.url);
                }}
                className={`p-2 rounded-lg cursor-pointer flex items-center justify-between text-xs font-mono transition-all ${
                  isSelected
                    ? "bg-[#DFBB7D]/20 text-[#DFBB7D] border border-[#DFBB7D]/40"
                    : "hover:bg-white/5 text-white/80"
                }`}
              >
                <div className="truncate flex-1 pr-3">
                  <span className="font-bold">{formatTrackTitle(item.title)}</span>
                  <span className="text-white/40 ml-2">by {item.artist}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/50 shrink-0">
                  <span>{formatDuration(item.duration_sec)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] uppercase">
                    {item.source}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Track Details & Settings Bar */}
      {selectedTrack && (
        <div className="p-3 bg-[#1A1D24] border border-[#DFBB7D]/30 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-black/40 overflow-hidden shrink-0 flex items-center justify-center">
              {selectedTrack.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedTrack.thumbnail_url}
                  alt={selectedTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music2 className="w-5 h-5 text-white/40" />
              )}
            </div>
            <div>
              <div className="font-bold text-white truncate max-w-xs sm:max-w-md">
                {formatTrackTitle(selectedTrack.title)}
              </div>
              <div className="text-[11px] text-[#DFBB7D]">
                {selectedTrack.artist} • {formatDuration(selectedTrack.duration_sec)}
              </div>
            </div>
          </div>

          {/* Configuration controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Target Playlist Selector */}
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-white/50" />
              <select
                value={targetPlaylistId}
                onChange={(e) => setTargetPlaylistId(e.target.value ? Number(e.target.value) : "")}
                className="bg-[#16181D] border border-white/20 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#DFBB7D]"
              >
                <option value="">-- No Playlist (Library Only) --</option>
                {playlists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sheng Voice Intro Toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-white/70 select-none">
              <input
                type="checkbox"
                checked={includeIntroDrop}
                onChange={(e) => setIncludeIntroDrop(e.target.checked)}
                className="accent-[#DFBB7D] rounded"
              />
              <span>Sheng Intro Drop</span>
            </label>

            {includeIntroDrop && (
              <select
                value={voicePreference}
                onChange={(e) => setVoicePreference(e.target.value as "male" | "female")}
                className="bg-[#16181D] border border-white/20 rounded-lg px-2 py-1 text-[11px] font-mono text-white"
              >
                <option value="male">Bwana / Sudi (Male)</option>
                <option value="female">Zari / Malkia (Female)</option>
              </select>
            )}

            {/* Ingest Action Button */}
            <button
              onClick={handleIngest}
              disabled={loading}
              className="px-4 py-2 bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] font-mono font-black uppercase text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-[2px_2px_0px_#000] disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              {loading ? "Mastering..." : "Add to Library & Master"}
            </button>
          </div>
        </div>
      )}

      {/* Status & Alerts */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-mono flex items-center gap-2 ${
            isSuccess
              ? "bg-emerald-950/40 border border-emerald-500/40 text-emerald-300"
              : "bg-amber-950/40 border border-amber-500/40 text-amber-300 animate-pulse"
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-xl text-xs font-mono bg-red-950/40 border border-red-500/40 text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}

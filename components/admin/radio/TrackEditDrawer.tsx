"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Save, Trash2, Music2, Disc, Sliders, Activity, Image as ImageIcon, Check, AlertCircle } from "lucide-react";
import { RadioSet } from "@/lib/radio/types";

export interface TrackEditDrawerProps {
  track: RadioSet | null;
  isOpen: boolean;
  onClose: () => void;
  onTrackUpdated: (updatedTrack: RadioSet) => void;
  onTrackDeleted: (trackId: number) => void;
}

const GENRES = [
  "Afro House",
  "Amapiano",
  "Hip-Hop",
  "Rock",
  "Reggae",
  "Pop",
  "Gengetone",
  "Old School Hip Hop",
  "Chillout / Sundowner",
  "Electronic / Dance",
];

const CAMELOT_KEYS = [
  "1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B",
  "5A", "5B", "6A", "6B", "7A", "7B", "8A", "8B",
  "9A", "9B", "10A", "10B", "11A", "11B", "12A", "12B",
];

export default function TrackEditDrawer({
  track,
  isOpen,
  onClose,
  onTrackUpdated,
  onTrackDeleted,
}: TrackEditDrawerProps) {
  const [title, setTitle] = useState("");
  const [djName, setDjName] = useState("");
  const [genre, setGenre] = useState("Afro House");
  const [coverUrl, setCoverUrl] = useState("");
  const [bpm, setBpm] = useState<string>("");
  const [musicalKey, setMusicalKey] = useState<string>("");
  const [isFullSet, setIsFullSet] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Tap-Tempo State
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const tapResetTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (track) {
      setTitle(track.title || "");
      setDjName(track.dj_name || "");
      setGenre(track.genre || "Afro House");
      setCoverUrl(track.cover_url || "");
      setBpm(track.bpm ? String(track.bpm) : "");
      setMusicalKey(track.musical_key || "");
      setIsFullSet(Boolean(track.is_full_set));
      setIsActive(track.is_active !== false);
      setFeedback(null);
    }
  }, [track]);

  if (!isOpen || !track) return null;

  const showFeedback = (text: string, type: "success" | "error") => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Tap-tempo BPM detection tool
  const handleTapTempo = () => {
    const now = performance.now();
    if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);

    setTapTimes((prev) => {
      // Discard taps older than 2.5 seconds
      const filtered = prev.filter((t) => now - t < 2500);
      const next = [...filtered, now];

      if (next.length >= 2) {
        // Calculate average intervals
        const intervals: number[] = [];
        for (let i = 1; i < next.length; i++) {
          intervals.push(next[i] - next[i - 1]);
        }
        const avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const calculatedBpm = Math.round(60000 / avgIntervalMs);
        if (calculatedBpm >= 40 && calculatedBpm <= 220) {
          setBpm(String(calculatedBpm));
        }
      }
      return next;
    });

    // Reset tap buffer after 2.5s of inactivity
    tapResetTimerRef.current = setTimeout(() => {
      setTapTimes([]);
    }, 2500);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      const parsedBpm = bpm.trim() ? Number(bpm.trim()) : null;
      if (parsedBpm !== null && (isNaN(parsedBpm) || parsedBpm < 40 || parsedBpm > 250)) {
        showFeedback("BPM must be between 40 and 250", "error");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/admin/radio/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: track.id,
          title: title.trim(),
          dj_name: djName.trim(),
          genre: genre.trim(),
          cover_url: coverUrl.trim(),
          bpm: parsedBpm,
          musical_key: musicalKey.trim() || null,
          is_full_set: isFullSet,
          is_active: isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update track");
      }

      showFeedback("Track updated successfully!", "success");
      onTrackUpdated(data.item);
    } catch (err: any) {
      showFeedback(err.message || "Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${track.title}" from the station library?`)) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/radio/library?id=${track.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to delete track");
      }

      onTrackDeleted(track.id);
      onClose();
    } catch (err: any) {
      showFeedback(err.message || "Failed to delete track", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs transition-opacity">
      <div className="w-full max-w-lg h-full bg-[#16181D] border-l-2 border-[#DFBB7D] text-[#FBF9F6] shadow-[-6px_0px_20px_rgba(0,0,0,0.8)] flex flex-col font-mono">
        {/* Header */}
        <div className="p-4 bg-[#121316] border-b-2 border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-[#DFBB7D]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              TRACK INSPECTOR · CONTROL DECK
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-white/50 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 text-xs flex items-center gap-2 border-b ${
              feedback.type === "success"
                ? "bg-emerald-950/80 text-emerald-300 border-emerald-700"
                : "bg-red-950/80 text-red-300 border-red-700"
            }`}
          >
            {feedback.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Cover Art Preview & Custom URL */}
          <div className="bg-[#1A1D24] border border-white/10 p-3 flex gap-3 items-center">
            <div className="w-16 h-16 bg-black border border-white/20 shrink-0 overflow-hidden relative">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/30">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <label className="text-[10px] uppercase text-white/60 block">Cover Artwork URL</label>
              <input
                type="text"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://... image link"
                className="w-full bg-[#121316] text-white p-1.5 border border-white/20 text-[11px]"
              />
              <div className="flex gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={() => setCoverUrl("/flyer.png")}
                  className="text-[#DFBB7D] hover:underline"
                >
                  Use Default Flyer
                </button>
                <button
                  type="button"
                  onClick={() => setCoverUrl("")}
                  className="text-white/40 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[11px] uppercase text-white/70 block mb-1">Track Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#1A1D24] text-white p-2 border border-white/20 text-xs font-bold"
            />
          </div>

          {/* Artist / DJ */}
          <div>
            <label className="text-[11px] uppercase text-white/70 block mb-1">DJ / Artist Name</label>
            <input
              type="text"
              value={djName}
              onChange={(e) => setDjName(e.target.value)}
              className="w-full bg-[#1A1D24] text-white p-2 border border-white/20 text-xs"
            />
          </div>

          {/* Genre & Set Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase text-white/70 block mb-1">Genre</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full bg-[#1A1D24] text-white p-2 border border-white/20 text-xs"
              >
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] uppercase text-white/70 block mb-1">Set Format</label>
              <button
                type="button"
                onClick={() => setIsFullSet(!isFullSet)}
                className={`w-full p-2 border text-xs font-bold uppercase transition-all ${
                  isFullSet
                    ? "bg-purple-600 text-white border-purple-400"
                    : "bg-[#1A1D24] text-white/60 border-white/20"
                }`}
              >
                {isFullSet ? "Full DJ Mix" : "Single Track"}
              </button>
            </div>
          </div>

          {/* BPM & Tap-Tempo */}
          <div className="bg-[#1A1D24] border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase text-[#DFBB7D] font-bold flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Tempo / BPM
              </label>
              <span className="text-[10px] text-white/50">40 – 250 BPM</span>
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                min="40"
                max="250"
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
                placeholder="e.g. 124"
                className="w-24 bg-[#121316] text-white p-2 border border-white/20 text-center font-bold text-sm"
              />
              <button
                type="button"
                onClick={handleTapTempo}
                className="flex-1 bg-[#DFBB7D] hover:bg-[#F5C842] active:scale-98 text-[#16181D] font-bold p-2 border border-[#16181D] shadow-[2px_2px_0px_#16181D] text-xs uppercase"
              >
                🥁 Tap Tempo {tapTimes.length > 1 ? `(${tapTimes.length})` : ""}
              </button>
            </div>
            <p className="text-[10px] text-white/50">
              Tap the button 4+ times to the beat of the song to calculate BPM.
            </p>
          </div>

          {/* Harmonic Musical Key */}
          <div className="bg-[#1A1D24] border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase text-[#DFBB7D] font-bold flex items-center gap-1.5">
                <Disc className="w-3.5 h-3.5" />
                Harmonic Key (Camelot Wheel)
              </label>
              <button
                type="button"
                onClick={() => setMusicalKey("")}
                className="text-[10px] text-white/40 hover:underline"
              >
                Clear Key
              </button>
            </div>

            <select
              value={musicalKey}
              onChange={(e) => setMusicalKey(e.target.value)}
              className="w-full bg-[#121316] text-white p-2 border border-white/20 text-xs font-bold"
            >
              <option value="">-- No Key Assigned --</option>
              {CAMELOT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k} (Harmonic Mixing)
                </option>
              ))}
            </select>
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between p-3 bg-[#1A1D24] border border-white/10">
            <div>
              <span className="text-xs text-white font-bold block">Station Rotation Status</span>
              <span className="text-[10px] text-white/50">
                {isActive ? "Track is active in 24/7 station rotation" : "Track is benched (archived from air)"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`px-3 py-1.5 text-xs font-bold uppercase border ${
                isActive
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-red-600/30 text-red-300 border-red-500/50"
              }`}
            >
              {isActive ? "Active" : "Benched"}
            </button>
          </div>

          {/* Audio Link Info */}
          <div className="p-2.5 bg-black/40 border border-white/5 text-[10px] text-white/60 space-y-1">
            <div className="flex justify-between">
              <span>Track ID: #{track.id}</span>
              <span>Duration: {track.duration || `${track.duration_sec || 0}s`}</span>
            </div>
            <p className="truncate text-white/40">URL: {track.audio_url}</p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#121316] border-t-2 border-white/10 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-2 bg-red-600/20 hover:bg-red-600 text-red-200 hover:text-white border border-red-500/40 text-xs font-bold uppercase flex items-center gap-1.5 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? "Deleting..." : "Delete"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold uppercase"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold text-xs uppercase border border-[#16181D] shadow-[2px_2px_0px_#16181D] flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

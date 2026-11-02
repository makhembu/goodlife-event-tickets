"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  X,
  Radio,
  Clock,
  Music2,
  RefreshCw,
  Sliders,
  ChevronDown,
} from "lucide-react";
import { PlaylistTrack, PlaylistSummary } from "./PlaylistManagerPanel";

interface HarmonizeSummary {
  totalTracks: number;
  harmonizedCount: number;
  unindexedCount: number;
  fullSetCount: number;
  keyCompatibilityPercent: number;
  clashCount: number;
}

interface TransitionDetail {
  fromTrackId: number;
  toTrackId: number;
  fromTitle: string;
  toTitle: string;
  fromKey: string;
  toKey: string;
  fromBpm: number;
  toBpm: number;
  keyRelation: "exact" | "relative" | "adjacent" | "clash";
  bpmDeltaPercent: number;
  isCompatible: boolean;
}

interface HarmonizeModalProps {
  playlist: PlaylistSummary;
  tracks: PlaylistTrack[];
  isOpen: boolean;
  onClose: () => void;
  onApplied: () => void;
}

export default function HarmonizeModal({
  playlist,
  tracks,
  isOpen,
  onClose,
  onApplied,
}: HarmonizeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<HarmonizeSummary | null>(null);
  const [transitions, setTransitions] = useState<TransitionDetail[]>([]);
  const [proposedOrder, setProposedOrder] = useState<number[]>([]);
  const [currentOrder, setCurrentOrder] = useState<number[]>([]);
  const [unindexedTracks, setUnindexedTracks] = useState<any[]>([]);
  const [fullSetAnchors, setFullSetAnchors] = useState<any[]>([]);
  const [selectedOpenerId, setSelectedOpenerId] = useState<number | null>(null);
  // Default unchecked so admins never accidentally reset broadcast clock on apply
  const [reanchorBroadcast, setReanchorBroadcast] = useState(false);
  const [applying, setApplying] = useState(false);

  // Eligible opener candidates (indexed tracks only)
  const indexedTracks = tracks.filter(
    (t) => t.bpm && t.musical_key && /^(1[0-2]|[1-9])[AB]$/i.test(t.musical_key.trim())
  );

  const fetchHarmonizePreview = async (openerId?: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/radio/playlists/${playlist.id}/harmonize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openerTrackId: openerId ?? selectedOpenerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate harmonic sequence preview");
      }
      setSummary(data.summary);
      setTransitions(data.transitions || []);
      setProposedOrder(data.proposedOrder || []);
      setCurrentOrder(data.currentOrder || []);
      setUnindexedTracks(data.unindexedTracks || []);
      setFullSetAnchors(data.fullSetAnchors || []);
      if (!selectedOpenerId && data.openerTrackId) {
        setSelectedOpenerId(data.openerTrackId);
      }
    } catch (err: any) {
      setError(err.message || "Failed to preview harmonic ordering");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedOpenerId(indexedTracks[0]?.id || null);
      fetchHarmonizePreview(indexedTracks[0]?.id || null);
    }
  }, [isOpen, playlist.id]);

  const handleApply = async () => {
    if (proposedOrder.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/radio/playlists/${playlist.id}/harmonize/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedOrder,
          expectedPreviousOrder: currentOrder,
          reanchorBroadcast,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to apply harmonized order");
      }
      onApplied();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to apply new order");
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  // Track map for fast rendering
  const trackMap = new Map<number, PlaylistTrack>();
  tracks.forEach((t) => trackMap.set(t.id, t));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#DFBB7D] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[8px_8px_0px_#000]">
        
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#1A1D24]">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-5 h-5 text-[#DFBB7D]" />
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                  HARMONIZE TRACKLIST · {playlist.name}
                </h3>
                {playlist.is_broadcast_active && (
                  <span className="px-2 py-0.5 bg-[#E84855] text-white font-mono text-[9px] font-bold uppercase tracking-wider animate-pulse flex items-center space-x-1">
                    <Radio className="w-2.5 h-2.5 inline" />
                    <span>ON AIR</span>
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] text-white/60">
                Order tracks by Camelot key wheel adjacency, tempo envelope (±6%), and artist separation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-white/50 hover:text-white border border-white/10 hover:border-white/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 font-mono text-xs">
          
          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-[#E84855]/20 border border-[#E84855] text-red-200 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-[#E84855] shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* On-Air Warning */}
          {playlist.is_broadcast_active && (
            <div className="p-3 bg-[#DFBB7D]/10 border-2 border-[#DFBB7D] text-[#DFBB7D] space-y-2">
              <div className="flex items-center space-x-2 font-bold text-[11px]">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#DFBB7D]" />
                <span>THIS PLAYLIST IS CURRENTLY BROADCASTING LIVE ON AIR</span>
              </div>
              <p className="text-[10px] text-white/80 leading-relaxed">
                Reordering changes the virtual schedule for all live listeners. Check the box below to re-anchor playback to Track 1 immediately upon saving to avoid an abrupt mid-song jump.
              </p>
              <label className="flex items-center space-x-2 text-[11px] font-bold text-white cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={reanchorBroadcast}
                  onChange={(e) => setReanchorBroadcast(e.target.checked)}
                  className="accent-[#DFBB7D] w-4 h-4"
                />
                <span>Re-anchor broadcast clock to Track #1 upon saving (Recommended)</span>
              </label>
            </div>
          )}

          {/* Controls Bar: Opener track picker & re-calculate */}
          <div className="p-3 bg-[#1A1D24] border border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <span className="text-[11px] text-white/60">OPENER TRACK:</span>
              <select
                value={selectedOpenerId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSelectedOpenerId(id);
                  fetchHarmonizePreview(id);
                }}
                disabled={loading || indexedTracks.length === 0}
                className="bg-[#16181D] text-white text-[11px] p-2 border border-white/20 focus:border-[#DFBB7D] outline-none max-w-xs truncate"
              >
                {indexedTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.musical_key || "?"} · {t.bpm || "?"} BPM)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => fetchHarmonizePreview(selectedOpenerId)}
              disabled={loading}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-[11px] flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Recalculate</span>
            </button>
          </div>

          {/* Metrics Summary Strip */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-[#1A1D24] border border-white/10">
                <div className="text-[10px] text-white/50 uppercase">Key Compatibility</div>
                <div className="text-xl font-bold text-[#10B981] mt-0.5">
                  {summary.keyCompatibilityPercent}%
                </div>
                <div className="text-[9px] text-white/40">Harmonic transitions</div>
              </div>
              <div className="p-3 bg-[#1A1D24] border border-white/10">
                <div className="text-[10px] text-white/50 uppercase">Harmonized Tracks</div>
                <div className="text-xl font-bold text-[#DFBB7D] mt-0.5">
                  {summary.harmonizedCount} / {summary.totalTracks}
                </div>
                <div className="text-[9px] text-white/40">Sequenced by Camelot/BPM</div>
              </div>
              <div className="p-3 bg-[#1A1D24] border border-white/10">
                <div className="text-[10px] text-white/50 uppercase">Key Clashes</div>
                <div className={`text-xl font-bold mt-0.5 ${summary.clashCount > 0 ? "text-[#E84855]" : "text-emerald-400"}`}>
                  {summary.clashCount}
                </div>
                <div className="text-[9px] text-white/40">Transitions &gt; 1 step</div>
              </div>
              <div className="p-3 bg-[#1A1D24] border border-white/10">
                <div className="text-[10px] text-white/50 uppercase">Pending Metadata</div>
                <div className={`text-xl font-bold mt-0.5 ${summary.unindexedCount > 0 ? "text-amber-400" : "text-white/60"}`}>
                  {summary.unindexedCount}
                </div>
                <div className="text-[9px] text-white/40">Appended at end</div>
              </div>
            </div>
          )}

          {/* Side-by-Side Flow Comparison */}
          {loading ? (
            <div className="p-12 text-center text-white/40 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#DFBB7D]" />
              <span>Analyzing harmonic wheel transitions & tempo contours...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Left Column: Current Sequence */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-white/10">
                  <span className="font-bold text-white/70 uppercase text-[11px]">Current Track Order</span>
                  <span className="text-[10px] text-white/40">{currentOrder.length} tracks</span>
                </div>
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {currentOrder.map((trackId, idx) => {
                    const t = trackMap.get(trackId);
                    if (!t) return null;
                    return (
                      <div
                        key={`curr-${trackId}-${idx}`}
                        className="p-2 bg-white/5 border border-white/10 flex items-center justify-between text-[11px]"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="text-white/30 text-[10px] w-5 text-right font-mono">
                            {idx + 1}
                          </span>
                          <span className="text-white truncate font-medium">{t.title}</span>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0 text-[10px]">
                          {t.musical_key ? (
                            <span className="px-1.5 py-0.5 bg-white/10 text-white font-bold">
                              {t.musical_key}
                            </span>
                          ) : (
                            <span className="text-white/30">--</span>
                          )}
                          <span className="text-white/40">{t.bpm ? `${t.bpm}` : "—"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Harmonized Sequence */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-white/10">
                  <span className="font-bold text-[#DFBB7D] uppercase text-[11px]">Proposed Harmonized Flow</span>
                  <span className="text-[10px] text-[#DFBB7D]/80">Optimal DJ Sequence</span>
                </div>
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {proposedOrder.map((trackId, idx) => {
                    const t = trackMap.get(trackId);
                    if (!t) return null;
                    const transition = idx > 0 ? transitions[idx - 1] : null;

                    return (
                      <div key={`prop-${trackId}-${idx}`} className="space-y-1">
                        {/* Transition Pill Connector */}
                        {transition && (
                          <div className="flex items-center justify-center space-x-2 py-0.5 font-mono text-[9px]">
                            {transition.keyRelation === "exact" && (
                              <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Exact Key ({transition.fromKey} → {transition.toKey})
                              </span>
                            )}
                            {transition.keyRelation === "relative" && (
                              <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                Relative Key ({transition.fromKey} → {transition.toKey})
                              </span>
                            )}
                            {transition.keyRelation === "adjacent" && (
                              <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                +1 Step ({transition.fromKey} → {transition.toKey})
                              </span>
                            )}
                            {transition.keyRelation === "clash" && (
                              <span className="px-1.5 py-0.2 bg-red-500/20 text-red-300 border border-red-500/30 font-bold">
                                Clash ({transition.fromKey} → {transition.toKey})
                              </span>
                            )}
                            <span className="text-white/40">
                              {transition.bpmDeltaPercent >= 0 ? `+${transition.bpmDeltaPercent}%` : `${transition.bpmDeltaPercent}%`} BPM
                            </span>
                          </div>
                        )}

                        {/* Track card */}
                        <div
                          className={`p-2 border flex items-center justify-between text-[11px] ${
                            idx === 0
                              ? "bg-[#DFBB7D]/10 border-[#DFBB7D] text-white"
                              : "bg-white/5 border-white/10 text-white"
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span className="text-[#DFBB7D] text-[10px] w-5 text-right font-mono font-bold">
                              {idx + 1}
                            </span>
                            <span className="truncate font-medium">{t.title}</span>
                            {idx === 0 && (
                              <span className="px-1 py-0.2 bg-[#DFBB7D] text-[#16181D] font-bold text-[8px] uppercase">
                                OPENER
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 shrink-0 text-[10px]">
                            {t.musical_key ? (
                              <span className="px-1.5 py-0.5 bg-[#DFBB7D]/20 text-[#DFBB7D] font-bold border border-[#DFBB7D]/40">
                                {t.musical_key}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300">Unindexed</span>
                            )}
                            <span className="text-white/60">{t.bpm ? `${t.bpm} BPM` : "—"}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* Unindexed Tracks Warning Box */}
          {unindexedTracks.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/40 text-amber-200 space-y-1">
              <div className="font-bold text-[11px] flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{unindexedTracks.length} Unindexed Tracks Appended At End</span>
              </div>
              <p className="text-[10px] text-white/70">
                These tracks are missing verified Camelot key or BPM tags and are placed safely at the end of the playlist without disrupting harmonic chains. Tag them in the station library to include them in automatic sequencing.
              </p>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-[#1A1D24] flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={applying}
            className="px-4 py-2 bg-transparent hover:bg-white/5 text-white/70 border border-white/20 font-bold"
          >
            Cancel
          </button>

          <button
            onClick={handleApply}
            disabled={applying || loading || proposedOrder.length === 0}
            className="px-6 py-2 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold border border-[#16181D] shadow-[2px_2px_0px_#16181D] flex items-center space-x-2"
          >
            {applying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>SAVING ORDER...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>APPLY NEW ORDER</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

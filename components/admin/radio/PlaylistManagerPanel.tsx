"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Layers,
  Radio,
  Plus,
  Play,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Clock,
  Music2,
  X,
  Search,
  Check,
  RadioTower,
  Sparkles,
  Undo2,
  Zap,
  Link2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { RadioSet } from "@/lib/radio/types";
import HarmonizeModal from "./HarmonizeModal";
import HarmonizeProgressModal from "./HarmonizeProgressModal";
import AutoPlaylistModal from "./AutoPlaylistModal";

export interface PlaylistIngestJob {
  job_id: string;
  playlist_id: number;
  playlist_name: string;
  total_tracks: number;
  completed_tracks: number;
  status: "queued" | "running" | "completed" | "failed";
  current_track?: string;
  error?: string;
  reconnecting?: boolean;
  source_url?: string;
}

const INGEST_STORAGE_KEY = "goodlife_playlist_ingest_jobs_v1";

export interface PlaylistSummary {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  genre: string;
  cover_url: string | null;
  is_public: boolean;
  is_broadcast_active: boolean;
  activated_at: string | null;
  track_count: number;
  total_duration_sec: number;
  ingest_job_id?: string | null;
  ingest_source_url?: string | null;
}

export interface PlaylistTrack {
  playlist_track_id: number;
  position: number;
  id: number;
  title: string;
  dj_name: string;
  audio_url: string;
  cover_url: string | null;
  duration: string;
  duration_sec: number;
  genre: string;
  bpm?: number | null;
  musical_key?: string | null;
  energy?: number | null;
  is_full_set?: boolean;
  key_source?: 'manual' | 'tunebat' | 'analyzed' | null;
}

interface PlaylistManagerPanelProps {
  library: RadioSet[];
  onRefreshLive?: () => void;
  onPlaylistsChanged?: () => void;
}

export default function PlaylistManagerPanel({
  library,
  onRefreshLive,
  onPlaylistsChanged,
}: PlaylistManagerPanelProps) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [selectedPlaylistTracks, setSelectedPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  // New playlist modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createGenre, setCreateGenre] = useState("Amapiano");
  const [createCoverUrl, setCreateCoverUrl] = useState("");
  const [createSourceUrl, setCreateSourceUrl] = useState("");
  const [previewingSource, setPreviewingSource] = useState(false);
  const [previewedSource, setPreviewedSource] = useState<{
    title: string;
    source: string;
    tracks: Array<{
      video_id: string;
      title: string;
      artist: string;
      duration_sec: number;
      thumbnail_url: string;
      url?: string;
    }>;
  } | null>(null);
  const [createSourceError, setCreateSourceError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [ingestJobs, setIngestJobs] = useState<Record<string, PlaylistIngestJob>>({});
  const ingestJobsRef = React.useRef<Record<string, PlaylistIngestJob>>({});
  ingestJobsRef.current = ingestJobs;
  const lastCompletedCountsRef = React.useRef<Record<string, number>>({});
  const [customGenres, setCustomGenres] = useState<string[]>([]);
  const [newGenreInput, setNewGenreInput] = useState("");
  const [showAddGenreInput, setShowAddGenreInput] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("goodlife_custom_genres");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setCustomGenres(parsed);
      }
    } catch {}
  }, []);

  const allAvailableGenres = useMemo(() => {
    const defaults = ["Amapiano", "Afro House", "3-Step", "Festival Anthems", "Lounge"];
    const fromPlaylists = playlists.map((p) => p.genre).filter(Boolean);
    return Array.from(new Set([...defaults, ...customGenres, ...fromPlaylists]));
  }, [playlists, customGenres]);

  const handleAddCustomGenre = (e: React.FormEvent) => {
    e.preventDefault();
    const g = newGenreInput.trim();
    if (!g) return;
    if (!allAvailableGenres.includes(g)) {
      const updated = [...customGenres, g];
      setCustomGenres(updated);
      try {
        localStorage.setItem("goodlife_custom_genres", JSON.stringify(updated));
      } catch {}
    }
    setCreateGenre(g);
    setNewGenreInput("");
    setShowAddGenreInput(false);
  };

  const handleDeleteCustomGenre = (genreToDelete: string) => {
    const updated = customGenres.filter((g) => g !== genreToDelete);
    setCustomGenres(updated);
    try {
      localStorage.setItem("goodlife_custom_genres", JSON.stringify(updated));
    } catch {}
    if (createGenre === genreToDelete) {
      setCreateGenre("Amapiano");
    }
  };

  // Add tracks selector state
  const [showAddTracks, setShowAddTracks] = useState(false);
  const [showHarmonizeModal, setShowHarmonizeModal] = useState(false);
  const [showHarmonizeProgressModal, setShowHarmonizeProgressModal] = useState(false);
  const [trackSearchQuery, setTrackSearchQuery] = useState("");
  const [selectedBulkTrackIds, setSelectedBulkTrackIds] = useState<Set<number>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Auto-Playlist & Harmonization State
  const [showAutoPlaylistModal, setShowAutoPlaylistModal] = useState(false);
  const [harmonizingAll, setHarmonizingAll] = useState(false);

  const unindexedCount = useMemo(() => {
    return library.filter((t) => !t.bpm || !t.musical_key || t.musical_key.trim() === "").length;
  }, [library]);

  const handleHarmonizeAll = async () => {
    if (harmonizingAll) return;
    if (unindexedCount === 0) {
      showBanner("All tracks in your library are already harmonically indexed with Camelot keys and BPM!", "success");
      return;
    }
    if (!confirm(`Harmonize all ${unindexedCount} unindexed festival tracks via Cloudflare Tunnel?\n\nThis analyzes audio tempo (BPM) and Camelot musical keys using audio intelligence.`)) {
      return;
    }

    setHarmonizingAll(true);
    try {
      const res = await fetch("/api/admin/radio/library/harmonize-all", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showBanner(
          `⚡ Harmonization complete: ${data.succeeded || 0} tracks indexed${data.failed ? ` (${data.failed} failed/skipped)` : ""}!`,
          "success"
        );
        if (onRefreshLive) onRefreshLive();
      } else {
        showBanner(data.error || "Failed to harmonize unindexed tracks", "error");
      }
    } catch {
      showBanner("Network error while harmonizing unindexed tracks", "error");
    } finally {
      setHarmonizingAll(false);
    }
  };

  const handleUndoReorder = async () => {
    if (!selectedPlaylistId) return;
    if (!confirm("Restore previous track order?\n\nThis will revert to the last saved snapshot and consume it (Undo is one-way). Continue?")) {
      return;
    }
    let reanchor = false;
    if (selectedPlaylist?.is_broadcast_active) {
      reanchor = confirm(
        "This playlist is currently LIVE ON AIR.\n\nDo you want to re-anchor the broadcast timeline to Track #1 upon restoring?\n\nClick OK to re-anchor to Track #1, or Cancel to keep current timeline offset."
      );
    }
    try {
      const res = await fetch(`/api/admin/radio/playlists/${selectedPlaylistId}/harmonize/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reanchorBroadcast: reanchor }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showBanner(
          `Restored previous track order (${data.restoredTrackCount} tracks)${data.reanchored ? " · Broadcast re-anchored to #1" : ""}`,
          "success"
        );
        fetchPlaylistDetails(selectedPlaylistId);
        if (data.reanchored && onRefreshLive) {
          onRefreshLive();
        }
      } else {
        showBanner(data.error || "No previous order snapshot available to undo", "error");
      }
    } catch {
      showBanner("Network error restoring previous order", "error");
    }
  };

  const fetchPlaylists = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/radio/playlists?_t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.playlists)) {
        setPlaylists(data.playlists);
        if (selectedPlaylistId === null && data.playlists.length > 0) {
          setSelectedPlaylistId(data.playlists[0].id);
        }
        // Recover any persistent ingest_job_id tracked in Neon DB across refreshes / devices
        const dbTracked: Record<string, PlaylistIngestJob> = {};
        for (const p of data.playlists as PlaylistSummary[]) {
          if (p.ingest_job_id) {
            dbTracked[p.ingest_job_id] = {
              job_id: p.ingest_job_id,
              playlist_id: p.id,
              playlist_name: p.name,
              total_tracks: p.track_count || 0,
              completed_tracks: p.track_count || 0,
              status: "queued",
              source_url: p.ingest_source_url || undefined,
            };
          }
        }
        if (Object.keys(dbTracked).length > 0) {
          setIngestJobs((prev) => {
            const merged = { ...prev };
            for (const [jid, j] of Object.entries(dbTracked)) {
              if (!merged[jid]) {
                merged[jid] = j;
              }
            }
            return merged;
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch playlists:", e);
    } finally {
      setLoading(false);
    }
  };

  // Hydrate persistent ingest jobs from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(INGEST_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setIngestJobs(parsed);
        }
      }
    } catch {}
  }, []);

  // Persist active ingest jobs cleanly to localStorage
  useEffect(() => {
    try {
      if (Object.keys(ingestJobs).length === 0) {
        localStorage.removeItem(INGEST_STORAGE_KEY);
      } else {
        localStorage.setItem(INGEST_STORAGE_KEY, JSON.stringify(ingestJobs));
      }
    } catch {}
  }, [ingestJobs]);

  // Resilient persistent background job polling (survives refreshes & temporary network loss)
  const activeJobIdsKey = useMemo(
    () =>
      Object.values(ingestJobs)
        .filter((j) => j.status === "queued" || j.status === "running")
        .map((j) => j.job_id)
        .sort()
        .join(","),
    [ingestJobs]
  );

  useEffect(() => {
    if (!activeJobIdsKey) return;
    const jobIds = activeJobIdsKey.split(",").filter(Boolean);

    const pollOnce = async () => {
      for (const jid of jobIds) {
        try {
          const res = await fetch(`/api/admin/radio/jobs/${encodeURIComponent(jid)}`, {
            cache: "no-store",
          });
          if (res.status === 404) {
            setIngestJobs((prev) => {
              const cur = prev[jid];
              if (!cur) return prev;
              return {
                ...prev,
                [jid]: {
                  ...cur,
                  status: "completed",
                  reconnecting: false,
                },
              };
            });
            continue;
          }
          if (!res.ok) {
            setIngestJobs((prev) =>
              prev[jid] ? { ...prev, [jid]: { ...prev[jid], reconnecting: true } } : prev
            );
            continue;
          }
          const job = await res.json();
          const newCompleted = Number(job.completed_tracks || 0);
          const prevCompleted = lastCompletedCountsRef.current[jid] ?? -1;

          setIngestJobs((prev) => {
            const cur = prev[jid];
            if (!cur) return prev;
            return {
              ...prev,
              [jid]: {
                ...cur,
                total_tracks: Number(job.total_tracks || cur.total_tracks || 0),
                completed_tracks: newCompleted,
                status: job.status || cur.status,
                current_track: job.current_track || cur.current_track,
                error: job.error || cur.error,
                reconnecting: false,
              },
            };
          });

          if (newCompleted !== prevCompleted || job.status === "completed") {
            lastCompletedCountsRef.current[jid] = newCompleted;
            fetchPlaylists();
            const matched = ingestJobsRef.current[jid];
            if (matched && selectedPlaylistId === matched.playlist_id) {
              fetchPlaylistDetails(selectedPlaylistId);
            }
            if (job.status === "completed" && onPlaylistsChanged) {
              onPlaylistsChanged();
            }
          }
        } catch {
          setIngestJobs((prev) =>
            prev[jid] ? { ...prev, [jid]: { ...prev[jid], reconnecting: true } } : prev
          );
        }
      }
    };

    pollOnce();
    const interval = setInterval(pollOnce, 2500);
    return () => clearInterval(interval);
  }, [activeJobIdsKey, selectedPlaylistId]);

  const dismissIngestJob = async (job: PlaylistIngestJob) => {
    setIngestJobs((prev) => {
      const next = { ...prev };
      delete next[job.job_id];
      return next;
    });
    try {
      await fetch("/api/admin/radio/playlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_id: job.playlist_id, clear_ingest_job: true }),
      });
    } catch {}
  };

  const fetchPlaylistDetails = async (id: number) => {
    try {
      setLoadingTracks(true);
      const res = await fetch(`/api/admin/radio/playlists/${id}?_t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.tracks)) {
        setSelectedPlaylistTracks(data.tracks);
      }
    } catch (e) {
      console.error("Failed to fetch playlist tracks:", e);
    } finally {
      setLoadingTracks(false);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  useEffect(() => {
    if (selectedPlaylistId) {
      fetchPlaylistDetails(selectedPlaylistId);
    } else {
      setSelectedPlaylistTracks([]);
    }
  }, [selectedPlaylistId]);

  const showBanner = (text: string, type: "success" | "error" = "success") => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Toggle "Put On Air"
  const handleToggleBroadcast = async (playlist: PlaylistSummary) => {
    try {
      const willActivate = !playlist.is_broadcast_active;
      const res = await fetch(`/api/admin/radio/playlists/${playlist.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: willActivate }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showBanner(data.error || "Failed to update broadcast status", "error");
        return;
      }

      showBanner(
        willActivate
          ? `🎙️ "${playlist.name}" is now ON AIR! 24/7 broadcast timeline has locked onto this set.`
          : `Station returned to full catalog AutoDJ rotation.`,
        "success"
      );
      await fetchPlaylists();
      if (onRefreshLive) onRefreshLive();
    } catch (err: any) {
      showBanner(err.message || "Network error", "error");
    }
  };

  // Preview optional YouTube / Spotify playlist link in Create Modal
  const handlePreviewCreateUrl = async () => {
    const url = createSourceUrl.trim();
    if (!url) return;
    setPreviewingSource(true);
    setCreateSourceError(null);
    try {
      const res = await fetch(`/api/admin/radio/playlist-preview?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.tracks) || data.tracks.length === 0) {
        setCreateSourceError(data.error || "Could not extract tracks from that playlist link.");
        setPreviewedSource(null);
        return;
      }
      setPreviewedSource({
        title: data.title || "Imported Playlist",
        source: data.source || "stream",
        tracks: data.tracks,
      });
      if (!createName.trim() && data.title) {
        setCreateName(data.title);
      }
      if (!createCoverUrl.trim() && data.tracks[0]?.thumbnail_url) {
        setCreateCoverUrl(data.tracks[0].thumbnail_url);
      }
    } catch (err: any) {
      setCreateSourceError(err?.message || "Failed to inspect streaming link.");
    } finally {
      setPreviewingSource(false);
    }
  };

  // Create playlist (standard manual OR with optional persistent background link ingestion)
  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = createSourceUrl.trim();
    if (!createName.trim() && !trimmedUrl) return;

    try {
      setCreating(true);
      setCreateSourceError(null);

      let resolvedData = previewedSource;
      if (trimmedUrl && !resolvedData) {
        const prevRes = await fetch(`/api/admin/radio/playlist-preview?url=${encodeURIComponent(trimmedUrl)}`);
        const prevJson = await prevRes.json();
        if (!prevRes.ok || !Array.isArray(prevJson.tracks) || prevJson.tracks.length === 0) {
          setCreateSourceError(prevJson.error || "Could not extract tracks from streaming link.");
          return;
        }
        resolvedData = {
          title: prevJson.title || "Imported Playlist",
          source: prevJson.source || "stream",
          tracks: prevJson.tracks,
        };
        setPreviewedSource(resolvedData);
      }

      const finalName = createName.trim() || resolvedData?.title || "New Festival Playlist";
      const finalCover = createCoverUrl.trim() || resolvedData?.tracks?.[0]?.thumbnail_url || null;

      const res = await fetch("/api/admin/radio/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: finalName,
          description: createDesc,
          genre: createGenre,
          cover_url: finalCover,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showBanner(data.error || "Failed to create playlist", "error");
        return;
      }

      const createdPl = data.playlist;
      let queuedJob: PlaylistIngestJob | null = null;

      // Optional persistent background streaming ingestion
      if (trimmedUrl && resolvedData && resolvedData.tracks.length > 0 && createdPl?.id) {
        const qRes = await fetch("/api/admin/radio/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tracks: resolvedData.tracks,
            genre: createGenre,
            playlist_id: createdPl.id,
            playlist_title: createdPl.name,
            source_url: trimmedUrl,
          }),
        });
        const qJson = await qRes.json();
        if (qRes.ok && qJson.job_id) {
          queuedJob = {
            job_id: qJson.job_id,
            playlist_id: createdPl.id,
            playlist_name: createdPl.name,
            total_tracks: qJson.total_tracks || resolvedData.tracks.length,
            completed_tracks: 0,
            status: qJson.status || "queued",
            current_track: resolvedData.tracks[0]?.title,
            source_url: trimmedUrl,
          };
          setIngestJobs((prev) => ({
            ...prev,
            [queuedJob!.job_id]: queuedJob!,
          }));
        } else {
          showBanner(
            `Playlist "${createdPl.name}" created, but background ingestion failed to enqueue: ${qJson.error || "Bridge unavailable"}`,
            "error"
          );
        }
      }

      if (queuedJob) {
        showBanner(
          `Playlist "${createdPl.name}" created! Ingesting ${queuedJob.total_tracks} tracks in background — safe to refresh.`,
          "success"
        );
      } else {
        showBanner(`Playlist "${createdPl.name}" created!`, "success");
      }

      setCreateName("");
      setCreateDesc("");
      setCreateCoverUrl("");
      setCreateSourceUrl("");
      setPreviewedSource(null);
      setCreateSourceError(null);
      setShowCreateModal(false);

      if (createdPl) {
        const createdSummary: PlaylistSummary = {
          ...createdPl,
          track_count: 0,
          total_duration_sec: 0,
          ingest_job_id: queuedJob?.job_id || null,
          ingest_source_url: trimmedUrl || null,
        };
        setPlaylists((prev) => {
          const exists = prev.some((p) => p.id === createdSummary.id);
          return exists ? prev : [createdSummary, ...prev];
        });
        setSelectedPlaylistId(createdSummary.id);
      }
      await fetchPlaylists();
      if (onPlaylistsChanged) onPlaylistsChanged();
    } catch (err: any) {
      showBanner(err.message || "Failed to create playlist", "error");
    } finally {
      setCreating(false);
    }
  };

  // Delete playlist
  const handleDeletePlaylist = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete playlist "${name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/radio/playlists/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) {
        showBanner(data.error || "Failed to delete playlist", "error");
        return;
      }

      showBanner(`Playlist "${name}" deleted`, "success");
      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(null);
      }
      await fetchPlaylists();
    } catch (err: any) {
      showBanner(err.message || "Network error", "error");
    }
  };

  const handleToggleTrackSelection = (trackId: number) => {
    setSelectedBulkTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };

  const handleSelectAllAvailable = () => {
    setSelectedBulkTrackIds(new Set(availableTracks.map((t) => t.id)));
  };

  const handleClearSelection = () => {
    setSelectedBulkTrackIds(new Set());
  };

  const handleBulkAddTracks = async () => {
    if (!selectedPlaylistId || selectedBulkTrackIds.size === 0) return;
    try {
      setBulkAdding(true);
      const res = await fetch(`/api/admin/radio/playlists/${selectedPlaylistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_ids: Array.from(selectedBulkTrackIds) }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showBanner(`Successfully added ${selectedBulkTrackIds.size} tracks to playlist`, "success");
        setSelectedBulkTrackIds(new Set());
        fetchPlaylistDetails(selectedPlaylistId);
        fetchPlaylists();
      } else {
        showBanner(data.error || "Failed to bulk add tracks", "error");
      }
    } catch (err: any) {
      showBanner(err.message || "Network error", "error");
    } finally {
      setBulkAdding(false);
    }
  };

  // Add track to current playlist
  const handleAddTrack = async (trackId: number) => {
    if (!selectedPlaylistId) return;
    try {
      const res = await fetch(`/api/admin/radio/playlists/${selectedPlaylistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showBanner("Track added to playlist", "success");
        fetchPlaylistDetails(selectedPlaylistId);
        fetchPlaylists();
      }
    } catch (err: any) {
      showBanner(err.message || "Failed to add track", "error");
    }
  };

  // Remove track from current playlist
  const handleRemoveTrack = async (trackId: number) => {
    if (!selectedPlaylistId) return;
    try {
      const res = await fetch(
        `/api/admin/radio/playlists/${selectedPlaylistId}/tracks/${trackId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        fetchPlaylistDetails(selectedPlaylistId);
        fetchPlaylists();
      }
    } catch (err: any) {
      showBanner(err.message || "Failed to remove track", "error");
    }
  };

  // Move track Up/Down
  const handleMoveTrack = async (index: number, direction: "up" | "down") => {
    if (!selectedPlaylistId) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= selectedPlaylistTracks.length) return;

    const newTracks = [...selectedPlaylistTracks];
    const temp = newTracks[index];
    newTracks[index] = newTracks[targetIndex];
    newTracks[targetIndex] = temp;

    const reorderPayload = newTracks.map((t, pos) => ({
      track_id: t.id,
      position: pos,
    }));

    setSelectedPlaylistTracks(newTracks);

    try {
      await fetch(`/api/admin/radio/playlists/${selectedPlaylistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: reorderPayload }),
      });
    } catch (err) {
      console.error("Reorder save error:", err);
    }
  };

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);
  const activeBroadcastPlaylist = playlists.find((p) => p.is_broadcast_active);

  const formatDuration = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} mins`;
  };

  // Filter library tracks for adding
  const existingTrackIds = new Set(selectedPlaylistTracks.map((t) => t.id));
  const availableTracks = library.filter((t) => {
    if (existingTrackIds.has(t.id)) return false;
    if (!trackSearchQuery.trim()) return true;
    const q = trackSearchQuery.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.dj_name.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl font-bold flex items-center gap-3 transition-all ${
            actionMessage.type === "success"
              ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
              : "bg-red-500/20 border border-red-500/40 text-red-300"
          }`}
        >
          <Sparkles className="w-5 h-5 shrink-0" />
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Persistent Background Playlist Ingestion Progress Tracker */}
      {Object.values(ingestJobs).length > 0 && (
        <div className="space-y-2.5">
          {Object.values(ingestJobs).map((job) => {
            const pct =
              job.total_tracks > 0
                ? Math.min(100, Math.round((job.completed_tracks / job.total_tracks) * 100))
                : 0;
            const isFinished = job.status === "completed" || job.status === "failed";
            return (
              <div
                key={job.job_id}
                className={`p-4 rounded-xl border-2 font-mono text-xs space-y-2 shadow-[4px_4px_0px_#000] ${
                  job.status === "completed"
                    ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-200"
                    : job.status === "failed"
                    ? "bg-red-950/60 border-red-500/60 text-red-200"
                    : "bg-[#1A1D24] border-[#DFBB7D] text-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 font-bold">
                    {isFinished ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-[#DFBB7D] animate-spin shrink-0" />
                    )}
                    <span className="uppercase tracking-wider">
                      {job.status === "completed"
                        ? `Import Finished: ${job.playlist_name}`
                        : job.status === "failed"
                        ? `Import Error: ${job.playlist_name}`
                        : `Background Import: ${job.playlist_name}`}
                    </span>
                    {job.reconnecting && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">
                        RECONNECTING…
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[#DFBB7D]">
                      {job.completed_tracks} / {job.total_tracks} tracks ({pct}%)
                    </span>
                    {job.playlist_id && (
                      <button
                        type="button"
                        onClick={() => setSelectedPlaylistId(job.playlist_id)}
                        className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-bold uppercase cursor-pointer"
                      >
                        Open
                      </button>
                    )}
                    {isFinished && (
                      <button
                        type="button"
                        onClick={() => dismissIngestJob(job)}
                        className="p-1 text-white/60 hover:text-white cursor-pointer"
                        title="Dismiss"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-2 bg-black/50 rounded-full overflow-hidden border border-white/10">
                  <div
                    className={`h-full transition-all duration-500 ${
                      job.status === "completed"
                        ? "bg-emerald-400"
                        : "bg-gradient-to-r from-[#DFBB7D] to-[#F5C842]"
                    }`}
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-white/70">
                  <span className="truncate">
                    {job.status === "completed"
                      ? "All resolved tracks mastered and attached directly to your playlist."
                      : job.current_track
                      ? `Mastering: ${job.current_track}`
                      : "Queued on studio worker — continues even if you refresh or go offline."}
                  </span>
                  <span className="text-[10px] text-white/40 uppercase shrink-0 ml-2">
                    {job.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Broadcast Airwave Status Bar */}
      <div className={`p-5 rounded-2xl border-2 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
        activeBroadcastPlaylist
          ? "bg-[#1A1D24] border-[#DFBB7D] shadow-[4px_4px_0px_#DFBB7D]"
          : "bg-[#16181D] border-white/20"
      }`}>
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
              activeBroadcastPlaylist
                ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D] shadow-md animate-pulse"
                : "bg-white/10 text-white/60 border-white/20"
            }`}
          >
            <RadioTower className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-mono font-bold text-white/70">
                24/7 Airwave Automation
              </span>
              {activeBroadcastPlaylist ? (
                <span className="px-2.5 py-0.5 text-[10px] font-black uppercase rounded bg-[#DFBB7D] text-[#16181D] shadow-sm animate-pulse">
                  PLAYLIST ON AIR
                </span>
              ) : (
                <span className="px-2.5 py-0.5 text-[10px] font-black uppercase rounded bg-white/10 text-white/70 border border-white/20">
                  FULL CATALOG (AUTODJ)
                </span>
              )}
            </div>
            <div className="text-lg font-black font-mono text-white mt-1">
              {activeBroadcastPlaylist ? (
                <>
                  Locked to: <span className="text-[#DFBB7D]">{activeBroadcastPlaylist.name}</span>{" "}
                  <span className="text-xs text-white/70 font-mono font-normal">
                    ({activeBroadcastPlaylist.track_count} tracks •{" "}
                    {formatDuration(activeBroadcastPlaylist.total_duration_sec)})
                  </span>
                </>
              ) : (
                <span className="text-white/80 font-mono">
                  Broadcasting across all {library.length} festival tracks seamlessly.
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowHarmonizeProgressModal(true)}
            className={`px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all border flex items-center gap-2 ${
              unindexedCount > 0
                ? "bg-[#DFBB7D]/10 hover:bg-[#DFBB7D]/20 text-[#DFBB7D] border-[#DFBB7D]/40 shadow-[2px_2px_0px_#DFBB7D]"
                : "bg-white/5 hover:bg-white/10 text-white/60 border-white/10 hover:border-white/20"
            }`}
            title="Harmonize unindexed catalog tracks via audio intelligence"
          >
            <Zap className={`w-3.5 h-3.5 ${unindexedCount > 0 ? "text-[#DFBB7D]" : "text-white/40"}`} />
            {unindexedCount > 0
              ? `Harmonize Unindexed (${unindexedCount})`
              : `All Harmonized (${library.length})`}
          </button>

          <button
            onClick={() => setShowAutoPlaylistModal(true)}
            className="px-3.5 py-2 bg-[#DFBB7D]/10 hover:bg-[#DFBB7D]/25 text-[#DFBB7D] hover:text-white text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all border border-[#DFBB7D]/40 flex items-center gap-1.5 shadow-[2px_2px_0px_#DFBB7D]"
            title="Create an algorithmic harmonic playlist (Late Night Drive, Club Peak, etc.)"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#DFBB7D]" />
            Auto-Playlist
          </button>

          {activeBroadcastPlaylist && (
            <button
              onClick={() => handleToggleBroadcast(activeBroadcastPlaylist)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white hover:text-[#DFBB7D] text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all border border-white/20 hover:border-[#DFBB7D]"
            >
              Return to Full Catalog
            </button>
          )}
        </div>
      </div>

      {/* Main Playlist Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Playlist Index (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#DFBB7D]" />
              Your Playlists ({playlists.length})
            </h3>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] text-xs font-mono font-black uppercase rounded-lg flex items-center gap-1.5 transition-all shadow-[2px_2px_0px_#000]"
            >
              <Plus className="w-3.5 h-3.5" />
              New Playlist
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-white/50 text-xs font-mono uppercase tracking-wider">
              Loading playlists...
            </div>
          ) : playlists.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#16181D] border-2 border-dashed border-white/20 text-center">
              <Layers className="w-8 h-8 text-white/40 mx-auto mb-2" />
              <div className="text-sm font-bold text-white">No playlists yet</div>
              <p className="text-xs text-white/60 mt-1 mb-4">
                Create a playlist to curate specific vibe sets or take over the airwaves.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-[#DFBB7D] text-[#16181D] font-black text-xs font-mono uppercase rounded-xl shadow-[2px_2px_0px_#000]"
              >
                Create Playlist
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {playlists.map((pl) => {
                const isSelected = pl.id === selectedPlaylistId;
                return (
                  <div
                    key={pl.id}
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3.5 ${
                      isSelected
                        ? "bg-[#1E222B] border-[#DFBB7D] shadow-[3px_3px_0px_#DFBB7D]"
                        : "bg-[#16181D] border-white/15 hover:border-white/40 hover:bg-[#1A1D24]"
                    }`}
                  >
                    {/* Cover art or fallback */}
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-black shrink-0 border border-white/20 relative">
                      {pl.cover_url ? (
                        <img
                          src={pl.cover_url}
                          alt={pl.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40">
                          <Music2 className="w-6 h-6" />
                        </div>
                      )}
                      {pl.is_broadcast_active && (
                        <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#DFBB7D] rounded-full animate-ping" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-white truncate">{pl.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-white/10 text-white border border-white/20">
                          {pl.genre}
                        </span>
                        <span className="text-xs font-mono text-[#DFBB7D]">
                          {pl.track_count} tracks • {formatDuration(pl.total_duration_sec)}
                        </span>
                      </div>
                    </div>

                    {pl.is_broadcast_active && (
                      <span className="px-2 py-0.5 rounded bg-[#DFBB7D] text-[#16181D] text-[9px] font-mono font-black uppercase shrink-0 shadow-sm">
                        ON AIR
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Playlist Tracks & Order Manager (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {selectedPlaylist ? (
            <div className="p-6 rounded-2xl bg-[#16181D] border-2 border-white/20 backdrop-blur-xl space-y-6 shadow-[4px_4px_0px_#000]">
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/15">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-black shrink-0 border-2 border-white/20">
                    {selectedPlaylist.cover_url ? (
                      <img
                        src={selectedPlaylist.cover_url}
                        alt={selectedPlaylist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/40">
                        <Music2 className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-mono font-black text-white">{selectedPlaylist.name}</h2>
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-[#DFBB7D] text-[#16181D]">
                        {selectedPlaylist.genre}
                      </span>
                    </div>
                    {selectedPlaylist.description && (
                      <p className="text-xs font-mono text-white/80 mt-1 max-w-lg">
                        {selectedPlaylist.description}
                      </p>
                    )}
                    <div className="text-xs font-mono text-[#DFBB7D] mt-1.5 flex items-center gap-3">
                      <span>{selectedPlaylistTracks.length} tracks</span>
                      <span>•</span>
                      <span>{formatDuration(selectedPlaylist.total_duration_sec)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {/* Put On Air button */}
                  <button
                    onClick={() => handleToggleBroadcast(selectedPlaylist)}
                    className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                      selectedPlaylist.is_broadcast_active
                        ? "bg-[#E84855] text-white border-2 border-white/30 hover:bg-red-600 shadow-[2px_2px_0px_#000]"
                        : "bg-[#DFBB7D] text-[#16181D] hover:bg-[#F2CE8A] border-2 border-[#16181D] shadow-[2px_2px_0px_#DFBB7D]"
                    }`}
                  >
                    <Radio className="w-4 h-4" />
                    {selectedPlaylist.is_broadcast_active ? "Take Off Air" : "Put On Air"}
                  </button>

                  <button
                    onClick={() => handleDeletePlaylist(selectedPlaylist.id, selectedPlaylist.name)}
                    className="p-2.5 rounded-xl bg-white/10 text-white/70 hover:text-white hover:bg-red-500/20 border border-white/20 transition-all"
                    title="Delete playlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  Tracklist Sequence (Plays In This Order On Air)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowHarmonizeModal(true)}
                    disabled={selectedPlaylistTracks.length < 2}
                    className="px-3 py-1.5 bg-[#DFBB7D]/20 hover:bg-[#DFBB7D] text-[#DFBB7D] hover:text-[#16181D] border-2 border-[#DFBB7D] rounded-xl text-xs font-mono font-black uppercase flex items-center gap-1.5 transition-all disabled:opacity-30 shadow-[1px_1px_0px_#DFBB7D]"
                    title="Order tracks by Camelot key wheel & tempo progression"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Harmonize Tracklist</span>
                  </button>

                  <button
                    onClick={handleUndoReorder}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/30 rounded-xl text-xs font-mono font-bold uppercase flex items-center gap-1.5 transition-all"
                    title="Undo last reorder from database snapshot"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo</span>
                  </button>

                  <button
                    onClick={() => setShowAddTracks(!showAddTracks)}
                    className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-black border-2 border-emerald-500/50 rounded-xl text-xs font-mono font-bold uppercase flex items-center gap-1.5 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {showAddTracks ? "Close Selector" : "Add Tracks"}
                  </button>
                </div>
              </div>

              {/* Add Tracks Drawer */}
              {showAddTracks && (
                <div className="p-4 rounded-2xl bg-[#121316] border-2 border-white/20 space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                      <input
                        type="text"
                        placeholder="Search music library to add..."
                        value={trackSearchQuery}
                        onChange={(e) => setTrackSearchQuery(e.target.value)}
                        className="w-full bg-[#1A1D24] border-2 border-white/20 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D]"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSelectAllAvailable}
                        disabled={availableTracks.length === 0}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-[11px] font-mono font-bold uppercase transition-all disabled:opacity-40"
                      >
                        Select All ({availableTracks.length})
                      </button>
                      {selectedBulkTrackIds.size > 0 && (
                        <button
                          onClick={handleClearSelection}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[11px] font-mono font-bold uppercase transition-all"
                        >
                          Clear ({selectedBulkTrackIds.size})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bulk Action Sticky Bar */}
                  {selectedBulkTrackIds.size > 0 && (
                    <div className="p-3 bg-[#DFBB7D]/15 border-2 border-[#DFBB7D] rounded-xl flex items-center justify-between gap-3 animate-fadeIn">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#DFBB7D]" />
                        <span className="text-xs font-mono font-bold text-white">
                          <span className="text-[#DFBB7D] font-black">{selectedBulkTrackIds.size}</span> tracks selected
                        </span>
                      </div>
                      <button
                        onClick={handleBulkAddTracks}
                        disabled={bulkAdding}
                        className="px-4 py-2 bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] font-mono font-black text-xs uppercase rounded-lg flex items-center gap-1.5 transition-all shadow-[2px_2px_0px_#000] disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {bulkAdding ? "Adding Tracks..." : `➕ Bulk Add (${selectedBulkTrackIds.size}) Songs to Playlist`}
                      </button>
                    </div>
                  )}

                  <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                    {availableTracks.length === 0 ? (
                      <div className="text-center py-6 text-xs font-mono text-white/60">
                        {trackSearchQuery ? "No matching tracks found." : "All library tracks are already in this playlist."}
                      </div>
                    ) : (
                      availableTracks.map((t) => {
                        const isSelected = selectedBulkTrackIds.has(t.id);
                        return (
                          <div
                            key={t.id}
                            onClick={() => handleToggleTrackSelection(t.id)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                              isSelected
                                ? "bg-[#DFBB7D]/15 border-[#DFBB7D]"
                                : "bg-[#1A1D24] border-white/15 hover:border-white/40"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleTrackSelection(t.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 accent-[#DFBB7D] rounded cursor-pointer shrink-0"
                              />
                              {t.cover_url && (
                                <img
                                  src={t.cover_url}
                                  alt={t.title}
                                  className="w-9 h-9 rounded-lg object-cover shrink-0 border border-white/20"
                                />
                              )}
                              <div className="min-w-0">
                                <div className="text-xs font-mono font-bold text-white truncate">{t.title}</div>
                                <div className="text-[10px] font-mono text-[#DFBB7D] truncate">
                                  {t.dj_name} • {t.duration}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddTrack(t.id);
                              }}
                              className="px-2.5 py-1 bg-[#DFBB7D] text-[#16181D] hover:bg-[#F2CE8A] rounded-lg text-[10px] font-mono font-black uppercase shrink-0 transition-all shadow-sm"
                            >
                              + Add
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Tracks List with Reordering */}
              {loadingTracks ? (
                <div className="p-8 text-center text-white/60 text-xs font-mono uppercase tracking-wider">
                  Loading tracklist...
                </div>
              ) : selectedPlaylistTracks.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-[#121316] border-2 border-dashed border-white/20">
                  <Music2 className="w-8 h-8 text-white/40 mx-auto mb-2" />
                  <div className="text-sm font-bold text-white">Playlist is empty</div>
                  <p className="text-xs text-white/60 mt-1 mb-4">
                    Click "Add Tracks" above to add songs to this playlist.
                  </p>
                  <button
                    onClick={() => setShowAddTracks(true)}
                    className="px-4 py-2 bg-[#DFBB7D] text-[#16181D] font-black text-xs font-mono uppercase rounded-xl shadow-[2px_2px_0px_#000]"
                  >
                    Add Songs
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedPlaylistTracks.map((track, idx) => (
                    <div
                      key={track.id}
                      className="p-2.5 sm:p-3 rounded-xl bg-[#1A1D24] border border-white/15 flex items-center gap-2 sm:gap-3.5 group hover:border-[#DFBB7D] hover:bg-[#202530] transition-all"
                    >
                      <span className="text-xs font-mono font-bold text-[#DFBB7D] w-5 sm:w-6 text-right shrink-0">
                        {idx + 1}
                      </span>

                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-black shrink-0 border border-white/20">
                        {track.cover_url ? (
                          <img
                            src={track.cover_url}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/40">
                            <Music2 className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono font-bold text-white truncate flex items-center gap-2">
                          <span>{track.title}</span>
                          {track.is_full_set && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 border border-purple-500/50 text-[9px] font-mono font-black uppercase">
                              DJ MIX
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-white/80 truncate flex items-center gap-2 mt-0.5">
                          <span className="text-white/90">{track.dj_name}</span>
                          <span className="text-white/40">•</span>
                          <span className="text-[#DFBB7D]">{track.genre}</span>
                          {track.musical_key && (
                            <>
                              <span className="text-white/40">•</span>
                              <span className="text-emerald-300 font-mono font-bold text-[10px]">
                                {track.musical_key}
                              </span>
                              {track.key_source && (
                                <span
                                  className={`px-1 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
                                    track.key_source === "tunebat"
                                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                      : track.key_source === "analyzed"
                                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                      : "bg-white/10 text-white/80"
                                  }`}
                                  title={`Key Source: ${track.key_source}`}
                                >
                                  {track.key_source === "analyzed" ? "auto" : track.key_source}
                                </span>
                              )}
                            </>
                          )}
                          {track.bpm && (
                            <>
                              <span className="text-white/40">•</span>
                              <span className="text-[#DFBB7D] font-mono text-[10px]">
                                {track.bpm} BPM
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="hidden sm:block text-xs text-[#DFBB7D] font-mono font-bold shrink-0">
                        {track.duration}
                      </div>

                      {/* Reorder and Delete controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          disabled={idx === 0}
                          onClick={() => handleMoveTrack(idx, "up")}
                          className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 hover:text-[#DFBB7D] border border-white/20 disabled:opacity-20 transition-all"
                          title="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          disabled={idx === selectedPlaylistTracks.length - 1}
                          onClick={() => handleMoveTrack(idx, "down")}
                          className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 hover:text-[#DFBB7D] border border-white/20 disabled:opacity-20 transition-all"
                          title="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemoveTrack(track.id)}
                          className="p-1.5 rounded-lg bg-white/10 text-white/80 hover:text-white hover:bg-red-500/30 border border-white/20 transition-all ml-1"
                          title="Remove from playlist"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center rounded-2xl bg-[#16181D] border-2 border-white/20 text-white/60 font-mono">
              Select a playlist from the left or create a new one to manage tracks.
            </div>
          )}
        </div>
      </div>

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16181D] border-2 border-white/30 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-[6px_6px_0px_#DFBB7D]">
            <div className="flex items-center justify-between border-b border-white/20 pb-3">
              <h3 className="text-base font-mono font-black text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#DFBB7D]" />
                Create New Playlist
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-white/60 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlaylist} className="space-y-4">
              <div>
                <label className="text-xs font-mono font-bold uppercase text-white/80 block mb-1.5">
                  Playlist Title *
                </label>
                <input
                  type="text"
                  required={!createSourceUrl.trim()}
                  placeholder="e.g. Sunset Piano Chords (or auto-fill from link)"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-[#121316] border-2 border-white/20 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D]"
                />
              </div>

              <div>
                <label className="text-xs font-mono font-bold uppercase text-white/80 block mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief vibe description or festival theme..."
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  className="w-full bg-[#121316] border-2 border-white/20 rounded-xl px-3.5 py-2 text-sm font-mono text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono font-bold uppercase text-white/80">
                    Primary Genre
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddGenreInput(!showAddGenreInput)}
                    className="text-[11px] text-[#DFBB7D] hover:underline flex items-center gap-1 font-bold"
                  >
                    <Plus className="w-3 h-3" />
                    Add Custom Category
                  </button>
                </div>

                {showAddGenreInput && (
                  <div className="flex items-center gap-2 mb-2.5">
                    <input
                      type="text"
                      value={newGenreInput}
                      onChange={(e) => setNewGenreInput(e.target.value)}
                      placeholder="e.g. Gengetone, Arbantone, Deep Tech..."
                      className="flex-1 bg-[#121316] border border-[#DFBB7D]/50 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D]"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomGenre}
                      className="px-3 py-1.5 bg-[#DFBB7D] text-[#16181D] font-bold text-xs rounded-lg uppercase"
                    >
                      Save Genre
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddGenreInput(false)}
                      className="p-1.5 text-white/50 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {allAvailableGenres.map((g) => {
                    const isSelected = createGenre === g;
                    const isCustom = customGenres.includes(g);
                    return (
                      <div key={g} className="relative group">
                        <button
                          type="button"
                          onClick={() => setCreateGenre(g)}
                          className={`px-3 py-1 text-xs font-mono font-bold rounded-lg border transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D]"
                              : "bg-[#121316] text-white/80 border-white/20 hover:border-white/50"
                          }`}
                        >
                          <span>{g}</span>
                          {isCustom && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCustomGenre(g);
                              }}
                              className="text-white/40 hover:text-red-400 p-0.5"
                              title="Delete custom category"
                            >
                              <X className="w-3 h-3" />
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-mono font-bold uppercase text-white/80 block mb-1.5">
                  Cover Art Image URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://... (or leave empty to inherit from first track)"
                  value={createCoverUrl}
                  onChange={(e) => setCreateCoverUrl(e.target.value)}
                  className="w-full bg-[#121316] border-2 border-white/20 rounded-xl px-3.5 py-2 text-sm font-mono text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D]"
                />
              </div>

              {/* Optional Streaming Playlist Link Ingestion */}
              <div className="p-3.5 rounded-xl bg-[#121316] border border-[#DFBB7D]/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-mono font-bold uppercase text-[#DFBB7D] flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Spotify or YouTube Playlist Link (Optional)</span>
                  </label>
                  <span className="text-[10px] font-mono text-white/40">Persists across refresh</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    placeholder="Paste YouTube or Spotify playlist URL (or leave empty)"
                    value={createSourceUrl}
                    onChange={(e) => {
                      setCreateSourceUrl(e.target.value);
                      setPreviewedSource(null);
                      setCreateSourceError(null);
                    }}
                    className="flex-1 bg-[#1A1D24] border border-white/20 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D]"
                  />
                  {createSourceUrl.trim() && (
                    <button
                      type="button"
                      onClick={handlePreviewCreateUrl}
                      disabled={previewingSource}
                      className="px-3 py-2 bg-white/10 hover:bg-[#DFBB7D] hover:text-[#16181D] text-white font-mono text-[11px] font-bold uppercase rounded-lg shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {previewingSource ? "Scanning..." : "Preview"}
                    </button>
                  )}
                </div>
                {createSourceError && (
                  <p className="text-[11px] font-mono text-red-400">{createSourceError}</p>
                )}
                {previewedSource && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-[11px] font-mono text-emerald-200 space-y-1">
                    <div className="font-bold flex items-center justify-between">
                      <span>✓ {previewedSource.tracks.length} tracks ready ({previewedSource.source})</span>
                    </div>
                    <div className="text-white/70 truncate">
                      {previewedSource.tracks
                        .slice(0, 3)
                        .map((t) => t.title)
                        .join(" · ")}
                      {previewedSource.tracks.length > 3 ? ` +${previewedSource.tracks.length - 3} more` : ""}
                    </div>
                  </div>
                )}
                <p className="text-[10px] font-mono text-white/45 leading-relaxed">
                  Leave blank to create an empty manual playlist. Add a link to auto-download, loudnorm-master &amp; populate tracks reliably in the background.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-mono font-bold text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || (!createName.trim() && !createSourceUrl.trim())}
                  className="px-5 py-2.5 bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] font-mono font-black text-xs uppercase rounded-xl transition-all disabled:opacity-50 shadow-[2px_2px_0px_#000]"
                >
                  {creating
                    ? createSourceUrl.trim()
                      ? "Creating & Queueing..."
                      : "Creating..."
                    : createSourceUrl.trim()
                    ? "Create & Start Ingestion"
                    : "Create Playlist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Harmonize Tracklist Review & Diff Modal */}
      {selectedPlaylist && (
        <HarmonizeModal
          playlist={selectedPlaylist}
          tracks={selectedPlaylistTracks}
          isOpen={showHarmonizeModal}
          onClose={() => setShowHarmonizeModal(false)}
          onApplied={() => {
            showBanner(`Harmonized playlist "${selectedPlaylist.name}" successfully!`, "success");
            fetchPlaylistDetails(selectedPlaylist.id);
            if (selectedPlaylist.is_broadcast_active && onRefreshLive) {
              onRefreshLive();
            }
          }}
        />
      )}

      {/* Harmonize Unindexed Progress Modal */}
      <HarmonizeProgressModal
        isOpen={showHarmonizeProgressModal}
        onClose={() => setShowHarmonizeProgressModal(false)}
        initialUnindexedCount={unindexedCount}
        onComplete={() => {
          fetchPlaylists();
          if (onRefreshLive) onRefreshLive();
        }}
      />

      {/* Auto-Playlist Vibe Creator Modal */}
      <AutoPlaylistModal
        isOpen={showAutoPlaylistModal}
        onClose={() => setShowAutoPlaylistModal(false)}
        onPlaylistCreated={(newId) => {
          fetchPlaylists();
          setSelectedPlaylistId(newId);
          fetchPlaylistDetails(newId);
        }}
        showBanner={showBanner}
      />
    </div>
  );
}

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
  Sliders,
  ListPlus,
  Globe,
  GripVertical,
  ChevronsUp,
  ChevronsDown,
  CheckSquare,
  Square,
  FolderInput,
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
  onEditTrack?: (track: RadioSet) => void;
  refreshTrigger?: number;
  onRefreshLive?: () => void;
  onPlaylistsChanged?: () => void;
}

export default function PlaylistManagerPanel({
  library,
  onEditTrack,
  refreshTrigger,
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
  const [activeOnAirSetId, setActiveOnAirSetId] = useState<number | null>(null);
  const [activeOnAirPlaylistId, setActiveOnAirPlaylistId] = useState<number | null>(null);
  const playingTrackRowRef = React.useRef<HTMLDivElement | null>(null);
  const [deleteModalTarget, setDeleteModalTarget] = useState<{ id: number; name: string } | null>(null);
  const [deletingPlaylist, setDeletingPlaylist] = useState(false);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoReanchor, setUndoReanchor] = useState(false);
  const [undoingReorder, setUndoingReorder] = useState(false);
  const [showHarmonizeAllModal, setShowHarmonizeAllModal] = useState(false);
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
  const [addDrawerMode, setAddDrawerMode] = useState<"library" | "quick_song" | "import_playlist">("library");
  const [quickSongQuery, setQuickSongQuery] = useState("");
  const [quickSongSearching, setQuickSongSearching] = useState(false);
  const [quickSongResults, setQuickSongResults] = useState<
    Array<{
      id?: number;
      video_id: string;
      title: string;
      artist: string;
      duration_sec: number;
      thumbnail_url: string;
      source: string;
      url?: string;
    }>
  >([]);
  const [quickAddingSongId, setQuickAddingSongId] = useState<string | null>(null);
  const [importPlaylistUrl, setImportPlaylistUrl] = useState("");
  const [importPlaylistPreviewing, setImportPlaylistPreviewing] = useState(false);
  const [importPlaylistPreview, setImportPlaylistPreview] = useState<{
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
  const [importingPlaylist, setImportingPlaylist] = useState(false);
  const [mergeSourcePlaylistId, setMergeSourcePlaylistId] = useState<string>("");
  const [mergingPlaylist, setMergingPlaylist] = useState(false);
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
    setShowHarmonizeAllModal(true);
  };

  const executeHarmonizeAll = async () => {
    setShowHarmonizeAllModal(false);
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

  const handleUndoReorder = () => {
    if (!selectedPlaylistId) return;
    setUndoReanchor(false);
    setShowUndoModal(true);
  };

  const executeUndoReorder = async () => {
    if (!selectedPlaylistId || undoingReorder) return;
    setUndoingReorder(true);
    try {
      const res = await fetch(`/api/admin/radio/playlists/${selectedPlaylistId}/harmonize/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reanchorBroadcast: Boolean(selectedPlaylist?.is_broadcast_active && undoReanchor) }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowUndoModal(false);
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
    } finally {
      setUndoingReorder(false);
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
    if (refreshTrigger && refreshTrigger > 0 && selectedPlaylistId) {
      fetchPlaylistDetails(selectedPlaylistId);
    }
  }, [refreshTrigger, selectedPlaylistId]);

  // Poll active broadcast playout track so the live playing song is highlighted accurately
  useEffect(() => {
    let active = true;
    const syncActivePlayout = async () => {
      try {
        const res = await fetch(`/api/admin/radio/playlist?_t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        let nextSetId: number | null = data.active_set_id ? Number(data.active_set_id) : null;
        if (!nextSetId) {
          const liveRes = await fetch("/api/radio/live", { cache: "no-store" }).catch(() => null);
          if (liveRes?.ok) {
            const liveJson = await liveRes.json();
            if (liveJson?.now_playing?.id) nextSetId = Number(liveJson.now_playing.id);
          }
        }
        if (active) {
          setActiveOnAirSetId(nextSetId);
          setActiveOnAirPlaylistId(data.playlist_id ? Number(data.playlist_id) : null);
        }
      } catch {}
    };

    syncActivePlayout();
    const timer = setInterval(syncActivePlayout, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
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

  // Delete playlist (opens custom modal instead of native browser confirm)
  const handleDeletePlaylist = (id: number, name: string) => {
    setDeleteModalTarget({ id, name });
  };

  const executeDeletePlaylist = async () => {
    if (!deleteModalTarget || deletingPlaylist) return;
    const { id, name } = deleteModalTarget;
    setDeletingPlaylist(true);
    try {
      const res = await fetch(`/api/admin/radio/playlists/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) {
        showBanner(data.error || "Failed to delete playlist", "error");
        return;
      }

      setDeleteModalTarget(null);
      showBanner(`Playlist "${name}" deleted`, "success");
      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(null);
      }
      await fetchPlaylists();
    } catch (err: any) {
      showBanner(err.message || "Network error", "error");
    } finally {
      setDeletingPlaylist(false);
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

  // Search song / resolve YouTube song link for quick add into current playlist
  const handleQuickSongSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = quickSongQuery.trim();
    if (!raw) return;

    const ytMatch = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
    const extractedVideoId = ytMatch ? ytMatch[1] : null;
    const searchTerm = extractedVideoId || raw;

    setQuickSongSearching(true);
    try {
      const res = await fetch(`/api/admin/radio/search?q=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      let items = Array.isArray(data) ? data : [];
      if (items.length === 0 && extractedVideoId) {
        items = [
          {
            video_id: extractedVideoId,
            title: `YouTube Track (${extractedVideoId})`,
            artist: "GOODLIFE Resident",
            duration_sec: 180,
            thumbnail_url: `https://i.ytimg.com/vi/${extractedVideoId}/hqdefault.jpg`,
            source: "youtube",
            url: `https://www.youtube.com/watch?v=${extractedVideoId}`,
          },
        ];
      }
      setQuickSongResults(items);
      if (items.length === 0) {
        showBanner("No songs found for that query or link.", "error");
      }
    } catch (err: any) {
      showBanner(err?.message || "Failed to search for song", "error");
    } finally {
      setQuickSongSearching(false);
    }
  };

  // Quick-add a search result (either immediate library track OR background YouTube ingest) into open playlist
  const handleQuickAddSongToPlaylist = async (item: {
    id?: number;
    video_id: string;
    title: string;
    artist: string;
    duration_sec: number;
    thumbnail_url: string;
    source: string;
    url?: string;
  }) => {
    const activePl = playlists.find((p) => p.id === selectedPlaylistId);
    if (!activePl) return;

    setQuickAddingSongId(item.video_id);
    try {
      if (item.source === "library" && typeof item.id === "number") {
        const res = await fetch(`/api/admin/radio/playlists/${activePl.id}/tracks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track_id: item.id }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showBanner(`Added "${item.title}" to "${activePl.name}"`, "success");
          fetchPlaylistDetails(activePl.id);
          fetchPlaylists();
        } else {
          showBanner(data.error || "Failed to add library track", "error");
        }
        return;
      }

      const qRes = await fetch("/api/admin/radio/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracks: [
            {
              video_id: item.video_id,
              title: item.title,
              artist: item.artist || "GOODLIFE Resident",
              duration_sec: item.duration_sec || 180,
              thumbnail_url: item.thumbnail_url || `https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`,
            },
          ],
          genre: activePl.genre || "Amapiano",
          playlist_id: activePl.id,
          playlist_title: activePl.name,
          source_url: item.url || `https://www.youtube.com/watch?v=${item.video_id}`,
        }),
      });
      const qJson = await qRes.json();
      if (!qRes.ok || !qJson.job_id) {
        showBanner(qJson.error || "Failed to queue song ingestion into playlist", "error");
        return;
      }

      const job: PlaylistIngestJob = {
        job_id: qJson.job_id,
        playlist_id: activePl.id,
        playlist_name: activePl.name,
        total_tracks: qJson.total_tracks || 1,
        completed_tracks: 0,
        status: qJson.status || "queued",
        current_track: item.title,
        source_url: item.url || `https://www.youtube.com/watch?v=${item.video_id}`,
      };
      setIngestJobs((prev) => ({ ...prev, [job.job_id]: job }));
      showBanner(`Queued "${item.title}" for broadcast mastering into "${activePl.name}"`, "success");
    } catch (err: any) {
      showBanner(err?.message || "Failed to add song to playlist", "error");
    } finally {
      setQuickAddingSongId(null);
    }
  };

  // Preview YouTube / Spotify playlist URL to import into currently open playlist
  const handlePreviewImportPlaylistUrl = async () => {
    const url = importPlaylistUrl.trim();
    if (!url) return;
    setImportPlaylistPreviewing(true);
    try {
      const res = await fetch(`/api/admin/radio/playlist-preview?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.tracks) || data.tracks.length === 0) {
        setImportPlaylistPreview(null);
        showBanner(data.error || "Could not extract tracks from that playlist URL.", "error");
        return;
      }
      setImportPlaylistPreview({
        title: data.title || "Imported Playlist",
        source: data.source || "stream",
        tracks: data.tracks,
      });
    } catch (err: any) {
      showBanner(err?.message || "Failed to preview streaming playlist", "error");
    } finally {
      setImportPlaylistPreviewing(false);
    }
  };

  // Enqueue resolved YouTube / Spotify playlist URL into currently open playlist
  const handleImportExternalPlaylistToCurrent = async () => {
    const activePl = playlists.find((p) => p.id === selectedPlaylistId);
    if (!activePl || !importPlaylistPreview || importPlaylistPreview.tracks.length === 0) return;

    setImportingPlaylist(true);
    try {
      const qRes = await fetch("/api/admin/radio/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracks: importPlaylistPreview.tracks,
          genre: activePl.genre || "Amapiano",
          playlist_id: activePl.id,
          playlist_title: activePl.name,
          source_url: importPlaylistUrl.trim(),
        }),
      });
      const qJson = await qRes.json();
      if (!qRes.ok || !qJson.job_id) {
        showBanner(qJson.error || "Failed to enqueue playlist ingestion", "error");
        return;
      }

      const job: PlaylistIngestJob = {
        job_id: qJson.job_id,
        playlist_id: activePl.id,
        playlist_name: activePl.name,
        total_tracks: qJson.total_tracks || importPlaylistPreview.tracks.length,
        completed_tracks: 0,
        status: qJson.status || "queued",
        current_track: importPlaylistPreview.tracks[0]?.title,
        source_url: importPlaylistUrl.trim(),
      };
      setIngestJobs((prev) => ({ ...prev, [job.job_id]: job }));
      showBanner(
        `Queued ${job.total_tracks} tracks from "${importPlaylistPreview.title}" into "${activePl.name}"`,
        "success"
      );
      setImportPlaylistUrl("");
      setImportPlaylistPreview(null);
    } catch (err: any) {
      showBanner(err?.message || "Network error importing playlist", "error");
    } finally {
      setImportingPlaylist(false);
    }
  };

  // Merge / Copy all non-duplicate tracks from another saved GOODLIFE playlist into current playlist
  const handleMergeSavedPlaylist = async () => {
    const activePl = playlists.find((p) => p.id === selectedPlaylistId);
    const sourceId = parseInt(mergeSourcePlaylistId, 10);
    if (!activePl || isNaN(sourceId) || sourceId === activePl.id) return;

    setMergingPlaylist(true);
    try {
      const srcRes = await fetch(`/api/admin/radio/playlists/${sourceId}?_t=${Date.now()}`, {
        cache: "no-store",
      });
      const srcData = await srcRes.json();
      if (!srcRes.ok || !srcData.success || !Array.isArray(srcData.tracks)) {
        showBanner(srcData.error || "Failed to read source playlist", "error");
        return;
      }

      const currentIds = new Set(selectedPlaylistTracks.map((t) => t.id));
      const newIds = (srcData.tracks as Array<{ id: number }>)
        .map((t) => t.id)
        .filter((id) => !currentIds.has(id));

      if (newIds.length === 0) {
        showBanner("All tracks from that playlist are already in this playlist.", "success");
        return;
      }

      const addRes = await fetch(`/api/admin/radio/playlists/${activePl.id}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_ids: newIds }),
      });
      const addData = await addRes.json();
      if (addRes.ok && addData.success) {
        const addedCount = typeof addData.added === "number" ? addData.added : newIds.length;
        showBanner(`Merged ${addedCount} tracks into "${activePl.name}"`, "success");
        setMergeSourcePlaylistId("");
        fetchPlaylistDetails(activePl.id);
        fetchPlaylists();
      } else {
        showBanner(addData.error || "Failed to copy playlist tracks", "error");
      }
    } catch (err: any) {
      showBanner(err?.message || "Failed to merge saved playlist", "error");
    } finally {
      setMergingPlaylist(false);
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

  // Tracklist Sequence search, selection, drag & drop, and bulk actions state
  const [tracklistSearch, setTracklistSearch] = useState("");
  const [selectedPlaylistTrackIds, setSelectedPlaylistTrackIds] = useState<Set<number>>(new Set());
  const [draggedTrackId, setDraggedTrackId] = useState<number | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<number | null>(null);
  const [showBulkRemoveTracksModal, setShowBulkRemoveTracksModal] = useState(false);
  const [showBulkTransferModal, setShowBulkTransferModal] = useState(false);
  const [transferTargetPlaylistId, setTransferTargetPlaylistId] = useState("");
  const [transferMode, setTransferMode] = useState<"copy" | "move">("copy");
  const [bulkActionBusy, setBulkActionBusy] = useState(false);

  // Clear tracklist search & selection when active playlist changes
  useEffect(() => {
    setSelectedPlaylistTrackIds(new Set());
    setTracklistSearch("");
    setDraggedTrackId(null);
    setDragOverTrackId(null);
  }, [selectedPlaylistId]);

  // Filtered tracks in the current playlist
  const filteredPlaylistTracks = useMemo(() => {
    if (!tracklistSearch.trim()) return selectedPlaylistTracks;
    const q = tracklistSearch.toLowerCase().trim();
    return selectedPlaylistTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.dj_name && t.dj_name.toLowerCase().includes(q)) ||
        (t.genre && t.genre.toLowerCase().includes(q)) ||
        (t.musical_key && t.musical_key.toLowerCase().includes(q)) ||
        (t.bpm && String(t.bpm).includes(q))
    );
  }, [selectedPlaylistTracks, tracklistSearch]);

  const handleToggleSelectPlaylistTrack = (trackId: number) => {
    setSelectedPlaylistTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };

  const handleSelectAllFilteredTracks = () => {
    const next = new Set(selectedPlaylistTrackIds);
    const allFilteredSelected =
      filteredPlaylistTracks.length > 0 &&
      filteredPlaylistTracks.every((t) => next.has(t.id));

    if (allFilteredSelected) {
      filteredPlaylistTracks.forEach((t) => next.delete(t.id));
    } else {
      filteredPlaylistTracks.forEach((t) => next.add(t.id));
    }
    setSelectedPlaylistTrackIds(next);
  };

  const handleClearPlaylistTrackSelection = () => {
    setSelectedPlaylistTrackIds(new Set());
  };

  // Drag and drop reordering
  const handleTrackDrop = async (sourceTrackId: number, targetTrackId: number) => {
    if (sourceTrackId === targetTrackId || !selectedPlaylistId) return;
    const sourceIndex = selectedPlaylistTracks.findIndex((t) => t.id === sourceTrackId);
    const targetIndex = selectedPlaylistTracks.findIndex((t) => t.id === targetTrackId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const updated = [...selectedPlaylistTracks];
    const [moved] = updated.splice(sourceIndex, 1);
    updated.splice(targetIndex, 0, moved);

    setSelectedPlaylistTracks(updated);

    const reorderPayload = updated.map((t, pos) => ({
      track_id: t.id,
      position: pos,
    }));

    try {
      await fetch(`/api/admin/radio/playlists/${selectedPlaylistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: reorderPayload }),
      });
      showBanner(`Moved "${moved.title}" to position #${targetIndex + 1}`, "success");
    } catch (err: any) {
      showBanner("Failed to save reordered tracks", "error");
      fetchPlaylistDetails(selectedPlaylistId);
    }
  };

  // Bulk Move to Top
  const handleBulkMoveToTop = async () => {
    if (!selectedPlaylistId || selectedPlaylistTrackIds.size === 0) return;
    const selected = selectedPlaylistTracks.filter((t) => selectedPlaylistTrackIds.has(t.id));
    const unselected = selectedPlaylistTracks.filter((t) => !selectedPlaylistTrackIds.has(t.id));
    const updated = [...selected, ...unselected];
    setSelectedPlaylistTracks(updated);
    const reorderPayload = updated.map((t, pos) => ({ track_id: t.id, position: pos }));
    try {
      await fetch(`/api/admin/radio/playlists/${selectedPlaylistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: reorderPayload }),
      });
      showBanner(`Moved ${selected.length} track${selected.length > 1 ? "s" : ""} to top`, "success");
    } catch {
      showBanner("Failed to reorder tracks", "error");
      fetchPlaylistDetails(selectedPlaylistId);
    }
  };

  // Bulk Move to Bottom
  const handleBulkMoveToBottom = async () => {
    if (!selectedPlaylistId || selectedPlaylistTrackIds.size === 0) return;
    const selected = selectedPlaylistTracks.filter((t) => selectedPlaylistTrackIds.has(t.id));
    const unselected = selectedPlaylistTracks.filter((t) => !selectedPlaylistTrackIds.has(t.id));
    const updated = [...unselected, ...selected];
    setSelectedPlaylistTracks(updated);
    const reorderPayload = updated.map((t, pos) => ({ track_id: t.id, position: pos }));
    try {
      await fetch(`/api/admin/radio/playlists/${selectedPlaylistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: reorderPayload }),
      });
      showBanner(`Moved ${selected.length} track${selected.length > 1 ? "s" : ""} to bottom`, "success");
    } catch {
      showBanner("Failed to reorder tracks", "error");
      fetchPlaylistDetails(selectedPlaylistId);
    }
  };

  // Bulk Remove confirmed
  const handleConfirmBulkRemove = async () => {
    if (!selectedPlaylistId || selectedPlaylistTrackIds.size === 0) return;
    setBulkActionBusy(true);
    try {
      const ids = Array.from(selectedPlaylistTrackIds);
      const res = await fetch(`/api/admin/radio/playlists/${selectedPlaylistId}/tracks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_ids: ids }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showBanner(`Removed ${ids.length} track${ids.length > 1 ? "s" : ""} from playlist`, "success");
        setSelectedPlaylistTrackIds(new Set());
        setShowBulkRemoveTracksModal(false);
        fetchPlaylistDetails(selectedPlaylistId);
        fetchPlaylists();
      } else {
        showBanner(data.error || "Failed to remove tracks", "error");
      }
    } catch (err: any) {
      showBanner(err.message || "Failed to remove tracks", "error");
    } finally {
      setBulkActionBusy(false);
    }
  };

  // Bulk Copy / Move to another playlist
  const handleConfirmBulkTransfer = async () => {
    const targetId = parseInt(transferTargetPlaylistId, 10);
    if (!selectedPlaylistId || isNaN(targetId) || selectedPlaylistTrackIds.size === 0) return;
    setBulkActionBusy(true);
    try {
      const ids = Array.from(selectedPlaylistTrackIds);
      const addRes = await fetch(`/api/admin/radio/playlists/${targetId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_ids: ids }),
      });
      const addData = await addRes.json();
      if (!addRes.ok || !addData.success) {
        throw new Error(addData.error || "Failed to add tracks to target playlist");
      }

      if (transferMode === "move") {
        await fetch(`/api/admin/radio/playlists/${selectedPlaylistId}/tracks`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track_ids: ids }),
        });
        showBanner(`Moved ${ids.length} track${ids.length > 1 ? "s" : ""} to target playlist`, "success");
      } else {
        showBanner(`Copied ${ids.length} track${ids.length > 1 ? "s" : ""} to target playlist`, "success");
      }

      setSelectedPlaylistTrackIds(new Set());
      setShowBulkTransferModal(false);
      setTransferTargetPlaylistId("");
      fetchPlaylistDetails(selectedPlaylistId);
      fetchPlaylists();
    } catch (err: any) {
      showBanner(err.message || "Failed to transfer tracks", "error");
    } finally {
      setBulkActionBusy(false);
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                    Tracklist Sequence (Plays In This Order On Air)
                  </span>
                  {selectedPlaylist.is_broadcast_active &&
                    activeOnAirSetId &&
                    selectedPlaylistTracks.some((t) => t.id === activeOnAirSetId) && (
                      <button
                        type="button"
                        onClick={() => {
                          playingTrackRowRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                        }}
                        className="px-2.5 py-1 bg-[#E84855]/20 hover:bg-[#E84855] text-red-200 hover:text-white border border-[#E84855]/60 rounded-lg text-[10px] font-mono font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer"
                        title="Scroll directly to the currently playing track"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#F5C842] animate-ping" />
                        <span>Jump to Playing (#{selectedPlaylistTracks.findIndex((t) => t.id === activeOnAirSetId) + 1})</span>
                      </button>
                    )}
                </div>
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
                  {/* Drawer Mode Switcher: Library | Quick Add Song | Import Playlist / Merge */}
                  <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-white/10">
                    <button
                      type="button"
                      onClick={() => setAddDrawerMode("library")}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                        addDrawerMode === "library"
                          ? "bg-[#DFBB7D] text-[#16181D] shadow-[2px_2px_0px_#000]"
                          : "bg-white/5 hover:bg-white/15 text-white/75"
                      }`}
                    >
                      <Music2 className="w-3.5 h-3.5" />
                      <span>From Library</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddDrawerMode("quick_song")}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                        addDrawerMode === "quick_song"
                          ? "bg-[#DFBB7D] text-[#16181D] shadow-[2px_2px_0px_#000]"
                          : "bg-white/5 hover:bg-white/15 text-white/75"
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Quick Add Song (Search / Link)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddDrawerMode("import_playlist")}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                        addDrawerMode === "import_playlist"
                          ? "bg-[#DFBB7D] text-[#16181D] shadow-[2px_2px_0px_#000]"
                          : "bg-white/5 hover:bg-white/15 text-white/75"
                      }`}
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                      <span>Import Playlist / Merge</span>
                    </button>
                  </div>

                  {addDrawerMode === "library" && (
                    <>
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
                    </>
                  )}

                  {addDrawerMode === "quick_song" && (
                    <div className="space-y-3">
                      <form onSubmit={handleQuickSongSearch} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                          <input
                            type="text"
                            placeholder="Search YouTube/catalog OR paste YouTube song URL (watch?v= / youtu.be/)..."
                            value={quickSongQuery}
                            onChange={(e) => setQuickSongQuery(e.target.value)}
                            className="w-full bg-[#1A1D24] border-2 border-white/20 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D]"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={quickSongSearching || !quickSongQuery.trim()}
                          className="px-4 py-2 rounded-xl bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] font-mono font-black text-xs uppercase flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          {quickSongSearching ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Search className="w-3.5 h-3.5" />
                          )}
                          <span>{quickSongSearching ? "Searching..." : "Find Song"}</span>
                        </button>
                      </form>

                      {quickSongResults.length > 0 && (
                        <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                          {quickSongResults.map((item) => {
                            const isLib = item.source === "library";
                            const alreadyInPlaylist = isLib && typeof item.id === "number" && existingTrackIds.has(item.id);
                            const isBusy = quickAddingSongId === item.video_id;
                            const durM = Math.floor((item.duration_sec || 0) / 60);
                            const durS = String((item.duration_sec || 0) % 60).padStart(2, "0");
                            return (
                              <div
                                key={`${item.source}-${item.video_id}`}
                                className="p-2.5 rounded-xl bg-[#1A1D24] border border-white/15 flex items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {item.thumbnail_url && (
                                    <img
                                      src={item.thumbnail_url}
                                      alt={item.title}
                                      className="w-9 h-9 rounded-lg object-cover shrink-0 border border-white/20"
                                    />
                                  )}
                                  <div className="min-w-0">
                                    <div className="text-xs font-mono font-bold text-white truncate flex items-center gap-1.5">
                                      <span className="truncate">{item.title}</span>
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${
                                          isLib
                                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                            : "bg-[#DFBB7D]/20 text-[#DFBB7D] border border-[#DFBB7D]/40"
                                        }`}
                                      >
                                        {isLib ? "IN LIBRARY" : "YOUTUBE"}
                                      </span>
                                    </div>
                                    <div className="text-[10px] font-mono text-white/60 truncate">
                                      {item.artist || "Resident"} · {durM}:{durS}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={alreadyInPlaylist || isBusy}
                                  onClick={() => handleQuickAddSongToPlaylist(item)}
                                  className="px-3 py-1.5 rounded-lg bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] text-[10px] font-mono font-black uppercase shrink-0 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                                >
                                  {isBusy ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Plus className="w-3 h-3" />
                                  )}
                                  <span>
                                    {alreadyInPlaylist
                                      ? "Added"
                                      : isBusy
                                      ? "Adding..."
                                      : isLib
                                      ? "Add Now"
                                      : "Ingest to Playlist"}
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {addDrawerMode === "import_playlist" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Copy / Merge from existing GOODLIFE Playlist */}
                      <div className="p-3.5 rounded-xl bg-[#1A1D24] border border-white/15 space-y-2.5">
                        <div className="text-[11px] font-mono font-black uppercase text-[#DFBB7D] flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          <span>Copy from Saved Playlist</span>
                        </div>
                        <p className="text-[11px] font-mono text-white/60">
                          Merge non-duplicate tracks from any saved GOODLIFE playlist into &ldquo;{selectedPlaylist.name}&rdquo;.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={mergeSourcePlaylistId}
                            onChange={(e) => setMergeSourcePlaylistId(e.target.value)}
                            className="flex-1 bg-[#121316] border-2 border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#DFBB7D]"
                          >
                            <option value="">Select source playlist...</option>
                            {playlists
                              .filter((p) => p.id !== selectedPlaylist.id && p.track_count > 0)
                              .map((p) => (
                                <option key={p.id} value={String(p.id)}>
                                  {p.name} ({p.track_count} tracks)
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            disabled={!mergeSourcePlaylistId || mergingPlaylist}
                            onClick={handleMergeSavedPlaylist}
                            className="px-3.5 py-2 rounded-xl bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] font-mono font-black text-xs uppercase disabled:opacity-40 cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                          >
                            {mergingPlaylist ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Plus className="w-3.5 h-3.5" />
                            )}
                            <span>{mergingPlaylist ? "Merging..." : "Copy Tracks"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Import YouTube / Spotify Playlist URL directly into open playlist */}
                      <div className="p-3.5 rounded-xl bg-[#1A1D24] border border-white/15 space-y-2.5">
                        <div className="text-[11px] font-mono font-black uppercase text-[#DFBB7D] flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Import YouTube / Spotify Playlist Link</span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="url"
                            value={importPlaylistUrl}
                            onChange={(e) => {
                              setImportPlaylistUrl(e.target.value);
                              setImportPlaylistPreview(null);
                            }}
                            placeholder="https://open.spotify.com/playlist/... or youtube.com/playlist?list=..."
                            className="flex-1 bg-[#121316] border-2 border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D]"
                          />
                          <button
                            type="button"
                            disabled={!importPlaylistUrl.trim() || importPlaylistPreviewing}
                            onClick={handlePreviewImportPlaylistUrl}
                            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono font-bold text-xs uppercase disabled:opacity-40 cursor-pointer shrink-0"
                          >
                            {importPlaylistPreviewing ? "Resolving..." : "Preview"}
                          </button>
                        </div>

                        {importPlaylistPreview && (
                          <div className="p-2.5 rounded-lg bg-[#121316] border border-[#DFBB7D]/50 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-mono font-bold text-white truncate">
                                {importPlaylistPreview.title}
                              </div>
                              <div className="text-[10px] font-mono text-[#DFBB7D]">
                                {importPlaylistPreview.tracks.length} tracks ready · {importPlaylistPreview.source.toUpperCase()}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={importingPlaylist}
                              onClick={handleImportExternalPlaylistToCurrent}
                              className="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-[#16181D] font-mono font-black text-[10px] uppercase shrink-0 cursor-pointer disabled:opacity-40"
                            >
                              {importingPlaylist
                                ? "Queuing..."
                                : `+ Import ${importPlaylistPreview.tracks.length} Tracks`}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tracks List with Reordering & Search */}
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
                <div className="space-y-3">
                  {/* Tracklist Search & Selection Controls Toolbar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-[#121316] border border-white/15">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                      <input
                        type="text"
                        placeholder="Search playlist tracks (title, artist, genre, key, BPM)..."
                        value={tracklistSearch}
                        onChange={(e) => setTracklistSearch(e.target.value)}
                        className="w-full bg-[#1A1D24] border border-white/20 focus:border-[#DFBB7D] rounded-lg pl-8 pr-8 py-1.5 text-xs font-mono text-white placeholder-white/40 focus:outline-none transition-all"
                      />
                      {tracklistSearch && (
                        <button
                          type="button"
                          onClick={() => setTracklistSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-0.5"
                          title="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSelectAllFilteredTracks}
                        disabled={filteredPlaylistTracks.length === 0}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-[11px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                        title="Toggle selection for all visible tracks"
                      >
                        {filteredPlaylistTracks.length > 0 &&
                        filteredPlaylistTracks.every((t) => selectedPlaylistTrackIds.has(t.id)) ? (
                          <CheckSquare className="w-3.5 h-3.5 text-[#DFBB7D]" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-white/50" />
                        )}
                        <span>
                          {filteredPlaylistTracks.length > 0 &&
                          filteredPlaylistTracks.every((t) => selectedPlaylistTrackIds.has(t.id))
                            ? "Deselect All"
                            : `Select All (${filteredPlaylistTracks.length})`}
                        </span>
                      </button>

                      {tracklistSearch && (
                        <span className="text-[11px] font-mono text-[#DFBB7D] px-2 py-1 rounded bg-[#DFBB7D]/10 border border-[#DFBB7D]/20">
                          {filteredPlaylistTracks.length} / {selectedPlaylistTracks.length} tracks
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bulk Actions Sticky Toolbar */}
                  {selectedPlaylistTrackIds.size > 0 && (
                    <div className="p-3 bg-[#DFBB7D]/15 border-2 border-[#DFBB7D] rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-[0_4px_16px_rgba(223,187,125,0.15)] animate-fadeIn">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#DFBB7D]" />
                        <span className="text-xs font-mono font-bold text-white">
                          <span className="text-[#DFBB7D] font-black">{selectedPlaylistTrackIds.size}</span> tracks selected
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleBulkMoveToTop}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-mono font-bold uppercase flex items-center gap-1 transition-all cursor-pointer"
                          title="Move all selected tracks to top of playlist"
                        >
                          <ChevronsUp className="w-3.5 h-3.5 text-[#DFBB7D]" />
                          <span>Move to Top</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleBulkMoveToBottom}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-mono font-bold uppercase flex items-center gap-1 transition-all cursor-pointer"
                          title="Move all selected tracks to bottom of playlist"
                        >
                          <ChevronsDown className="w-3.5 h-3.5 text-[#DFBB7D]" />
                          <span>Move to Bottom</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowBulkTransferModal(true)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#DFBB7D]/20 hover:bg-[#DFBB7D] text-[#DFBB7D] hover:text-[#16181D] border border-[#DFBB7D]/50 text-[11px] font-mono font-bold uppercase flex items-center gap-1 transition-all cursor-pointer"
                          title="Copy or Move selected tracks to another playlist"
                        >
                          <FolderInput className="w-3.5 h-3.5" />
                          <span>Copy / Move to Playlist...</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowBulkRemoveTracksModal(true)}
                          className="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white border border-red-500/40 text-[11px] font-mono font-bold uppercase flex items-center gap-1 transition-all cursor-pointer"
                          title="Remove selected tracks from this playlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove ({selectedPlaylistTrackIds.size})</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleClearPlaylistTrackSelection}
                          className="px-2 py-1 text-[11px] font-mono text-white/60 hover:text-white underline cursor-pointer ml-1"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}

                  {filteredPlaylistTracks.length === 0 ? (
                    <div className="p-8 text-center rounded-xl bg-[#121316] border border-white/15 text-white/60 font-mono text-xs">
                      No tracks match &ldquo;{tracklistSearch}&rdquo; in this playlist.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredPlaylistTracks.map((track) => {
                        const realIdx = selectedPlaylistTracks.findIndex((t) => t.id === track.id);
                        const isSelected = selectedPlaylistTrackIds.has(track.id);
                        const isBeingDragged = draggedTrackId === track.id;
                        const isDragOver = dragOverTrackId === track.id;
                        const isPlayingNow =
                          Boolean(selectedPlaylist.is_broadcast_active) &&
                          activeOnAirSetId === track.id &&
                          (!activeOnAirPlaylistId || activeOnAirPlaylistId === selectedPlaylist.id);

                        return (
                          <div
                            key={track.id}
                            ref={isPlayingNow ? playingTrackRowRef : undefined}
                            draggable={true}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", String(track.id));
                              setDraggedTrackId(track.id);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (dragOverTrackId !== track.id) {
                                setDragOverTrackId(track.id);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverTrackId === track.id) {
                                setDragOverTrackId(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedTrackId !== null && draggedTrackId !== track.id) {
                                handleTrackDrop(draggedTrackId, track.id);
                              }
                              setDraggedTrackId(null);
                              setDragOverTrackId(null);
                            }}
                            onDragEnd={() => {
                              setDraggedTrackId(null);
                              setDragOverTrackId(null);
                            }}
                            className={`p-2.5 sm:p-3 rounded-xl flex items-center gap-2 sm:gap-3 group transition-all select-none ${
                              isPlayingNow
                                ? "bg-gradient-to-r from-[#DFBB7D]/25 via-[#222733] to-[#1A1D24] border-2 border-[#DFBB7D] shadow-[0_0_20px_rgba(223,187,125,0.22)] ring-1 ring-[#F5C842]/40"
                                : isSelected
                                ? "bg-[#DFBB7D]/15 border-2 border-[#DFBB7D]"
                                : "bg-[#1A1D24] border border-white/15 hover:border-[#DFBB7D] hover:bg-[#202530]"
                            } ${
                              isBeingDragged ? "opacity-30 scale-[0.98] border-dashed border-[#DFBB7D]" : ""
                            } ${
                              isDragOver ? "border-t-4 border-t-[#DFBB7D] bg-[#DFBB7D]/10" : ""
                            }`}
                          >
                            {/* Drag handle */}
                            <div
                              className="cursor-grab active:cursor-grabbing text-white/30 group-hover:text-white/80 p-1 rounded hover:bg-white/10 shrink-0 transition-colors"
                              title="Drag up or down to reorder track position"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>

                            {/* Checkbox for selection */}
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectPlaylistTrack(track.id)}
                              className="w-4 h-4 rounded accent-[#DFBB7D] cursor-pointer shrink-0"
                              title="Select track for bulk actions"
                            />

                            {/* Position Number */}
                            <span
                              className={`text-xs font-mono font-bold w-6 sm:w-7 text-right shrink-0 ${
                                isPlayingNow ? "text-[#F5C842] font-black" : "text-[#DFBB7D]"
                              }`}
                            >
                              {isPlayingNow ? `▶ ${realIdx + 1}` : realIdx + 1}
                            </span>

                            {/* Cover art */}
                            <div
                              className={`w-10 h-10 rounded-lg overflow-hidden bg-black shrink-0 border ${
                                isPlayingNow ? "border-[#F5C842] ring-2 ring-[#DFBB7D]/40" : "border-white/20"
                              }`}
                            >
                              {track.cover_url ? (
                                <img
                                  src={track.cover_url}
                                  alt={track.title}
                                  className="w-full h-full object-cover pointer-events-none"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/40">
                                  <Music2 className="w-4 h-4" />
                                </div>
                              )}
                            </div>

                            {/* Track Details */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-mono font-bold text-white truncate flex items-center gap-2">
                                <span className={isPlayingNow ? "text-[#F5C842] font-black" : ""}>
                                  {track.title}
                                </span>
                                {isPlayingNow && (
                                  <span className="px-2 py-0.5 rounded bg-[#E84855] text-white text-[9px] font-mono font-black uppercase tracking-wider flex items-center gap-1 shrink-0 animate-pulse shadow-sm">
                                    <Radio className="w-2.5 h-2.5" />
                                    ON AIR NOW
                                  </span>
                                )}
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

                            {/* Reorder, Edit and Delete controls */}
                            <div className="flex items-center gap-1 shrink-0">
                              {onEditTrack && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const libMatch = library.find((l) => l.id === track.id);
                                    onEditTrack(
                                      libMatch || {
                                        ...track,
                                        cover_url: track.cover_url || "",
                                        file_size: 0,
                                        bitrate: 160,
                                        processing_status: "ready",
                                        play_count: 0,
                                        is_active: true,
                                        is_full_set: Boolean(track.is_full_set),
                                        display_order: track.position,
                                        source_type: "r2",
                                        created_at: new Date().toISOString(),
                                      }
                                    );
                                  }}
                                  className="p-1.5 rounded-lg bg-white/10 text-[#DFBB7D] hover:bg-[#DFBB7D] hover:text-[#16181D] border border-white/20 transition-all cursor-pointer"
                                  title="Edit track properties"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                disabled={realIdx <= 0}
                                onClick={() => handleMoveTrack(realIdx, "up")}
                                className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 hover:text-[#DFBB7D] border border-white/20 disabled:opacity-20 transition-all"
                                title="Move up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                disabled={realIdx === -1 || realIdx >= selectedPlaylistTracks.length - 1}
                                onClick={() => handleMoveTrack(realIdx, "down")}
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
                        );
                      })}
                    </div>
                  )}
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

      {/* Custom Delete Playlist Confirmation Modal */}
      {deleteModalTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !deletingPlaylist && setDeleteModalTarget(null)}
        >
          <div
            className="bg-[#16181D] border-2 border-[#E84855] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-[6px_6px_0px_#000] font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-3">
              <div className="flex items-center gap-2.5 text-white font-black text-sm uppercase">
                <div className="p-1.5 rounded-lg bg-[#E84855]/20 text-[#E84855] border border-[#E84855]/40">
                  <Trash2 className="w-4 h-4" />
                </div>
                <span>Delete Playlist</span>
              </div>
              <button
                type="button"
                disabled={deletingPlaylist}
                onClick={() => setDeleteModalTarget(null)}
                className="p-1 rounded-lg text-white/60 hover:text-white cursor-pointer disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-white/80 leading-relaxed">
              <p>
                Are you sure you want to delete playlist{" "}
                <span className="font-black text-[#DFBB7D]">&ldquo;{deleteModalTarget.name}&rdquo;</span>?
              </p>
              <p className="text-[11px] text-white/50">
                Songs stay safely in your main Music Library; only this curated playlist sequence will be removed.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deletingPlaylist}
                onClick={() => setDeleteModalTarget(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold uppercase cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingPlaylist}
                onClick={executeDeletePlaylist}
                className="px-4 py-2 rounded-xl bg-[#E84855] hover:bg-red-500 text-white text-xs font-black uppercase flex items-center gap-1.5 shadow-[2px_2px_0px_#000] cursor-pointer disabled:opacity-50"
              >
                {deletingPlaylist ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Playlist</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Undo Reorder Confirmation Modal */}
      {showUndoModal && selectedPlaylist && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !undoingReorder && setShowUndoModal(false)}
        >
          <div
            className="bg-[#16181D] border-2 border-[#DFBB7D] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-[6px_6px_0px_#000] font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-3">
              <div className="flex items-center gap-2 text-white font-black text-sm uppercase">
                <Undo2 className="w-4 h-4 text-[#DFBB7D]" />
                <span>Restore Previous Order</span>
              </div>
              <button
                type="button"
                disabled={undoingReorder}
                onClick={() => setShowUndoModal(false)}
                className="p-1 rounded-lg text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-white/80 leading-relaxed">
              <p>
                Revert <span className="font-bold text-[#DFBB7D]">{selectedPlaylist.name}</span> to the previous saved snapshot? (One-way undo.)
              </p>
              {selectedPlaylist.is_broadcast_active && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#DFBB7D]/10 border border-[#DFBB7D]/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={undoReanchor}
                    onChange={(e) => setUndoReanchor(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-[#DFBB7D]"
                  />
                  <span className="text-[11px] text-white">
                    Playlist is <strong className="text-[#DFBB7D]">LIVE ON AIR</strong> — re-anchor broadcast timeline cleanly to Track #1?
                  </span>
                </label>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={undoingReorder}
                onClick={() => setShowUndoModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={undoingReorder}
                onClick={executeUndoReorder}
                className="px-4 py-2 rounded-xl bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] text-xs font-black uppercase flex items-center gap-1.5 shadow-[2px_2px_0px_#000] cursor-pointer disabled:opacity-50"
              >
                {undoingReorder ? "Restoring..." : "Restore Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Harmonize Unindexed Catalog Confirmation Modal */}
      {showHarmonizeAllModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowHarmonizeAllModal(false)}
        >
          <div
            className="bg-[#16181D] border-2 border-[#DFBB7D] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-[6px_6px_0px_#000] font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-3">
              <div className="flex items-center gap-2 text-white font-black text-sm uppercase">
                <Zap className="w-4 h-4 text-[#DFBB7D]" />
                <span>Harmonize {unindexedCount} Unindexed Tracks</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHarmonizeAllModal(false)}
                className="p-1 rounded-lg text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-white/80 leading-relaxed">
              Analyze audio tempo (BPM), Camelot musical key, and energy across{" "}
              <span className="font-bold text-[#DFBB7D]">{unindexedCount}</span> unindexed library tracks via the parallel studio bridge?
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowHarmonizeAllModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeHarmonizeAll}
                className="px-4 py-2 rounded-xl bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] text-xs font-black uppercase shadow-[2px_2px_0px_#000] cursor-pointer"
              >
                Start Harmonizing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Bulk Remove Songs Confirmation Modal */}
      {showBulkRemoveTracksModal && selectedPlaylist && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowBulkRemoveTracksModal(false)}
        >
          <div
            className="bg-[#16181D] border-2 border-red-500/50 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-[6px_6px_0px_#000] font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-3">
              <div className="flex items-center gap-2 text-white font-black text-sm uppercase">
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>Remove {selectedPlaylistTrackIds.size} Songs</span>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkRemoveTracksModal(false)}
                className="p-1 rounded-lg text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-white/80 leading-relaxed">
              Remove <span className="font-bold text-red-400">{selectedPlaylistTrackIds.size}</span> selected song{selectedPlaylistTrackIds.size > 1 ? "s" : ""} from{" "}
              <span className="font-bold text-white">&ldquo;{selectedPlaylist.name}&rdquo;</span>?
            </p>
            <p className="text-[11px] text-white/50 leading-relaxed">
              Songs will only be removed from this playlist. They will remain intact in your main music library.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={bulkActionBusy}
                onClick={() => setShowBulkRemoveTracksModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionBusy}
                onClick={handleConfirmBulkRemove}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-black uppercase shadow-[2px_2px_0px_#000] cursor-pointer flex items-center gap-1.5"
              >
                {bulkActionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{bulkActionBusy ? "Removing..." : "Remove Songs"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Bulk Copy / Move to Another Playlist Modal */}
      {showBulkTransferModal && selectedPlaylist && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowBulkTransferModal(false)}
        >
          <div
            className="bg-[#16181D] border-2 border-[#DFBB7D] rounded-2xl p-6 max-w-md w-full space-y-4 shadow-[6px_6px_0px_#000] font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-3">
              <div className="flex items-center gap-2 text-white font-black text-sm uppercase">
                <FolderInput className="w-4 h-4 text-[#DFBB7D]" />
                <span>Transfer {selectedPlaylistTrackIds.size} Songs</span>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkTransferModal(false)}
                className="p-1 rounded-lg text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-white/70 uppercase block mb-1.5">
                  Action Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTransferMode("copy")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase transition-all cursor-pointer ${
                      transferMode === "copy"
                        ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D] shadow-[2px_2px_0px_#000]"
                        : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    Copy to Playlist
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferMode("move")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase transition-all cursor-pointer ${
                      transferMode === "move"
                        ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D] shadow-[2px_2px_0px_#000]"
                        : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    Move to Playlist
                  </button>
                </div>
                <p className="text-[10px] text-white/50 mt-1">
                  {transferMode === "copy"
                    ? "Keeps songs in this playlist and also copies them to destination."
                    : "Moves songs to destination and removes them from this playlist."}
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-white/70 uppercase block mb-1.5">
                  Destination Playlist
                </label>
                <select
                  value={transferTargetPlaylistId}
                  onChange={(e) => setTransferTargetPlaylistId(e.target.value)}
                  className="w-full bg-[#121316] border-2 border-white/20 focus:border-[#DFBB7D] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                >
                  <option value="">Choose destination playlist...</option>
                  {playlists
                    .filter((p) => p.id !== selectedPlaylist.id)
                    .map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name} ({p.track_count} tracks)
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={bulkActionBusy}
                onClick={() => setShowBulkTransferModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionBusy || !transferTargetPlaylistId}
                onClick={handleConfirmBulkTransfer}
                className="px-4 py-2 rounded-xl bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] text-xs font-black uppercase shadow-[2px_2px_0px_#000] cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              >
                {bulkActionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {bulkActionBusy
                    ? "Transferring..."
                    : transferMode === "move"
                    ? "Move Tracks"
                    : "Copy Tracks"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

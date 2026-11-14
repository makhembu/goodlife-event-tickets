"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  Radio,
  ArrowLeft,
  Search,
  ListMusic,
  Upload,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUp,
  ArrowDown,
  Volume2,
  Sparkles,
  CheckSquare,
  Square,
  RadioTower,
  Mic,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from "lucide-react";
import { RadioSet, IngestJobTrack, RadioSettings, BroadcastMode } from "@/lib/radio/types";
import RadioConsoleLayout from "@/components/admin/radio/RadioConsoleLayout";
import { ConsoleTab } from "@/components/admin/radio/ConsoleSidebar";
import AiDropGenerator from "@/components/admin/radio/AiDropGenerator";
import PerformanceSoundboard from "@/components/admin/radio/PerformanceSoundboard";
import CueDock, { CueDropItem } from "@/components/admin/radio/CueDock";
import DropStudio from "@/components/admin/radio/DropStudio";
import BrowserMicRecorder from "@/components/admin/radio/BrowserMicRecorder";
import OnAirRundown from "@/components/admin/radio/OnAirRundown";
import QueueNextTrack from "@/components/admin/radio/QueueNextTrack";
import DecksConnectCard from "@/components/admin/radio/DecksConnectCard";
import DropManagerPanel from "@/components/admin/radio/DropManagerPanel";
import RadioTelemetryLogs from "@/components/admin/radio/RadioTelemetryLogs";
import RadioOverridesEditor from "@/components/admin/radio/RadioOverridesEditor";
import PlaylistManagerPanel from "@/components/admin/radio/PlaylistManagerPanel";
import TrackEditDrawer from "@/components/admin/radio/TrackEditDrawer";
import LibraryIngestDock from "@/components/admin/radio/LibraryIngestDock";
import ScheduleManager from "@/components/admin/radio/ScheduleManager";
import { KenyaListenerMap } from "@/components/admin/radio/KenyaListenerMap";
import { AutomationHealthWidget } from "@/components/admin/radio/AutomationHealthWidget";
import { SoundboardProvider } from "@/context/SoundboardContext";
import AssignToPadSheet from "@/components/admin/radio/AssignToPadSheet";
import { useRadio } from "@/context/RadioContext";
import { formatTrackTitle } from "@/lib/radio/media-helpers";

export default function AdminRadioPage() {
  const { airLiveDrop, setManualDucking, fetchRadioLive } = useRadio();
  const [activeTab, setActiveTabState] = useState<ConsoleTab>("studio");

  useEffect(() => {
    try {
      const hash = window.location.hash.replace("#", "") as ConsoleTab;
      const validTabs: ConsoleTab[] = ["studio", "drops", "library", "playlists", "live", "telemetry", "overrides"];
      if (validTabs.includes(hash)) {
        setActiveTabState(hash);
      } else {
        const saved = localStorage.getItem("goodlife_admin_radio_tab") as ConsoleTab;
        if (validTabs.includes(saved)) {
          setActiveTabState(saved);
        }
      }
    } catch {}
  }, []);

  const setActiveTab = (tab: ConsoleTab) => {
    setActiveTabState(tab);
    if (tab === "library" || tab === "playlists") {
      fetchAvailablePlaylists();
    }
    try {
      localStorage.setItem("goodlife_admin_radio_tab", tab);
      window.location.hash = tab;
    } catch {}
  };
  const [studioDeck, setStudioDeck] = useState<"perform" | "playout" | "drops">("perform");
  const [library, setLibrary] = useState<RadioSet[]>([]);
  const [loadingLib, setLoadingLib] = useState(true);
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);

  // Studio cue & ducking state
  const [cueItem, setCueItem] = useState<CueDropItem | null>(null);
  const [isDucking, setIsDucking] = useState(false);
  const [syncedBroadcastTrack, setSyncedBroadcastTrack] = useState<{
    id: number;
    title: string;
    dj_name?: string | null;
  } | null>(null);
  const [syncedBroadcastNext, setSyncedBroadcastNext] = useState<{
    id: number;
    title: string;
    dj_name?: string | null;
  } | null>(null);

  // Uploads blob audio if needed, broadcasts to live stream for all listeners (Stream only, no local echo)
  const handleFireCueOnAir = async (item: CueDropItem) => {
    setIsDucking(true);
    let targetUrl = item.audioUrl;
    if (targetUrl.startsWith("blob:")) {
      try {
        const blob = await fetch(targetUrl).then((r) => r.blob());
        const formData = new FormData();
        formData.append("audio", blob, "drop.webm");
        formData.append("name", item.title || "mic_drop");
        const upRes = await fetch("/api/admin/radio/drops/upload", {
          method: "POST",
          body: formData,
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          if (upData.audio_url) targetUrl = upData.audio_url;
        }
      } catch (e) {
        console.warn("Failed to upload blob before firing on air:", e);
      }
    }
    await airLiveDrop({
      audioUrl: targetUrl,
      title: item.title,
      persona: item.persona,
      script: item.script,
    });
    // Stream only: do NOT play locally via new Audio() to prevent double-play echo!
    setTimeout(() => setIsDucking(false), 4500);
  };

  // Search tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<IngestJobTrack[]>([]);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<IngestJobTrack[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [importGenre, setImportGenre] = useState("Afro House");

  // Ingestion job tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{
    completed: number;
    total: number;
    status: string;
    currentTrack?: string;
  } | null>(null);

  // Direct upload tab state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDj, setUploadDj] = useState("");
  const [uploadGenre, setUploadGenre] = useState("Afro House");
  const [isHighQuality, setIsHighQuality] = useState(true);
  const [uploadDurationSec, setUploadDurationSec] = useState<number | null>(null);
  const [uploadIsFullSet, setUploadIsFullSet] = useState(false);
  const [libSearchQuery, setLibSearchQuery] = useState("");
  const [libSelectedGenre, setLibSelectedGenre] = useState("ALL");
  const [libPage, setLibPage] = useState(1);
  const libPageSize = 25;
  const [editingTrack, setEditingTrack] = useState<RadioSet | null>(null);
  const [rundownRefreshTick, setRundownRefreshTick] = useState(0);
  const [uploadTargetPlaylistId, setUploadTargetPlaylistId] = useState<number | null>(null);
  const [availablePlaylists, setAvailablePlaylists] = useState<{ id: number; name: string; genre: string }[]>([]);
  const [quickAddPlaylistMap, setQuickAddPlaylistMap] = useState<Record<number, number>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadSuccessBanner, setUploadSuccessBanner] = useState<string | null>(null);
  const [uploadErrorBanner, setUploadErrorBanner] = useState<string | null>(null);

  // Live broadcast state
  const [broadcastMode, setBroadcastMode] = useState<BroadcastMode>("curated");
  const [liveStreamUrl, setLiveStreamUrl] = useState("");
  const [liveTitle, setLiveTitle] = useState("GOODLIFE MAIN STAGE LIVE");
  const [fallbackSetId, setFallbackSetId] = useState<number | null>(null);
  const [savingLive, setSavingLive] = useState(false);

  // Inline audio preview player
  const [previewTrackUrl, setPreviewTrackUrl] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Status banners
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Live on-air state (is someone broadcasting via Icecast/Harbor?)
  const [liveOnAirStatus, setLiveOnAirStatus] = useState<{
    isConnected: boolean;
    type: "autodj" | "presenter" | "admin";
    name: string | null;
    showTitle: string | null;
  }>({
    isConnected: false,
    type: "autodj",
    name: null,
    showTitle: null,
  });

  const showMsg = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // Load Library & Settings
  const fetchLibrary = async () => {
    try {
      setLoadingLib(true);
      const res = await fetch("/api/admin/radio/library");
      if (res.ok) {
        const data = await res.json();
        setLibrary(data || []);
      }
    } catch {
      showMsg("Failed to load radio library", "error");
    } finally {
      setLoadingLib(false);
    }
  };

  const fetchBroadcastSettings = async () => {
    try {
      const res = await fetch("/api/admin/radio/broadcast");
      if (res.ok) {
        const data: RadioSettings = await res.json();
        setBroadcastMode(data.broadcast_mode || "curated");
        setLiveStreamUrl(data.live_stream_url || "");
        setLiveTitle(data.live_title || "GOODLIFE MAIN STAGE LIVE");
        setFallbackSetId(data.live_fallback_set_id || null);
      }
    } catch {}
  };

  const fetchAvailablePlaylists = async () => {
    try {
      const res = await fetch("/api/admin/radio/playlists");
      const data = await res.json();
      if (data.success && Array.isArray(data.playlists)) {
        setAvailablePlaylists(
          data.playlists.map((p: any) => ({
            id: p.id,
            name: p.name,
            genre: p.genre,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to fetch available playlists:", err);
    }
  };

  const checkBridgeHealth = async () => {
    try {
      const res = await fetch("/api/admin/radio/health");
      const data = await res.json();
      setBridgeOnline(Boolean(data.ok));
      setLiveOnAirStatus({
        isConnected: Boolean(data.live_dj_connected),
        type: data.live_type || "autodj",
        name: data.live_dj_name || null,
        showTitle: data.live_show?.show_title || data.live_title || null,
      });
    } catch {
      setBridgeOnline(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLibrary();
      fetchBroadcastSettings();
      fetchAvailablePlaylists();
      checkBridgeHealth();
    }, 0);
    const hInterval = setInterval(checkBridgeHealth, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(hInterval);
    };
  }, []);

  // Poll Ingestion Job Progress
  useEffect(() => {
    if (!activeJobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/radio/queue?job_id=${activeJobId}`);
        if (res.ok) {
          const job = await res.json();
          setJobProgress({
            completed: job.completed_tracks || 0,
            total: job.total_tracks || 0,
            status: job.status || "processing",
            currentTrack: job.current_track,
          });
          if (job.status === "completed") {
            clearInterval(interval);
            setActiveJobId(null);
            showMsg(`Ingestion complete: ${job.completed_tracks} tracks added to library`, "success");
            fetchLibrary();
          } else if (job.status === "failed") {
            clearInterval(interval);
            setActiveJobId(null);
            showMsg(`Ingestion job failed: ${job.error_message || "Unknown error"}`, "error");
          }
        }
      } catch {}
    }, 2500);
    return () => clearInterval(interval);
  }, [activeJobId]);

  // 1. Search Invidious / YouTube
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/admin/radio/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (res.ok) {
        setSearchResults(data || []);
      } else {
        showMsg(data.error || "Search failed", "error");
      }
    } catch {
      showMsg("Failed to reach search endpoint", "error");
    } finally {
      setSearching(false);
    }
  };

  // 2. Playlist Preview
  const handlePlaylistPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistUrl.trim()) return;
    setLoadingPlaylist(true);
    setPlaylistTracks([]);
    try {
      const res = await fetch(`/api/admin/radio/playlist-preview?url=${encodeURIComponent(playlistUrl.trim())}`);
      const data = await res.json();
      if (res.ok && data.tracks) {
        setPlaylistTracks(data.tracks);
        showMsg(`Autoloaded ${data.tracks.length} tracks`, "success");
      } else {
        showMsg(data.error || "Playlist preview failed", "error");
      }
    } catch {
      showMsg("Playlist preview error", "error");
    } finally {
      setLoadingPlaylist(false);
    }
  };

  // Direct Upload handler
  const handleDirectUpload = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!uploadFile) {
      showMsg("Please select an audio file", "error");
      return;
    }

    setUploadState("uploading");
    setUploading(true);
    setUploadProgress(5);
    setUploadErrorBanner(null);
    setUploadSuccessBanner(null);

    try {
      const presignedRes = await fetch("/api/admin/radio/multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "presigned",
          filename: uploadFile.name,
          contentType: uploadFile.type || "audio/mpeg",
          isHighQuality,
        }),
      });

      if (!presignedRes.ok) {
        const errJson = await presignedRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to get presigned R2 upload URL");
      }

      const { uploadUrl, publicUrl, key } = await presignedRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", uploadFile.type || "audio/mpeg");

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percentComplete = Math.round((evt.loaded / evt.total) * 90);
            setUploadProgress(Math.max(5, percentComplete));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Cloudflare R2 rejected upload with HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error uploading directly to Cloudflare R2"));
        xhr.send(uploadFile);
      });

      setUploadProgress(95);

      // Register uploaded set in database via authenticated endpoint
      const regRes = await fetch("/api/admin/radio/register-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: uploadTitle.trim() || uploadFile.name.replace(/\.[^/.]+$/, ""),
          djName: uploadDj.trim() || "Goodlife Resident",
          genre: uploadGenre,
          audioUrl: publicUrl,
          durationSec: uploadDurationSec || 180,
          is_full_set: uploadIsFullSet,
          isHighQuality,
          playlistId: uploadTargetPlaylistId,
        }),
      });

      if (!regRes.ok) {
        throw new Error("Failed to register set in database");
      }

      setUploadProgress(100);
      setUploadState("success");
      setUploadSuccessBanner(`Successfully uploaded "${uploadTitle || uploadFile.name}" to radio library!`);
      setUploadFile(null);
      setUploadTitle("");
      setUploadDj("");
      setUploadDurationSec(null);
      setUploadIsFullSet(false);
      fetchLibrary();
    } catch (err: any) {
      setUploadState("error");
      setUploadErrorBanner(err.message || "Failed to upload file to Cloudflare R2");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveLiveBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLive(true);
    try {
      const res = await fetch("/api/admin/radio/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broadcast_mode: broadcastMode,
          live_stream_url: liveStreamUrl.trim(),
          live_title: liveTitle.trim(),
          live_fallback_set_id: fallbackSetId,
        }),
      });
      if (res.ok) {
        showMsg("Broadcast settings updated!", "success");
      } else {
        showMsg("Failed to save settings", "error");
      }
    } catch {
      showMsg("Network error saving broadcast settings", "error");
    } finally {
      setSavingLive(false);
    }
  };

  const togglePreview = (url: string) => {
    if (!audioPreviewRef.current) return;
    if (previewTrackUrl === url && isPreviewPlaying) {
      audioPreviewRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      setPreviewTrackUrl(url);
      audioPreviewRef.current.src = url;
      audioPreviewRef.current.play().then(() => setIsPreviewPlaying(true)).catch(() => {});
    }
  };

  const deleteTrack = async (id: number) => {
    if (!confirm("Are you sure you want to delete this track from the station?")) return;
    try {
      const res = await fetch(`/api/admin/radio/library?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        showMsg("Track deleted from station", "success");
        fetchLibrary();
      } else {
        showMsg("Failed to delete track", "error");
      }
    } catch {
      showMsg("Error deleting track", "error");
    }
  };

  const moveTrack = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= library.length) return;

    const newLib = [...library];
    const temp = newLib[index];
    newLib[index] = newLib[targetIndex];
    newLib[targetIndex] = temp;
    setLibrary(newLib);

    try {
      await fetch("/api/admin/radio/library/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_ids: newLib.map((s) => s.id) }),
      });
    } catch {}
  };

  // Music Library filtering & pagination
  const filteredLibrary = useMemo(() => {
    let list = library;
    if (libSelectedGenre && libSelectedGenre !== "ALL") {
      list = list.filter((s) => s.genre?.toLowerCase() === libSelectedGenre.toLowerCase());
    }
    if (libSearchQuery.trim()) {
      const q = libSearchQuery.toLowerCase();
      list = list.filter((s) =>
        s.title?.toLowerCase().includes(q) ||
        s.dj_name?.toLowerCase().includes(q) ||
        s.genre?.toLowerCase().includes(q) ||
        (s.bpm && String(s.bpm).includes(q))
      );
    }
    return list;
  }, [library, libSelectedGenre, libSearchQuery]);

  const totalLibPages = Math.max(1, Math.ceil(filteredLibrary.length / libPageSize));
  const currentLibPage = Math.min(libPage, totalLibPages);
  const paginatedLibrary = useMemo(() => {
    const start = (currentLibPage - 1) * libPageSize;
    return filteredLibrary.slice(start, start + libPageSize);
  }, [filteredLibrary, currentLibPage, libPageSize]);

  // Unique genres for filter pills
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    library.forEach((s) => {
      if (s.genre) set.add(s.genre);
    });
    return Array.from(set);
  }, [library]);

  const handleSkipBroadcast = async () => {
    try {
      const res = await fetch("/api/admin/radio/azuracast/skip", { method: "POST" });
      if (res.ok) {
        showMsg("Broadcast advanced to next track", "success");
        // Immediately synchronize local audio playback with new broadcast track
        await fetchRadioLive();
      } else {
        showMsg("Failed to skip track on broadcast server", "error");
      }
    } catch {
      showMsg("Network error issuing skip command", "error");
    }
  };

  return (
    <RadioConsoleLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      streamUrl={liveStreamUrl}
      isDucking={isDucking}
      bridgeOnline={bridgeOnline}
      onSkip={handleSkipBroadcast}
    >
      <SoundboardProvider>
        {/* Toast Alert Banner */}
      {message && (
        <div className={`mb-4 p-3 border-2 font-mono text-xs flex items-center justify-between shadow-[2px_2px_0px_#000] ${
          message.type === "success"
            ? "bg-[#10B981]/20 border-[#10B981] text-emerald-300 font-bold"
            : "bg-[#E84855]/20 border-[#E84855] text-red-300 font-bold"
        }`}>
          <div className="flex items-center space-x-2">
            {message.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="font-bold px-1 text-sm text-white/70 hover:text-white">×</button>
        </div>
      )}

      {/* VIEW 1: STUDIO COCKPIT (DUAL DECK ON DESKTOP, SUB-DECK SWITCHER ON MOBILE) */}
      {activeTab === "studio" && (
        <div className="space-y-4">
          {/* Live Ingest Alert: Notifies admin when presenter/admin is live on air and cockpit playout is overridden */}
          {liveOnAirStatus.isConnected && (
            <div className="bg-amber-500/15 border-2 border-amber-400 p-3 shadow-[3px_3px_0px_#000] font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="p-1.5 bg-amber-400 text-black font-black shrink-0 mt-0.5 sm:mt-0">
                  <RadioTower className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-amber-300 uppercase tracking-wider">
                      LIVE BROADCAST IN PROGRESS:
                    </span>
                    <span className="px-2 py-0.5 bg-black/60 border border-amber-400/50 text-white font-bold">
                      {liveOnAirStatus.type === "admin"
                        ? "ADMIN MASTER TAKEOVER"
                        : `DJ ${liveOnAirStatus.name || "LIVE PRESENTER"}`}
                    </span>
                    {liveOnAirStatus.showTitle && (
                      <span className="text-white/70 text-[11px]">
                        ({liveOnAirStatus.showTitle})
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-amber-200/90 mt-1">
                    ⚠️ The station feed is currently locked to direct hardware/Icecast ingest. Cockpit playlist skips and live cueing will <strong>not affect the live stream</strong> until the live session concludes or you release the harbor.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("live")}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase shrink-0 border border-black shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>VIEW HARBOR / ENCODER</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Mobile Studio Deck Segmented Switcher (< lg) */}
          <div className="lg:hidden flex items-center p-1 bg-[#16181D] border-2 border-[#DFBB7D] shadow-[2px_2px_0px_#16181D] font-mono text-xs select-none">
            <button
              type="button"
              onClick={() => setStudioDeck("perform")}
              className={`flex-1 py-2 font-bold transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                studioDeck === "perform"
                  ? "bg-[#DFBB7D] text-[#16181D] shadow-[1px_1px_0px_#16181D]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <span>📻 RUNDOWN & MIC</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioDeck("playout")}
              className={`flex-1 py-2 font-bold transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                studioDeck === "playout"
                  ? "bg-[#DFBB7D] text-[#16181D] shadow-[1px_1px_0px_#16181D]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <span>🎛️ SOUNDBOARD</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioDeck("drops")}
              className={`flex-1 py-2 font-bold transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                studioDeck === "drops"
                  ? "bg-[#DFBB7D] text-[#16181D] shadow-[1px_1px_0px_#16181D]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <span>✨ AI DROPS</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* DECK A: On-Air Rundown, Live Mic & Cue (7 cols / ~60%) */}
            <div className={`space-y-6 lg:col-span-7 ${studioDeck === "playout" ? "hidden lg:block" : "block"}`}>
              {/* On-Air Rundown, Mic & Cue: Front and center for Live Talkover */}
              <div className={`space-y-6 ${studioDeck === "drops" ? "hidden lg:block" : "block"}`}>
                <OnAirRundown
                  refreshTrigger={rundownRefreshTick}
                  onEditTrack={(track) => {
                    const fullTrack = library.find((l) => l.id === track.id);
                    if (fullTrack) {
                      setEditingTrack(fullTrack);
                    } else {
                      setEditingTrack({
                        id: track.id,
                        title: track.title,
                        dj_name: track.dj_name,
                        duration: track.duration,
                        duration_sec: track.duration_sec,
                        cover_url: track.cover_url,
                        audio_url: track.audio_url,
                        display_order: track.display_order,
                        genre: track.genre || "Afro House",
                        file_size: 0,
                        bitrate: 160,
                        processing_status: "ready",
                        play_count: 0,
                        is_active: true,
                        is_full_set: false,
                        bpm: null,
                        musical_key: null,
                        source_type: "r2",
                        created_at: new Date().toISOString(),
                      });
                    }
                  }}
                  onTrackStateSync={(active, next) => {
                    setSyncedBroadcastTrack(active);
                    setSyncedBroadcastNext(next);
                  }}
                />

                <BrowserMicRecorder
                  syncedTrack={syncedBroadcastTrack}
                  syncedNextTrack={syncedBroadcastNext}
                  onTalkoverToggle={(active) => {
                    setIsDucking(active);
                    setManualDucking(active);
                  }}
                  onSendToCue={(cue) => setCueItem(cue)}
                  onAirLive={async (audioUrl, title, persona, script) => {
                    return await airLiveDrop({ audioUrl, title, persona, script });
                  }}
                />

                <CueDock
                  cueItem={cueItem}
                  onClearCue={() => setCueItem(null)}
                  onFireOnAir={handleFireCueOnAir}
                  onUpdateScript={async (newScript) => {
                    const res = await fetch("/api/admin/radio/drops/generate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ custom_text: newScript }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setCueItem({
                        id: `cue_${Date.now()}`,
                        title: "Updated Drop",
                        script: newScript,
                        audioUrl: data.drop_url,
                      });
                    }
                  }}
                />
              </div>

              {/* AI Drop Studio: Visible on desktop or when 'drops' is selected on mobile */}
              <div className={`space-y-6 ${studioDeck === "perform" ? "hidden lg:block" : "block"}`}>
                <DropStudio
                  onDropReady={(cue) => setCueItem(cue)}
                  onFireDirect={async (audioUrl, title) => {
                    setIsDucking(true);
                    await airLiveDrop({ audioUrl, title, persona: "Station DJ" });
                    setTimeout(() => setIsDucking(false), 4500);
                  }}
                  onAirLive={async (audioUrl, title, persona, script) => {
                    return await airLiveDrop({ audioUrl, title, persona, script });
                  }}
                />
                {/* On mobile 'drops' view, also render CueDock below so DJ can preview and assign */}
                <div className="lg:hidden">
                  <CueDock
                    cueItem={cueItem}
                    onClearCue={() => setCueItem(null)}
                    onFireOnAir={handleFireCueOnAir}
                  />
                </div>
              </div>
            </div>

            {/* DECK B: Performance Soundboard & Queue (5 cols / ~40%) */}
            <div className={`space-y-6 lg:col-span-5 ${studioDeck !== "playout" ? "hidden lg:block" : "block"}`}>
              {/* Home Server Automation Health */}
              <AutomationHealthWidget />

              {/* 47-County Live Listener Radar */}
              <KenyaListenerMap
                onSelectCounty={(countyName, count, cities) => {
                  const cityText = cities.length > 0 ? ` out in ${cities.join(", ")}` : "";
                  const shoutoutScript = `Big shoutout to the ${count} tuned in across ${countyName}${cityText}! Locked into GOODLIFE Radio 254!`;
                  showMsg(`Radar Cue: ${countyName} shoutout loaded to Cue Dock!`, "success");
                  setCueItem({
                    id: `radar_${Date.now()}`,
                    title: `Shoutout: ${countyName}`,
                    script: shoutoutScript,
                    audioUrl: "",
                    persona: "DJ Fusion",
                  });
                }}
              />
              <PerformanceSoundboard
                onFireOnAir={async (name, url) => {
                  setIsDucking(true);
                  if (url) {
                    await airLiveDrop({ audioUrl: url, title: name, persona: name });
                  }
                  setTimeout(() => setIsDucking(false), 4500);
                }}
                onSendToCue={(pad) => {
                  setCueItem({
                    id: `pad_${pad.id}`,
                    title: pad.name,
                    script: `Station Drop: ${pad.name}`,
                    audioUrl: pad.audioUrl || "",
                    persona: pad.name,
                  });
                }}
                onChoke={() => setIsDucking(false)}
              />
              <QueueNextTrack />
              <DecksConnectCard />
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: DROPS VAULT */}
      {activeTab === "drops" && (
        <div className="space-y-6">
          <AiDropGenerator
            onDropGenerated={(url, name) => {
              showMsg(`AI Drop "${name}" synthesized and ready to audition or assign!`, "success");
            }}
            onSendToCue={(cue) => {
              setCueItem(cue);
              showMsg(`Loaded "${cue.title}" into Studio Cue Dock (Deck A)!`, "success");
            }}
          />
          <DropManagerPanel
            onSendToCue={(cue) => {
              setCueItem(cue);
              showMsg(`Loaded "${cue.title}" into Studio Cue Dock (Deck A)!`, "success");
            }}
          />
        </div>
      )}

      {/* VIEW 3: MUSIC LIBRARY */}
      {activeTab === "library" && (
        <div className="space-y-6">
          {/* Quick On-The-Fly Ingest Dock */}
          <LibraryIngestDock onTrackAdded={fetchLibrary} showBanner={showMsg} />

          {/* Direct Upload Form */}
          <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-5 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
            <div className="flex items-center space-x-2 border-b border-white/10 pb-2">
              <Upload className="w-5 h-5 text-[#DFBB7D]" />
              <h3 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                DIRECT HIGH-BITRATE SET UPLOAD (CLOUDFLARE R2)
              </h3>
            </div>

            <form onSubmit={handleDirectUpload} className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-white/70 font-bold">SELECT AUDIO FILE (.mp3, .wav, .aac, .m4a)</label>
                    {uploadDurationSec ? (
                      <span className="text-[10px] text-[#DFBB7D] font-mono font-bold">
                        ⏱ {Math.floor(uploadDurationSec / 60)}m {uploadDurationSec % 60}s detected
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setUploadFile(f);
                      if (f) {
                        if (!uploadTitle.trim()) {
                          setUploadTitle(f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
                        }
                        try {
                          const url = URL.createObjectURL(f);
                          const audio = new Audio(url);
                          audio.onloadedmetadata = () => {
                            if (audio.duration && isFinite(audio.duration)) {
                              const d = Math.round(audio.duration);
                              setUploadDurationSec(d);
                              if (d >= 1200) {
                                setUploadIsFullSet(true);
                              }
                            }
                            URL.revokeObjectURL(url);
                          };
                        } catch {}
                      } else {
                        setUploadDurationSec(null);
                      }
                    }}
                    className="w-full bg-[#1A1D24] text-white p-2 border border-white/20 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-white/70 font-bold mb-1">TRACK OR SET TITLE</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Nairobi Sunset Session Pt. 2"
                    className="w-full bg-[#1A1D24] text-white p-2 border border-white/20 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-white/70 font-bold mb-1">DJ / ARTIST</label>
                  <input
                    type="text"
                    value={uploadDj}
                    onChange={(e) => setUploadDj(e.target.value)}
                    placeholder="e.g. DJ Shax"
                    className="w-full bg-[#1A1D24] text-white p-2 border border-white/20 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-white/70 font-bold mb-1">GENRE</label>
                  <select
                    value={uploadGenre}
                    onChange={(e) => setUploadGenre(e.target.value)}
                    className="w-full bg-[#1A1D24] text-white p-2 border border-white/20 text-xs"
                  >
                    <option value="Afro House">Afro House</option>
                    <option value="Amapiano">Amapiano</option>
                    <option value="Hip-Hop">Hip-Hop / Rap</option>
                    <option value="Rock">Rock / Alternative</option>
                    <option value="Reggae">Reggae / Dancehall</option>
                    <option value="Pop">2000s Pop / R&B</option>
                    <option value="Gengetone">Gengetone</option>
                    <option value="Old School Hip Hop">Old School Hip Hop</option>
                    <option value="Chillout / Sundowner">Chillout / Sundowner</option>
                    <option value="Electronic / Dance">Electronic / Dance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-white/70 font-bold mb-1">ADD TO PLAYLIST</label>
                  <select
                    value={uploadTargetPlaylistId ?? ""}
                    onChange={(e) => setUploadTargetPlaylistId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-[#1A1D24] text-[#DFBB7D] font-bold p-2 border border-[#DFBB7D]/40 text-xs"
                  >
                    <option value="">-- No Playlist (Library Only) --</option>
                    {availablePlaylists.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col justify-center space-y-1.5 pt-2">
                  <label className="flex items-center space-x-2 text-white/90 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      id="hifi"
                      checked={isHighQuality}
                      onChange={(e) => setIsHighQuality(e.target.checked)}
                      className="accent-[#DFBB7D] w-4 h-4"
                    />
                    <span>Flag as Hi-Fi 320k</span>
                  </label>
                  <label className="flex items-center space-x-2 text-[#DFBB7D] cursor-pointer text-xs font-bold">
                    <input
                      type="checkbox"
                      id="fullset"
                      checked={uploadIsFullSet}
                      onChange={(e) => setUploadIsFullSet(e.target.checked)}
                      className="accent-[#DFBB7D] w-4 h-4"
                    />
                    <span>Full DJ Mix / Set</span>
                  </label>
                </div>
              </div>

              {uploading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span>Uploading to R2...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-white/10 h-2">
                    <div className="bg-[#DFBB7D] h-full" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={uploading || !uploadFile}
                className="px-5 py-2.5 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold border border-[#16181D] shadow-[2px_2px_0px_#16181D] cursor-pointer active:scale-98 transition-all"
              >
                {uploading ? "UPLOADING TO R2..." : "UPLOAD SET TO STATION"}
              </button>
            </form>
          </div>

          {/* Library Table with Search, Filter & Pagination */}
          <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-5 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <ListMusic className="w-5 h-5 text-[#DFBB7D]" />
                <h3 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                  ACTIVE STATION LIBRARY ({library.length} SETS)
                </h3>
              </div>
              <button
                onClick={fetchLibrary}
                className="p-1.5 bg-white/10 hover:bg-[#DFBB7D] hover:text-[#16181D] border border-white/20 self-start sm:self-auto cursor-pointer"
                title="Refresh Library"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLib ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Search Bar & Instant Filter */}
            <div className="space-y-3 font-mono">
              <div className="relative">
                <Search className="w-4 h-4 text-[#DFBB7D] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={libSearchQuery}
                  onChange={(e) => {
                    setLibSearchQuery(e.target.value);
                    setLibPage(1);
                  }}
                  placeholder="Search tracks by title, artist, genre, or BPM..."
                  className="w-full bg-[#121316] text-white pl-9 pr-9 py-2 border border-white/20 text-xs focus:outline-none focus:border-[#DFBB7D]"
                />
                {libSearchQuery && (
                  <button
                    onClick={() => {
                      setLibSearchQuery("");
                      setLibPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Genre Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  onClick={() => {
                    setLibSelectedGenre("ALL");
                    setLibPage(1);
                  }}
                  className={`px-2.5 py-1 font-bold uppercase border cursor-pointer transition-all ${
                    libSelectedGenre === "ALL"
                      ? "bg-[#DFBB7D] text-[#16181D] border-[#16181D] shadow-[2px_2px_0px_#16181D]"
                      : "bg-[#1A1D24] text-white/70 border-white/20 hover:text-white"
                  }`}
                >
                  ALL ({library.length})
                </button>
                {availableGenres.map((g) => {
                  const count = library.filter((s) => s.genre?.toLowerCase() === g.toLowerCase()).length;
                  return (
                    <button
                      key={g}
                      onClick={() => {
                        setLibSelectedGenre(g);
                        setLibPage(1);
                      }}
                      className={`px-2.5 py-1 font-bold uppercase border cursor-pointer transition-all ${
                        libSelectedGenre.toLowerCase() === g.toLowerCase()
                          ? "bg-[#DFBB7D] text-[#16181D] border-[#16181D] shadow-[2px_2px_0px_#16181D]"
                          : "bg-[#1A1D24] text-white/70 border-white/20 hover:text-white"
                      }`}
                    >
                      {g} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Pagination Bar (Top) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/10 text-xs text-white/70">
                <div>
                  Showing <span className="text-white font-bold">{filteredLibrary.length === 0 ? 0 : (currentLibPage - 1) * libPageSize + 1}</span>–
                  <span className="text-white font-bold">{Math.min(currentLibPage * libPageSize, filteredLibrary.length)}</span> of{" "}
                  <span className="text-[#DFBB7D] font-bold">{filteredLibrary.length}</span> sets
                  {(libSearchQuery || libSelectedGenre !== "ALL") && (
                    <span className="text-white/40 ml-1"> (filtered from {library.length})</span>
                  )}
                </div>

                {totalLibPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setLibPage((p) => Math.max(1, p - 1))}
                      disabled={currentLibPage <= 1}
                      className="px-2.5 py-1 bg-[#1A1D24] border border-white/20 text-white disabled:opacity-30 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Prev
                    </button>
                    <span className="text-white font-mono font-bold">
                      Page {currentLibPage} of {totalLibPages}
                    </span>
                    <button
                      onClick={() => setLibPage((p) => Math.min(totalLibPages, p + 1))}
                      disabled={currentLibPage >= totalLibPages}
                      className="px-2.5 py-1 bg-[#1A1D24] border border-white/20 text-white disabled:opacity-30 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Track Listing */}
            <div className="space-y-2">
              {filteredLibrary.length === 0 ? (
                <div className="py-12 text-center text-white/50 font-mono text-xs border border-dashed border-white/20 p-6">
                  No tracks match your current filter or search query.
                </div>
              ) : (
                paginatedLibrary.map((set, idx) => {
                  const globalIdx = (currentLibPage - 1) * libPageSize + idx;
                  return (
                    <div
                      key={set.id}
                      className="p-3 bg-[#121316] hover:bg-white/5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3 font-mono text-xs transition-colors"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1 truncate">
                        {/* Position Move Controls (disabled when filtered or searched) */}
                        <div className="flex flex-col space-y-0.5">
                          <button
                            onClick={() => moveTrack(globalIdx, "up")}
                            disabled={globalIdx === 0 || libSearchQuery.trim() !== "" || libSelectedGenre !== "ALL"}
                            className="text-white/40 hover:text-white disabled:opacity-10 cursor-pointer"
                            title="Move track up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => moveTrack(globalIdx, "down")}
                            disabled={globalIdx === library.length - 1 || libSearchQuery.trim() !== "" || libSelectedGenre !== "ALL"}
                            className="text-white/40 hover:text-white disabled:opacity-10 cursor-pointer"
                            title="Move track down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Play Preview */}
                        <button
                          onClick={() => set.audio_url && togglePreview(set.audio_url)}
                          className={`p-2 border cursor-pointer transition-all ${
                            previewTrackUrl === set.audio_url && isPreviewPlaying
                              ? "bg-red-600 text-white border-red-500 font-bold"
                              : "bg-[#DFBB7D] text-[#16181D] hover:bg-[#F5C842] border-[#16181D]"
                          }`}
                          title="Listen to preview"
                        >
                          {previewTrackUrl === set.audio_url && isPreviewPlaying ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Cover thumbnail */}
                        <div className="w-10 h-10 bg-black/60 border border-white/20 shrink-0 overflow-hidden relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={set.cover_url || "/flyer.png"}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "/flyer.png";
                            }}
                          />
                        </div>

                        {/* Title, Artist, Badges */}
                        <div className="truncate">
                          <div className="font-bold text-white truncate flex items-center space-x-2">
                            <span className="truncate">{formatTrackTitle(set.title)}</span>
                            {set.is_full_set && (
                              <span className="px-1.5 py-0.2 bg-purple-500/30 text-purple-200 border border-purple-400/50 text-[9px] font-mono font-bold uppercase shrink-0">
                                DJ MIX
                              </span>
                            )}
                            {set.is_active === false && (
                              <span className="px-1.5 py-0.2 bg-red-600/30 text-red-200 border border-red-500/50 text-[9px] font-mono font-bold uppercase shrink-0">
                                BENCHED
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#DFBB7D] flex items-center space-x-2 truncate mt-0.5">
                            <span>{set.dj_name || "Goodlife Resident"} · {set.genre}</span>
                            {set.musical_key && (
                              <span className="px-1.5 py-0.2 bg-[#DFBB7D]/20 text-[#DFBB7D] border border-[#DFBB7D]/40 font-mono font-bold text-[9px] shrink-0">
                                {set.musical_key}
                              </span>
                            )}
                            {set.bpm && (
                              <span className="px-1.5 py-0.2 bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono font-bold text-[9px] shrink-0">
                                {set.bpm} BPM
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right actions */}
                      <div className="flex items-center justify-between md:justify-end space-x-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/5 w-full md:w-auto">
                        {/* EDIT BUTTON (Opens Control Drawer) */}
                        <button
                          onClick={() => setEditingTrack(set)}
                          className="px-2.5 py-1 bg-[#1A1D24] hover:bg-[#DFBB7D] hover:text-[#16181D] text-white border border-white/20 text-[11px] font-bold uppercase flex items-center gap-1 cursor-pointer transition-all"
                          title="Edit track properties"
                        >
                          <Sliders className="w-3 h-3 text-[#DFBB7D]" />
                          Edit
                        </button>

                        {/* Add to Playlist Selector */}
                        <select
                          value={quickAddPlaylistMap[set.id] ?? ""}
                          onChange={(e) => setQuickAddPlaylistMap((prev) => ({ ...prev, [set.id]: Number(e.target.value) }))}
                          className="bg-[#1A1D24] text-white/90 text-[11px] p-1 border border-white/20"
                        >
                          <option value="">+ To Playlist...</option>
                          {availablePlaylists.map((pl) => (
                            <option key={pl.id} value={pl.id}>
                              {pl.name}
                            </option>
                          ))}
                        </select>

                        {quickAddPlaylistMap[set.id] ? (
                          <button
                            onClick={async () => {
                              const plId = quickAddPlaylistMap[set.id];
                              if (!plId) return;
                              try {
                                const res = await fetch(`/api/admin/radio/playlists/${plId}/tracks`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ track_ids: [set.id] }),
                                });
                                const d = await res.json();
                                if (res.ok) {
                                  showMsg(`Added track to ${availablePlaylists.find((p) => p.id === plId)?.name || "playlist"}!`, "success");
                                  setQuickAddPlaylistMap((prev) => ({ ...prev, [set.id]: 0 }));
                                } else {
                                  showMsg(d.error || "Failed to add track to playlist", "error");
                                }
                              } catch {
                                showMsg("Network error adding to playlist", "error");
                              }
                            }}
                            className="px-2 py-1 bg-[#DFBB7D] text-[#16181D] text-[10px] font-bold hover:bg-[#F5C842] cursor-pointer"
                          >
                            ADD
                          </button>
                        ) : null}

                        <span className="text-white/60 text-[11px] font-mono px-1">
                          {set.duration || `${Math.floor((set.duration_sec || 0) / 60)}:${String((set.duration_sec || 0) % 60).padStart(2, "0")}`}
                        </span>

                        <button
                          onClick={() => deleteTrack(set.id)}
                          className="p-1.5 text-white/30 hover:text-[#E84855] cursor-pointer"
                          title="Delete from library"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Pagination Bar */}
            {totalLibPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs font-mono text-white/70">
                <span>
                  Page {currentLibPage} of {totalLibPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setLibPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 400, behavior: "smooth" });
                    }}
                    disabled={currentLibPage <= 1}
                    className="px-3 py-1 bg-[#1A1D24] border border-white/20 text-white disabled:opacity-30 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <button
                    onClick={() => {
                      setLibPage((p) => Math.min(totalLibPages, p + 1));
                      window.scrollTo({ top: 400, behavior: "smooth" });
                    }}
                    disabled={currentLibPage >= totalLibPages}
                    className="px-3 py-1 bg-[#1A1D24] border border-white/20 text-white disabled:opacity-30 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TRACK INSPECTOR / CONTROL DRAWER */}
      <TrackEditDrawer
        track={editingTrack}
        isOpen={Boolean(editingTrack)}
        onClose={() => setEditingTrack(null)}
        onTrackUpdated={(updated) => {
          setLibrary((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          setRundownRefreshTick((n) => n + 1);
          showMsg(`Saved changes for "${updated.title}"`, "success");
        }}
        onTrackDeleted={(delId) => {
          setLibrary((prev) => prev.filter((t) => t.id !== delId));
          setRundownRefreshTick((n) => n + 1);
          showMsg("Track deleted from library", "success");
        }}
      />

      {/* VIEW: PLAYLISTS & PROGRAMMING */}
      {activeTab === "playlists" && (
        <div className="space-y-6">
          <PlaylistManagerPanel
            library={library}
            onEditTrack={(track) => setEditingTrack(track)}
            refreshTrigger={rundownRefreshTick}
            onRefreshLive={fetchBroadcastSettings}
            onPlaylistsChanged={fetchAvailablePlaylists}
          />
        </div>
      )}

      {/* VIEW 4: LIVE DJ HARBOR */}
      {activeTab === "live" && (
        <div className="space-y-6 max-w-2xl">
          <DecksConnectCard />
        </div>
      )}

      {/* VIEW 4B: TIMETABLE & PRESENTER ROSTER */}
      {activeTab === "schedule" && (
        <div className="space-y-6">
          <ScheduleManager />
        </div>
      )}

      {/* VIEW 5: TELEMETRY & LOGS */}
      {activeTab === "telemetry" && (
        <div className="space-y-6">
          <RadioTelemetryLogs library={library} />
        </div>
      )}

      {/* VIEW 6: OVERRIDES & CONFIG */}
      {activeTab === "overrides" && (
        <div className="space-y-6">
          <RadioOverridesEditor />
        </div>
      )}

      {/* Hidden audio preview player */}
      <audio
        ref={audioPreviewRef}
        onEnded={() => setIsPreviewPlaying(false)}
        className="hidden"
      />
      {/* Global Assign to Pad Sheet */}
      <AssignToPadSheet />
    </SoundboardProvider>
  </RadioConsoleLayout>
);
}

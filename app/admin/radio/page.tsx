"use client";

import React, { useState, useEffect, useRef } from "react";
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
import { useRadio } from "@/context/RadioContext";
import { formatTrackTitle } from "@/lib/radio/media-helpers";

export default function AdminRadioPage() {
  const { airLiveDrop } = useRadio();
  const [activeTab, setActiveTab] = useState<ConsoleTab>("studio");
  const [library, setLibrary] = useState<RadioSet[]>([]);
  const [loadingLib, setLoadingLib] = useState(true);
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);

  // Studio custom drop state
  const [customDropUrl, setCustomDropUrl] = useState<string | null>(null);
  const [customDropName, setCustomDropName] = useState<string>("Live Mic Drop");
  const [cueItem, setCueItem] = useState<CueDropItem | null>(null);
  const [isDucking, setIsDucking] = useState(false);

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

  const checkBridgeHealth = async () => {
    try {
      const res = await fetch("/api/admin/radio/health");
      const data = await res.json();
      setBridgeOnline(Boolean(data.ok));
    } catch {
      setBridgeOnline(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
    fetchBroadcastSettings();
    checkBridgeHealth();
    const hInterval = setInterval(checkBridgeHealth, 30000);
    return () => clearInterval(hInterval);
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
          durationSec: 180,
          isHighQuality,
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

  return (
    <RadioConsoleLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      streamUrl={liveStreamUrl}
      isDucking={isDucking}
      bridgeOnline={bridgeOnline}
    >
      {/* Toast Alert Banner */}
      {message && (
        <div className={`mb-4 p-3 border-2 font-mono text-xs flex items-center justify-between shadow-[2px_2px_0px_#16181D] ${
          message.type === "success"
            ? "bg-[#10B981]/20 border-[#10B981] text-emerald-900 font-bold"
            : "bg-[#E84855]/20 border-[#E84855] text-red-900 font-bold"
        }`}>
          <div className="flex items-center space-x-2">
            {message.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="font-bold px-1 text-sm">×</button>
        </div>
      )}

      {/* VIEW 1: STUDIO COCKPIT (DUAL DECK LAYOUT) */}
      {activeTab === "studio" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* DECK A: Performance & Drops (7 cols / ~60%) */}
          <div className="lg:col-span-7 space-y-6">
            <PerformanceSoundboard
              customDropUrl={customDropUrl}
              customDropName={customDropName}
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

            <CueDock
              cueItem={cueItem}
              onClearCue={() => setCueItem(null)}
              onFireOnAir={async (item) => {
                setIsDucking(true);
                await airLiveDrop({
                  audioUrl: item.audioUrl,
                  title: item.title,
                  persona: item.persona,
                  script: item.script,
                });
                const audio = new Audio(item.audioUrl);
                audio.onended = () => setIsDucking(false);
                audio.play().catch(() => setIsDucking(false));
              }}
              onAssignToPad={(item, padIdx) => {
                setCustomDropUrl(item.audioUrl);
                setCustomDropName(item.title);
                showMsg(`Assigned to Cartwall Pad #${padIdx + 1}!`, "success");
              }}
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

            <DropStudio
              onDropReady={(cue) => setCueItem(cue)}
              onFireDirect={(audioUrl, title) => {
                setIsDucking(true);
                const audio = new Audio(audioUrl);
                audio.onended = () => setIsDucking(false);
                audio.play().catch(() => setIsDucking(false));
              }}
              onAirLive={async (audioUrl, title, persona, script) => {
                return await airLiveDrop({ audioUrl, title, persona, script });
              }}
            />

            <BrowserMicRecorder
              onDropMastered={(url, name) => {
                setCustomDropUrl(url);
                setCustomDropName(name);
              }}
              onTalkoverToggle={(active) => setIsDucking(active)}
              onSendToCue={(cue) => setCueItem(cue)}
              onAirLive={async (audioUrl, title, persona, script) => {
                return await airLiveDrop({ audioUrl, title, persona, script });
              }}
            />
          </div>

          {/* DECK B: Playout & Queue (5 cols / ~40%) */}
          <div className="lg:col-span-5 space-y-6">
            <OnAirRundown />
            <QueueNextTrack />
            <DecksConnectCard />
          </div>
        </div>
      )}

      {/* VIEW 2: DROPS VAULT */}
      {activeTab === "drops" && (
        <div className="space-y-6">
          <AiDropGenerator
            onDropGenerated={(url, name) => {
              setCustomDropUrl(url);
              setCustomDropName(name);
              showMsg(`AI Drop "${name}" synthesized and loaded to Cartwall Pad #8!`, "success");
            }}
          />
          <DropManagerPanel />
        </div>
      )}

      {/* VIEW 3: MUSIC LIBRARY */}
      {activeTab === "library" && (
        <div className="space-y-6">
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
                  <label className="block text-[11px] text-white/60 mb-1">SELECT AUDIO FILE (.mp3, .wav, .aac, .m4a)</label>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full bg-[#1A1D24] text-white p-2 border border-white/20"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-white/60 mb-1">TRACK OR SET TITLE</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Nairobi Sunset Session Pt. 2"
                    className="w-full bg-[#1A1D24] text-white p-2 border border-white/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-white/60 mb-1">DJ / ARTIST</label>
                  <input
                    type="text"
                    value={uploadDj}
                    onChange={(e) => setUploadDj(e.target.value)}
                    placeholder="e.g. DJ Shax"
                    className="w-full bg-[#1A1D24] text-white p-2 border border-white/20"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-white/60 mb-1">GENRE</label>
                  <select
                    value={uploadGenre}
                    onChange={(e) => setUploadGenre(e.target.value)}
                    className="w-full bg-[#1A1D24] text-white p-2 border border-white/20"
                  >
                    <option value="Afro House">Afro House</option>
                    <option value="Amapiano">Amapiano</option>
                    <option value="Gengetone">Gengetone</option>
                    <option value="Old School Hip Hop">Old School Hip Hop</option>
                    <option value="Chillout / Sundowner">Chillout / Sundowner</option>
                    <option value="Electronic / Dance">Electronic / Dance</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <input
                    type="checkbox"
                    id="hifi"
                    checked={isHighQuality}
                    onChange={(e) => setIsHighQuality(e.target.checked)}
                    className="accent-[#DFBB7D] w-4 h-4"
                  />
                  <label htmlFor="hifi" className="text-white/80 cursor-pointer">Flag as Hi-Fi 320k</label>
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
                className="px-5 py-2.5 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold border border-[#16181D] shadow-[2px_2px_0px_#16181D]"
              >
                {uploading ? "UPLOADING TO R2..." : "UPLOAD SET TO STATION"}
              </button>
            </form>
          </div>

          {/* Library Table */}
          <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-5 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <ListMusic className="w-5 h-5 text-[#DFBB7D]" />
                <h3 className="font-mono text-sm font-bold uppercase text-white tracking-wider">
                  ACTIVE STATION LIBRARY ({library.length} SETS)
                </h3>
              </div>
              <button
                onClick={fetchLibrary}
                className="p-1.5 bg-white/10 hover:bg-[#DFBB7D] hover:text-[#16181D] border border-white/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLib ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="space-y-2">
              {library.map((set, idx) => (
                <div
                  key={set.id}
                  className="p-3 bg-white/5 border border-white/10 flex items-center justify-between gap-3 font-mono text-xs"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div className="flex flex-col space-y-0.5">
                      <button
                        onClick={() => moveTrack(idx, "up")}
                        disabled={idx === 0}
                        className="text-white/40 hover:text-white disabled:opacity-20"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => moveTrack(idx, "down")}
                        disabled={idx === library.length - 1}
                        className="text-white/40 hover:text-white disabled:opacity-20"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => togglePreview(set.audio_url)}
                      className="p-2 bg-[#DFBB7D] text-[#16181D] hover:bg-[#F5C842]"
                    >
                      {previewTrackUrl === set.audio_url && isPreviewPlaying ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <div className="truncate">
                      <div className="font-bold text-white truncate">{formatTrackTitle(set.title)}</div>
                      <div className="text-[10px] text-[#DFBB7D]">{set.dj_name} · {set.genre}</div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    <span className="text-white/50 text-[11px]">{set.duration || "Full Set"}</span>
                    <button
                      onClick={() => deleteTrack(set.id)}
                      className="p-1.5 text-white/30 hover:text-[#E84855]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: LIVE DJ HARBOR */}
      {activeTab === "live" && (
        <div className="space-y-6 max-w-2xl">
          <DecksConnectCard />
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
    </RadioConsoleLayout>
  );
}

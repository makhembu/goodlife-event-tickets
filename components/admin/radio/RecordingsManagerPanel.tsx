"use client";

import React, { useState, useEffect } from "react";
import {
  Disc3,
  Play,
  Pause,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Calendar,
  Radio,
  RefreshCw,
  ExternalLink,
  Volume2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface AdminRecording {
  id: number;
  title: string;
  dj_name: string;
  audio_url: string;
  duration: number;
  file_size: number;
  bitrate: number;
  genre: string;
  recorded_at: string;
  is_public: boolean;
  approved_at?: string | null;
  slot_id?: number | null;
  show_id?: number | null;
  presenter_id?: number | null;
  show_title?: string | null;
  show_slug?: string | null;
  presenter_dj_name?: string | null;
  presenter_slug?: string | null;
}

export default function RecordingsManagerPanel() {
  const [recordings, setRecordings] = useState<AdminRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "public" | "private">("all");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // In-panel audio preview
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const fetchRecordings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/radio/recordings");
      if (!res.ok) throw new Error("Failed to fetch recordings");
      const data = await res.json();
      if (data.recordings) {
        setRecordings(data.recordings);
      }
    } catch (err: any) {
      console.warn("Error fetching admin recordings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
    return () => {
      if (audioElement) {
        audioElement.pause();
      }
    };
  }, []);

  const handleToggleApprove = async (id: number, currentPublic: boolean) => {
    setActionLoading(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/radio/recordings/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: !currentPublic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update recording status");

      setMessage({
        type: "success",
        text: !currentPublic ? "Recording approved and published to public vault!" : "Recording made private.",
      });
      await fetchRecordings();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to update status." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTogglePlay = (rec: AdminRecording) => {
    if (playingId === rec.id) {
      audioElement?.pause();
      setPlayingId(null);
    } else {
      if (audioElement) {
        audioElement.pause();
      }
      const audio = new Audio(rec.audio_url);
      audio.onended = () => setPlayingId(null);
      audio.play().catch((err) => {
        setMessage({ type: "error", text: `Playback error: ${err.message}` });
      });
      setAudioElement(audio);
      setPlayingId(rec.id);
    }
  };

  const formatDuration = (sec: number) => {
    if (!sec || sec <= 0) return "0:00";
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const filtered = recordings.filter((r) => {
    if (filter === "public") return r.is_public;
    if (filter === "private") return !r.is_public;
    return true;
  });

  return (
    <div className="space-y-6 text-[#FBF9F6]">
      {/* Header */}
      <div className="p-5 border border-white/[0.08] bg-[#13151C] shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Disc3 className="w-5 h-5 text-[#DFBB7D]" />
            <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-white">
              Broadcast Vault &amp; Recorded Shows
            </h2>
          </div>
          <p className="font-mono text-xs text-neutral-400 mt-1">
            Master 320kbps recordings captured by Liquidsoap harbor. Approve sets for public listener replay.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Pills */}
          <div className="flex border border-white/10 rounded overflow-hidden text-xs font-mono">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 font-bold uppercase transition-colors cursor-pointer ${
                filter === "all" ? "bg-[#DFBB7D] text-[#0D0F12]" : "bg-[#1C2028] text-neutral-300 hover:bg-[#252B36]"
              }`}
            >
              All ({recordings.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("private")}
              className={`px-3 py-1.5 font-bold uppercase transition-colors cursor-pointer ${
                filter === "private" ? "bg-[#DFBB7D] text-[#0D0F12]" : "bg-[#1C2028] text-neutral-300 hover:bg-[#252B36]"
              }`}
            >
              Pending ({recordings.filter((r) => !r.is_public).length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("public")}
              className={`px-3 py-1.5 font-bold uppercase transition-colors cursor-pointer ${
                filter === "public" ? "bg-[#DFBB7D] text-[#0D0F12]" : "bg-[#1C2028] text-neutral-300 hover:bg-[#252B36]"
              }`}
            >
              Public ({recordings.filter((r) => r.is_public).length})
            </button>
          </div>

          <button
            type="button"
            onClick={fetchRecordings}
            disabled={loading}
            className="p-2 border border-white/10 bg-[#1C2028] hover:bg-[#252B36] text-neutral-300 rounded cursor-pointer transition-colors"
            title="Refresh Recordings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 border rounded text-xs font-mono flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/60 border-red-500/40 text-red-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Playout Daemon Status Guide */}
      <div className="p-4 border border-[#DFBB7D]/30 bg-[#181A22] text-xs font-mono space-y-2 rounded">
        <div className="flex items-center gap-2 text-[#DFBB7D] font-bold uppercase">
          <Radio className="w-4 h-4" />
          <span>How Live Show Recording Works</span>
        </div>
        <p className="text-neutral-300 leading-relaxed">
          When a presenter broadcasts live through Liquidsoap (harbor DJ input on port 8005/8000), the automated archiver
          daemon captures the raw audio, applies EBU R128 (-14 LUFS) loudnorm, uploads the 320kbps MP3 to Cloudflare R2,
          and lists it here as <strong>Pending Licensing Approval</strong>. Once you verify track licenses, toggle it to
          <strong> Public</strong> to display it in the listener vault.
        </p>
      </div>

      {/* Recordings List */}
      {loading && recordings.length === 0 ? (
        <div className="py-16 text-center border border-white/[0.08] bg-[#13151C] space-y-2">
          <Disc3 className="w-8 h-8 mx-auto animate-spin text-[#DFBB7D]" />
          <p className="font-mono text-xs text-neutral-400 uppercase">Fetching recording archives...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 border border-dashed border-white/15 bg-[#13151C] text-center font-mono text-xs text-neutral-400 uppercase tracking-wider">
          {recordings.length === 0
            ? "No show recordings in the database yet. Live sets will archive here automatically after live DJ broadcasts conclude."
            : "No recordings match the selected filter."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((rec) => {
            const isPlayingThis = playingId === rec.id;
            const isBusy = actionLoading === rec.id;

            return (
              <div
                key={rec.id}
                className="p-4 border border-white/[0.08] bg-[#14171E] hover:border-white/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleTogglePlay(rec)}
                    className={`w-10 h-10 border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      isPlayingThis
                        ? "bg-[#DFBB7D] text-[#0D0F12] border-[#DFBB7D]"
                        : "bg-[#1C2028] text-white border-white/10 hover:border-white/30"
                    }`}
                    title={isPlayingThis ? "Pause Preview" : "Preview Recording"}
                  >
                    {isPlayingThis ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-sans text-base font-bold uppercase text-white truncate">
                        {rec.title}
                      </h4>
                      {rec.is_public ? (
                        <span className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold uppercase flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> PUBLIC IN VAULT
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-amber-950/60 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold uppercase flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" /> PENDING REVIEW
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-neutral-400">
                      <span className="font-bold text-[#DFBB7D]">
                        {rec.dj_name || rec.presenter_dj_name || "GOODLIFE Resident"}
                      </span>
                      {rec.show_title && (
                        <>
                          <span>•</span>
                          <span className="text-white/80">{rec.show_title}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(rec.duration)}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(rec.recorded_at).toLocaleDateString("en-KE", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span>•</span>
                      <span>{rec.bitrate || 320} kbps</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggleApprove(rec.id, rec.is_public)}
                    className={`px-3.5 py-2 font-mono text-xs font-bold uppercase border transition-all cursor-pointer ${
                      rec.is_public
                        ? "bg-[#1C2028] hover:bg-red-950/40 text-red-300 border-red-500/30"
                        : "bg-[#DFBB7D] hover:bg-[#edd39d] text-[#0D0F12] border-[#DFBB7D]"
                    } disabled:opacity-50`}
                  >
                    {isBusy
                      ? "SAVING..."
                      : rec.is_public
                      ? "REVOKE PUBLIC RELEASE"
                      : "APPROVE & PUBLISH"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

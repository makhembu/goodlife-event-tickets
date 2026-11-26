"use client";

import React, { useState, useEffect } from "react";
import {
  RadioTower,
  Copy,
  Check,
  RotateCw,
  ShieldCheck,
  Zap,
  AlertTriangle,
  Music,
} from "lucide-react";

export interface DecksConnectCardProps {
  harborHost?: string;
  harborPort?: number;
  harborMount?: string;
  harborUser?: string;
  webDjUrl?: string;
}

export default function DecksConnectCard({
  harborHost = "stream.darajadigital.com",
  harborPort = 8005,
  harborMount = "/live",
}: DecksConnectCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [djConnected, setDjConnected] = useState<boolean | null>(null);
  const [liveType, setLiveType] = useState<"autodj" | "presenter" | "admin">("autodj");
  const [liveDjName, setLiveDjName] = useState<string | null>(null);

  // Admin Master Stream Key state
  const [keyPrefix, setKeyPrefix] = useState<string | null>(null);
  const [cachedKey, setCachedKey] = useState<string | null>(null);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dual-path ingest: direct bore relay vs Cloudflare Tunnel
  const [connectionMode, setConnectionMode] = useState<"direct" | "tunnel">("direct");
  const [apiPrimary, setApiPrimary] = useState<{ host: string; port: number; mount: string; tls: boolean } | null>(null);
  const [apiAlternate, setApiAlternate] = useState<{ label?: string; host: string; port: number; mount: string; tls: boolean } | null>(null);

  // Station Default Standby Audio state
  const [standbyAudioUrl, setStandbyAudioUrl] = useState<string | null>(null);
  const [uploadingStandby, setUploadingStandby] = useState(false);
  const [standbyMsg, setStandbyMsg] = useState<{ text: string; error?: boolean } | null>(null);

  // Load cached key and status on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = sessionStorage.getItem("gl_admin_stream_key_master");
      if (cached) {
        setCachedKey(cached);
      }
    }

    const fetchAdminKey = async () => {
      try {
        const res = await fetch("/api/admin/radio/stream-key");
        if (res.ok) {
          const data = await res.json();
          setKeyPrefix(data.key_prefix);
          if (data.host && data.port) {
            setApiPrimary({
              host: data.host,
              port: data.port,
              mount: data.mount || harborMount,
              tls: Boolean(data.tls),
            });
          }
          if (data.alternate?.host && data.alternate?.port) {
            setApiAlternate({
              label: data.alternate.label || "Cloudflare Tunnel",
              host: data.alternate.host,
              port: data.alternate.port,
              mount: data.alternate.mount || harborMount,
              tls: Boolean(data.alternate.tls),
            });
          }
        }
      } catch (e) {
        console.error("Failed to load admin stream key:", e);
      }
    };
    fetchAdminKey();

    const fetchStandbyAudio = async () => {
      try {
        const res = await fetch("/api/admin/radio/standby-audio");
        if (res.ok) {
          const data = await res.json();
          setStandbyAudioUrl(data.default_standby_audio_url);
        }
      } catch (e) {
        console.error("Failed to load standby audio:", e);
      }
    };
    fetchStandbyAudio();
  }, []);

  // Poll health status
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/admin/radio/health");
        if (res.ok) {
          const data = await res.json();
          setDjConnected(data.live_dj_connected ?? false);
          setLiveType(data.live_type ?? "autodj");
          setLiveDjName(data.live_dj_name ?? null);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, []);

  const copyToClipboard = (text: string, fieldName: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleRegenerateKey = async () => {
    setIsRegenerating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/radio/stream-key", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to regenerate stream key");

      setNewlyGeneratedKey(data.fullKey);
      setKeyPrefix(data.prefix);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("gl_admin_stream_key_master", data.fullKey);
      }
      setShowRegenConfirm(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to regenerate key");
    } finally {
      setIsRegenerating(false);
    }
  };

  const activeKeyToDisplay = newlyGeneratedKey || cachedKey || keyPrefix || "gl_live_••••••••••••";
  const activeKeyFull = newlyGeneratedKey || cachedKey || null;

  const direct = apiPrimary || {
    host: harborHost,
    port: harborPort,
    mount: harborMount,
    tls: false,
  };
  const tunnel = apiAlternate || {
    label: "Cloudflare Tunnel",
    host: "live.darajadigital.com",
    port: 443,
    mount: harborMount,
    tls: true,
  };
  const active = connectionMode === "tunnel" ? tunnel : direct;
  const alternate = connectionMode === "tunnel" ? direct : tunnel;
  const activeHost = active.host;
  const activePort = active.port;
  const activeMount = active.mount;
  const activeTls = active.tls;

  const copyAllSettings = () => {
    const keyVal = activeKeyFull || keyPrefix || "<ADMIN_MASTER_KEY>";
    const text = `GOODLIFE Radio - ADMIN MASTER HARBOR CREDENTIALS:
Connection: ${connectionMode === "tunnel" ? "Cloudflare Tunnel (TLS)" : "Direct relay"}
Server / Host: ${activeHost}
Port: ${activePort}
TLS / SSL: ${activeTls ? "ON" : "OFF"}
Mountpoint: ${activeMount}
Username: admin
Password / Stream Key: ${keyVal}
Audio Format: MP3 320kbps Stereo (44.1kHz)
Alternate test endpoint: ${alternate.host}:${alternate.port} (TLS ${alternate.tls ? "ON" : "OFF"})
Note: Connecting with these credentials executes an instant unconditional On-Air takeover.`;

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 3000);
  };

  const handleStandbyAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStandbyMsg(null);
    setUploadingStandby(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/radio/standby-audio", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setStandbyAudioUrl(data.default_standby_audio_url);
      setStandbyMsg({ text: "Station default standby audio updated!" });
      setTimeout(() => setStandbyMsg(null), 4000);
    } catch (err: any) {
      setStandbyMsg({ text: err.message || "Failed to upload audio", error: true });
    } finally {
      setUploadingStandby(false);
    }
  };

  const handleClearStandbyAudio = async () => {
    setStandbyMsg(null);
    try {
      const res = await fetch("/api/admin/radio/standby-audio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_standby_audio_url: null }),
      });
      if (!res.ok) throw new Error("Failed to reset standby audio");
      setStandbyAudioUrl(null);
      setStandbyMsg({ text: "Reset to system default audio rotation." });
      setTimeout(() => setStandbyMsg(null), 4000);
    } catch (err: any) {
      setStandbyMsg({ text: err.message || "Failed to reset audio", error: true });
    }
  };

  return (
    <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-4 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-white/10 pb-3">
        <div className="flex items-start sm:items-center space-x-2">
          <div className="p-1.5 bg-[#DFBB7D] text-[#16181D] font-bold shrink-0 mt-0.5 sm:mt-0">
            <RadioTower className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-mono text-xs sm:text-sm font-bold tracking-wider uppercase text-white truncate flex items-center gap-2">
              <span>ADMIN MASTER HARBOR · HARDWARE / CDJ / TRAKTOR</span>
              <span className="text-[10px] bg-red-950/80 text-red-300 border border-red-700/60 px-1.5 py-0.2 uppercase font-mono">
                Admin Priority
              </span>
            </h3>
            <p className="text-[11px] font-mono text-[#DFBB7D] mt-0.5">
              Direct relay + Cloudflare Tunnel · Admin Master Key initiates instant takeover 24/7
            </p>

            {/* Live DJ Status Badge on Mobile (< sm) */}
            <div className="sm:hidden mt-2">
              <div
                className={`inline-flex px-2 py-1 font-mono text-[11px] font-bold border items-center space-x-1.5 ${
                  djConnected === true
                    ? liveType === "admin"
                      ? "bg-amber-400 text-black border-amber-500 animate-pulse"
                      : "bg-[#10B981] text-[#16181D] border-[#10B981] animate-pulse"
                    : "bg-white/10 text-white/90 border-white/20"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    djConnected === true
                      ? liveType === "admin"
                        ? "bg-black"
                        : "bg-[#16181D]"
                      : "bg-emerald-400"
                  }`}
                />
                <span>
                  {djConnected === true
                    ? liveType === "admin"
                      ? "ADMIN LIVE ON AIR (TAKEOVER)"
                      : `PRESENTER ON AIR: ${liveDjName || "LIVE DJ"}`
                    : "HARBOR IDLE (AUTODJ ACTIVE)"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Live DJ Status Badge on Desktop (>= sm) */}
        <div
          className={`hidden sm:flex px-2.5 py-1 font-mono text-xs font-bold border items-center space-x-1.5 shrink-0 ${
            djConnected === true
              ? liveType === "admin"
                ? "bg-amber-400 text-black border-amber-500 animate-pulse font-black"
                : "bg-[#10B981] text-[#16181D] border-[#10B981] animate-pulse"
              : "bg-white/10 text-white/80 border-white/20"
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              djConnected === true
                ? liveType === "admin"
                  ? "bg-black"
                  : "bg-[#16181D]"
                : "bg-emerald-400/80"
            }`}
          />
          <span>
            {djConnected === true
              ? liveType === "admin"
                ? "ADMIN LIVE ON AIR (MASTER TAKEOVER)"
                : `PRESENTER ON AIR: ${liveDjName || "LIVE DJ"}`
              : "HARBOR IDLE (AUTODJ ACTIVE)"}
          </span>
        </div>
      </div>

      {/* Dual-path ingest selector */}
      <div className="bg-[#1A1D24] border border-white/10 p-2.5 font-mono text-xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-white/50 font-bold uppercase">Connection method</span>
          <span className="text-[10px] text-[#DFBB7D]">Both hit the same harbor</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setConnectionMode("direct")}
            className={`text-left p-2 border transition-all cursor-pointer ${
              connectionMode === "direct"
                ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D]"
                : "bg-black/20 text-white/80 border-white/15 hover:border-[#DFBB7D]/60"
            }`}
          >
            <span className="block font-bold uppercase text-[11px]">Direct relay · port {direct.port}</span>
            <span className={`block text-[10px] ${connectionMode === "direct" ? "text-[#16181D]/70" : "text-white/50"}`}>
              {direct.host}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setConnectionMode("tunnel")}
            className={`text-left p-2 border transition-all cursor-pointer ${
              connectionMode === "tunnel"
                ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D]"
                : "bg-black/20 text-white/80 border-white/15 hover:border-[#DFBB7D]/60"
            }`}
          >
            <span className="block font-bold uppercase text-[11px]">{tunnel.label || "Cloudflare Tunnel"} · port {tunnel.port} · TLS</span>
            <span className={`block text-[10px] ${connectionMode === "tunnel" ? "text-[#16181D]/70" : "text-white/50"}`}>
              {tunnel.host}
            </span>
          </button>
        </div>
        <p className="text-[10px] text-white/50">
          Use the tunnel if your network blocks port {direct.port}. Same mount, username and stream key on both paths.
        </p>
      </div>

      {/* Harbor Credential Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs">
        {/* Host */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-white/50 block">SERVER / HOST</span>
            <span className="text-white font-bold">{activeHost}</span>
          </div>
          <button
            onClick={() => copyToClipboard(activeHost, "host")}
            className="p-1 text-white/40 hover:text-[#DFBB7D] cursor-pointer"
            title="Copy Host"
          >
            {copiedField === "host" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Port */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-white/50 block">PORT</span>
            <span className="text-[#DFBB7D] font-bold">{activePort}</span>
          </div>
          <button
            onClick={() => copyToClipboard(String(activePort), "port")}
            className="p-1 text-white/40 hover:text-[#DFBB7D] cursor-pointer"
            title="Copy Port"
          >
            {copiedField === "port" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* TLS */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-white/50 block">TLS / SSL</span>
            <span className={`font-bold ${activeTls ? "text-emerald-400" : "text-white"}`}>
              {activeTls ? "ON (HTTPS)" : "OFF"}
            </span>
          </div>
          <span className="text-[10px] text-white/40">{activeTls ? "Port 443" : "Plain TCP"}</span>
        </div>

        {/* Mount */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-white/50 block">MOUNTPOINT</span>
            <span className="text-white font-bold">{activeMount}</span>
          </div>
          <button
            onClick={() => copyToClipboard(activeMount, "mount")}
            className="p-1 text-white/40 hover:text-[#DFBB7D] cursor-pointer"
            title="Copy Mount"
          >
            {copiedField === "mount" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Admin Master Username */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-white/50 block">LOGIN / USERNAME</span>
            <span className="text-[#DFBB7D] font-bold text-xs">admin</span>
          </div>
          <button
            onClick={() => copyToClipboard("admin", "username")}
            className="p-1 text-white/40 hover:text-[#DFBB7D] cursor-pointer"
            title="Copy Admin Username"
          >
            {copiedField === "username" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Admin Master Stream Key Row */}
      <div className="bg-[#1A1D24] p-3 border-2 border-[#DFBB7D]/40 space-y-2 font-mono text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[11px] text-[#DFBB7D] font-bold uppercase block flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>ADMIN MASTER STREAM KEY (TAKEOVER KEY)</span>
            </span>
            <span className="text-[11px] text-white/60 block">
              Secret key used in BUTT / VirtualDJ / OBS password field for emergency or live station takeover.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRegenConfirm(true)}
              disabled={isRegenerating}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold border border-white/20 flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
              title="Regenerate Admin Master Key"
            >
              <RotateCw className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
              <span>{isRegenerating ? "GENERATING..." : "REGEN KEY"}</span>
            </button>
          </div>
        </div>

        {/* Key Display & Copy Action */}
        <div className="flex items-center justify-between bg-black/40 border border-white/10 p-2 gap-2">
          <div className="font-mono text-xs text-[#DFBB7D] truncate font-bold select-all">
            {activeKeyToDisplay}
          </div>
          <button
            onClick={() => {
              if (activeKeyFull) {
                copyToClipboard(activeKeyFull, "admin_key");
              } else if (keyPrefix) {
                copyToClipboard(keyPrefix, "admin_key");
              }
            }}
            className="px-2.5 py-1 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
            title="Copy Master Key"
          >
            {copiedField === "admin_key" ? (
              <>
                <Check className="w-3 h-3 text-emerald-700" />
                <span>COPIED!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>COPY KEY</span>
              </>
            )}
          </button>
        </div>

        {newlyGeneratedKey && (
          <div className="bg-emerald-950/60 border border-emerald-500/50 p-2 text-[11px] text-emerald-300 font-mono">
            ✓ New Admin Master Key generated and active. Cached in your admin session.
          </div>
        )}
      </div>

      {/* Regeneration Modal Confirmation */}
      {showRegenConfirm && (
        <div className="bg-black/80 border-2 border-amber-400 p-3 space-y-3 font-mono text-xs">
          <div className="flex items-start gap-2 text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white uppercase block">Regenerate Admin Master Stream Key?</strong>
              <p className="text-[11px] text-white/80 mt-0.5">
                The current admin key will be revoked immediately. Any encoder broadcasting using the previous admin master key will be disconnected.
              </p>
            </div>
          </div>
          {errorMsg && <div className="text-red-400 text-[11px]">{errorMsg}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setShowRegenConfirm(false)}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white font-bold cursor-pointer"
            >
              CANCEL
            </button>
            <button
              onClick={handleRegenerateKey}
              disabled={isRegenerating}
              className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-black font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
              <span>{isRegenerating ? "REGENERATING..." : "CONFIRM & ISSUE NEW KEY"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Station Default Standby Audio (Master Fallback Drop) */}
      <div className="bg-[#1A1D24]/80 border border-white/10 p-3 font-mono text-xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-[#DFBB7D]" />
            <span className="font-bold uppercase tracking-wider text-white">Default Station Standby Audio</span>
          </div>
          {standbyAudioUrl && (
            <button
              onClick={handleClearStandbyAudio}
              className="text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer"
            >
              Reset to Server Default
            </button>
          )}
        </div>
        <p className="text-[11px] text-white/60">
          This audio drop loops whenever no live DJ or presenter is on air, or when an on-air presenter has not set their own custom standby audio.
        </p>

        {standbyMsg && (
          <div
            className={`p-2 text-[11px] border ${
              standbyMsg.error
                ? "bg-red-950/60 border-red-700/60 text-red-300"
                : "bg-emerald-950/60 border-emerald-700/60 text-emerald-300"
            }`}
          >
            {standbyMsg.text}
          </div>
        )}

        {standbyAudioUrl ? (
          <div className="space-y-1.5 pt-1">
            <audio controls src={standbyAudioUrl} className="w-full h-8" />
            <div className="text-[10px] text-white/40 break-all truncate">
              Source: {standbyAudioUrl}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-[#DFBB7D] bg-black/30 border border-dashed border-[#DFBB7D]/30 p-2">
            Active: System Branded Rotation (4 local station drops). Uploading a custom audio file here overrides the master station loop.
          </div>
        )}

        <div className="pt-1">
          <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold border border-white/20 text-[11px] uppercase cursor-pointer ${uploadingStandby ? "opacity-50 cursor-not-allowed" : ""}`}>
            <Music className="w-3.5 h-3.5 text-[#DFBB7D]" />
            <span>{uploadingStandby ? "UPLOADING..." : standbyAudioUrl ? "REPLACE STATION AUDIO" : "UPLOAD MASTER STANDBY AUDIO (MP3)"}</span>
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a"
              className="hidden"
              disabled={uploadingStandby}
              onChange={handleStandbyAudioUpload}
            />
          </label>
        </div>
      </div>

      {/* Takeover Notice */}
      <div className="bg-[#1A1D24]/60 border border-[#DFBB7D]/30 p-2.5 font-mono text-[11px] text-white/80 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-[#DFBB7D] shrink-0 mt-0.5" />
        <div>
          <strong className="text-white uppercase">Admin Live Takeover Invariant:</strong> Connecting with username{" "}
          <code className="text-[#DFBB7D]">admin</code> and your Master Key bypasses schedule timetable restrictions and immediately takes the live station feed on air. Presenters must continue using their personal credentials issued in Presenter Roster.
        </div>
      </div>

      {/* Action Strip */}
      <div className="flex items-center justify-between pt-1 font-mono text-xs">
        <span className="text-[11px] text-white/40">Audio Format: MP3 320kbps Stereo (44.1kHz)</span>
        <button
          onClick={copyAllSettings}
          className="px-3 py-1.5 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold border border-[#16181D] flex items-center space-x-1.5 shadow-[2px_2px_0px_#16181D] cursor-pointer"
        >
          {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedAll ? "COPIED ALL!" : "COPY ALL CREDENTIALS"}</span>
        </button>
      </div>
    </div>
  );
}

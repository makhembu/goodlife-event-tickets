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
} from "lucide-react";

export interface DecksConnectCardProps {
  harborHost?: string;
  harborPort?: number;
  harborMount?: string;
  harborUser?: string;
  webDjUrl?: string;
}

export default function DecksConnectCard({
  harborHost = "live-dj.darajadigital.com",
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
        }
      } catch (e) {
        console.error("Failed to load admin stream key:", e);
      }
    };
    fetchAdminKey();
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

  const copyAllSettings = () => {
    const keyVal = activeKeyFull || keyPrefix || "<ADMIN_MASTER_KEY>";
    const text = `GOODLIFE Radio 254 - ADMIN MASTER HARBOR CREDENTIALS:
Server / Host: ${harborHost}
Port: ${harborPort}
Mountpoint: ${harborMount}
Username: admin
Password / Stream Key: ${keyVal}
Audio Format: MP3 320kbps Stereo (44.1kHz)
Note: Connecting with these credentials executes an instant unconditional On-Air takeover.`;

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 3000);
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
              Direct Icecast source harbor · Admin Master Key initiates instant takeover 24/7
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

      {/* Harbor Credential Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs">
        {/* Host */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-white/50 block">SERVER / HOST</span>
            <span className="text-white font-bold">{harborHost}</span>
          </div>
          <button
            onClick={() => copyToClipboard(harborHost, "host")}
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
            <span className="text-[#DFBB7D] font-bold">{harborPort}</span>
          </div>
          <button
            onClick={() => copyToClipboard(String(harborPort), "port")}
            className="p-1 text-white/40 hover:text-[#DFBB7D] cursor-pointer"
            title="Copy Port"
          >
            {copiedField === "port" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Mount */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-white/50 block">MOUNTPOINT</span>
            <span className="text-white font-bold">{harborMount}</span>
          </div>
          <button
            onClick={() => copyToClipboard(harborMount, "mount")}
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

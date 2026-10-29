"use client";

import React, { useState, useEffect } from "react";
import { RadioTower, Copy, Check, ExternalLink, Headphones, Info, ShieldCheck, Eye, EyeOff } from "lucide-react";

export interface DecksConnectCardProps {
  harborHost?: string;
  harborPort?: number;
  harborMount?: string;
  harborUser?: string;
  harborPass?: string;
  webDjUrl?: string;
}

export default function DecksConnectCard({
  harborHost = "live-dj.darajadigital.com",
  harborPort = 8005,
  harborMount = "/live",
  harborUser = "source",
  harborPass = "goodlife254dj",
  webDjUrl = "https://dj.darajadigital.com",
}: DecksConnectCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [passRevealed, setPassRevealed] = useState(false);
  const [djConnected, setDjConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/admin/radio/health");
        if (res.ok) {
          const data = await res.json();
          setDjConnected(data.live_dj_connected ?? false);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const copyToClipboard = (text: string, fieldName: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const copyAllSettings = () => {
    const text = `GOODLIFE Radio 254 - DJ Decks Credentials:
Server: ${harborHost}
Port: ${harborPort}
Mountpoint: ${harborMount}
User: ${harborUser}
Password: ${harborPass}
Format: MP3 320kbps (or 256kbps)`;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 3000);
  };

  return (
    <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-4 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-[#10B981] text-[#16181D] font-bold">
            <RadioTower className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase text-white">
              LIVE DJ HARBOR · BUTT / CDJ / TRAKTOR
            </h3>
            <p className="text-[11px] font-mono text-[#DFBB7D]">
              Direct Icecast source harbor · AutoDJ automatically crossfades on connection
            </p>
          </div>
        </div>

        {/* Live DJ Status Badge */}
        <div className={`px-2.5 py-1 font-mono text-xs font-bold border flex items-center space-x-1.5 ${
          djConnected === true
            ? "bg-[#10B981] text-[#16181D] border-[#10B981] animate-pulse"
            : "bg-white/5 text-white/50 border-white/10"
        }`}>
          <div className={`w-2 h-2 rounded-full ${djConnected === true ? "bg-[#16181D]" : "bg-white/40"}`} />
          <span>{djConnected === true ? "LIVE DJ ON AIR" : "HARBOR IDLE (AUTODJ ACTIVE)"}</span>
        </div>
      </div>

      {/* Harbor Credential Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs">
        {/* Host */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-white/50 block">SERVER / HOST</span>
            <span className="text-white font-bold">{harborHost}</span>
          </div>
          <button
            onClick={() => copyToClipboard(harborHost, "host")}
            className="p-1 text-white/40 hover:text-[#DFBB7D]"
            title="Copy Host"
          >
            {copiedField === "host" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Port */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-white/50 block">PORT</span>
            <span className="text-[#DFBB7D] font-bold">{harborPort}</span>
          </div>
          <button
            onClick={() => copyToClipboard(String(harborPort), "port")}
            className="p-1 text-white/40 hover:text-[#DFBB7D]"
            title="Copy Port"
          >
            {copiedField === "port" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Mount */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-white/50 block">MOUNTPOINT</span>
            <span className="text-white font-bold">{harborMount}</span>
          </div>
          <button
            onClick={() => copyToClipboard(harborMount, "mount")}
            className="p-1 text-white/40 hover:text-[#DFBB7D]"
            title="Copy Mount"
          >
            {copiedField === "mount" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Password */}
        <div className="bg-[#1A1D24] p-2.5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-white/50 block">PASSWORD</span>
            <span className="text-white font-bold">{passRevealed ? harborPass : "••••••••••••"}</span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setPassRevealed(!passRevealed)}
              className="p-1 text-white/40 hover:text-white"
            >
              {passRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => copyToClipboard(harborPass, "pass")}
              className="p-1 text-white/40 hover:text-[#DFBB7D]"
              title="Copy Password"
            >
              {copiedField === "pass" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Action Strip */}
      <div className="flex items-center justify-between pt-1 font-mono text-xs">
        <span className="text-[11px] text-white/40">Audio Format: MP3 320kbps Stereo (44.1kHz)</span>
        <button
          onClick={copyAllSettings}
          className="px-3 py-1.5 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold border border-[#16181D] flex items-center space-x-1.5 shadow-[2px_2px_0px_#16181D]"
        >
          {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedAll ? "COPIED ALL!" : "COPY ALL CREDENTIALS"}</span>
        </button>
      </div>
    </div>
  );
}

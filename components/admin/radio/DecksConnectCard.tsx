"use client";

import React, { useState, useEffect } from "react";
import { RadioTower, Copy, Check, ExternalLink, Headphones, Info, ShieldCheck, Eye, EyeOff } from "lucide-react";

interface DecksConnectCardProps {
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
  harborPass = "",
  webDjUrl = "https://radio.darajadigital.com",
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
    navigator.clipboard.writeText(text);
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
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 3000);
  };

  return (
    <div className="p-5 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-brand-navy pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-brand-navy" />
            <h2 className="font-display text-lg font-black uppercase tracking-wider">
              CONNECT CLUB DECKS (PIONEER / BUTT / OBS)
            </h2>
          </div>
          {/* Live connection indicator badge */}
          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 border-2 text-[10px] font-black uppercase tracking-wider rounded ${
            djConnected === true
              ? "bg-emerald-100 border-emerald-600 text-emerald-800"
              : djConnected === false
              ? "bg-slate-100 border-slate-400 text-slate-500"
              : "bg-yellow-50 border-yellow-400 text-yellow-700"
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              djConnected === true ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
            }`} />
            {djConnected === true ? "LIVE — DJ CONNECTED" : djConnected === false ? "WAITING FOR DJ" : "CHECKING..."}
          </div>
        </div>

        <button
          type="button"
          onClick={copyAllSettings}
          className="px-3 py-1.5 border-2 border-brand-navy bg-brand-accent hover:bg-brand-off-white text-brand-navy font-black text-xs uppercase flex items-center gap-1.5 transition-all shadow-(--shadow-brut-xs) cursor-pointer"
        >
          {copiedAll ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
          <span>{copiedAll ? "COPIED ALL CREDENTIALS!" : "COPY ALL SETTINGS FOR BUTT"}</span>
        </button>
      </div>

      <p className="text-xs text-brand-navy/70">
        Plug your mixer into your laptop, open BUTT or OBS, and paste these settings. The station automatically detects your audio and crossfades into your live set with <b>zero dead air</b>.
      </p>

      {/* Quick Credentials Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
        {/* Host */}
        <div className="p-2.5 border-2 border-brand-navy bg-brand-off-white flex flex-col justify-between">
          <span className="text-[10px] text-brand-navy/60 font-bold uppercase">Server Host</span>
          <div className="flex items-center justify-between gap-1 mt-1">
            <span className="font-black text-brand-navy truncate text-[11px]">{harborHost}</span>
            <button
              onClick={() => copyToClipboard(harborHost, "host")}
              className="p-1 hover:text-brand-accent cursor-pointer shrink-0"
              title="Copy Host"
            >
              {copiedField === "host" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Port */}
        <div className="p-2.5 border-2 border-brand-navy bg-brand-off-white flex flex-col justify-between">
          <span className="text-[10px] text-brand-navy/60 font-bold uppercase">Port</span>
          <div className="flex items-center justify-between gap-1 mt-1">
            <span className="font-black text-brand-navy">{harborPort}</span>
            <button
              onClick={() => copyToClipboard(String(harborPort), "port")}
              className="p-1 hover:text-brand-accent cursor-pointer shrink-0"
              title="Copy Port"
            >
              {copiedField === "port" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Mount */}
        <div className="p-2.5 border-2 border-brand-navy bg-brand-off-white flex flex-col justify-between">
          <span className="text-[10px] text-brand-navy/60 font-bold uppercase">Mountpoint</span>
          <div className="flex items-center justify-between gap-1 mt-1">
            <span className="font-black text-brand-navy">{harborMount}</span>
            <button
              onClick={() => copyToClipboard(harborMount, "mount")}
              className="p-1 hover:text-brand-accent cursor-pointer shrink-0"
              title="Copy Mount"
            >
              {copiedField === "mount" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Password */}
        <div className="p-2.5 border-2 border-brand-navy bg-brand-off-white flex flex-col justify-between">
          <span className="text-[10px] text-brand-navy/60 font-bold uppercase">DJ Password</span>
          <div className="flex items-center justify-between gap-1 mt-1">
            <span className="font-black text-brand-navy truncate text-[11px] font-mono">
              {passRevealed ? (harborPass || "• Not Set •") : "•".repeat(Math.max(8, harborPass ? harborPass.length : 8))}
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setPassRevealed(!passRevealed)}
                className="p-1 hover:text-brand-accent cursor-pointer text-brand-navy/70 hover:text-brand-navy"
                title={passRevealed ? "Hide password" : "Show password"}
              >
                {passRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(harborPass, "pass")}
                className="p-1 hover:text-brand-accent cursor-pointer shrink-0"
                title="Copy Password"
              >
                {copiedField === "pass" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Zero-Training 3-Step Guide */}
      <div className="p-3 border-2 border-brand-navy/30 bg-amber-50 text-amber-950 text-xs rounded space-y-1.5 font-sans">
        <div className="flex items-center gap-1.5 font-black uppercase text-[11px] text-amber-900">
          <Info className="w-4 h-4 text-amber-700 shrink-0" />
          <span>ZERO-TRAINING QUICK GUIDE (HOW TO GO LIVE IN 60 SECONDS):</span>
        </div>
        <ol className="list-decimal list-inside space-y-1 text-amber-900/90 text-[11px] leading-relaxed">
          <li><b>Connect Laptop:</b> Run a 3.5mm-to-RCA cable from your Pioneer Mixer <i>REC OUT</i> into your laptop audio jack or USB audio interface.</li>
          <li><b>Open BUTT or OBS:</b> Click <i>&quot;COPY ALL SETTINGS FOR BUTT&quot;</i> above and paste them into BUTT Settings → Main.</li>
          <li><b>Click Play / Connect:</b> The station will crossfade automatically from AutoDJ to your decks. When finished, click Disconnect—your set will auto-archive to the Set Vault!</li>
        </ol>
      </div>
    </div>
  );
}

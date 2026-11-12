"use client";

import React, { useRef, useState, useEffect } from "react";
import { X, Download, Share2, MessageCircle, Copy, Check, Sparkles } from "lucide-react";

interface ShareStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  artist?: string;
  showTitle?: string;
  presenterName?: string;
}

export default function ShareStationModal({
  isOpen,
  onClose,
  title,
  artist,
  showTitle,
  presenterName,
}: ShareStationModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [storyImageUrl, setStoryImageUrl] = useState<string | null>(null);

  const displayShow = showTitle || (presenterName ? `LIVE WITH ${presenterName.toUpperCase()}` : "GOODLIFE LIVE AIRWAVES");
  const displayTrack = title || "Live Afro House & Amapiano";
  const displayArtist = artist || (presenterName ? presenterName : "GOODLIFE Residents");
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/radio` : "https://tickets.goodlife.co.ke/radio";
  const shareText = `Tuned in to GOODLIFE Radio 254: "${displayTrack}" by ${displayArtist} · 24/7 Nairobi Festival Airwaves 🇰🇪⚡ Listen live: ${shareUrl}`;

  // Generate 9:16 Instagram Story Canvas (1080 x 1920)
  useEffect(() => {
    if (!isOpen) return;

    setIsGenerating(true);
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setIsGenerating(false);
      return;
    }

    // 1. Background: Deep Navy Brutalist gradient & atmosphere
    const bgGradient = ctx.createLinearGradient(0, 0, 0, 1920);
    bgGradient.addColorStop(0, "#0B1B2E");
    bgGradient.addColorStop(0.4, "#142B4C");
    bgGradient.addColorStop(1, "#08121F");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 1080, 1920);

    // 2. Texture / Grid lines
    ctx.strokeStyle = "rgba(200, 165, 74, 0.08)";
    ctx.lineWidth = 2;
    for (let x = 60; x < 1080; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1920);
      ctx.stroke();
    }
    for (let y = 60; y < 1920; y += 120) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1080, y);
      ctx.stroke();
    }

    // 3. Brutalist Border Frame
    ctx.strokeStyle = "#C8A54A";
    ctx.lineWidth = 16;
    ctx.strokeRect(32, 32, 1080 - 64, 1920 - 64);

    // Inner subtle border
    ctx.strokeStyle = "rgba(243, 236, 225, 0.2)";
    ctx.lineWidth = 4;
    ctx.strokeRect(54, 54, 1080 - 108, 1920 - 108);

    // 4. Header: LIVE ON AIR & 254.0 MHZ
    ctx.fillStyle = "#EF4444";
    ctx.fillRect(90, 130, 240, 56);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("● LIVE ON AIR", 120, 168);

    ctx.fillStyle = "#C8A54A";
    ctx.font = "bold 28px monospace";
    ctx.fillText("254.0 MHZ · NAIROBI", 360, 168);

    // 5. Station Title
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 84px sans-serif";
    ctx.fillText("GOODLIFE RADIO", 90, 310);

    ctx.fillStyle = "#C8A54A";
    ctx.font = "bold 32px monospace";
    ctx.fillText("AFRO HOUSE · AMAPIANO · SHENG DROPS", 90, 370);

    // Horizontal Gold Divider
    ctx.fillStyle = "#C8A54A";
    ctx.fillRect(90, 410, 900, 8);

    // 6. Center Card: Now Playing / On Air Show
    ctx.fillStyle = "#0B1B2E";
    ctx.fillRect(90, 480, 900, 780);
    ctx.strokeStyle = "#C8A54A";
    ctx.lineWidth = 6;
    ctx.strokeRect(90, 480, 900, 780);

    // Card Tag
    ctx.fillStyle = "#C8A54A";
    ctx.fillRect(140, 530, 260, 46);
    ctx.fillStyle = "#142B4C";
    ctx.font = "bold 22px monospace";
    ctx.fillText("ON AIR BROADCAST", 158, 562);

    // Show Title
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 58px sans-serif";
    const truncatedShow = displayShow.length > 25 ? displayShow.slice(0, 25) + "..." : displayShow;
    ctx.fillText(truncatedShow.toUpperCase(), 140, 650);

    // Track Title
    ctx.fillStyle = "#C8A54A";
    ctx.font = "bold 44px sans-serif";
    const truncatedTrack = displayTrack.length > 28 ? displayTrack.slice(0, 28) + "..." : displayTrack;
    ctx.fillText(truncatedTrack, 140, 730);

    // Artist / Presenter
    ctx.fillStyle = "rgba(243, 236, 225, 0.85)";
    ctx.font = "32px monospace";
    const truncatedArtist = displayArtist.length > 32 ? displayArtist.slice(0, 32) + "..." : displayArtist;
    ctx.fillText(`Host / Artist: ${truncatedArtist}`, 140, 800);

    // Equalizer Graphic in Center Card
    const barWidth = 32;
    const barGap = 20;
    const startX = 140;
    const startY = 1180;
    const heights = [60, 110, 170, 90, 210, 150, 120, 180, 70, 140, 200, 130, 80];

    for (let i = 0; i < heights.length; i++) {
      const h = heights[i];
      const x = startX + i * (barWidth + barGap);
      const isPeak = h > 180;
      ctx.fillStyle = isPeak ? "#EF4444" : i % 2 === 0 ? "#C8A54A" : "#10B981";
      ctx.fillRect(x, startY - h, barWidth, h);
    }

    // 7. Data Saver Quality Badge
    ctx.fillStyle = "rgba(200, 165, 74, 0.15)";
    ctx.fillRect(90, 1320, 900, 100);
    ctx.strokeStyle = "rgba(200, 165, 74, 0.4)";
    ctx.lineWidth = 3;
    ctx.strokeRect(90, 1320, 900, 100);

    ctx.fillStyle = "#C8A54A";
    ctx.font = "bold 28px monospace";
    ctx.fillText("📱 MOBILE DATA SAVER (64 KBPS) · ~28 MB/HR", 160, 1380);

    // 8. Footer Call To Action & Web Link
    ctx.fillStyle = "#F3ECE1";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText("TUNE IN LIVE ON YOUR PHONE", 90, 1530);

    ctx.fillStyle = "#C8A54A";
    ctx.font = "900 48px monospace";
    ctx.fillText("TICKETS.GOODLIFE.CO.KE/RADIO", 90, 1600);

    ctx.fillStyle = "rgba(243, 236, 225, 0.6)";
    ctx.font = "24px monospace";
    ctx.fillText("NO APP DOWNLOAD REQUIRED · INSTANT BROWSER PLAY", 90, 1660);

    // Render to data URL
    try {
      const url = canvas.toDataURL("image/png");
      setStoryImageUrl(url);
    } catch (e) {
      console.error("Failed to generate story canvas image:", e);
    } finally {
      setIsGenerating(false);
    }
  }, [isOpen, displayShow, displayTrack, displayArtist]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleDownloadStory = () => {
    if (!storyImageUrl) return;
    const a = document.createElement("a");
    a.href = storyImageUrl;
    a.download = `goodlife-radio-story-${Date.now()}.png`;
    a.click();
  };

  const handleWhatsAppShare = () => {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, "_blank");
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "GOODLIFE Radio 254",
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // User cancelled or unsupported
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-brand-navy/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-brand-off-white text-brand-navy border-4 border-brand-navy shadow-(--shadow-brut-lg) rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-brand-navy text-white flex items-center justify-between border-b-4 border-brand-navy shrink-0">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-brand-accent" />
            <h3 className="font-display text-xl uppercase tracking-wider">SPREAD THE AIRWAVES</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 text-white rounded transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Quick Info */}
          <div className="p-3 bg-white border-2 border-brand-navy rounded-lg space-y-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-brand-navy/60 font-mono">
              NOW BROADCASTING
            </div>
            <div className="font-display text-lg uppercase text-brand-navy leading-tight">
              {displayShow}
            </div>
            <div className="text-xs font-mono text-brand-navy/80">
              {displayTrack} · {displayArtist}
            </div>
          </div>

          {/* Action 1: WhatsApp One-Click Share */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase font-mono tracking-wider text-brand-navy block">
              1. Direct Instant Message
            </span>
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-sm font-bold uppercase tracking-wider border-2 border-brand-navy shadow-(--shadow-brut-xs) transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <MessageCircle className="w-5 h-5" />
              <span>Share to WhatsApp Crew</span>
            </button>
          </div>

          {/* Action 2: Instagram Story 9:16 Card Preview & Download */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase font-mono tracking-wider text-brand-navy block">
              2. Instagram Story Card (9:16 HD)
            </span>
            <div className="bg-brand-navy/5 border-2 border-dashed border-brand-navy/30 rounded-xl p-3 flex flex-col items-center gap-3">
              {storyImageUrl ? (
                <div className="relative w-36 aspect-[9/16] rounded-lg overflow-hidden border-2 border-brand-navy shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={storyImageUrl}
                    alt="GOODLIFE Instagram Story Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-brand-navy/90 text-brand-accent py-0.5 text-center text-[9px] font-mono font-bold uppercase">
                    1080 × 1920
                  </div>
                </div>
              ) : (
                <div className="w-36 aspect-[9/16] bg-brand-navy/10 animate-pulse rounded-lg flex items-center justify-center text-xs font-mono">
                  Rendering...
                </div>
              )}

              <button
                type="button"
                onClick={handleDownloadStory}
                disabled={!storyImageUrl}
                className="py-2 px-4 bg-white hover:bg-brand-accent text-brand-navy font-mono text-xs font-bold uppercase tracking-wider border-2 border-brand-navy shadow-(--shadow-brut-xs) transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-brand-navy" />
                <span>Download Story Card (.PNG)</span>
              </button>
            </div>
          </div>

          {/* Action 3: Copy Link & Native Share */}
          <div className="pt-2 border-t-2 border-brand-navy/15 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-1 py-2.5 px-3 bg-white hover:bg-neutral-100 text-brand-navy font-mono text-xs font-bold uppercase border-2 border-brand-navy shadow-(--shadow-brut-xs) flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Link</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleNativeShare}
              className="flex-1 py-2.5 px-3 bg-brand-accent hover:bg-amber-400 text-brand-navy font-mono text-xs font-bold uppercase border-2 border-brand-navy shadow-(--shadow-brut-xs) flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>More Options</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

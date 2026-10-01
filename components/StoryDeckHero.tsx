"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, VolumeX, Maximize2, Sparkles, Film, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { HapticFeedback } from "@/components/ui/haptic-feedback";

export interface StoryDeckHeroProps {
  posterUrl: string;
  videoUrl?: string | null;
  eventTitle: string;
  onExpand?: (mode: "poster" | "video") => void;
  className?: string;
}

const POSTER_DURATION = 3500; // 3.5s auto-countdown on poster before teaser autoplay

export default function StoryDeckHero({
  posterUrl,
  videoUrl,
  eventTitle,
  onExpand,
  className = "",
}: StoryDeckHeroProps) {
  const hasVideo = Boolean(videoUrl && videoUrl.trim() !== "");
  const [activeIndex, setActiveIndex] = useState<0 | 1>(0);
  const [isMuted, setIsMuted] = useState(true);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(hasVideo);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // 1. Story Countdown Timer on Poster
  useEffect(() => {
    if (!hasVideo || !autoAdvanceEnabled || activeIndex !== 0) {
      setProgress(activeIndex === 1 ? 100 : 0);
      return;
    }

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, (elapsed / POSTER_DURATION) * 100);
      setProgress(pct);

      if (elapsed < POSTER_DURATION) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        HapticFeedback.trigger("confirmation");
        setActiveIndex(1);
        setProgress(100);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [hasVideo, autoAdvanceEnabled, activeIndex]);

  // 2. Play / Pause video based on active slide & viewport visibility
  useEffect(() => {
    if (!hasVideo || !videoRef.current) return;

    if (activeIndex === 1) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        // Autoplay policy fallback: keep muted and retry
        if (videoRef.current) {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play().catch(() => {});
        }
      });
    } else {
      videoRef.current.pause();
    }
  }, [activeIndex, hasVideo]);

  // 3. Viewport Visibility Observer (pause when attendee scrolls to tickets)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasVideo) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && videoRef.current) {
            videoRef.current.pause();
          } else if (entry.isIntersecting && activeIndex === 1 && videoRef.current) {
            videoRef.current.play().catch(() => {});
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasVideo, activeIndex]);

  const handleSelectPoster = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    HapticFeedback.trigger("confirmation");
    setAutoAdvanceEnabled(false); // User manually took control
    setActiveIndex(0);
  };

  const handleSelectVideo = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!hasVideo) return;
    HapticFeedback.trigger("confirmation");
    setAutoAdvanceEnabled(false);
    setActiveIndex(1);
  };

  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    HapticFeedback.trigger("confirmation");
    if (videoRef.current) {
      const nextMuted = !videoRef.current.muted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    } else {
      setIsMuted(!isMuted);
    }
  };

  const handleTriggerExpand = () => {
    HapticFeedback.trigger("confirmation");
    if (onExpand) {
      onExpand(activeIndex === 0 ? "poster" : "video");
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-md:aspect-[390/551] max-md:max-h-[52dvh] md:aspect-[707/1000] border-2 border-brand-navy shadow-(--shadow-brut-sm-strong) overflow-hidden bg-brand-navy group select-none ${className}`}
    >
      {/* A. STORY DECK SEGMENT PROGRESS BARS (TOP) */}
      {hasVideo && (
        <div className="absolute top-2 inset-x-2.5 z-30 flex items-center gap-1.5 h-1.5 pointer-events-none">
          {/* Segment 0: Poster */}
          <div className="flex-1 h-full bg-white/30 backdrop-blur-xs rounded-full overflow-hidden border border-black/20 shadow-xs">
            <div
              className="h-full bg-yellow-400 transition-none rounded-full"
              style={{
                width: activeIndex === 0 ? `${progress}%` : "100%",
              }}
            />
          </div>

          {/* Segment 1: Teaser Video */}
          <div className="flex-1 h-full bg-white/30 backdrop-blur-xs rounded-full overflow-hidden border border-black/20 shadow-xs">
            <div
              className="h-full bg-yellow-400 transition-none rounded-full"
              style={{
                width: activeIndex === 1 ? "100%" : "0%",
              }}
            />
          </div>
        </div>
      )}

      {/* B. TOP BADGE & QUICK SWITCHER PILLS */}
      <div className="absolute top-5 inset-x-2.5 z-30 flex items-center justify-between pointer-events-auto">
        {hasVideo ? (
          <div className="flex items-center gap-1 bg-brand-navy/90 border-2 border-brand-navy p-0.5 shadow-(--shadow-brut-2xs)">
            <button
              type="button"
              onClick={handleSelectPoster}
              className={`px-2 py-0.5 text-[10px] font-black uppercase font-mono flex items-center gap-1 transition-all cursor-pointer ${
                activeIndex === 0
                  ? "bg-yellow-300 text-brand-navy border border-brand-navy shadow-xs"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              <ImageIcon className="w-3 h-3" />
              <span>POSTER</span>
            </button>
            <button
              type="button"
              onClick={handleSelectVideo}
              className={`px-2 py-0.5 text-[10px] font-black uppercase font-mono flex items-center gap-1 transition-all cursor-pointer ${
                activeIndex === 1
                  ? "bg-yellow-300 text-brand-navy border border-brand-navy shadow-xs"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              <Film className="w-3 h-3" />
              <span>TEASER</span>
            </button>
          </div>
        ) : (
          <div className="bg-brand-navy/90 text-white border-2 border-brand-navy px-2 py-0.5 text-[10px] font-mono font-black uppercase">
            OFFICIAL POSTER
          </div>
        )}

        {/* Story indicator icon */}
        {hasVideo && (
          <span className="hidden sm:flex items-center gap-1 text-[9px] font-mono font-black uppercase px-2 py-0.5 bg-yellow-300 text-brand-navy border-2 border-brand-navy shadow-(--shadow-brut-2xs)">
            <Sparkles className="w-2.5 h-2.5" />
            {activeIndex === 0 ? "3.5s PREVIEW" : "HYPE REEL"}
          </span>
        )}
      </div>

      {/* C. MAIN MEDIA VIEWPORT */}
      <div
        onClick={handleTriggerExpand}
        className="w-full h-full relative cursor-pointer group/viewport"
        title="Tap to enlarge full resolution"
      >
        {/* SLIDE 0: POSTER IMAGE */}
        <AnimatePresence initial={false}>
          {activeIndex === 0 && (
            <motion.div
              key="poster"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 w-full h-full"
            >
              <Image
                src={posterUrl}
                alt={`${eventTitle} Poster`}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 420px"
                className="object-contain"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* SLIDE 1: TEASER VIDEO */}
        {hasVideo && (
          <div
            className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${
              activeIndex === 1 ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          >
            <video
              ref={videoRef}
              src={videoUrl!}
              autoPlay
              playsInline
              loop
              muted={isMuted}
              preload="metadata"
              className="w-full h-full object-contain pointer-events-none"
            />
          </div>
        )}

        {/* D. TOUCH TAP ZONES (LEFT 30% / RIGHT 70% QUICK SWITCH) */}
        {hasVideo && (
          <div className="absolute inset-0 flex z-20 pointer-events-none">
            {/* Left Zone: Back to Poster */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                handleSelectPoster(e);
              }}
              className="w-[30%] h-full pointer-events-auto cursor-pointer"
              title="Tap left to view Poster"
            />
            {/* Right Zone: Advance to Video or Trigger Modal */}
            <div
              onClick={(e) => {
                if (activeIndex === 0) {
                  e.stopPropagation();
                  handleSelectVideo(e);
                } else {
                  handleTriggerExpand();
                }
              }}
              className="w-[70%] h-full pointer-events-auto cursor-pointer"
              title={activeIndex === 0 ? "Tap right to watch Teaser" : "Tap to open cinema mode"}
            />
          </div>
        )}
      </div>

      {/* E. FLOATING CONTROLS (BOTTOM) */}
      <div className="absolute bottom-2.5 inset-x-2.5 z-30 flex items-center justify-between pointer-events-none">
        {/* Fullscreen Expand Badge */}
        <button
          type="button"
          onClick={handleTriggerExpand}
          className="pointer-events-auto px-2.5 py-1 bg-brand-navy/90 hover:bg-yellow-300 hover:text-brand-navy text-white border-2 border-brand-navy text-[10px] font-mono font-black uppercase flex items-center gap-1.5 transition-all shadow-(--shadow-brut-xs) cursor-pointer"
        >
          <Maximize2 className="w-3 h-3" />
          <span>FULL VIEW</span>
        </button>

        {/* Sound Toggle (Only on Video slide) */}
        {hasVideo && activeIndex === 1 && (
          <button
            type="button"
            onClick={handleToggleSound}
            className={`pointer-events-auto px-2.5 py-1 border-2 border-brand-navy text-[10px] font-mono font-black uppercase flex items-center gap-1.5 transition-all shadow-(--shadow-brut-xs) cursor-pointer ${
              isMuted
                ? "bg-yellow-300 text-brand-navy hover:bg-white"
                : "bg-green-400 text-brand-navy hover:bg-green-300 animate-pulse"
            }`}
            title={isMuted ? "Click to turn on sound" : "Click to mute"}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>UNMUTE AUDIO</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5" />
                <span>SOUND ON</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

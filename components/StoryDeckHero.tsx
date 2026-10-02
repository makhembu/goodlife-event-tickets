"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, VolumeX, Maximize2, Sparkles, Film, Image as ImageIcon, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { HapticFeedback } from "@/components/ui/haptic-feedback";

export interface StoryDeckHeroProps {
  posterUrl: string;
  videoUrl?: string | null;
  eventTitle: string;
  tag?: string;
  subtitle?: string;
  scheduleText?: string;
  onExpand?: (mode: "poster" | "video") => void;
  isExpanded?: boolean;
  className?: string;
}

const POSTER_DURATION = 3500; // 3.5s auto-countdown on poster before teaser autoplay

export default function StoryDeckHero({
  posterUrl,
  videoUrl,
  eventTitle,
  tag,
  subtitle,
  scheduleText,
  onExpand,
  isExpanded = false,
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

  // 1. Story Countdown Timer on Poster (paused if lightbox is open)
  useEffect(() => {
    if (!hasVideo || !autoAdvanceEnabled || activeIndex !== 0 || isExpanded) {
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
  }, [hasVideo, autoAdvanceEnabled, activeIndex, isExpanded]);

  // 2. Play / Pause video based on active slide, lightbox expanded state & viewport visibility
  useEffect(() => {
    if (!hasVideo || !videoRef.current) return;

    if (isExpanded) {
      // Immediately pause and silence inline video while lightbox modal is active to prevent audio overlap
      videoRef.current.pause();
      return;
    }

    if (activeIndex === 1) {
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
  }, [activeIndex, hasVideo, isExpanded]);

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
    if (videoRef.current) {
      videoRef.current.pause();
    }
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
        <div className="absolute top-1.5 inset-x-2 z-30 flex items-center gap-1.5 h-1 pointer-events-none">
          {/* Segment 0: Poster */}
          <div className="flex-1 h-full bg-white/25 backdrop-blur-xs rounded-full overflow-hidden border border-black/20 shadow-xs">
            <div
              className="h-full bg-brand-accent transition-none rounded-full"
              style={{
                width: activeIndex === 0 ? `${progress}%` : "100%",
              }}
            />
          </div>

          {/* Segment 1: Teaser Video */}
          <div className="flex-1 h-full bg-white/25 backdrop-blur-xs rounded-full overflow-hidden border border-black/20 shadow-xs">
            <div
              className="h-full bg-brand-accent transition-none rounded-full"
              style={{
                width: activeIndex === 1 ? "100%" : "0%",
              }}
            />
          </div>
        </div>
      )}

      {/* B. MAIN MEDIA VIEWPORT */}
      <div
        onClick={handleTriggerExpand}
        className="w-full h-full relative cursor-pointer group/viewport overflow-hidden"
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
              className="absolute inset-0 w-full h-full overflow-hidden"
            >
              <Image
                src={posterUrl}
                alt={`${eventTitle} Poster`}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 420px"
                className="object-cover"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* SLIDE 1: TEASER VIDEO */}
        {hasVideo && (
          <div
            className={`absolute inset-0 w-full h-full transition-opacity duration-500 overflow-hidden ${
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
              className="w-full h-full object-cover scale-[1.02] pointer-events-none"
            />
          </div>
        )}

        {/* C. TOUCH TAP ZONES (LEFT 30% / RIGHT 70% QUICK SWITCH) */}
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

      {/* D. LOWER-THIRD BROADCAST SCRIM (Smart Adaptive HUD - Option A) */}
      <div
        className={`absolute bottom-0 inset-x-0 z-25 pointer-events-none transition-opacity duration-300 md:hidden ${
          activeIndex === 1 ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="w-full bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-16 pb-12 px-3 flex flex-col justify-end text-white">
          {tag && (
            <span className="text-[10px] font-black tracking-widest text-brand-navy uppercase bg-brand-accent px-1.5 py-0.5 w-fit rounded-[2px] shadow-xs mb-1">
              {tag}
            </span>
          )}
          <h2 className="text-xl sm:text-2xl font-display uppercase tracking-wide text-white leading-tight drop-shadow-md">
            {eventTitle}
          </h2>
          {subtitle && (
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/90 mt-0.5 flex items-center gap-1.5 drop-shadow-sm">
              <span className="w-2 h-2 border border-brand-navy bg-brand-accent shrink-0 animate-pulse" />
              <span className="truncate">{subtitle}</span>
            </p>
          )}
          {scheduleText && (
            <div className="mt-1.5 inline-flex w-fit items-center gap-1 px-1.5 py-0.5 bg-black/60 border border-white/20 text-brand-accent text-[9px] font-mono font-bold uppercase tracking-wider rounded-[2px] backdrop-blur-xs">
              <Clock className="w-2.5 h-2.5 text-brand-accent shrink-0" />
              <span>{scheduleText}</span>
            </div>
          )}
        </div>
      </div>

      {/* E. FLOATING CONTROLS (BOTTOM DOCK) */}
      <div className="absolute bottom-2 inset-x-2 sm:bottom-2.5 sm:inset-x-2.5 z-30 flex items-center justify-between pointer-events-none gap-2">
        {/* Left: Media Switcher Pill (Poster / Teaser) */}
        {hasVideo ? (
          <div className="pointer-events-auto flex items-center bg-black/60 border border-white/20 backdrop-blur-md p-0.5 shadow-sm rounded-sm">
            <button
              type="button"
              onClick={handleSelectPoster}
              className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase flex items-center gap-1 transition-all cursor-pointer rounded-[2px] ${
                activeIndex === 0
                  ? "bg-brand-accent text-brand-navy shadow-xs font-black"
                  : "text-white/70 hover:text-white"
              }`}
              title="View Event Poster"
            >
              <ImageIcon className="w-2.5 h-2.5" />
              <span>POSTER</span>
            </button>
            <button
              type="button"
              onClick={handleSelectVideo}
              className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase flex items-center gap-1 transition-all cursor-pointer rounded-[2px] ${
                activeIndex === 1
                  ? "bg-brand-accent text-brand-navy shadow-xs font-black"
                  : "text-white/70 hover:text-white"
              }`}
              title="Watch Video Teaser"
            >
              <Film className="w-2.5 h-2.5" />
              <span>TEASER</span>
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto bg-black/60 text-white/80 border border-white/20 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase backdrop-blur-md rounded-sm">
            POSTER
          </div>
        )}

        {/* Right: Audio and Fullscreen Icon Actions */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Sound Toggle (Only on Video slide) */}
          {hasVideo && activeIndex === 1 && (
            <button
              type="button"
              onClick={handleToggleSound}
              aria-label={isMuted ? "Unmute audio" : "Mute audio"}
              title={isMuted ? "Unmute audio" : "Mute audio"}
              className={`w-6.5 h-6.5 sm:w-7 sm:h-7 flex items-center justify-center border backdrop-blur-md transition-all cursor-pointer rounded-sm ${
                isMuted
                  ? "bg-black/60 text-white/90 border-white/20 hover:bg-black/80 hover:text-white"
                  : "bg-brand-accent text-brand-navy border-brand-accent shadow-xs"
              }`}
            >
              {isMuted ? (
                <VolumeX className="w-3 h-3" />
              ) : (
                <Volume2 className="w-3 h-3" />
              )}
            </button>
          )}

          {/* Fullscreen Expand Icon Button */}
          <button
            type="button"
            onClick={handleTriggerExpand}
            aria-label="Open full screen view"
            title="Full View"
            className="w-6.5 h-6.5 sm:w-7 sm:h-7 flex items-center justify-center bg-black/60 text-white/90 hover:bg-black/80 hover:text-white border border-white/20 backdrop-blur-md transition-all cursor-pointer rounded-sm"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

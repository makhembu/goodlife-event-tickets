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
  isExpanded?: boolean;
  className?: string;
}

const POSTER_DURATION = 3500; // 3.5s auto-countdown on poster before teaser autoplay

export default function StoryDeckHero({
  posterUrl,
  videoUrl,
  eventTitle,
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

      {/* D. FLOATING CONTROLS (BOTTOM DOCK) */}
      <div className="absolute bottom-2.5 inset-x-2.5 z-30 flex items-center justify-between pointer-events-none gap-2">
        {/* Left: Media Switcher Pill (Poster / Teaser) */}
        {hasVideo ? (
          <div className="pointer-events-auto flex items-center bg-brand-navy/90 border border-brand-navy backdrop-blur-md p-0.5 shadow-(--shadow-brut-xs)">
            <button
              type="button"
              onClick={handleSelectPoster}
              className={`px-2 py-1 text-[10px] font-mono font-black uppercase flex items-center gap-1 transition-all cursor-pointer ${
                activeIndex === 0
                  ? "bg-brand-accent text-brand-navy shadow-xs"
                  : "text-brand-off-white/70 hover:text-white"
              }`}
              title="View Event Poster"
            >
              <ImageIcon className="w-3 h-3" />
              <span>POSTER</span>
            </button>
            <button
              type="button"
              onClick={handleSelectVideo}
              className={`px-2 py-1 text-[10px] font-mono font-black uppercase flex items-center gap-1 transition-all cursor-pointer ${
                activeIndex === 1
                  ? "bg-brand-accent text-brand-navy shadow-xs"
                  : "text-brand-off-white/70 hover:text-white"
              }`}
              title="Watch Video Teaser"
            >
              <Film className="w-3 h-3" />
              <span>TEASER</span>
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto bg-brand-navy/90 text-brand-off-white/80 border border-brand-navy px-2 py-1 text-[10px] font-mono font-black uppercase backdrop-blur-md shadow-(--shadow-brut-xs)">
            POSTER
          </div>
        )}

        {/* Right: Audio and Fullscreen Icon Actions */}
        <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
          {/* Sound Toggle (Only on Video slide) */}
          {hasVideo && activeIndex === 1 && (
            <button
              type="button"
              onClick={handleToggleSound}
              aria-label={isMuted ? "Unmute audio" : "Mute audio"}
              title={isMuted ? "Unmute audio" : "Mute audio"}
              className={`w-8 h-8 flex items-center justify-center border border-brand-navy backdrop-blur-md shadow-(--shadow-brut-xs) transition-all cursor-pointer ${
                isMuted
                  ? "bg-brand-navy/90 text-brand-off-white hover:bg-brand-accent hover:text-brand-navy"
                  : "bg-brand-accent text-brand-navy ring-2 ring-brand-accent/50"
              }`}
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Fullscreen Expand Icon Button */}
          <button
            type="button"
            onClick={handleTriggerExpand}
            aria-label="Open full screen view"
            title="Full View"
            className="w-8 h-8 flex items-center justify-center bg-brand-navy/90 text-brand-off-white hover:bg-brand-accent hover:text-brand-navy border border-brand-navy backdrop-blur-md shadow-(--shadow-brut-xs) transition-all cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

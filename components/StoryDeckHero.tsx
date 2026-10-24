"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import {
  Volume2,
  VolumeX,
  Maximize2,
  Film,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { HapticFeedback } from "@/components/ui/haptic-feedback";
import {
  resolveStoryMedia,
  normalizeStoryMedia,
  type StoryMediaItem,
} from "@/lib/story-media";

export interface StoryDeckHeroProps {
  posterUrl: string;
  videoUrl?: string | null;
  /** Ordered slides. Empty/undefined falls back to posterUrl + videoUrl. */
  media?: StoryMediaItem[] | null;
  eventTitle: string;
  tag?: string;
  subtitle?: string;
  scheduleText?: string;
  onExpand?: (item: StoryMediaItem) => void;
  isExpanded?: boolean;
  className?: string;
}

/** Poster slides advance after this long; video slides advance on `ended`. */
const POSTER_DURATION = 5000;
/** Give the browser this long to paint a poster before starting its timer. */
const POSTER_READY_FALLBACK = 2500;
/** Delay before warming the next video's metadata. Never preloads the deck. */
const NEXT_VIDEO_WARM_DELAY = 1200;

export default function StoryDeckHero({
  posterUrl,
  videoUrl,
  media,
  eventTitle,
  tag,
  subtitle,
  scheduleText,
  onExpand,
  isExpanded = false,
  className = "",
}: StoryDeckHeroProps) {
  const slides = useMemo(() => {
    const custom = normalizeStoryMedia(media);
    if (custom.length > 0) return custom;
    return resolveStoryMedia({ flyer_url: posterUrl, video_url: videoUrl });
  }, [media, posterUrl, videoUrl]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true);
  const [progress, setProgress] = useState(0);
  const [loadedPosterUrl, setLoadedPosterUrl] = useState<string | null>(null);
  const [posterDeadlineUrl, setPosterDeadlineUrl] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [warmVideoIndex, setWarmVideoIndex] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const activeSlide = slides[activeIndex];
  const deckPoster = slides.find((s) => s.kind === "poster")?.url || posterUrl;
  const hasMultiple = slides.length > 1;
  const isVideo = activeSlide?.kind === "video";

  // Wait for the active poster before starting its clock. Without this, a slow
  // image eats the 5 seconds and the deck advances on a blank frame. Readiness
  // is derived rather than stored so a slide change cannot leave a stale flag
  // behind (and so the effect never has to setState synchronously).
  useEffect(() => {
    if (!activeSlide || activeSlide.kind !== "poster") return;
    const url = activeSlide.url;
    const timer = setTimeout(() => setPosterDeadlineUrl(url), POSTER_READY_FALLBACK);
    return () => clearTimeout(timer);
  }, [activeSlide]);

  const posterReady =
    !activeSlide ||
    activeSlide.kind !== "poster" ||
    loadedPosterUrl === activeSlide.url ||
    posterDeadlineUrl === activeSlide.url;

  const goToSlide = useCallback(
    (index: number, manual = true) => {
      if (index < 0 || index >= slides.length) return;
      if (manual) HapticFeedback.trigger("confirmation");
      if (index === activeIndex) {
        if (manual) setAutoAdvanceEnabled(true);
        return;
      }
      videoRef.current?.pause();
      setActiveIndex(index);
      setProgress(0);
      setAutoAdvanceEnabled(true);
    },
    [activeIndex, slides]
  );

  const advance = useCallback(() => {
    if (activeIndex < slides.length - 1) {
      goToSlide(activeIndex + 1, false);
    } else {
      setProgress(100);
      setAutoAdvanceEnabled(false);
    }
  }, [activeIndex, goToSlide, slides.length]);

  // Poster countdown. Pauses for the lightbox, off-screen scrolling and once
  // the deck has reached its last slide.
  useEffect(() => {
    if (!activeSlide || activeSlide.kind !== "poster") return;
    if (!autoAdvanceEnabled || isExpanded || !isVisible || !posterReady) return;

    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const pct = Math.min(100, ((now - start) / POSTER_DURATION) * 100);
      setProgress(pct);
      if (pct < 100) {
        frame = requestAnimationFrame(tick);
      } else {
        HapticFeedback.trigger("confirmation");
        advance();
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, activeSlide, autoAdvanceEnabled, isExpanded, isVisible, posterReady, advance]);

  // Play only the active video, and only while the deck is visible.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;

    if (isExpanded || !isVisible) {
      video.pause();
      return;
    }

    video.play().catch(() => {
      // Autoplay policy fallback: keep muted and retry.
      video.muted = true;
      setIsMuted(true);
      video.play().catch(() => {});
    });
  }, [activeIndex, isVideo, isExpanded, isVisible]);

  // Pause when the attendee scrolls down to the tickets.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => setIsVisible(entries[0]?.isIntersecting ?? true),
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Warm exactly one slide ahead. Posters are warmed through the Next image
  // optimizer (same URL the active slide uses, so it lands in the HTTP cache);
  // videos are only asked for metadata, and only after the current slide has
  // had time to paint. Slide +2 and beyond are never fetched.
  useEffect(() => {
    const next = slides[activeIndex + 1];
    if (!next || next.kind !== "video") return;
    const timer = setTimeout(() => setWarmVideoIndex(activeIndex + 1), NEXT_VIDEO_WARM_DELAY);
    return () => clearTimeout(timer);
  }, [activeIndex, slides]);

  const handlePrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    goToSlide(activeIndex - 1);
  };

  const handleNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    goToSlide(activeIndex + 1);
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
    if (!activeSlide) return;
    HapticFeedback.trigger("confirmation");
    videoRef.current?.pause();
    onExpand?.(activeSlide);
  };

  if (!activeSlide) return null;

  const progressFor = (index: number) => {
    if (index < activeIndex) return 100;
    if (index > activeIndex) return 0;
    return progress;
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-md:aspect-[390/551] max-md:max-h-[52dvh] md:aspect-[707/1000] border-2 border-brand-navy shadow-(--shadow-brut-sm-strong) overflow-hidden bg-brand-navy group select-none ${className}`}
    >
      {/* A. STORY DECK SEGMENT PROGRESS BARS (TOP) */}
      {hasMultiple && (
        <div className="absolute top-1 inset-x-2 z-30 flex items-center gap-1.5 h-3">
          {slides.map((slide, index) => (
            <button
              key={`${slide.kind}-${slide.url}-${index}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToSlide(index);
              }}
              className="flex-1 h-3 flex items-center cursor-pointer group/segment"
              aria-label={`Go to story ${index + 1} of ${slides.length}`}
              aria-current={index === activeIndex ? "true" : undefined}
              title={slide.kind === "video" ? `Story ${index + 1}: teaser video` : `Story ${index + 1}: poster`}
            >
              <span className="block w-full h-1 bg-white/25 backdrop-blur-xs rounded-full overflow-hidden border border-black/20 shadow-xs group-hover/segment:bg-white/40 transition-colors">
                <span
                  className="block h-full bg-brand-accent rounded-full"
                  style={{ width: `${progressFor(index)}%` }}
                />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* B. MAIN MEDIA VIEWPORT
          Tap (or Enter/Space) anywhere on the media opens the lightbox on the
          slide that is currently on screen. Navigation lives in the dock and
          the segment bars, never in invisible tap zones. */}
      <div
        onClick={handleTriggerExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleTriggerExpand();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Open full view of ${isVideo ? "the teaser video" : "the event poster"}`}
        className="w-full h-full relative cursor-pointer group/viewport overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        title="Tap to enlarge full resolution"
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={`${activeSlide.kind}-${activeSlide.url}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0 w-full h-full overflow-hidden"
          >
            {isVideo ? (
              <video
                ref={videoRef}
                src={activeSlide.url}
                poster={activeSlide.poster_url || deckPoster}
                autoPlay
                playsInline
                muted={isMuted}
                preload="auto"
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration > 0) {
                    setProgress(Math.min(100, (v.currentTime / v.duration) * 100));
                  }
                }}
                onEnded={() => {
                  if (autoAdvanceEnabled) advance();
                }}
                onError={() => {
                  if (autoAdvanceEnabled) advance();
                }}
                className="w-full h-full object-cover scale-[1.02] pointer-events-none"
              />
            ) : (
              <Image
                src={activeSlide.url}
                alt={`${eventTitle} Poster`}
                fill
                priority={activeIndex === 0}
                sizes="(max-width: 768px) 100vw, 420px"
                className="object-cover"
                referrerPolicy="no-referrer"
                onLoad={() => setLoadedPosterUrl(activeSlide.url)}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* One-slide lookahead: the next poster goes through the same image
            optimizer as the active one, so it is already in cache when its
            segment starts. Invisible and non-interactive. */}
        {slides[activeIndex + 1]?.kind === "poster" && (
          <div className="absolute inset-0 opacity-0 pointer-events-none" aria-hidden="true">
            <Image
              src={slides[activeIndex + 1].url}
              alt=""
              fill
              loading="eager"
              sizes="(max-width: 768px) 100vw, 420px"
              className="object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        {/* One-slide lookahead for a video: metadata only, after a delay. */}
        {warmVideoIndex === activeIndex + 1 && slides[warmVideoIndex]?.kind === "video" && (
          <video
            src={slides[warmVideoIndex].url}
            preload="metadata"
            muted
            playsInline
            aria-hidden="true"
            className="absolute w-px h-px opacity-0 pointer-events-none"
          />
        )}
      </div>

      {/* D. LOWER-THIRD BROADCAST SCRIM (Smart Adaptive HUD - Option A) */}
      <div
        className={`absolute bottom-0 inset-x-0 z-25 pointer-events-none transition-opacity duration-300 md:hidden ${
          isVideo ? "opacity-100" : "opacity-0"
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
        {/* Left: deck navigator, or the media type when there is only one slide */}
        {hasMultiple ? (
          <div className="pointer-events-auto flex items-center bg-black/60 border border-white/20 backdrop-blur-md p-0.5 shadow-sm rounded-sm">
            <button
              type="button"
              onClick={handlePrev}
              disabled={activeIndex === 0}
              aria-label="Previous story"
              title="Previous story"
              className="w-6.5 h-6.5 sm:w-7 sm:h-7 flex items-center justify-center text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-default cursor-pointer rounded-[2px] relative before:absolute before:-inset-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 text-[9px] font-mono font-black text-white tabular-nums">
              {activeIndex + 1}/{slides.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              disabled={activeIndex === slides.length - 1}
              aria-label="Next story"
              title="Next story"
              className="w-6.5 h-6.5 sm:w-7 sm:h-7 flex items-center justify-center text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-default cursor-pointer rounded-[2px] relative before:absolute before:-inset-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto bg-black/60 text-white/80 border border-white/20 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase backdrop-blur-md rounded-sm flex items-center gap-1">
            {isVideo ? <Film className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
            {isVideo ? "TEASER" : "POSTER"}
          </div>
        )}

        {/* Right: audio and fullscreen icon actions */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
          {isVideo && (
            <button
              type="button"
              onClick={handleToggleSound}
              aria-label={isMuted ? "Unmute audio" : "Mute audio"}
              title={isMuted ? "Unmute audio" : "Mute audio"}
              className={`w-6.5 h-6.5 sm:w-7 sm:h-7 flex items-center justify-center border backdrop-blur-md transition-all cursor-pointer rounded-sm relative before:absolute before:-inset-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${
                isMuted
                  ? "bg-black/60 text-white/90 border-white/20 hover:bg-black/80 hover:text-white"
                  : "bg-brand-accent text-brand-navy border-brand-accent shadow-xs"
              }`}
            >
              {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
            </button>
          )}

          <button
            type="button"
            onClick={handleTriggerExpand}
            aria-label="Open full screen view"
            title="Full View"
            className="w-6.5 h-6.5 sm:w-7 sm:h-7 flex items-center justify-center bg-black/60 text-white/90 hover:bg-black/80 hover:text-white border border-white/20 backdrop-blur-md transition-all cursor-pointer rounded-sm relative before:absolute before:-inset-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

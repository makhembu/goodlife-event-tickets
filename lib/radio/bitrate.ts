/**
 * GOODLIFE Radio 254 - Multi-Bitrate & Data Saver Configuration
 * Provides bitrate constants, stream URL resolvers, and mobile data usage estimates.
 */

import { AudioQuality } from "./types";

export interface BitrateTier {
  id: AudioQuality;
  label: string;
  badge: string;
  bitrateKbps: number;
  dataPerHourMb: number;
  dataPerHourLabel: string;
  description: string;
}

export const BITRATE_TIERS: Record<AudioQuality, BitrateTier> = {
  standard: {
    id: "standard",
    label: "Data Saver",
    badge: "📱 DATA SAVER (64K)",
    bitrateKbps: 64,
    dataPerHourMb: 28,
    dataPerHourLabel: "~28 MB/h",
    description: "Low-data mobile stream (64 kbps) optimized for Safaricom/Airtel bundles",
  },
  high: {
    id: "high",
    label: "Hi-Fi",
    badge: "🔊 HI-FI (192K)",
    bitrateKbps: 192,
    dataPerHourMb: 84,
    dataPerHourLabel: "~84 MB/h",
    description: "High-definition stereo stream (192 kbps) for Wi-Fi and premium sound",
  },
};

export const DEFAULT_QUALITY: AudioQuality = "standard";

/**
 * Calculates estimated data consumed in megabytes for a given duration in seconds.
 */
export function estimateDataUsageMb(seconds: number, quality: AudioQuality = "standard"): number {
  const tier = BITRATE_TIERS[quality] || BITRATE_TIERS.standard;
  const hours = seconds / 3600;
  return Math.round(hours * tier.dataPerHourMb * 10) / 10;
}

/**
 * Resolves the appropriate live stream URL based on user quality preference.
 */
export function resolveLiveStreamUrl(
  baseStreamUrl: string | undefined | null,
  quality: AudioQuality = "standard"
): string {
  if (!baseStreamUrl || !baseStreamUrl.trim()) return "";

  const trimmed = baseStreamUrl.trim();

  // Icecast and HLS mount point switching
  if (quality === "high") {
    // Switch to hi-fi mount if available, or replace _low with _hi
    if (trimmed.includes("live_low.mp3")) {
      return trimmed.replace("live_low.mp3", "live_hi.mp3");
    }
    if (trimmed.endsWith("/live.mp3")) {
      return trimmed.replace("/live.mp3", "/live_hi.mp3");
    }
    if (trimmed.includes("live_low.m3u8")) {
      return trimmed.replace("live_low.m3u8", "live_hi.m3u8");
    }
    if (trimmed.endsWith("/live.m3u8")) {
      return trimmed.replace("/live.m3u8", "/live_hi.m3u8");
    }
    return trimmed;
  } else {
    // Standard / Data Saver mount
    if (trimmed.includes("live_hi.mp3")) {
      return trimmed.replace("live_hi.mp3", "live_low.mp3");
    }
    if (trimmed.endsWith("/live.mp3")) {
      return trimmed.replace("/live.mp3", "/live_low.mp3");
    }
    if (trimmed.includes("live_hi.m3u8")) {
      return trimmed.replace("live_hi.m3u8", "live_low.m3u8");
    }
    if (trimmed.endsWith("/live.m3u8")) {
      return trimmed.replace("/live.m3u8", "/live_low.m3u8");
    }
    return trimmed;
  }
}

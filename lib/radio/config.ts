/**
 * Goodlife Radio Live Engine Configuration & Derived State Machine Timing
 *
 * All state machine thresholds are dynamically derived from the stream's
 * target segment duration (#EXT-X-TARGETDURATION) rather than hardcoded literals.
 */

// Baseline default target segment duration in seconds from HLS manifest (#EXT-X-TARGETDURATION:2)
export const DEFAULT_TARGET_DURATION_SEC = 2.0;

export interface RadioTimingConfig {
  targetDurationSec: number;
  reconnectThresholdMs: number;       // Time without buffer progress before entering 'reconnecting'
  backupMixThresholdMs: number;       // Time in 'reconnecting' before falling back to 'backup-mix'
  manifestProbeIntervalMs: number;    // Cadence to probe live stream while in 'backup-mix'
  metadataPollIntervalMs: number;     // Normal metadata polling interval
  metadataErrorBackoffMaxMs: number;  // Max backoff on polling errors
  upstreamTimeoutMs: number;          // Max latency allowed for upstream server response
  estimatedFallbackLatencySec: number;// Fallback audio delay estimate (3 x target duration)
}

export function computeRadioTiming(targetDurationSec: number = DEFAULT_TARGET_DURATION_SEC): RadioTimingConfig {
  const safeTarget = Math.max(1, targetDurationSec);
  return {
    targetDurationSec: safeTarget,
    // Buffer stall: 2 missed segments worth of time
    reconnectThresholdMs: Math.round(safeTarget * 2 * 1000),
    // Failover to backup mix: 4 missed segments worth of time
    backupMixThresholdMs: Math.round(safeTarget * 4 * 1000),
    // Probe live manifest every 2 segment durations while in backup
    manifestProbeIntervalMs: Math.round(safeTarget * 2 * 1000),
    // Metadata poll: 10 seconds
    metadataPollIntervalMs: 10_000,
    // Max exponential backoff: 60 seconds
    metadataErrorBackoffMaxMs: 60_000,
    // Upstream timeout on BFF: 3 seconds
    upstreamTimeoutMs: 3_000,
    // Fallback audio delay estimate: 3 x target duration (e.g. 6.0s for 2s segments).
    // Note: Local LAN baseline was measured at 6.38s; public tunnel / R2 latency will differ.
    estimatedFallbackLatencySec: Math.round(safeTarget * 3 * 10) / 10,
  };
}

export const RADIO_TIMING = computeRadioTiming(DEFAULT_TARGET_DURATION_SEC);

export type RadioEngineState =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "backup-mix"
  | "paused"
  | "error"
  | "offline";

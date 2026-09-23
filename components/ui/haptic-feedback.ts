/**
 * Haptic feedback for mobile web (Vibration API).
 *
 * HIG rationale: physical dimension of feedback — success/error states get a
 * tactile mirror of their visual signal (confetti / red banner). Desktop and
 * iOS Safari (no Vibration API) silently no-op; this is progressive
 * enhancement, never load-bearing.
 *
 * Patterns (ms):
 * - success:      [30] light pop, synced with confetti
 * - confirmation: [15, 60, 15] double tick — "action received, awaiting you"
 * - error:        [60, 40, 60] firm double thud
 */

export type HapticPattern = "success" | "confirmation" | "error";

const PATTERNS: Record<HapticPattern, number[]> = {
  success: [30],
  confirmation: [15, 60, 15],
  error: [60, 40, 60],
};

export const HapticFeedback = {
  /** Fire a named haptic pattern. Safe to call anywhere, any platform. */
  trigger(pattern: HapticPattern): void {
    if (typeof window === "undefined") return;
    const nav = window.navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate !== "function") return;
    try {
      nav.vibrate(PATTERNS[pattern]);
    } catch {
      /* never let haptics break a flow */
    }
  },
};

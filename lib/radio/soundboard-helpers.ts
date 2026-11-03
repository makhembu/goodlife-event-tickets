// lib/radio/soundboard-helpers.ts

export interface SoundboardPadItem {
  id: number;
  bank_id: number;
  position: number;
  label: string;
  emoji: string;
  color: string;
  audio_url: string | null;
  drop_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface SoundboardBankItem {
  id: number;
  name: string;
  position: number;
  pads: SoundboardPadItem[];
  created_at: string;
  updated_at: string;
}

export interface DropVaultOption {
  id: number;
  title: string;
  persona: string;
  mood: string;
  audio_url: string;
  script?: string;
  created_at: string;
}

/**
 * Validates audio URL: only allowed if starts with /drops/ or our verified R2 public domain
 */
export function isValidSoundboardAudioUrl(url: string | null | undefined): boolean {
  if (!url) return true; // Nullable clip is allowed
  const trimmed = url.trim();
  if (trimmed.startsWith("/drops/")) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return false;
    return (
      parsed.hostname.endsWith(".r2.dev") ||
      parsed.hostname.endsWith(".cloudflarestorage.com")
    );
  } catch {
    return false;
  }
}

/**
 * Swaps an item in an ordered ID list earlier or later.
 * Returns new array or unchanged array if at bounds.
 */
export function calculateStepReorder(
  orderedIds: number[],
  targetId: number,
  direction: "earlier" | "later"
): number[] {
  const curIdx = orderedIds.indexOf(targetId);
  if (curIdx === -1) return orderedIds;
  const targetIdx = direction === "earlier" ? curIdx - 1 : curIdx + 1;
  if (targetIdx < 0 || targetIdx >= orderedIds.length) return orderedIds;

  const result = [...orderedIds];
  const [removed] = result.splice(curIdx, 1);
  result.splice(targetIdx, 0, removed);
  return result;
}

/**
 * Guard against deleting the last remaining bank.
 */
export function canDeleteBank(totalBanks: number): boolean {
  return totalBanks > 1;
}

/**
 * Returns reordered pad items with updated position indices.
 */
export function reorderPadsWithPositions<T extends { id: number; position: number }>(
  pads: T[],
  orderedIds: number[]
): T[] {
  const padMap = new Map(pads.map((p) => [p.id, p]));
  const result: T[] = [];
  orderedIds.forEach((id, idx) => {
    const pad = padMap.get(id);
    if (pad) {
      result.push({ ...pad, position: idx });
    }
  });
  return result;
}

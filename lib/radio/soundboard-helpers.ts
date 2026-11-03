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

/**
 * Server-side validation of audio file limits:
 * - Content-Type must be audio MIME
 * - File size must not exceed 10MB (10,485,760 bytes)
 */
export async function validateSoundboardAudioLimits(
  url: string | null | undefined
): Promise<{ valid: boolean; error?: string }> {
  if (!url || !url.trim()) return { valid: true };

  const trimmed = url.trim();
  if (!isValidSoundboardAudioUrl(trimmed)) {
    return { valid: false, error: "Audio URL must point to our R2 storage domain or local /drops/ directory." };
  }

  const MAX_BYTES = 10 * 1024 * 1024; // 10MB

  // 1. Local relative files (/drops/...)
  if (trimmed.startsWith("/drops/")) {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const relativePath = trimmed.replace(/^\/+/, "");
      const fullPath = path.join(process.cwd(), "public", relativePath);

      if (!fs.existsSync(fullPath)) {
        return { valid: false, error: `Local audio file "${trimmed}" does not exist on disk.` };
      }

      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_BYTES) {
        return {
          valid: false,
          error: `Audio file size (${(stat.size / 1024 / 1024).toFixed(1)}MB) exceeds 10MB limit.`,
        };
      }
      return { valid: true };
    } catch {
      return { valid: true };
    }
  }

  // 2. Remote R2 Storage (HEAD probe)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(trimmed, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { valid: false, error: `Remote audio file returned HTTP ${res.status}.` };
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      const sizeBytes = parseInt(contentLength, 10);
      if (!isNaN(sizeBytes) && sizeBytes > MAX_BYTES) {
        return {
          valid: false,
          error: `Uploaded audio size (${(sizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds 10MB limit.`,
        };
      }
    }

    const contentType = res.headers.get("content-type");
    if (contentType) {
      const isAudio =
        contentType.startsWith("audio/") ||
        contentType.includes("octet-stream") ||
        contentType.includes("webm") ||
        contentType.includes("mp4") ||
        /\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(trimmed);
      if (!isAudio) {
        return {
          valid: false,
          error: `Invalid content type "${contentType}". Must be an audio file.`,
        };
      }
    }

    return { valid: true };
  } catch (err: any) {
    console.warn("[validateSoundboardAudioLimits] HEAD probe warning:", err.message);
    return { valid: true };
  }
}

/**
 * Validates admin session cookie value for fail-closed security.
 */
export function checkAdminSessionValid(cookieValue?: string | null): boolean {
  return cookieValue === "true";
}

/**
 * Executes a pad reordering transaction against a database client.
 * Calls BEGIN, updates each pad with its new sequential position,
 * and COMMITs. On error, calls ROLLBACK and rethrows.
 */
export async function executePadReorderTransaction(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  bankId: number,
  orderedPadIds: number[]
): Promise<number> {
  await client.query("BEGIN");
  try {
    for (let pos = 0; pos < orderedPadIds.length; pos++) {
      const padId = Number(orderedPadIds[pos]);
      await client.query(
        `UPDATE soundboard_pads 
         SET position = $1, updated_at = NOW() 
         WHERE id = $2 AND bank_id = $3`,
        [pos, padId, bankId]
      );
    }
    await client.query("COMMIT");
    return orderedPadIds.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

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

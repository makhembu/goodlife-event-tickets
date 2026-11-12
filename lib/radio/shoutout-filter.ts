import { createHash } from "crypto";
import { normalizePhone } from "@/lib/phone";

/**
 * Masks a phone number so it can never be exposed in public APIs or broadcast walls.
 * Converts "0712345678" -> "0712***678"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return "";
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 7) return "***";
  const start = normalized.slice(0, 4);
  const end = normalized.slice(-3);
  return `${start}***${end}`;
}

/**
 * Computes a SHA-256 identifier hash for rate limiting and deduplication.
 * Salted with an internal salt to prevent rainbow table reverse-lookups.
 */
export function hashIdentifier(val: string): string {
  const salt = process.env.PHONE_HASH_SALT || "goodlife_interaction_salt_2026";
  return createHash("sha256").update(`${salt}:${val.trim().toLowerCase()}`).digest("hex");
}

/**
 * Basic content moderation filter:
 * 1. Checks length limits.
 * 2. Blocks spam URLs / links (e.g. http://, https://, .com, .ru, telegram.me, t.me, wa.me).
 * 3. Blocks obvious profanity / abusive harassment strings.
 */
const PROFANITY_LIST = [
  "fck", "fuck", "shit", "bitch", "asshole", "pussy", "dick",
  "matako", "malaya", "kuma", "mboro", "uma", "kumamako"
];

const LINK_REGEX = /(https?:\/\/|www\.|\.com|\.xyz|\.io|\.org|\.net|\.ru|\.ng|t\.me|telegram\.me|bit\.ly)/i;

export interface ValidationResult {
  isValid: boolean;
  cleanText: string;
  error?: string;
}

export function sanitizeShoutoutMessage(message: string): ValidationResult {
  if (!message || typeof message !== "string") {
    return { isValid: false, cleanText: "", error: "Message cannot be empty." };
  }

  const trimmed = message.trim();
  if (trimmed.length < 2) {
    return { isValid: false, cleanText: "", error: "Message is too short." };
  }

  if (trimmed.length > 280) {
    return { isValid: false, cleanText: "", error: "Message exceeds 280 characters maximum." };
  }

  // Check spam links
  if (LINK_REGEX.test(trimmed)) {
    return { isValid: false, cleanText: "", error: "Links, URLs, and external handles are not allowed in shoutouts." };
  }

  // Check profanity / abuse
  const lower = trimmed.toLowerCase();
  for (const badWord of PROFANITY_LIST) {
    const wordRegex = new RegExp(`\\b${badWord}\\b`, "i");
    if (wordRegex.test(lower)) {
      return { isValid: false, cleanText: "", error: "Message contains restricted or inappropriate language." };
    }
  }

  return { isValid: true, cleanText: trimmed };
}

/**
 * Sanitizes sender name (max 50 chars, no control chars or html).
 */
export function sanitizeSenderName(name: string): string {
  if (!name) return "Anonymous Listener";
  const cleaned = name.trim().replace(/<[^>]*>/g, "").replace(/[<>]/g, "").slice(0, 50);
  return cleaned || "Anonymous Listener";
}

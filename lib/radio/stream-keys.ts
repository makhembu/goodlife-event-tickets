import crypto from "crypto";

export interface GeneratedStreamKey {
  fullKey: string;
  hash: string;
  prefix: string;
}

/**
 * Generates an unguessable stream key for a Goodlife presenter.
 * Format: gl_live_<32 random hex characters>
 * Returns the full key (to be shown ONCE), the SHA-256 hash (to store in DB),
 * and the prefix preview (e.g. gl_live_ab...9f4a).
 */
export function generateStreamKey(): GeneratedStreamKey {
  const randomHex = crypto.randomBytes(16).toString("hex");
  const fullKey = `gl_live_${randomHex}`;
  const hash = hashStreamKey(fullKey);
  const prefix = formatStreamKeyPrefix(fullKey);

  return { fullKey, hash, prefix };
}

/**
 * Computes deterministic SHA-256 hash of a stream key.
 */
export function hashStreamKey(key: string): string {
  return crypto.createHash("sha256").update(key.trim()).digest("hex");
}

/**
 * Formats a preview prefix string to display safely in dashboards.
 * Example: "gl_live_1234...abcd"
 */
export function formatStreamKeyPrefix(fullKey: string): string {
  const trimmed = fullKey.trim();
  if (trimmed.length < 16) return trimmed;
  return `${trimmed.slice(0, 11)}...${trimmed.slice(-4)}`;
}

/**
 * Timing-safe stream key verification against the stored SHA-256 hash.
 */
export function verifyStreamKey(inputKey: string, storedHash: string | null | undefined): boolean {
  if (!inputKey || !storedHash) return false;
  try {
    const candidateHash = hashStreamKey(inputKey);
    const candidateBuf = Buffer.from(candidateHash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");

    if (candidateBuf.length !== storedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(candidateBuf, storedBuf);
  } catch {
    return false;
  }
}

/**
 * Formats standard Icecast/Harbor username for a presenter: "dj_<slug>"
 */
export function formatPresenterUsername(slug: string): string {
  const clean = slug.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return clean.startsWith("dj_") ? clean : `dj_${clean}`;
}

/**
 * Extracts presenter slug from Icecast username (removes "dj_" prefix if present).
 */
export function extractSlugFromUsername(username: string): string {
  const clean = username.trim().toLowerCase();
  return clean.replace(/^dj[_-]/, "");
}

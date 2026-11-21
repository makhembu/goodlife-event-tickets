// East African Sheng & Swahili + standard profanity & spam link filtering for GOODLIFE Radio 254
// Flags messages for presenter/admin queue rather than blindly dropping them.

const ENGLISH_PATTERNS = [
  /\bf+u+c+k+/i,
  /\bs+h+i+t+/i,
  /\bb+i+t+c+h+/i,
  /\ba+s+s+h+o+l+e+/i,
  /\bb+a+s+t+a+r+d+/i,
  /\bd+i+c+k+/i,
  /\bp+u+s+s+y+/i,
  /\bn+i+g+g+/i,
  /\bc+u+n+t+/i,
  /\bw+h+o+r+e+/i,
  /\bs+l+u+t+/i,
];

// Swahili & Sheng insults, vulgarities, and derogatory terms
const SWAHILI_SHENG_PATTERNS = [
  /\bk+u+m+a+/i,
  /\bm+b+w+a+ g+a+s+i+/i,
  /\bm+a+l+a+y+a+/i,
  /\bm+a+v+i+/i,
  /\bm+k+u+n+d+u+/i,
  /\bm+b+o+o+/i,
  /\bk+u+m+a+n+i+n+a+/i,
  /\bg+h+a+s+i+a+/i,
  /\bk+a+f+i+r+i+/i,
  /\bs+h+e+t+a+n+i+/i,
  /\bm+t+h+e+t+h+e+/i,
];

// Spam patterns (URLs, scam Telegram/WhatsApp groups, phishing)
const SPAM_PATTERNS = [
  /https?:\/\//i,
  /wa\.me\//i,
  /t\.me\//i,
  /\.xyz\b/i,
  /\.top\b/i,
  /\.ru\b/i,
  /\b(crypto|bitcoin|forex|invest|earning|free tickets|guaranteed win)\b/i,
];

export interface ModerationResult {
  isFlagged: boolean;
  reasons: string[];
}

export function moderateMessage(text: string): ModerationResult {
  if (!text) return { isFlagged: false, reasons: [] };
  
  const reasons: string[] = [];

  // 1. Check English profanity
  for (const pattern of ENGLISH_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push("profanity_en");
      break;
    }
  }

  // 2. Check Swahili/Sheng profanity
  for (const pattern of SWAHILI_SHENG_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push("profanity_sw_sheng");
      break;
    }
  }

  // 3. Check spam & link patterns
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push("spam_link");
      break;
    }
  }

  return {
    isFlagged: reasons.length > 0,
    reasons,
  };
}

// Sanitization: Strips control characters, normalizes whitespace, trims
export function sanitizeInputText(input?: string | null, maxLen: number = 280): string {
  if (!input) return "";
  // Strip control chars (\x00-\x1F except newline and tab)
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return cleaned.trim().slice(0, maxLen);
}

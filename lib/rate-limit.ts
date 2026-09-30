import { NextRequest, NextResponse } from "next/server";
import { alertPayheroAbuseRisk } from "./payhero-alerts";

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

const clientMap = new Map<string, ClientRecord>();
const phoneCooldownMap = new Map<string, number>();

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of clientMap.entries()) {
      if (now > record.resetTime) {
        clientMap.delete(key);
      }
    }
    for (const [phone, cooldownUntil] of phoneCooldownMap.entries()) {
      if (now > cooldownUntil) {
        phoneCooldownMap.delete(phone);
      }
    }
  }, 5 * 60 * 1000);
  if (timer.unref) timer.unref();
}

export function getClientIp(req: NextRequest): string {
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return "127.0.0.1";
}

export function checkKeyRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetInMs: number; retryAfterSec: number } {
  const now = Date.now();
  const record = clientMap.get(key);

  if (!record || now > record.resetTime) {
    clientMap.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetInMs: config.windowMs,
      retryAfterSec: Math.ceil(config.windowMs / 1000),
    };
  }

  if (record.count >= config.maxRequests) {
    const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetInMs: record.resetTime - now,
      retryAfterSec,
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetInMs: record.resetTime - now,
    retryAfterSec: Math.ceil((record.resetTime - now) / 1000),
  };
}

export function checkRateLimit(
  req: NextRequest,
  actionKey: string,
  config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }
): { allowed: boolean; remaining: number; resetInMs: number; response?: NextResponse } {
  const ip = getClientIp(req);
  const identifier = `${actionKey}:${ip}`;
  const res = checkKeyRateLimit(identifier, config);

  if (!res.allowed) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs: res.resetInMs,
      response: NextResponse.json(
        {
          error: "Too many requests. Please slow down.",
          message: `Rate limit exceeded. Please wait ${res.retryAfterSec} seconds before trying again.`,
          retryAfter: res.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(res.retryAfterSec),
            "X-RateLimit-Limit": String(config.maxRequests),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil((Date.now() + res.resetInMs) / 1000)),
          },
        }
      ),
    };
  }

  return {
    allowed: true,
    remaining: res.remaining,
    resetInMs: res.resetInMs,
  };
}

// ==================== PAYHERO STK ABUSE & RATE LIMIT ENGINE ====================
// PayHero Policy & Docs Protection:
// 1. Per-Phone Number: >10 successive failed/cancelled STK requests blocks phone for 24h.
// 2. Account-Level: 50+ failed/cancelled requests in 6h locks down account for 4h (500+ for 24h).
// 3. Prevent rapid double-triggers while phone dialog is ringing.

interface FailureRecord {
  timestamp: number;
  phone?: string;
  reference?: string;
  reason?: string;
}

const recentPayheroFailures: FailureRecord[] = [];

/**
 * Record a failed or cancelled PayHero STK transaction from webhooks or status checks.
 * Tracks against PayHero's 50-failure 6-hour account restriction threshold.
 */
export function recordPayheroFailure(event: { phone?: string; reference?: string; reason?: string }) {
  const now = Date.now();
  recentPayheroFailures.push({ ...event, timestamp: now });

  // Retain only last 6 hours
  const sixHoursAgo = now - 6 * 60 * 60 * 1000;
  while (recentPayheroFailures.length > 0 && recentPayheroFailures[0].timestamp < sixHoursAgo) {
    recentPayheroFailures.shift();
  }

  // If approaching the 50-limit account suspension threshold (e.g. 35+), warn operators
  if (recentPayheroFailures.length >= 35) {
    alertPayheroAbuseRisk(recentPayheroFailures.length, 6).catch(() => {});
  }
}

/**
 * Returns number of failed/cancelled transactions in the last N milliseconds (default 6 hours).
 */
export function getRecentPayheroFailureCount(windowMs: number = 6 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - windowMs;
  return recentPayheroFailures.filter(f => f.timestamp >= cutoff).length;
}

export interface PayheroStkRateLimitResult {
  allowed: boolean;
  error?: string;
  message?: string;
  retryAfterSec?: number;
  response?: NextResponse;
}

/**
 * Strict, multi-tiered rate limiting for PayHero STK Push prompts:
 * - 25s cooldown per phone number (prevents duplicate ringing prompts)
 * - Max 3 prompts per 5 minutes per phone number
 * - Max 8 prompts per 24 hours per phone number (stays well under PayHero's 10-fail ban threshold)
 * - Max 5 prompts per minute per IP
 * - Max 25 prompts per hour per IP
 * - Account circuit-breaker if 6-hour failures approach 50
 */
export function checkPayheroStkRateLimit({
  request,
  phoneNumber,
  scope = "stk-push",
}: {
  request: NextRequest;
  phoneNumber: string;
  scope?: string;
}): PayheroStkRateLimitResult {
  const now = Date.now();

  // Normalize phone number to digits only (e.g. 254712345678)
  const clean = phoneNumber.replace(/\D/g, "");
  const normPhone = clean.startsWith("0") ? "254" + clean.slice(1) : clean.startsWith("+") ? clean.slice(1) : clean;

  // 1. Phone Cooldown (Anti-Double-Click / Active Dialog Guard)
  // Safaricom USSD prompt stays active on customer handset for 15-45s.
  // Spamming another push immediately terminates the previous one and generates a cancelled record in PayHero.
  const activeCooldownUntil = phoneCooldownMap.get(normPhone);
  if (activeCooldownUntil && activeCooldownUntil > now) {
    const secondsLeft = Math.max(1, Math.ceil((activeCooldownUntil - now) / 1000));
    const userMsg = `An M-Pesa STK prompt was recently sent to ${phoneNumber}. Please check your phone for the PIN dialog, or wait ${secondsLeft}s before requesting a new prompt.`;
    return {
      allowed: false,
      error: userMsg,
      message: userMsg,
      retryAfterSec: secondsLeft,
      response: NextResponse.json(
        {
          success: false,
          error: userMsg,
          message: userMsg,
          retryAfter: secondsLeft,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(secondsLeft),
            "X-RateLimit-Violation": "phone-cooldown",
          },
        }
      ),
    };
  }

  // 2. Phone 5-Minute Frequency (Max 3 prompts in 5 minutes)
  const phone5m = checkKeyRateLimit(`payhero:phone:5m:${normPhone}`, { maxRequests: 3, windowMs: 5 * 60 * 1000 });
  if (!phone5m.allowed) {
    const userMsg = `Too many STK payment prompts sent to this phone number. Please wait ${phone5m.retryAfterSec}s or pay via Manual Till to avoid temporary carrier restriction.`;
    return {
      allowed: false,
      error: userMsg,
      message: userMsg,
      retryAfterSec: phone5m.retryAfterSec,
      response: NextResponse.json(
        {
          success: false,
          error: userMsg,
          message: userMsg,
          retryAfter: phone5m.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(phone5m.retryAfterSec),
            "X-RateLimit-Violation": "phone-frequency-5m",
          },
        }
      ),
    };
  }

  // 3. Phone 24-Hour Frequency (Max 8 prompts in 24 hours - under PayHero's 10-fail ban threshold)
  const phone24h = checkKeyRateLimit(`payhero:phone:24h:${normPhone}`, { maxRequests: 8, windowMs: 24 * 60 * 60 * 1000 });
  if (!phone24h.allowed) {
    const userMsg = `Payment limit reached for this phone number today. PayHero restricts numbers with frequent attempts. Please use Manual Till or contact support.`;
    return {
      allowed: false,
      error: userMsg,
      message: userMsg,
      retryAfterSec: phone24h.retryAfterSec,
      response: NextResponse.json(
        {
          success: false,
          error: userMsg,
          message: userMsg,
          retryAfter: phone24h.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(phone24h.retryAfterSec),
            "X-RateLimit-Violation": "phone-frequency-24h",
          },
        }
      ),
    };
  }

  // 4. IP-Level Rate Limits (Anti-Bot / Network Flood Guard)
  const ip = getClientIp(request);
  const ip1m = checkKeyRateLimit(`payhero:ip:1m:${ip}`, { maxRequests: 5, windowMs: 60 * 1000 });
  if (!ip1m.allowed) {
    const userMsg = `Too many payment requests from this device. Please wait ${ip1m.retryAfterSec}s before trying again.`;
    return {
      allowed: false,
      error: userMsg,
      message: userMsg,
      retryAfterSec: ip1m.retryAfterSec,
      response: NextResponse.json(
        {
          success: false,
          error: userMsg,
          message: userMsg,
          retryAfter: ip1m.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(ip1m.retryAfterSec),
            "X-RateLimit-Violation": "ip-1m",
          },
        }
      ),
    };
  }

  const ip1h = checkKeyRateLimit(`payhero:ip:1h:${ip}`, { maxRequests: 25, windowMs: 60 * 60 * 1000 });
  if (!ip1h.allowed) {
    const userMsg = `Hourly payment request limit exceeded. Please wait ${ip1h.retryAfterSec}s.`;
    return {
      allowed: false,
      error: userMsg,
      message: userMsg,
      retryAfterSec: ip1h.retryAfterSec,
      response: NextResponse.json(
        {
          success: false,
          error: userMsg,
          message: userMsg,
          retryAfter: ip1h.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(ip1h.retryAfterSec),
            "X-RateLimit-Violation": "ip-1h",
          },
        }
      ),
    };
  }

  // 5. Account Failure Protection
  // If recent 6-hour failed/cancelled requests reach 40+ (near the 50 limit), enforce 45s cooldown on all STK prompts
  const recentFailures = getRecentPayheroFailureCount();
  if (recentFailures >= 40) {
    const cooldownSec = 45;
    const userMsg = `Payment gateway is experiencing high network load. Please wait ${cooldownSec}s before retrying.`;
    return {
      allowed: false,
      error: userMsg,
      message: userMsg,
      retryAfterSec: cooldownSec,
      response: NextResponse.json(
        {
          success: false,
          error: userMsg,
          message: userMsg,
          retryAfter: cooldownSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(cooldownSec),
            "X-RateLimit-Violation": "account-circuit-breaker",
          },
        }
      ),
    };
  }

  // If passed all checks, activate a 25-second cooldown for this phone number
  phoneCooldownMap.set(normPhone, now + 25 * 1000);

  return { allowed: true };
}

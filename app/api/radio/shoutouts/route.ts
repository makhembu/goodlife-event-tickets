import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import {
  sanitizeShoutoutMessage,
  sanitizeSenderName,
  hashIdentifier,
  maskPhone,
} from "@/lib/radio/shoutout-filter";
import { normalizePhone } from "@/lib/phone";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Public Shoutouts & Song Requests API
 * 
 * GET /api/radio/shoutouts
 * Returns public list of approved and featured shoutouts for the Shoutout Wall ticker.
 * Phone numbers are NEVER returned (sender_phone is omitted entirely).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 50);

    const res = await neonQuery(
      `SELECT 
        id, 
        sender_name, 
        message, 
        request_track, 
        source, 
        is_featured, 
        created_at
       FROM radio_shoutouts
       WHERE status IN ('approved', 'read') OR is_featured = TRUE
       ORDER BY is_featured DESC, created_at DESC
       LIMIT $1;`,
      [limit]
    );

    return NextResponse.json(res?.rows || [], {
      headers: {
        "Cache-Control": "s-maxage=10, stale-while-revalidate=20",
      },
    });
  } catch (err: any) {
    console.warn("[api/radio/shoutouts:GET] Error:", err.message);
    return NextResponse.json([], { status: 200 });
  }
}

/**
 * POST /api/radio/shoutouts
 * Listener sends a shoutout or song request via web form.
 * Protected by database-backed rate limits, spam/link/profanity filters.
 */
export async function POST(req: NextRequest) {
  // 1. IP rate limiting (5 requests per 5 minutes per IP)
  const rl = checkRateLimit(req, "radio-shoutout", { maxRequests: 5, windowMs: 5 * 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const body = await req.json();
    const { name, message, trackRequest, phone } = body || {};

    // 2. Validate Message
    const validation = sanitizeShoutoutMessage(message);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const cleanName = sanitizeSenderName(name);
    const cleanTrack = trackRequest ? String(trackRequest).trim().slice(0, 150) : null;
    const cleanPhone = phone ? normalizePhone(phone) : null;

    // 3. Sender Identifier Hash for rate limiting
    // Derive from phone if provided, else from client IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const senderHash = hashIdentifier(cleanPhone || clientIp);

    // 4. Database-backed rate limit check (max 3 shoutouts per 15 minutes per sender)
    try {
      const recentCountRes = await neonQuery(
        `SELECT COUNT(*) as cnt 
         FROM radio_shoutouts 
         WHERE sender_hash = $1 AND created_at > NOW() - INTERVAL '15 minutes';`,
        [senderHash]
      );
      const recentCount = parseInt(recentCountRes?.rows?.[0]?.cnt || "0", 10);
      if (recentCount >= 3) {
        return NextResponse.json(
          { error: "Slow down! You can send up to 3 shoutouts every 15 minutes." },
          { status: 429 }
        );
      }
    } catch {
      // If table unmigrated, proceed
    }

    // 5. Find current on-air slot (or slot within warm-up)
    let currentSlotId: number | null = null;
    try {
      const slotRes = await neonQuery(
        `SELECT id FROM show_slots 
         WHERE starts_at <= NOW() AND ends_at >= NOW()
         ORDER BY starts_at DESC LIMIT 1;`
      );
      if (slotRes?.rows && slotRes.rows.length > 0) {
        currentSlotId = slotRes.rows[0].id;
      }
    } catch {
      currentSlotId = null;
    }

    // 6. Insert Shoutout
    const insertRes = await neonQuery(
      `INSERT INTO radio_shoutouts 
        (slot_id, sender_name, sender_phone, sender_hash, message, request_track, source, status, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, 'web', 'pending', FALSE)
       RETURNING id, sender_name, message, request_track, created_at;`,
      [currentSlotId, cleanName, cleanPhone, senderHash, validation.cleanText, cleanTrack]
    );

    const inserted = insertRes?.rows?.[0] || {
      id: Date.now(),
      sender_name: cleanName,
      message: validation.cleanText,
      request_track: cleanTrack,
    };

    return NextResponse.json({
      success: true,
      message: "Shoutout submitted! It will appear on air once approved by the DJ.",
      shoutout: {
        id: inserted.id,
        sender_name: inserted.sender_name,
        message: inserted.message,
        request_track: inserted.request_track,
      },
    });
  } catch (err: any) {
    console.error("[api/radio/shoutouts:POST] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to submit shoutout" }, { status: 500 });
  }
}

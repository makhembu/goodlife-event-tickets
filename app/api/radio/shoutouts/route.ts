import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import {
  sanitizeShoutoutMessage,
  sanitizeSenderName,
  hashIdentifier,
} from "@/lib/radio/shoutout-filter";
import { moderateMessage, sanitizeInputText } from "@/lib/radio/moderation";
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
        status,
        request_status,
        presenter_id,
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
 * Protected by database-backed rate limits, Sheng/Swahili filter, and session throttling.
 */
export async function POST(req: NextRequest) {
  // 1. IP rate limiting (10 requests per minute per IP ceiling for festival Wi-Fi)
  const rl = checkRateLimit(req, "radio-shoutout", { maxRequests: 10, windowMs: 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const body = await req.json();
    const { name, message, trackRequest, phone, presenterId } = body || {};

    // 2. Validate Message (Raw trim, clean control chars, no double-escaping)
    const rawMessage = sanitizeInputText(message, 280);
    if (!rawMessage || rawMessage.length < 2) {
      return NextResponse.json({ error: "Please enter a message (at least 2 characters)." }, { status: 400 });
    }

    const cleanName = sanitizeSenderName(name) || "Festival Listener";
    const cleanTrack = trackRequest ? sanitizeInputText(trackRequest, 150) : null;
    const cleanPhone = phone ? normalizePhone(phone) : null;

    // 3. Sheng / Swahili & Profanity & Link Analysis (Flags message rather than blindly dropping)
    const modCheck = moderateMessage(rawMessage + " " + (cleanTrack || ""));

    // 4. Sender Identifier Hash for rate limiting (via session cookie or IP)
    const listenerCookie = req.cookies.get("goodlife_listener_id")?.value;
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const senderHash = hashIdentifier(listenerCookie || cleanPhone || clientIp);

    // 5. Database-backed rate limit check (max 3 shoutouts per 15 minutes per session hash)
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
      // Proceed if query fails
    }

    // 6. Find current on-air slot and presenter
    let currentSlotId: number | null = null;
    let targetPresenterId: number | null = presenterId ? parseInt(String(presenterId), 10) : null;

    try {
      const slotRes = await neonQuery(
        `SELECT id, presenter_id FROM show_slots 
         WHERE status = 'live' OR (starts_at <= NOW() AND ends_at >= NOW())
         ORDER BY starts_at DESC LIMIT 1;`
      );
      if (slotRes?.rows && slotRes.rows.length > 0) {
        currentSlotId = slotRes.rows[0].id;
        if (!targetPresenterId) {
          targetPresenterId = slotRes.rows[0].presenter_id;
        }
      }
    } catch {
      currentSlotId = null;
    }

    // 7. Global Cap Guard: Max 50 pending unreviewed messages per slot to prevent bot floods
    if (currentSlotId) {
      try {
        const pendingCountRes = await neonQuery(
          `SELECT COUNT(*) as cnt FROM radio_shoutouts WHERE slot_id = $1 AND status = 'pending';`,
          [currentSlotId]
        );
        const pendingCount = parseInt(pendingCountRes?.rows?.[0]?.cnt || "0", 10);
        if (pendingCount >= 50) {
          return NextResponse.json(
            { error: "The DJ queue is full of incoming love! Please try again in a few minutes." },
            { status: 429 }
          );
        }
      } catch {}
    }

    // 8. Insert Shoutout (Stored raw, React DOM will safely escape on output)
    const insertRes = await neonQuery(
      `INSERT INTO radio_shoutouts 
        (slot_id, presenter_id, sender_name, sender_phone, sender_hash, message, request_track, source, status, is_featured, is_flagged, request_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'web', 'pending', FALSE, $8, $9)
       RETURNING id, sender_name, message, request_track, status, created_at;`,
      [
        currentSlotId,
        targetPresenterId,
        cleanName,
        cleanPhone,
        senderHash,
        rawMessage,
        cleanTrack,
        modCheck.isFlagged,
        cleanTrack ? "pending" : null,
      ]
    );

    const inserted = insertRes?.rows?.[0] || {
      id: Date.now(),
      sender_name: cleanName,
      message: rawMessage,
      request_track: cleanTrack,
      status: "pending",
    };

    const response = NextResponse.json({
      success: true,
      message: "Shoutout sent! It will appear on air once checked by the DJ.",
      shoutout: {
        id: inserted.id,
        sender_name: inserted.sender_name,
        message: inserted.message,
        request_track: inserted.request_track,
        status: inserted.status,
      },
    });

    // Ensure listener session cookie is stamped if absent
    if (!listenerCookie) {
      response.cookies.set("goodlife_listener_id", senderHash, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        httpOnly: true,
        sameSite: "lax",
      });
    }

    return response;
  } catch (err: any) {
    console.error("[api/radio/shoutouts:POST] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to submit shoutout" }, { status: 500 });
  }
}

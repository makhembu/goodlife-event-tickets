import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { neonQuery, createTicket, fetchTicketTiers, getEventById } from "@/lib/supabase-db";
import { requirePresenter } from "@/lib/presenter-auth";
import { requireAdmin } from "@/lib/admin-auth";
import { hashIdentifier } from "@/lib/radio/shoutout-filter";
import { normalizePhone } from "@/lib/phone";
import { sendTicketViaWhatsApp } from "@/lib/whatsapp";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Contests & Ticket Giveaways API
 * 
 * GET /api/radio/contests
 * Public / listener endpoint returning active contests to participate in.
 *
 * POST /api/radio/contests
 * Presenter/Admin creates a contest. MUST reference an admin-approved event_id and tier_id.
 * Max winners cap is strictly enforced.
 */
export async function GET(req: NextRequest) {
  try {
    const res = await neonQuery(
      `SELECT 
        c.id,
        c.slot_id,
        c.title,
        c.description,
        c.contest_type,
        c.status,
        c.event_id,
        c.tier_id,
        c.max_winners,
        c.winners_awarded,
        c.starts_at,
        c.ends_at,
        e.title as event_title,
        p.dj_name
       FROM radio_contests c
       JOIN events e ON c.event_id = e.id
       LEFT JOIN presenters p ON c.presenter_id = p.id
       WHERE c.status = 'active' AND (c.ends_at IS NULL OR c.ends_at > NOW())
       ORDER BY c.created_at DESC LIMIT 5;`
    );

    // Omit passphrase from public response
    return NextResponse.json(res?.rows || [], {
      headers: {
        "Cache-Control": "s-maxage=5, stale-while-revalidate=10",
      },
    });
  } catch (err: any) {
    console.warn("[api/radio/contests:GET] Error:", err.message);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const presenterAuth = await requirePresenter(req);
    let isAdmin = false;
    let presenterId: number | null = null;

    if ("presenter" in presenterAuth) {
      presenterId = presenterAuth.presenter.id;
    } else {
      try {
        await requireAdmin(req);
        isAdmin = true;
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json();
    const {
      title,
      description,
      passphrase,
      contest_type = "passphrase",
      event_id,
      tier_id,
      max_winners = 1,
      duration_minutes = 30,
      slot_id,
    } = body || {};

    if (!title || !event_id || !tier_id) {
      return NextResponse.json({ error: "Missing required fields: title, event_id, tier_id." }, { status: 400 });
    }

    // Verify Event and Tier exist in database
    const targetEvent = await getEventById(Number(event_id));
    if (!targetEvent) {
      return NextResponse.json({ error: "Invalid event selected." }, { status: 400 });
    }

    const tiers = await fetchTicketTiers(targetEvent.id);
    const matchedTier = tiers.find((t) => t.id === tier_id);
    if (!matchedTier) {
      return NextResponse.json({ error: "Invalid ticket tier selected for this event." }, { status: 400 });
    }

    // Presenter contest budget cap check: max 5 tickets per contest
    const safeMaxWinners = Math.min(Math.max(parseInt(max_winners, 10) || 1, 1), 5);

    // Resolve slot
    let targetSlotId: number | null = slot_id ? parseInt(slot_id, 10) : null;
    if (!targetSlotId) {
      const slotRes = await neonQuery(
        `SELECT id FROM show_slots 
         WHERE starts_at <= NOW() AND ends_at >= NOW()
         ORDER BY starts_at DESC LIMIT 1;`
      );
      targetSlotId = slotRes?.rows?.[0]?.id || null;
    }

    const contestRes = await neonQuery(
      `INSERT INTO radio_contests 
        (slot_id, presenter_id, title, description, passphrase, contest_type, status, event_id, tier_id, max_winners, winners_awarded, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, 0, NOW(), NOW() + ($10 || ' minutes')::INTERVAL)
       RETURNING id, title, max_winners, starts_at, ends_at;`,
      [
        targetSlotId,
        presenterId,
        String(title).trim().slice(0, 255),
        description ? String(description).trim() : null,
        passphrase ? String(passphrase).trim().toLowerCase() : null,
        contest_type,
        targetEvent.id,
        matchedTier.id,
        safeMaxWinners,
        parseInt(duration_minutes, 10) || 30,
      ]
    );

    return NextResponse.json({
      success: true,
      message: `Contest launched! Giving away ${safeMaxWinners}x ${matchedTier.name} pass(es).`,
      contest: contestRes?.rows?.[0] || null,
    });
  } catch (err: any) {
    console.error("[api/radio/contests:POST] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to create contest" }, { status: 500 });
  }
}

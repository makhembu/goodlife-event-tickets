import { NextRequest, NextResponse } from "next/server";
import { verifyInternalMachineAuth } from "@/lib/radio/internal-auth";
import { neonQuery } from "@/lib/supabase-db";
import { verifyStreamKey, extractSlugFromUsername } from "@/lib/radio/stream-keys";

export const dynamic = "force-dynamic";

const DEFAULT_WARMUP_MINUTES = 15;

/**
 * POST /api/internal/radio-auth
 * Machine-to-machine route called by Liquidsoap harbor daemon before allowing a stream.
 * HMAC-signed with RADIO_BRIDGE_SECRET / GOODLIFE_RADIO_SECRET_KEY.
 *
 * Rules:
 * a. Presenter must be active and stream key must match.
 * b. Presenter must have a slot (primary or substitute) that is live now or starts within warmup window.
 * c. If connecting early during warmup and another presenter is currently live, reject with retry time.
 * d. Log all attempts (allow/deny) in radio_connection_log.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const authErr = await verifyInternalMachineAuth(req, rawBody);
  if (authErr) return authErr;

  let payload: any = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUsername = String(payload.username || "").trim();
  const rawKey = String(payload.key || "").trim();
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || payload.client_ip || null;

  if (!rawUsername || !rawKey) {
    return NextResponse.json(
      { allow: false, reason: "Username and stream key required" },
      { status: 400 }
    );
  }

  const slug = extractSlugFromUsername(rawUsername);
  const warmupMinutes = parseInt(
    process.env.WARMUP_WINDOW_MINUTES || String(DEFAULT_WARMUP_MINUTES),
    10
  );

  async function logAttempt(
    presenterId: number | null,
    slotId: number | null,
    allowed: boolean,
    reason: string
  ) {
    try {
      await neonQuery(
        `INSERT INTO radio_connection_log (
           presenter_id, slot_id, username, client_ip, allowed, reason, attempted_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW());`,
        [presenterId, slotId, rawUsername, clientIp, allowed, reason]
      );
    } catch (logErr) {
      console.error("[radio-auth] Failed to write connection log:", logErr);
    }
  }

  try {
    // 0. Admin Master Takeover Check
    // If username is "admin" or slug is "admin", verify against radio_settings.admin_stream_key_hash
    if (slug === "admin" || rawUsername.toLowerCase() === "admin") {
      const adminRes = await neonQuery(
        `SELECT admin_stream_key_hash, admin_stream_key_prefix, live_title
         FROM radio_settings
         WHERE id = 1
         LIMIT 1;`
      );

      const adminRow = adminRes.rows[0];
      const adminHash = adminRow?.admin_stream_key_hash;

      if (!adminHash || !verifyStreamKey(rawKey, adminHash)) {
        await logAttempt(null, null, false, "Invalid admin master stream key");
        return NextResponse.json({
          allow: false,
          reason: "Invalid admin stream key",
        });
      }

      // Admin has instant, unconditional takeover privileges (anytime 24/7)
      const liveTitle = adminRow?.live_title || "GOODLIFE MAIN STAGE LIVE (ADMIN TAKEOVER)";
      await logAttempt(null, null, true, "Admin Master Live Takeover Authorized");

      // Stamp radio_settings to live mode immediately
      try {
        await neonQuery(
          `UPDATE radio_settings
           SET broadcast_mode = 'live',
               live_title = $1,
               last_heartbeat = NOW(),
               updated_at = NOW()
           WHERE id = 1;`,
          [liveTitle]
        );
      } catch (e) {
        console.warn("[radio-auth] Failed to update radio_settings on admin takeover:", e);
      }

      return NextResponse.json({
        allow: true,
        reason: "Authorized (Admin Master Takeover)",
        slot_id: null,
        show_id: null,
        show_title: liveTitle,
        presenter_id: null,
        dj_name: "Admin Control",
        is_admin_takeover: true,
        starts_at: new Date().toISOString(),
        ends_at: null,
      });
    }

    // 1. Presenter Lookup
    const presRes = await neonQuery(
      `SELECT id, full_name, dj_name, slug, email, stream_key_hash, status
       FROM presenters
       WHERE LOWER(slug) = LOWER($1) OR LOWER(email) = LOWER($1)
       LIMIT 1;`,
      [slug]
    );

    if (presRes.rows.length === 0) {
      await logAttempt(null, null, false, "Presenter not found");
      return NextResponse.json({
        allow: false,
        reason: "Invalid presenter credentials",
      });
    }

    const presenter = presRes.rows[0];

    // 2. Status check
    if (presenter.status !== "active") {
      await logAttempt(presenter.id, null, false, `Presenter account ${presenter.status}`);
      return NextResponse.json({
        allow: false,
        reason: `Presenter account is ${presenter.status}. Please contact station administration.`,
      });
    }

    // 3. Stream Key verification
    if (!presenter.stream_key_hash || !verifyStreamKey(rawKey, presenter.stream_key_hash)) {
      await logAttempt(presenter.id, null, false, "Invalid stream key");
      return NextResponse.json({
        allow: false,
        reason: "Invalid presenter credentials",
      });
    }

    const now = new Date();
    const warmupLimit = new Date(now.getTime() + warmupMinutes * 60 * 1000);

    // 4. Candidate Slot check (Primary presenter OR substitute)
    const slotRes = await neonQuery(
      `SELECT s.id, s.show_id, s.presenter_id, s.substitute_presenter_id,
              s.starts_at, s.ends_at, s.status,
              sh.title AS show_title, sh.slug AS show_slug
       FROM show_slots s
       JOIN shows sh ON s.show_id = sh.id
       WHERE (s.presenter_id = $1 OR s.substitute_presenter_id = $1)
         AND s.status NOT IN ('cancelled', 'completed')
         AND s.starts_at <= $2
         AND s.ends_at > $3
       ORDER BY s.starts_at ASC
       LIMIT 1;`,
      [presenter.id, warmupLimit.toISOString(), now.toISOString()]
    );

    if (slotRes.rows.length === 0) {
      // Check for future slot to give informative message
      const nextSlotRes = await neonQuery(
        `SELECT s.starts_at, sh.title AS show_title
         FROM show_slots s
         JOIN shows sh ON s.show_id = sh.id
         WHERE (s.presenter_id = $1 OR s.substitute_presenter_id = $1)
           AND s.status NOT IN ('cancelled', 'completed')
           AND s.starts_at > $2
         ORDER BY s.starts_at ASC
         LIMIT 1;`,
        [presenter.id, now.toISOString()]
      );

      let reason = "No broadcast slot scheduled for you right now.";
      let nextSlotAt: string | null = null;
      if (nextSlotRes.rows.length > 0) {
        const nextSlot = nextSlotRes.rows[0];
        nextSlotAt = nextSlot.starts_at;
        const eatTime = new Date(nextSlot.starts_at).toLocaleTimeString("en-KE", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "Africa/Nairobi",
        });
        reason = `Your next show "${nextSlot.show_title}" is scheduled at ${eatTime} EAT. Warmup opens ${warmupMinutes}m before showtime.`;
      }

      await logAttempt(presenter.id, null, false, reason);
      return NextResponse.json({
        allow: false,
        reason,
        next_slot_at: nextSlotAt,
      });
    }

    const candidateSlot = slotRes.rows[0];
    const slotStartsAt = new Date(candidateSlot.starts_at);

    // 5. Early Warm-up Handover Protection:
    // If incoming presenter connects before starts_at, check if ANOTHER presenter is currently live
    if (now < slotStartsAt) {
      const activeLiveRes = await neonQuery(
        `SELECT s.id, s.presenter_id, p.dj_name, sh.title AS show_title
         FROM show_slots s
         JOIN presenters p ON s.presenter_id = p.id
         JOIN shows sh ON s.show_id = sh.id
         WHERE s.status = 'live'
           AND s.id != $1
           AND s.presenter_id != $2
           AND COALESCE(s.substitute_presenter_id, -1) != $2
         LIMIT 1;`,
        [candidateSlot.id, presenter.id]
      );

      if (activeLiveRes.rows.length > 0) {
        const currentLive = activeLiveRes.rows[0];
        const retryEpoch = Math.floor(slotStartsAt.getTime() / 1000);
        const startsAtEat = slotStartsAt.toLocaleTimeString("en-KE", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZone: "Africa/Nairobi",
        });

        const handoverReason = `Another show is on air: "${currentLive.show_title}" with ${currentLive.dj_name}. Please wait for your slot to start at ${startsAtEat} EAT.`;
        await logAttempt(presenter.id, candidateSlot.id, false, handoverReason);

        return NextResponse.json({
          allow: false,
          reason: handoverReason,
          retry_after: retryEpoch,
        });
      }
    }

    // 6. Authorized
    const authSuccessReason = `Authorized for show "${candidateSlot.show_title}" (Slot #${candidateSlot.id})`;
    await logAttempt(presenter.id, candidateSlot.id, true, authSuccessReason);

    return NextResponse.json({
      allow: true,
      reason: "Authorized",
      slot_id: candidateSlot.id,
      show_id: candidateSlot.show_id,
      show_title: candidateSlot.show_title,
      presenter_id: presenter.id,
      dj_name: presenter.dj_name,
      starts_at: candidateSlot.starts_at,
      ends_at: candidateSlot.ends_at,
    });
  } catch (err: any) {
    console.error("[radio-auth] Internal error:", err);
    await logAttempt(null, null, false, `Internal server error: ${err.message}`);
    return NextResponse.json(
      { allow: false, reason: "Internal authentication error" },
      { status: 500 }
    );
  }
}

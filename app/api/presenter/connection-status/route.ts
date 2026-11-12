import { NextRequest, NextResponse } from "next/server";
import { requirePresenter } from "@/lib/presenter-auth";
import { neonQuery } from "@/lib/supabase-db";
import { formatPresenterUsername } from "@/lib/radio/stream-keys";

export const dynamic = "force-dynamic";

/**
 * GET /api/presenter/connection-status
 * Pre-flight connection test check for presenters in their Studio Portal.
 * Verifies stream key readiness and calculates their exact connection window.
 */
export async function GET(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { presenter } = authResult;

  try {
    const presRes = await neonQuery(
      `SELECT stream_key_hash, stream_key_prefix, status FROM presenters WHERE id = $1;`,
      [presenter.id]
    );

    const presData = presRes.rows[0];
    const hasKey = Boolean(presData?.stream_key_hash);
    const keyPrefix = presData?.stream_key_prefix || "None generated yet";

    const warmupMinutes = parseInt(process.env.WARMUP_WINDOW_MINUTES || "15", 10);
    const now = new Date();
    const warmupLimit = new Date(now.getTime() + warmupMinutes * 60 * 1000);

    // Query next upcoming or current slot
    const slotRes = await neonQuery(
      `SELECT s.id, s.starts_at, s.ends_at, s.status, sh.title AS show_title
       FROM show_slots s
       JOIN shows sh ON s.show_id = sh.id
       WHERE (s.presenter_id = $1 OR s.substitute_presenter_id = $1)
         AND s.status NOT IN ('cancelled', 'completed')
         AND s.ends_at > $2
       ORDER BY s.starts_at ASC
       LIMIT 1;`,
      [presenter.id, now.toISOString()]
    );

    const slot = slotRes.rows[0] || null;

    let allowedNow = false;
    let allowedStartingAt: string | null = null;
    let statusText = "No upcoming broadcast slots found.";

    if (slot) {
      const startsAt = new Date(slot.starts_at);
      const endsAt = new Date(slot.ends_at);
      const warmupOpen = new Date(startsAt.getTime() - warmupMinutes * 60 * 1000);

      allowedStartingAt = warmupOpen.toISOString();

      if (now >= warmupOpen && now <= endsAt) {
        allowedNow = true;
        statusText = `Connection authorized now for "${slot.show_title}" (Window: ${warmupOpen.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })} - ${endsAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })} EAT)`;
      } else if (now < warmupOpen) {
        allowedNow = false;
        statusText = `Next slot "${slot.show_title}" opens for connection at ${warmupOpen.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })} EAT (${warmupMinutes}m warmup prior to showtime).`;
      }
    }

    const host = process.env.STREAM_HOST || process.env.ICECAST_HOST || "live-dj.goodlife.co.ke";
    const port = parseInt(process.env.HARBOR_PORT || "8005", 10);
    const mount = process.env.HARBOR_MOUNT || "/live";

    return NextResponse.json({
      ok: true,
      has_stream_key: hasKey,
      key_prefix: keyPrefix,
      allowed_now: allowedNow && hasKey,
      status_message: statusText,
      allowed_starting_at: allowedStartingAt,
      stream_config: {
        host,
        port,
        mount,
        username: formatPresenterUsername(presenter.slug),
        format: "MP3 320kbps Stereo, 44.1kHz",
      },
      next_slot: slot,
    });
  } catch (err: any) {
    console.error("[connection-status] Failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to inspect connection status" },
      { status: 500 }
    );
  }
}

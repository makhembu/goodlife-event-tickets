import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { hashIdentifier } from "@/lib/radio/shoutout-filter";
import { normalizePhone } from "@/lib/phone";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/radio/polls/vote
 * Listeners vote on an active poll.
 * Enforces strictly 1 vote per device/IP and per phone hash.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, "poll-vote", { maxRequests: 20, windowMs: 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const body = await req.json();
    const { poll_id, option_id, phone } = body || {};

    if (!poll_id || !option_id) {
      return NextResponse.json({ error: "Missing poll_id or option_id." }, { status: 400 });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    const cleanPhone = phone ? normalizePhone(phone) : null;

    // Use composite fingerprint for device uniqueness
    const voterHash = hashIdentifier(cleanPhone ? cleanPhone : `${clientIp}:${userAgent}`);

    // Check poll is active and still open
    const pollCheck = await neonQuery(
      `SELECT status, ends_at FROM radio_polls WHERE id = $1 LIMIT 1;`,
      [poll_id]
    );

    if (!pollCheck?.rows || pollCheck.rows.length === 0) {
      return NextResponse.json({ error: "Poll not found." }, { status: 404 });
    }

    const poll = pollCheck.rows[0];
    if (poll.status !== "active" || new Date(poll.ends_at) <= new Date()) {
      return NextResponse.json({ error: "This poll has ended." }, { status: 400 });
    }

    // Attempt to insert vote (unique constraint on poll_id, voter_hash)
    try {
      await neonQuery(
        `INSERT INTO radio_poll_votes (poll_id, option_id, voter_hash)
         VALUES ($1, $2, $3);`,
        [poll_id, option_id, voterHash]
      );
    } catch (insertErr: any) {
      if (insertErr.code === "23505" || insertErr.message?.includes("unique")) {
        return NextResponse.json({ error: "You have already voted on this poll." }, { status: 409 });
      }
      throw insertErr;
    }

    // Increment option count
    await neonQuery(
      `UPDATE radio_poll_options SET vote_count = vote_count + 1 WHERE id = $1 AND poll_id = $2;`,
      [option_id, poll_id]
    );

    // Return updated totals for instant UI update
    const optRes = await neonQuery(
      `SELECT id, option_text, vote_count FROM radio_poll_options WHERE poll_id = $1 ORDER BY display_order ASC;`,
      [poll_id]
    );
    const options = optRes?.rows || [];
    const totalVotes = options.reduce((sum: number, o: any) => sum + (o.vote_count || 0), 0);

    return NextResponse.json({
      success: true,
      message: "Vote recorded!",
      total_votes: totalVotes,
      options: options.map((opt: any) => ({
        id: opt.id,
        text: opt.option_text,
        votes: opt.vote_count,
        percentage: totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0,
      })),
    });
  } catch (err: any) {
    console.error("[api/radio/polls/vote] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to record vote." }, { status: 500 });
  }
}

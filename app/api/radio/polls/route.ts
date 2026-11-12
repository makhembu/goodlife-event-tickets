import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { requirePresenter } from "@/lib/presenter-auth";
import { requireAdmin } from "@/lib/admin-auth";
import { hashIdentifier } from "@/lib/radio/shoutout-filter";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * Polls API
 * 
 * GET /api/radio/polls
 * Fetches active polls for the current on-air slot or latest public poll.
 * Includes options, vote totals, and whether current client voted.
 *
 * POST /api/radio/polls
 * Presenter creates a new poll for their live slot (2 to 4 options, auto-closing duration).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slotId = searchParams.get("slot_id");
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const voterHash = hashIdentifier(clientIp);

    let query = `
      SELECT 
        p.id,
        p.slot_id,
        p.question,
        p.poll_type,
        p.status,
        p.duration_minutes,
        p.starts_at,
        p.ends_at,
        p.created_at,
        s.title as show_title,
        pr.dj_name
      FROM radio_polls p
      LEFT JOIN show_slots ss ON p.slot_id = ss.id
      LEFT JOIN shows s ON ss.show_id = s.id
      LEFT JOIN presenters pr ON p.presenter_id = pr.id
      WHERE (p.status = 'active' AND p.ends_at > NOW())
    `;
    const values: any[] = [];

    if (slotId && /^\d+$/.test(slotId)) {
      values.push(parseInt(slotId, 10));
      query += ` AND p.slot_id = $${values.length}`;
    }

    query += ` ORDER BY p.created_at DESC LIMIT 5;`;

    const pollRes = await neonQuery(query, values);
    const polls = pollRes?.rows || [];

    // Fetch options and user vote state for each poll
    const result = await Promise.all(
      polls.map(async (poll: any) => {
        const optRes = await neonQuery(
          `SELECT id, option_text, vote_count, display_order 
           FROM radio_poll_options 
           WHERE poll_id = $1 
           ORDER BY display_order ASC, id ASC;`,
          [poll.id]
        );

        const voteCheck = await neonQuery(
          `SELECT option_id FROM radio_poll_votes WHERE poll_id = $1 AND voter_hash = $2 LIMIT 1;`,
          [poll.id, voterHash]
        );

        const options = optRes?.rows || [];
        const totalVotes = options.reduce((sum: number, o: any) => sum + (o.vote_count || 0), 0);
        const hasVoted = Boolean(voteCheck?.rows && voteCheck.rows.length > 0);
        const userVotedOptionId = voteCheck?.rows?.[0]?.option_id || null;

        return {
          ...poll,
          total_votes: totalVotes,
          has_voted: hasVoted,
          user_voted_option_id: userVotedOptionId,
          options: options.map((opt: any) => ({
            id: opt.id,
            text: opt.option_text,
            votes: opt.vote_count,
            percentage: totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0,
          })),
        };
      })
    );

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "s-maxage=5, stale-while-revalidate=10",
      },
    });
  } catch (err: any) {
    console.warn("[api/radio/polls:GET] Error:", err.message);
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
    const { question, options, duration_minutes = 15, poll_type = "general", slot_id } = body || {};

    if (!question || typeof question !== "string" || question.trim().length < 5) {
      return NextResponse.json({ error: "Question must be at least 5 characters long." }, { status: 400 });
    }

    if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
      return NextResponse.json({ error: "Polls require between 2 and 4 options." }, { status: 400 });
    }

    const validOptions = options
      .map((opt: any) => String(opt || "").trim())
      .filter((opt: string) => opt.length > 0);

    if (validOptions.length < 2) {
      return NextResponse.json({ error: "Please provide at least 2 non-empty options." }, { status: 400 });
    }

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

    const duration = Math.min(Math.max(parseInt(duration_minutes, 10) || 15, 5), 120);

    // Create Poll
    const pollRes = await neonQuery(
      `INSERT INTO radio_polls 
        (slot_id, presenter_id, question, poll_type, status, duration_minutes, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, 'active', $5, NOW(), NOW() + ($5 || ' minutes')::INTERVAL)
       RETURNING id, question, poll_type, ends_at;`,
      [targetSlotId, presenterId, question.trim().slice(0, 255), poll_type, duration]
    );

    const createdPoll = pollRes?.rows?.[0];
    if (!createdPoll) {
      throw new Error("Failed to insert poll.");
    }

    // Insert Options
    for (let i = 0; i < validOptions.length; i++) {
      await neonQuery(
        `INSERT INTO radio_poll_options (poll_id, option_text, vote_count, display_order)
         VALUES ($1, $2, 0, $3);`,
        [createdPoll.id, validOptions[i].slice(0, 200), i + 1]
      );
    }

    return NextResponse.json({
      success: true,
      message: "Poll created successfully!",
      poll: createdPoll,
    });
  } catch (err: any) {
    console.error("[api/radio/polls:POST] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to create poll" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

// Daily cron job to enforce Kenya Data Protection Act compliance
// Permanently clears phone numbers associated with shoutouts older than 30 days.

export async function POST(req: NextRequest) {
  // Validate authorization via CRON_SECRET or Admin session
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await neonQuery(`
      UPDATE radio_shoutouts
      SET phone = NULL
      WHERE created_at < NOW() - INTERVAL '30 days'
        AND phone IS NOT NULL
      RETURNING id;
    `);

    const purgedCount = result.rows.length;

    return NextResponse.json({
      success: true,
      message: `Kenya DPA 30-day retention cleanup executed. Purged ${purgedCount} phone records.`,
      purged_count: purgedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[cron/purge-expired-phones] Cleanup error:", err);
    return NextResponse.json(
      { error: "Retention cleanup failed", details: err?.message },
      { status: 500 }
    );
  }
}

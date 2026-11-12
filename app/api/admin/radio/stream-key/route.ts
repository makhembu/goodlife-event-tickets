import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { generateStreamKey, formatStreamKeyPrefix } from "@/lib/radio/stream-keys";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/radio/stream-key
 * Returns current admin stream key prefix, username, and connection status.
 */
export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const res = await neonQuery(
      `SELECT admin_stream_key_hash, admin_stream_key_prefix, broadcast_mode, live_title
       FROM radio_settings
       WHERE id = 1
       LIMIT 1;`
    );

    const row = res.rows[0] || {};
    const hasKey = Boolean(row.admin_stream_key_hash);
    const keyPrefix = row.admin_stream_key_prefix || (hasKey ? "gl_live_••••" : "None generated yet");

    return NextResponse.json({
      has_key: hasKey,
      key_prefix: keyPrefix,
      username: "admin",
      mount: "/live",
      port: 8005,
      host: process.env.RADIO_STREAM_HOST || "live-dj.darajadigital.com",
      broadcast_mode: row.broadcast_mode || "autodj",
      live_title: row.live_title || "GOODLIFE RADIO LIVE",
    });
  } catch (err: any) {
    console.error("[admin stream-key GET] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/radio/stream-key
 * Regenerates the admin master live stream key with instant takeover capability.
 * Returns the full plaintext stream key (to display and cache in session).
 */
export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const { fullKey, hash, prefix } = generateStreamKey();

    await neonQuery(
      `UPDATE radio_settings
       SET admin_stream_key_hash = $1,
           admin_stream_key_prefix = $2,
           updated_at = NOW()
       WHERE id = 1;`,
      [hash, prefix]
    );

    return NextResponse.json({
      success: true,
      fullKey,
      prefix,
      username: "admin",
      message: "Admin Master Stream Key generated successfully.",
    });
  } catch (err: any) {
    console.error("[admin stream-key POST] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { Pool } from "pg";
import { generateDropEngineV2 } from "@/lib/radio/drop-engine";

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const db = getPool();
    const result = await db.query(`
      SELECT id, persona, mood, title, script, audio_url, 
             target_track_id, target_track_title, target_artist, 
             timing_type, play_count, created_at
      FROM radio_drops
      ORDER BY created_at DESC
      LIMIT 50
    `);

    return NextResponse.json({ drops: result.rows }, { status: 200 });
  } catch (err: any) {
    console.error("[api/admin/radio/drops] GET error:", err.message);
    return NextResponse.json({ error: err.message, drops: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const { action, drop_type, persona_id, intro_seconds } = body;

    // Action: "preview_next" or "regenerate"
    const drop = await generateDropEngineV2({
      dropType: drop_type,
      preferredPersonaId: persona_id,
      introSeconds: intro_seconds || 10,
      skipAudioSynthesis: false,
    });

    // Save drop into radio_drops table
    try {
      const db = getPool();
      await db.query(`
        INSERT INTO radio_drops (persona, mood, title, script, audio_url, timing_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        drop.persona_name,
        drop.tag,
        `Drop (${drop.drop_type})`,
        drop.script,
        drop.audio_url || "",
        drop.drop_type,
      ]);
    } catch (saveErr: any) {
      console.warn("[api/admin/radio/drops] Failed to persist drop to radio_drops:", saveErr.message);
    }

    return NextResponse.json({
      success: true,
      drop,
      action: action || "preview_next",
    });
  } catch (err: any) {
    console.error("[api/admin/radio/drops] POST error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const db = getPool();
    await db.query("DELETE FROM radio_drops WHERE id = $1", [id]);

    return NextResponse.json({ success: true, deleted_id: id });
  } catch (err: any) {
    console.error("[api/admin/radio/drops] DELETE error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

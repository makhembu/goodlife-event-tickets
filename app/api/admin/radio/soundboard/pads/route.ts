// app/api/admin/radio/soundboard/pads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { isValidSoundboardAudioUrl, validateSoundboardAudioLimits } from "@/lib/radio/soundboard-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const { bank_id, label, emoji, color, audio_url, drop_id } = body;

    if (!bank_id || typeof bank_id !== "number") {
      return NextResponse.json({ error: "Missing or invalid bank_id" }, { status: 400 });
    }

    const padLabel = (label || "New Pad").trim().slice(0, 100);
    const padEmoji = (emoji || "🔥").trim().slice(0, 16);
    const padColor = (color || "#DFBB7D").trim().slice(0, 32);

    if (audio_url) {
      const validation = await validateSoundboardAudioLimits(audio_url);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || "Audio URL must point to our R2 storage domain or local /drops/ directory." },
          { status: 400 }
        );
      }
    }

    // Determine next position
    const posRes = await neonQuery(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos 
       FROM soundboard_pads 
       WHERE bank_id = $1`,
      [bank_id]
    );
    const position = posRes.rows[0]?.next_pos ?? 0;

    const insertRes = await neonQuery(
      `INSERT INTO soundboard_pads (bank_id, position, label, emoji, color, audio_url, drop_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, bank_id, position, label, emoji, color, audio_url, drop_id, created_at, updated_at`,
      [bank_id, position, padLabel, padEmoji, padColor, audio_url || null, drop_id || null]
    );

    return NextResponse.json({ pad: insertRes.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("[api/admin/radio/soundboard/pads] POST error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

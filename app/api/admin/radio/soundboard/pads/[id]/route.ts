// app/api/admin/radio/soundboard/pads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { isValidSoundboardAudioUrl } from "@/lib/radio/soundboard-helpers";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const padId = parseInt(id, 10);
  if (isNaN(padId)) {
    return NextResponse.json({ error: "Invalid pad ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { label, emoji, color, audio_url, drop_id, position } = body;

    // Check pad existence
    const existing = await neonQuery(
      `SELECT id, bank_id, label, emoji, color, audio_url, drop_id, position 
       FROM soundboard_pads 
       WHERE id = $1`,
      [padId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Pad not found" }, { status: 404 });
    }

    const current = existing.rows[0];

    // Validate audio_url if provided
    let newAudioUrl = current.audio_url;
    if (audio_url !== undefined) {
      if (audio_url === null || audio_url === "") {
        newAudioUrl = null;
      } else {
        if (!isValidSoundboardAudioUrl(audio_url)) {
          return NextResponse.json(
            { error: "Audio URL must point to our R2 storage domain or local /drops/ directory." },
            { status: 400 }
          );
        }
        newAudioUrl = audio_url.trim();
      }
    }

    const newLabel = label !== undefined ? String(label).trim().slice(0, 100) : current.label;
    const newEmoji = emoji !== undefined ? String(emoji).trim().slice(0, 16) : current.emoji;
    const newColor = color !== undefined ? String(color).trim().slice(0, 32) : current.color;
    const newDropId = drop_id !== undefined ? (drop_id === null ? null : Number(drop_id)) : current.drop_id;
    const newPosition = position !== undefined ? Number(position) : current.position;

    const updateRes = await neonQuery(
      `UPDATE soundboard_pads
       SET label = $1,
           emoji = $2,
           color = $3,
           audio_url = $4,
           drop_id = $5,
           position = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, bank_id, position, label, emoji, color, audio_url, drop_id, created_at, updated_at`,
      [newLabel, newEmoji, newColor, newAudioUrl, newDropId, newPosition, padId]
    );

    return NextResponse.json({ pad: updateRes.rows[0] }, { status: 200 });
  } catch (err: any) {
    console.error("[api/admin/radio/soundboard/pads/[id]] PATCH error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const padId = parseInt(id, 10);
  if (isNaN(padId)) {
    return NextResponse.json({ error: "Invalid pad ID" }, { status: 400 });
  }

  try {
    // 1. Get bank_id before deleting
    const padRes = await neonQuery(
      `SELECT id, bank_id FROM soundboard_pads WHERE id = $1`,
      [padId]
    );

    if (padRes.rows.length === 0) {
      return NextResponse.json({ error: "Pad not found" }, { status: 404 });
    }

    const bankId = padRes.rows[0].bank_id;

    // 2. Delete pad (Does NOT touch radio_drops table!)
    await neonQuery(`DELETE FROM soundboard_pads WHERE id = $1`, [padId]);

    // 3. Compact remaining positions
    await neonQuery(
      `WITH ranked AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC, id ASC) - 1 AS new_pos
         FROM soundboard_pads
         WHERE bank_id = $1
       )
       UPDATE soundboard_pads p
       SET position = r.new_pos, updated_at = NOW()
       FROM ranked r
       WHERE p.id = r.id`,
      [bankId]
    );

    return NextResponse.json({ success: true, deleted_id: padId, bank_id: bankId }, { status: 200 });
  } catch (err: any) {
    console.error("[api/admin/radio/soundboard/pads/[id]] DELETE error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

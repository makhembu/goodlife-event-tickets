import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { generateStreamKey } from "@/lib/radio/stream-keys";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/radio/presenters/[id]/stream-key
 * Allows admin to regenerate or revoke a presenter's stream key.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const presenterId = parseInt(id, 10);
  if (isNaN(presenterId)) {
    return NextResponse.json({ error: "Invalid presenter ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "regenerate").toLowerCase();

    if (action === "revoke") {
      await neonQuery(
        `UPDATE presenters
         SET stream_key_hash = NULL,
             stream_key_prefix = NULL,
             updated_at = NOW()
         WHERE id = $1;`,
        [presenterId]
      );

      return NextResponse.json({
        success: true,
        action: "revoke",
        message: "Presenter stream key revoked. Presenter cannot connect until a new key is issued.",
      });
    }

    // Default: regenerate
    const { fullKey, hash, prefix } = generateStreamKey();

    const updateRes = await neonQuery(
      `UPDATE presenters
       SET stream_key_hash = $1,
           stream_key_prefix = $2,
           stream_key_created_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, dj_name, slug;`,
      [hash, prefix, presenterId]
    );

    if (updateRes.rows.length === 0) {
      return NextResponse.json({ error: "Presenter not found" }, { status: 404 });
    }

    const presenter = updateRes.rows[0];

    return NextResponse.json({
      success: true,
      action: "regenerate",
      presenterId,
      dj_name: presenter.dj_name,
      slug: presenter.slug,
      fullKey,
      prefix,
      message: "Stream key generated. Display to presenter once; it is not stored in plaintext.",
    });
  } catch (err: any) {
    console.error("[admin presenter stream-key] Failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update stream key" },
      { status: 500 }
    );
  }
}

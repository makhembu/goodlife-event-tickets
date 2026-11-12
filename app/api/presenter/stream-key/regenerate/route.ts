import { NextRequest, NextResponse } from "next/server";
import { requirePresenter } from "@/lib/presenter-auth";
import { neonQuery } from "@/lib/supabase-db";
import { generateStreamKey } from "@/lib/radio/stream-keys";

export const dynamic = "force-dynamic";

/**
 * POST /api/presenter/stream-key/regenerate
 * Allows an authenticated presenter to regenerate their individual Icecast harbor stream key.
 * The full key is returned ONCE to the client and never stored in plaintext.
 */
export async function POST(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { presenter } = authResult;

  try {
    const { fullKey, hash, prefix } = generateStreamKey();

    await neonQuery(
      `UPDATE presenters
       SET stream_key_hash = $1,
           stream_key_prefix = $2,
           stream_key_created_at = NOW(),
           updated_at = NOW()
       WHERE id = $3;`,
      [hash, prefix, presenter.id]
    );

    return NextResponse.json({
      success: true,
      fullKey,
      prefix,
      message: "Stream key regenerated successfully. Copy it now; it cannot be viewed again.",
    });
  } catch (err: any) {
    console.error("[stream-key regenerate] Failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to regenerate stream key" },
      { status: 500 }
    );
  }
}

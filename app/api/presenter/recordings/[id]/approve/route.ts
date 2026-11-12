import { NextRequest, NextResponse } from "next/server";
import { requirePresenter } from "@/lib/presenter-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

/**
 * POST /api/presenter/recordings/[id]/approve
 * Presenter authorizes their private recording to be published into the public vault.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { presenter } = authResult;
  const { id } = await params;
  const recordingId = parseInt(id, 10);

  if (isNaN(recordingId)) {
    return NextResponse.json({ error: "Invalid recording ID" }, { status: 400 });
  }

  try {
    // Verify ownership
    const checkRes = await neonQuery(
      `SELECT id, is_public FROM radio_recordings WHERE id = $1 AND presenter_id = $2;`,
      [recordingId, presenter.id]
    );

    if (checkRes.rows.length === 0) {
      return NextResponse.json(
        { error: "Recording not found or access denied" },
        { status: 404 }
      );
    }

    const currentPublic = Boolean(checkRes.rows[0].is_public);
    const newPublic = !currentPublic;

    await neonQuery(
      `UPDATE radio_recordings
       SET is_public = $1,
           approved_at = NOW()
       WHERE id = $2 AND presenter_id = $3;`,
      [newPublic, recordingId, presenter.id]
    );

    return NextResponse.json({
      success: true,
      recording_id: recordingId,
      is_public: newPublic,
      message: newPublic
        ? "Recording approved and published to public vault."
        : "Recording moved to private archive.",
    });
  } catch (err: any) {
    console.error("[presenter recording approve] Failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update recording status" },
      { status: 500 }
    );
  }
}

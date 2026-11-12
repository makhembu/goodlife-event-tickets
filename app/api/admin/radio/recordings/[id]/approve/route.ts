import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/radio/recordings/[id]/approve
 * Admin approves or revokes public status for a recorded show session.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const recordingId = parseInt(id, 10);
  if (isNaN(recordingId)) {
    return NextResponse.json({ error: "Invalid recording ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const explicitPublish = typeof body.is_public === "boolean" ? body.is_public : undefined;

    const checkRes = await neonQuery(
      `SELECT id, is_public FROM radio_recordings WHERE id = $1;`,
      [recordingId]
    );

    if (checkRes.rows.length === 0) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const currentPublic = Boolean(checkRes.rows[0].is_public);
    const newPublic = explicitPublish !== undefined ? explicitPublish : !currentPublic;

    await neonQuery(
      `UPDATE radio_recordings
       SET is_public = $1,
           approved_at = NOW()
       WHERE id = $2;`,
      [newPublic, recordingId]
    );

    return NextResponse.json({
      success: true,
      recording_id: recordingId,
      is_public: newPublic,
      message: newPublic
        ? "Recording published to public vault."
        : "Recording marked private.",
    });
  } catch (err: any) {
    console.error("[admin recording approve] Failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update recording status" },
      { status: 500 }
    );
  }
}

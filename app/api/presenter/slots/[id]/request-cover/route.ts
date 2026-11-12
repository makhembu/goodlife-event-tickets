import { NextRequest, NextResponse } from "next/server";
import { requirePresenter } from "@/lib/presenter-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

/**
 * POST /api/presenter/slots/[id]/request-cover
 * Allows an assigned presenter to request a substitute/cover DJ for their upcoming broadcast slot.
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
  const slotId = parseInt(id, 10);

  if (isNaN(slotId)) {
    return NextResponse.json({ error: "Invalid slot ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason || "").trim();

    if (!reason) {
      return NextResponse.json(
        { error: "A brief reason for the cover request is required" },
        { status: 400 }
      );
    }

    // Verify slot belongs to presenter and is in the future
    const checkRes = await neonQuery(
      `SELECT id, starts_at, status FROM show_slots
       WHERE id = $1 AND presenter_id = $2;`,
      [slotId, presenter.id]
    );

    if (checkRes.rows.length === 0) {
      return NextResponse.json(
        { error: "Slot not found or you are not the primary assigned presenter" },
        { status: 404 }
      );
    }

    const slot = checkRes.rows[0];
    if (new Date(slot.starts_at) < new Date()) {
      return NextResponse.json(
        { error: "Cannot request a cover for a past broadcast slot" },
        { status: 400 }
      );
    }

    await neonQuery(
      `UPDATE show_slots
       SET cover_requested = true,
           cover_request_reason = $1,
           cover_requested_at = NOW(),
           updated_at = NOW()
       WHERE id = $2;`,
      [reason, slotId]
    );

    return NextResponse.json({
      success: true,
      slot_id: slotId,
      message: "Cover request submitted. Station administrators can reassign this slot in the schedule manager.",
    });
  } catch (err: any) {
    console.error("[request-cover] Failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to submit cover request" },
      { status: 500 }
    );
  }
}

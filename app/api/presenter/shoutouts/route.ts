import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { requirePresenter } from "@/lib/presenter-auth";
import { requireAdmin } from "@/lib/admin-auth";
import { maskPhone } from "@/lib/radio/shoutout-filter";

export const dynamic = "force-dynamic";

/**
 * Presenter / Admin Moderation Endpoint for Shoutouts
 * 
 * GET /api/presenter/shoutouts?slot_id=<id>
 * Fetches moderation queue. Presenters see items for their assigned slot.
 * Admins see all items.
 *
 * PATCH /api/presenter/shoutouts
 * Moderates an item: status = 'approved' | 'read' | 'rejected', is_featured = boolean.
 */
export async function GET(req: NextRequest) {
  try {
    const presenterAuth = await requirePresenter(req);
    let isAdmin = false;
    let presenterId: number | null = null;
    let presenterSlug: string | null = null;

    if ("presenter" in presenterAuth) {
      presenterId = presenterAuth.presenter.id;
      presenterSlug = presenterAuth.presenter.slug;
    } else {
      try {
        await requireAdmin(req);
        isAdmin = true;
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { searchParams } = new URL(req.url);
    const slotIdParam = searchParams.get("slot_id");

    let query = `
      SELECT 
        s.id,
        s.slot_id,
        s.sender_name,
        s.sender_phone,
        s.message,
        s.request_track,
        s.source,
        s.status,
        s.is_featured,
        s.created_at,
        ss.show_id,
        sh.title as show_title
      FROM radio_shoutouts s
      LEFT JOIN show_slots ss ON s.slot_id = ss.id
      LEFT JOIN shows sh ON ss.show_id = sh.id
      WHERE 1=1
    `;
    const values: any[] = [];

    // Presenter scope: only items attached to their own slots
    if (!isAdmin && presenterId) {
      values.push(presenterId);
      query += ` AND (ss.primary_presenter_id = $${values.length} OR ss.substitute_presenter_id = $${values.length})`;
    }

    if (slotIdParam && /^\d+$/.test(slotIdParam)) {
      values.push(parseInt(slotIdParam, 10));
      query += ` AND s.slot_id = $${values.length}`;
    }

    query += ` ORDER BY s.created_at DESC LIMIT 100;`;

    const res = await neonQuery(query, values);
    const items = (res?.rows || []).map((row: any) => ({
      id: row.id,
      slot_id: row.slot_id,
      sender_name: row.sender_name,
      sender_phone_masked: maskPhone(row.sender_phone),
      message: row.message,
      request_track: row.request_track,
      source: row.source,
      status: row.status,
      is_featured: row.is_featured,
      created_at: row.created_at,
      show_title: row.show_title || null,
    }));

    return NextResponse.json({
      success: true,
      items,
      count: items.length,
    });
  } catch (err: any) {
    console.error("[api/presenter/shoutouts:GET] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const presenterAuth = await requirePresenter(req);
    let isAdmin = false;
    let actorName = "";
    let presenterId: number | null = null;

    if ("presenter" in presenterAuth) {
      actorName = `presenter:${presenterAuth.presenter.slug}`;
      presenterId = presenterAuth.presenter.id;
    } else {
      try {
        await requireAdmin(req);
        isAdmin = true;
        actorName = "admin";
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json();
    const { id, status, is_featured } = body || {};

    if (!id) {
      return NextResponse.json({ error: "Missing shoutout id" }, { status: 400 });
    }

    // Check ownership if presenter
    if (!isAdmin && presenterId) {
      const checkRes = await neonQuery(
        `SELECT s.id 
         FROM radio_shoutouts s
         LEFT JOIN show_slots ss ON s.slot_id = ss.id
         WHERE s.id = $1 AND (
           ss.primary_presenter_id = $2 OR ss.substitute_presenter_id = $2 OR s.slot_id IS NULL
         ) LIMIT 1;`,
        [id, presenterId]
      );
      if (!checkRes?.rows || checkRes.rows.length === 0) {
        return NextResponse.json({ error: "You cannot moderate shoutouts outside your shows." }, { status: 403 });
      }
    }

    // Build update
    const updates: string[] = [];
    const values: any[] = [id];

    if (status && ["pending", "approved", "read", "rejected"].includes(status)) {
      values.push(status);
      updates.push(`status = $${values.length}`);
    }

    if (typeof is_featured === "boolean") {
      values.push(is_featured);
      updates.push(`is_featured = $${values.length}`);
    }

    values.push(actorName);
    updates.push(`moderated_by = $${values.length}`);
    updates.push(`moderated_at = NOW()`);

    if (updates.length === 2) {
      return NextResponse.json({ error: "No changes specified" }, { status: 400 });
    }

    const query = `UPDATE radio_shoutouts SET ${updates.join(", ")} WHERE id = $1 RETURNING id, status, is_featured;`;
    const res = await neonQuery(query, values);

    return NextResponse.json({
      success: true,
      shoutout: res?.rows?.[0] || null,
    });
  } catch (err: any) {
    console.error("[api/presenter/shoutouts:PATCH] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to moderate" }, { status: 500 });
  }
}

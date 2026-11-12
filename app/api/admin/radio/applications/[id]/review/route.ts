import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { hashPresenterPassword } from "@/lib/presenter-session";
import { generateStreamKey } from "@/lib/radio/stream-keys";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/radio/applications/[id]/review
 * Allows admin to approve or reject a presenter application.
 * On approval:
 * - Creates active presenter account with must_change_password=true
 * - Generates temporary login password (shown ONCE to admin)
 * - Generates initial stream key (shown ONCE to admin)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const appId = parseInt(id, 10);
  if (isNaN(appId)) {
    return NextResponse.json({ error: "Invalid application ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toLowerCase();
    const adminNotes = String(body.admin_notes || "").trim();

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "Action must be either 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    const appRes = await neonQuery(
      `SELECT * FROM presenter_applications WHERE id = $1;`,
      [appId]
    );

    if (appRes.rows.length === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const application = appRes.rows[0];

    if (action === "reject") {
      await neonQuery(
        `UPDATE presenter_applications
         SET status = 'rejected',
             admin_notes = $1,
             updated_at = NOW()
         WHERE id = $2;`,
        [adminNotes || "Application declined by programming team.", appId]
      );

      return NextResponse.json({
        success: true,
        action: "reject",
        message: "Application rejected.",
      });
    }

    // Action: Approve
    // 1. Generate slug
    const baseSlug = (application.dj_name || application.full_name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    let slug = baseSlug;

    // Check slug collision
    const slugCheck = await neonQuery(
      `SELECT id FROM presenters WHERE slug = $1;`,
      [slug]
    );
    if (slugCheck.rows.length > 0) {
      slug = `${baseSlug}-${Math.floor(Math.random() * 899 + 100)}`;
    }

    // 2. Generate temporary password
    const tempPassword = `gl_p_${crypto.randomBytes(4).toString("hex")}`;
    const passwordHash = await hashPresenterPassword(tempPassword);

    // 3. Generate initial stream key
    const { fullKey, hash, prefix } = generateStreamKey();

    // 4. Create presenter record
    const insertRes = await neonQuery(
      `INSERT INTO presenters (
         full_name, dj_name, slug, email, phone, password_hash,
         must_change_password, bio, social_links, stream_key_hash, stream_key_prefix,
         status, stream_key_created_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, 'active', NOW(), NOW(), NOW())
       RETURNING id, full_name, dj_name, slug, email;`,
      [
        application.full_name,
        application.dj_name,
        slug,
        application.email,
        application.phone,
        passwordHash,
        application.bio,
        application.social_links,
        hash,
        prefix,
      ]
    );

    const createdPresenter = insertRes.rows[0];

    // 5. Update application status
    await neonQuery(
      `UPDATE presenter_applications
       SET status = 'approved',
           admin_notes = $1,
           updated_at = NOW()
       WHERE id = $2;`,
      [adminNotes || "Approved and onboarded into presenter roster.", appId]
    );

    return NextResponse.json({
      success: true,
      action: "approve",
      presenter: {
        id: createdPresenter.id,
        full_name: createdPresenter.full_name,
        dj_name: createdPresenter.dj_name,
        slug: createdPresenter.slug,
        email: createdPresenter.email,
        tempPassword,
        streamKey: fullKey,
        streamKeyPrefix: prefix,
      },
      message: "Presenter application approved! Account created. Share credentials with the presenter.",
    });
  } catch (err: any) {
    console.error("[admin app review] Review error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process application review" },
      { status: 500 }
    );
  }
}

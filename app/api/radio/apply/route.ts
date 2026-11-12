import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * POST /api/radio/apply
 * Public presenter application submission endpoint with database-backed rate limiting.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const fullName = String(body.full_name || "").trim();
    const djName = String(body.dj_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const rawPhone = String(body.phone || "").trim();
    const bio = String(body.bio || "").trim();
    const showConcept = String(body.show_concept || "").trim();
    const genre = String(body.genre || "Afrohouse / Electronic").trim();
    const sampleMixUrl = String(body.sample_mix_url || "").trim();
    const socialLinks = typeof body.social_links === "object" && body.social_links ? body.social_links : {};

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    if (!fullName || !djName || !email || !rawPhone || !bio || !showConcept || !sampleMixUrl) {
      return NextResponse.json(
        { error: "Please complete all required fields (name, DJ moniker, email, phone, bio, concept, and mix URL)." },
        { status: 400 }
      );
    }

    if (!email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    let phone = rawPhone;
    try {
      phone = normalizePhone(rawPhone);
    } catch {
      // Retain raw if outside standard Kenya normalization
    }

    // Rate Limiting: Max 3 submissions per IP or Email in last 24 hours
    const rateLimitRes = await neonQuery(
      `SELECT COUNT(*)::int AS count
       FROM presenter_applications
       WHERE (client_ip = $1 OR email = $2)
         AND created_at > NOW() - INTERVAL '24 hours';`,
      [clientIp, email]
    );

    const submissionCount = rateLimitRes.rows[0]?.count || 0;
    if (submissionCount >= 3) {
      return NextResponse.json(
        { error: "Rate limit reached. You can only submit up to 3 applications per 24 hours. Please wait before reapplying." },
        { status: 429 }
      );
    }

    // Insert Application
    const insertRes = await neonQuery(
      `INSERT INTO presenter_applications (
         full_name, dj_name, email, phone, bio, show_concept, genre,
         sample_mix_url, social_links, client_ip, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NOW(), NOW())
       RETURNING id;`,
      [
        fullName,
        djName,
        email,
        phone,
        bio,
        showConcept,
        genre,
        sampleMixUrl,
        JSON.stringify(socialLinks),
        clientIp,
      ]
    );

    const appId = insertRes.rows[0]?.id;

    return NextResponse.json({
      success: true,
      application_id: appId,
      message: "Application submitted successfully! Our station programming team will review your sample mix.",
    });
  } catch (err: any) {
    console.error("[presenter apply] Submission error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to submit presenter application" },
      { status: 500 }
    );
  }
}

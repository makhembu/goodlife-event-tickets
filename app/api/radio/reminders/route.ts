import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { neonQuery } from "@/lib/supabase-db";
import { hashIdentifier } from "@/lib/radio/shoutout-filter";
import { normalizePhone } from "@/lib/phone";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Show Reminders Opt-In API
 * 
 * POST /api/radio/reminders
 * Listeners opt-in to WhatsApp reminders for a favorite recurring show.
 * Generates an unsubscribe_token and records opt-in.
 * 
 * DELETE /api/radio/reminders?token=<token>
 * One-click unsubscribe link from message footer.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, "radio-reminder", { maxRequests: 5, windowMs: 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const body = await req.json();
    const { phone, show_id } = body || {};

    if (!phone || !show_id) {
      return NextResponse.json({ error: "Missing required fields: phone, show_id." }, { status: 400 });
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return NextResponse.json({ error: "Invalid Kenyan phone number." }, { status: 400 });
    }

    // Verify show exists
    const showRes = await neonQuery(
      `SELECT id, title FROM shows WHERE id = $1 LIMIT 1;`,
      [parseInt(show_id, 10)]
    );

    if (!showRes?.rows || showRes.rows.length === 0) {
      return NextResponse.json({ error: "Show not found." }, { status: 404 });
    }

    const show = showRes.rows[0];
    const phoneHash = hashIdentifier(cleanPhone);
    const token = randomBytes(24).toString("hex");

    await neonQuery(
      `INSERT INTO radio_reminders (phone, phone_hash, show_id, unsubscribe_token, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (phone_hash, show_id) 
       DO UPDATE SET is_active = TRUE, phone = EXCLUDED.phone;`,
      [cleanPhone, phoneHash, show.id, token]
    );

    return NextResponse.json({
      success: true,
      message: `Reminder set! You will get a ping 15 minutes before "${show.title}" goes live.`,
    });
  } catch (err: any) {
    console.error("[api/radio/reminders:POST] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to set reminder" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing unsubscribe token." }, { status: 400 });
    }

    await neonQuery(
      `UPDATE radio_reminders SET is_active = FALSE WHERE unsubscribe_token = $1;`,
      [token]
    );

    return NextResponse.json({
      success: true,
      message: "You have been unsubscribed from this show reminder.",
    });
  } catch (err: any) {
    console.error("[api/radio/reminders:DELETE] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to unsubscribe" }, { status: 500 });
  }
}

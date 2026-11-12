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

      const { recordRadioAuditLog } = await import("@/lib/radio/ops-service");
      await recordRadioAuditLog({
        adminActor: "admin",
        action: "revoke_stream_key",
        targetType: "presenter",
        targetId: presenterId,
      });

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
       RETURNING id, dj_name, slug, email, phone;`,
      [hash, prefix, presenterId]
    );

    if (updateRes.rows.length === 0) {
      return NextResponse.json({ error: "Presenter not found" }, { status: 404 });
    }

    const presenter = updateRes.rows[0];

    const streamHost = process.env.RADIO_STREAM_HOST || "goodlife.smwhr.space";
    const whatsappMessage = `🎙️ *GOODLIFE Radio 254 - New Live Stream Key*\n\n` +
      `Hey *${presenter.dj_name}*, your new encoder credentials for GOODLIFE Radio are ready:\n\n` +
      `🔑 *Stream Key / Password:* \`${fullKey}\`\n\n` +
      `*Encoder Settings (VirtualDJ / Mixxx / BUTT / OBS):*\n` +
      `• Host / Server: ${streamHost}\n` +
      `• Port: 8005\n` +
      `• Mount: /live\n` +
      `• Username: dj_${presenter.slug}\n` +
      `• Password: \`${fullKey}\`\n\n` +
      `_Connect 15 minutes before your scheduled slot for soundcheck._`;

    let cleanPhone = (presenter.phone || "").replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("0") && cleanPhone.length === 10) {
      cleanPhone = `254${cleanPhone.slice(1)}`;
    }
    const whatsappUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

    let wahaSent = false;
    if (body.send_whatsapp && cleanPhone) {
      try {
        const { sendWahaText } = await import("@/lib/waha");
        const wahaRes = await sendWahaText(`${cleanPhone}@c.us`, whatsappMessage);
        wahaSent = wahaRes.success;
      } catch (wErr) {
        console.warn("[admin stream-key] WAHA direct send skipped:", wErr);
      }
    }

    const { recordRadioAuditLog } = await import("@/lib/radio/ops-service");
    await recordRadioAuditLog({
      adminActor: "admin",
      action: "regenerate_stream_key",
      targetType: "presenter",
      targetId: presenterId,
      details: { prefix },
    });

    return NextResponse.json({
      success: true,
      action: "regenerate",
      presenterId,
      dj_name: presenter.dj_name,
      slug: presenter.slug,
      fullKey,
      prefix,
      whatsapp_message: whatsappMessage,
      whatsapp_url: whatsappUrl,
      waha_sent: wahaSent,
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

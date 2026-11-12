import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { hashPresenterPassword } from "@/lib/presenter-session";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;
  const presenterId = parseInt(id, 10);
  if (isNaN(presenterId)) {
    return NextResponse.json({ error: "Invalid presenter ID" }, { status: 400 });
  }

  try {
    const { rows } = await neonQuery(
      `SELECT id, full_name, dj_name, slug, email, phone FROM presenters WHERE id = $1;`,
      [presenterId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Presenter not found" }, { status: 404 });
    }

    const presenter = rows[0];

    // Generate new temporary password
    const temporaryPassword = `GL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const passwordHash = await hashPresenterPassword(temporaryPassword);

    await neonQuery(
      `UPDATE presenters
       SET password_hash = $1,
           must_change_password = true,
           failed_login_count = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $2;`,
      [passwordHash, presenterId]
    );

    // Format WhatsApp message
    const loginUrl = `${process.env.APP_URL || "https://goodlife.smwhr.space"}/presenter/login`;
    const whatsappMessage = `🎧 *GOODLIFE Radio 254 - Studio Login Details*\n\n` +
      `Hey *${presenter.dj_name}*, here are your login details for the GOODLIFE Radio Studio:\n\n` +
      `🔗 *Studio Portal:* ${loginUrl}\n` +
      `👤 *Login Email / Username:* ${presenter.email}\n` +
      `🔑 *Temporary Password:* \`${temporaryPassword}\`\n\n` +
      `_Please log in and update your password on your first session._`;

    // Clean phone number for wa.me link
    let cleanPhone = (presenter.phone || "").replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("0") && cleanPhone.length === 10) {
      cleanPhone = `254${cleanPhone.slice(1)}`;
    }
    const whatsappUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

    let wahaSent = false;
    if (cleanPhone) {
      try {
        const { sendWahaText } = await import("@/lib/waha");
        const wahaRes = await sendWahaText(`${cleanPhone}@c.us`, whatsappMessage);
        wahaSent = wahaRes.success;
      } catch (wErr) {
        console.warn("[admin reset-password] WAHA direct send skipped:", wErr);
      }
    }

    return NextResponse.json({
      success: true,
      dj_name: presenter.dj_name,
      email: presenter.email,
      phone: presenter.phone,
      temporary_password: temporaryPassword,
      whatsapp_message: whatsappMessage,
      whatsapp_url: whatsappUrl,
      waha_sent: wahaSent,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

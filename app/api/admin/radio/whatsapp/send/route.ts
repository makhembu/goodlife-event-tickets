import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sendWahaText } from "@/lib/waha";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/radio/whatsapp/send
 * Admin direct WAHA dispatcher for radio credentials, schedules, and alerts.
 */
export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const { phone, message } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { error: "Phone and message are required" },
        { status: 400 }
      );
    }

    let cleanPhone = String(phone).replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("0") && cleanPhone.length === 10) {
      cleanPhone = `254${cleanPhone.slice(1)}`;
    }

    if (!cleanPhone || cleanPhone.length < 9) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    const chatId = `${cleanPhone}@c.us`;
    const res = await sendWahaText(chatId, message);

    return NextResponse.json({
      success: res.success,
      message: res.message,
      chatId,
    });
  } catch (err: any) {
    console.error("[admin radio whatsapp send] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to send WhatsApp message" },
      { status: 500 }
    );
  }
}

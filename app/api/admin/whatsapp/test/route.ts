import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sendWahaText } from "@/lib/waha";

export const dynamic = "force-dynamic";

/** Kenyan mobile numbers: 07…, 2547…, 7…, or 0012547… */
function normalizeKenyanPhone(input: string): string | null {
  let digits = input.replace(/[^0-9]/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `254${digits.slice(1)}`;
  else if (digits.length === 9) digits = `254${digits}`;

  return /^2547\d{8}$/.test(digits) ? digits : null;
}

/** Dispatch a test message through the paired WhatsApp session. */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  let phoneNumber = "";
  let message = "";

  try {
    const body = await request.json();
    phoneNumber = typeof body?.phoneNumber === "string" ? body.phoneNumber : "";
    message = typeof body?.message === "string" ? body.message.slice(0, 1000) : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const normalized = normalizeKenyanPhone(phoneNumber);
  if (!normalized) {
    return NextResponse.json(
      { error: "Enter a valid Kenyan mobile number, for example 0712813284" },
      { status: 400 }
    );
  }

  const text =
    message.trim() ||
    "GOODLIFE FESTIVAL - WhatsApp gateway test. Your ticket delivery line is live.";

  const result = await sendWahaText(`${normalized}@c.us`, text);

  return NextResponse.json(
    {
      success: result.success,
      message: result.success
        ? `Test message dispatched to ${normalized}.`
        : result.message,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

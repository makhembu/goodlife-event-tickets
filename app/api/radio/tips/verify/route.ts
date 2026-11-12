import { NextRequest, NextResponse } from "next/server";
import { getRadioTipByReference, maskPhone } from "@/lib/radio/ops-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference")?.trim();

  if (!reference) {
    return NextResponse.json({ error: "Reference parameter is required." }, { status: 400 });
  }

  try {
    const tip = await getRadioTipByReference(reference);
    if (!tip) {
      return NextResponse.json({ error: "Tip not found" }, { status: 404 });
    }

    return NextResponse.json({
      reference: tip.reference,
      status: tip.status,
      amount: Number(tip.amount),
      sender_name: tip.sender_name,
      masked_phone: maskPhone(tip.phone),
      completed_at: tip.completed_at,
    });
  } catch (error: any) {
    console.error("[Radio Tips Verify] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

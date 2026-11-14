import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { generateScheduleSlots } from "@/lib/radio/schedule-generator";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const days = parseInt(String(body.days || 30), 10);
    const showId = body.show_id ? parseInt(String(body.show_id), 10) : undefined;

    const result = await generateScheduleSlots(days, new Date(), showId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Schedule generation failed" }, { status: 500 });
  }
}

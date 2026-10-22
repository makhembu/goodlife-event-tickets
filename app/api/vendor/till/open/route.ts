import { NextRequest, NextResponse } from "next/server";
import { openTillSession, fetchActiveEvent } from "@/lib/supabase-db";

function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie?.value) return null;
  try {
    const raw = sessionCookie.value.includes(".") ? sessionCookie.value.split(".")[0] : sessionCookie.value;
    try { return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); } catch { return JSON.parse(atob(raw)); }
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { opening_float } = await request.json();
    const float = Number(opening_float ?? 0);
    if (isNaN(float) || float < 0) return NextResponse.json({ error: "Invalid opening float" }, { status: 400 });
    const activeEvent = await fetchActiveEvent();
    const eventId = activeEvent?.id ?? 0;
    const tillSession = await openTillSession(
      session.vendorId,
      eventId,
      session.operatorId ?? null,
      session.operatorName ?? session.vendorName ?? null,
      float
    );
    return NextResponse.json({ session: tillSession });
  } catch (e: any) {
    // Unique constraint violation = already open
    if (e.message?.includes("unique") || e.code === "23505") {
      return NextResponse.json({ error: "A till session is already open for this vendor." }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

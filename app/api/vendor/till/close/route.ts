import { NextRequest, NextResponse } from "next/server";
import { closeTillSession } from "@/lib/supabase-db";

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
    const { session_id, closing_cash_counted, notes } = await request.json();
    if (!session_id) return NextResponse.json({ error: "session_id required" }, { status: 400 });
    const counted = Number(closing_cash_counted ?? 0);
    if (isNaN(counted) || counted < 0) return NextResponse.json({ error: "Invalid closing cash count" }, { status: 400 });
    const tillSession = await closeTillSession(Number(session_id), counted, notes);
    return NextResponse.json({ session: tillSession });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

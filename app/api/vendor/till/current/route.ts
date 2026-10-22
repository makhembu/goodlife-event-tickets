import { NextRequest, NextResponse } from "next/server";
import { getCurrentTillSession } from "@/lib/supabase-db";

function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie?.value) return null;
  try {
    const raw = sessionCookie.value.includes(".") ? sessionCookie.value.split(".")[0] : sessionCookie.value;
    try { return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); } catch { return JSON.parse(atob(raw)); }
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const tillSession = await getCurrentTillSession(session.vendorId);
    return NextResponse.json({ session: tillSession });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { fetchActiveEvent } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("goodlife_vendor_session");

    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    try {
      const raw = sessionCookie.value.includes(".") ? sessionCookie.value.split(".")[0] : sessionCookie.value;
      let sessionData: any = null;
      try {
        sessionData = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
      } catch {
        sessionData = JSON.parse(atob(raw));
      }

      const activeEvent = await fetchActiveEvent().catch(() => null);

      return NextResponse.json({
        success: true,
        session: sessionData,
        event: {
          id: activeEvent?.id || 2,
          title: activeEvent?.title || "GOODLIFE 4",
          till_number: activeEvent?.till_number || "5761205"
        }
      });
    } catch (e) {
      return NextResponse.json(
        { success: false, message: "Invalid session" },
        { status: 401 }
      );
    }
  } catch (error: any) {
    console.error("Vendor session error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

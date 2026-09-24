import { NextRequest, NextResponse } from "next/server";

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
      const sessionData = JSON.parse(atob(sessionCookie.value));
      return NextResponse.json({
        success: true,
        session: sessionData
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

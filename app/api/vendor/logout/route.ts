import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({ success: true, message: "Logged out successfully" });
    
    // Clear session cookie
    response.cookies.delete("goodlife_vendor_session");

    return response;
  } catch (error: any) {
    console.error("Vendor logout error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true, message: "Logged out from Gate Terminal" });
  response.cookies.delete("goodlife_scanner_session");
  return response;
}

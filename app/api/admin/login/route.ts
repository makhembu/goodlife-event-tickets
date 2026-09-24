import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "admin-login", { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const body = await request.json().catch(() => ({}));
    const { email, password } = body;

    if (email === "admin@goodlife.com" && password === "GoodlifeAdmin2026!") {
      const response = NextResponse.json({ success: true, message: "Authenticated successfully" });
      
      // Set session cookie
      response.cookies.set("goodlife_admin_session", "true", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 // 1 day
      });

      return response;
    }

    return NextResponse.json(
      { success: false, message: "Invalid email or password" },
      { status: 401 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

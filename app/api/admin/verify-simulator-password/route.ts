import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { getClientIp, checkKeyRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  const ip = getClientIp(request);
  const rl = checkKeyRateLimit(`sim-pwd:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ valid: false, error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { password } = body;

    const SIMULATOR_PASSWORD = process.env.SIMULATOR_PASSWORD || "";
    if (!SIMULATOR_PASSWORD) {
      return NextResponse.json({ valid: false, error: "Server misconfiguration" }, { status: 500 });
    }

    const submitted = Buffer.from(password || "");
    const expected = Buffer.from(SIMULATOR_PASSWORD);
    const valid =
      submitted.length === expected.length && timingSafeEqual(submitted, expected);

    if (valid) {
      return NextResponse.json({ valid: true });
    }
    return NextResponse.json({ valid: false }, { status: 401 });
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 });
  }
}

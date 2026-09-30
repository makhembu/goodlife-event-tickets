import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

export async function POST(request: NextRequest) {
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

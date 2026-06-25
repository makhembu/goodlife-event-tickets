import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    if (password === "GoodlifeSim2026!") {
      return NextResponse.json({ valid: true });
    }
    return NextResponse.json({ valid: false }, { status: 401 });
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 });
  }
}

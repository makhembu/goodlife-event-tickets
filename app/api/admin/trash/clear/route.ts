import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { emptyTrash } from "@/lib/supabase-db";

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const { password } = body;

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
    if (!ADMIN_PASSWORD || !password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const a = Buffer.from(password);
    const b = Buffer.from(ADMIN_PASSWORD);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }

    const success = await emptyTrash();
    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { emptyTrash } from "@/lib/supabase-db";

export async function POST(request: NextRequest) {
  try {
    const success = await emptyTrash();
    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

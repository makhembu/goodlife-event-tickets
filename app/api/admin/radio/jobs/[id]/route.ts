import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeGetJob } from "@/lib/radio/bridge-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Job ID required" }, { status: 400 });
  }

  const res = await bridgeGetJob(id);
  if (!res.ok) {
    return NextResponse.json({ error: res.error || "Job query failed" }, { status: 502 });
  }

  return NextResponse.json(res.data);
}

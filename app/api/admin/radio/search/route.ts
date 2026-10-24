import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeSearch } from "@/lib/radio/bridge-client";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  if (!q.trim()) {
    return NextResponse.json([]);
  }

  const res = await bridgeSearch(q);
  if (!res.ok) {
    return NextResponse.json({ error: res.error || "Search failed" }, { status: 502 });
  }

  return NextResponse.json(res.data || []);
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeGetAzuracastQueue } from "@/lib/radio/bridge-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const res = await bridgeGetAzuracastQueue();
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error || "Failed to fetch AzuraCast queue" },
      { status: 502 }
    );
  }

  return NextResponse.json(res.data);
}

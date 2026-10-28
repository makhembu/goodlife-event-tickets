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
      {
        online: false,
        status: "daemon_offline",
        error: res.error || "AzuraCast queue unreachable",
        queue: [],
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }

  return NextResponse.json({ ...res.data, online: true });
}

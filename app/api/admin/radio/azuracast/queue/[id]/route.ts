import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeDeleteQueueItem } from "@/lib/radio/bridge-client";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Queue ID is required" }, { status: 400 });
  }

  const res = await bridgeDeleteQueueItem(id);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error || "Failed to delete queue item" },
      { status: 502 }
    );
  }

  return NextResponse.json(res.data);
}

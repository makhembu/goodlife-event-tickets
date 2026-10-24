import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listR2Objects, deleteR2Object, isR2Configured } from "@/lib/r2-storage";

export async function GET(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Cloudflare R2 is not configured" },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get("prefix") || undefined;
    const objects = await listR2Objects(prefix);
    return NextResponse.json({ objects });
  } catch (err: any) {
    console.error("[api/admin/r2 GET] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to list R2 objects" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Cloudflare R2 is not configured" },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    let keyOrUrl = searchParams.get("key") || searchParams.get("url");

    if (!keyOrUrl) {
      const body = await request.json().catch(() => null);
      keyOrUrl = body?.key || body?.url;
    }

    if (!keyOrUrl || typeof keyOrUrl !== "string") {
      return NextResponse.json(
        { error: "A key or url parameter is required" },
        { status: 400 }
      );
    }

    const success = await deleteR2Object(keyOrUrl);
    if (!success) {
      return NextResponse.json(
        { error: "Failed to delete object from Cloudflare R2" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, key: keyOrUrl });
  } catch (err: any) {
    console.error("[api/admin/r2 DELETE] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to delete object" },
      { status: 500 }
    );
  }
}

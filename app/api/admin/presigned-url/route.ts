import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createR2PresignedUpload, isR2Configured } from "@/lib/r2-storage";

export async function POST(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Cloudflare R2 is not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { filename, contentType, folder } = body || {};

    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    const type = typeof contentType === "string" ? contentType : "application/octet-stream";
    const allowedFolders = ["gallery", "posters", "videos"];
    const targetFolder = typeof folder === "string" && allowedFolders.includes(folder.toLowerCase())
      ? folder.toLowerCase()
      : (type.startsWith("video/") ? "videos" : "gallery");

    const upload = await createR2PresignedUpload({
      filename,
      contentType: type,
      folder: targetFolder,
    });

    if (!upload) {
      return NextResponse.json(
        { error: "Failed to generate presigned upload URL" },
        { status: 500 }
      );
    }

    return NextResponse.json(upload);
  } catch (err: any) {
    console.error("[presigned-url] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

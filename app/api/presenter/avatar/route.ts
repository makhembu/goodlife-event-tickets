import { NextRequest, NextResponse } from "next/server";
import { requirePresenter } from "@/lib/presenter-auth";
import { neonQuery } from "@/lib/supabase-db";
import { uploadBufferToR2, isR2Configured } from "@/lib/r2-storage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) return authResult;
  const { presenter } = authResult;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured on the server" },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image exceeds 5MB limit" },
        { status: 400 }
      );
    }

    const contentType = file.type || "";
    if (!contentType.startsWith("image/") && !file.name.match(/\.(png|jpe?g|webp|gif)$/i)) {
      return NextResponse.json(
        { error: "Invalid image format. Please upload PNG, JPG, or WEBP." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploaded = await uploadBufferToR2({
      buffer,
      filename: `avatar_${presenter.slug}_${file.name}`,
      contentType: contentType || "image/jpeg",
      folder: "presenter-avatars",
    });

    if (!uploaded || !uploaded.publicUrl) {
      return NextResponse.json(
        { error: "Failed to upload image to storage" },
        { status: 500 }
      );
    }

    await neonQuery(
      `UPDATE presenters
       SET avatar_url = $1, updated_at = NOW()
       WHERE id = $2`,
      [uploaded.publicUrl, presenter.id]
    );

    return NextResponse.json({
      success: true,
      avatar_url: uploaded.publicUrl,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Avatar upload failed" },
      { status: 500 }
    );
  }
}

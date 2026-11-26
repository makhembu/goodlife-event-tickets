import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { uploadBufferToR2, isR2Configured } from "@/lib/r2-storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/radio/cover
 * Returns the configured default station fallback cover URL.
 */
export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { rows } = await neonQuery(
    "SELECT default_cover_url FROM radio_settings WHERE id = 1"
  );

  return NextResponse.json({
    success: true,
    default_cover_url: rows[0]?.default_cover_url || null,
  });
}

/**
 * PUT /api/admin/radio/cover
 * Sets or clears the default station fallback cover URL.
 */
export async function PUT(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const { default_cover_url } = body;
    const val = typeof default_cover_url === "string" ? default_cover_url.trim() : null;

    const { rows } = await neonQuery(
      `UPDATE radio_settings 
       SET default_cover_url = $1, updated_at = NOW() 
       WHERE id = 1 
       RETURNING default_cover_url`,
      [val || null]
    );

    return NextResponse.json({
      success: true,
      default_cover_url: rows[0]?.default_cover_url || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update default station cover" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/radio/cover
 * Uploads a custom fallback station cover artwork to Cloudflare R2 and persists to radio_settings.
 */
export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Cloudflare R2 storage is not configured for image uploads" },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File exceeds 10MB limit for station cover artwork" },
        { status: 400 }
      );
    }

    const contentType = file.type || "image/png";
    if (!contentType.startsWith("image/") && !file.name.match(/\.(png|jpe?g|webp|gif)$/i)) {
      return NextResponse.json(
        { error: "Invalid image format. Please upload PNG, JPG, or WebP image." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploaded = await uploadBufferToR2({
      buffer,
      filename: `station_cover_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
      contentType,
      folder: "radio/covers",
    });

    if (!uploaded || !uploaded.publicUrl) {
      return NextResponse.json(
        { error: "Failed to upload image to Cloudflare R2 storage" },
        { status: 500 }
      );
    }

    await neonQuery(
      `UPDATE radio_settings 
       SET default_cover_url = $1, updated_at = NOW() 
       WHERE id = 1`,
      [uploaded.publicUrl]
    );

    return NextResponse.json({
      success: true,
      default_cover_url: uploaded.publicUrl,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Image upload failed" },
      { status: 500 }
    );
  }
}

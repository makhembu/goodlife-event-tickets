import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    let image: any = null;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      image = formData.get("image");
    } else if (contentType.includes("application/json")) {
      const body = await request.json();
      image = body?.image;
    } else {
      try {
        const formData = await request.formData();
        image = formData.get("image");
      } catch {
        const body = await request.json().catch(() => ({}));
        image = body?.image;
      }
    }

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const key = process.env.IMGBB_API_KEY || "46a61350ab6bdc4e5ab0ef6e4e47e5be";
    const outgoingFormData = new FormData();
    outgoingFormData.append("image", image);

    const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, {
      method: "POST",
      body: outgoingFormData,
    });

    const data = await imgbbRes.json();
    if (!imgbbRes.ok || !data.success) {
      return NextResponse.json(
        { error: data?.error?.message || "Failed to upload to ImgBB" },
        { status: imgbbRes.status || 500 }
      );
    }

    const url = data.data.display_url || data.data.url;
    return NextResponse.json({ success: true, url });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

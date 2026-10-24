import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  createRadioPresignedUpload,
  initMultipartUpload,
  signMultipartPart,
  completeMultipart,
  abortMultipart,
} from "@/lib/radio/r2-signer";

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "presigned") {
      const { filename, contentType, isHighQuality } = body;
      const res = await createRadioPresignedUpload({
        filename: filename || "set.mp3",
        contentType: contentType || "audio/mpeg",
        isHighQuality: Boolean(isHighQuality),
      });
      if (!res) return NextResponse.json({ error: "R2 not configured" }, { status: 500 });
      return NextResponse.json(res);
    }

    if (action === "create") {
      const { key, contentType } = body;
      const res = await initMultipartUpload(key, contentType || "audio/mpeg");
      return NextResponse.json(res);
    }

    if (action === "sign_part") {
      const { key, uploadId, partNumber } = body;
      const res = await signMultipartPart(key, uploadId, partNumber);
      return NextResponse.json(res);
    }

    if (action === "complete") {
      const { key, uploadId, parts } = body;
      const res = await completeMultipart(key, uploadId, parts);
      return NextResponse.json(res);
    }

    if (action === "abort") {
      const { key, uploadId } = body;
      const res = await abortMultipart(key, uploadId);
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Multipart upload error" }, { status: 500 });
  }
}

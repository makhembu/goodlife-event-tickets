import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

// Common browser user-agent to bypass basic bot shields on public storage endpoints
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/ogg",
  "video/x-matroska",
];

const MAX_VIDEO_BYTES = 150 * 1024 * 1024; // 150 MB

/**
 * Tier 1: Catbox.moe
 * Permanent hosting, supports files up to 200MB, returns direct file URL.
 */
async function uploadToCatbox(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", file, file.name || "video.mp4");

  const res = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
    },
    body: formData,
    signal: AbortSignal.timeout(60000), // 60s timeout
  });

  if (!res.ok) {
    throw new Error(`Catbox HTTP ${res.status} ${res.statusText}`);
  }

  const text = (await res.text()).trim();
  if (!text.startsWith("http://") && !text.startsWith("https://")) {
    throw new Error(`Catbox unexpected response: ${text.slice(0, 100)}`);
  }

  return text;
}

/**
 * Tier 2 (Fallback 1): Pomf2 (pomf2.lain.la)
 * Reliable permanent hosting with byte-range support for video streaming (up to 512MB).
 */
async function uploadToPomf2(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("files[]", file, file.name || "video.mp4");

  const res = await fetch("https://pomf2.lain.la/upload.php", {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
    },
    body: formData,
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    throw new Error(`Pomf2 HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (!json?.success || !json.files?.[0]?.url) {
    throw new Error(json?.description || "Pomf2 did not return a valid file URL");
  }

  return json.files[0].url;
}

/**
 * Tier 3 (Fallback 2): Uguu.se
 * Fast file upload service for direct media delivery.
 */
async function uploadToUguu(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("files[]", file, file.name || "video.mp4");

  const res = await fetch("https://uguu.se/upload", {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
    },
    body: formData,
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    throw new Error(`Uguu HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (!json?.success || !json.files?.[0]?.url) {
    throw new Error("Uguu did not return a valid file URL");
  }

  return json.files[0].url;
}

export async function POST(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get("video") as File | null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    // Validate size
    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds ${(MAX_VIDEO_BYTES / (1024 * 1024)).toFixed(0)} MB limit` },
        { status: 400 }
      );
    }

    // Validate mime or extension
    const mime = file.type || "";
    const name = file.name || "";
    const isVideoMime = ALLOWED_VIDEO_TYPES.some((t) => mime.startsWith("video/") || mime === t);
    const isVideoExt = /\.(mp4|webm|mov|m4v|ogg|mkv)($|\?)/i.test(name);

    if (!isVideoMime && !isVideoExt) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload an MP4, WEBM, or MOV video file." },
        { status: 400 }
      );
    }

    const errors: string[] = [];
    let finalUrl: string | null = null;
    let chosenProvider = "";

    // Tier 1: Catbox
    try {
      finalUrl = await uploadToCatbox(file);
      chosenProvider = "catbox";
    } catch (err: any) {
      console.warn("[upload-video] Tier 1 (Catbox) failed, attempting fallback:", err.message);
      errors.push(`Catbox: ${err.message}`);
    }

    // Tier 2: Pomf2 (fallback 1)
    if (!finalUrl) {
      try {
        finalUrl = await uploadToPomf2(file);
        chosenProvider = "pomf2";
      } catch (err: any) {
        console.warn("[upload-video] Tier 2 (Pomf2) failed, attempting fallback:", err.message);
        errors.push(`Pomf2: ${err.message}`);
      }
    }

    // Tier 3: Uguu (fallback 2)
    if (!finalUrl) {
      try {
        finalUrl = await uploadToUguu(file);
        chosenProvider = "uguu";
      } catch (err: any) {
        console.warn("[upload-video] Tier 3 (Uguu) failed:", err.message);
        errors.push(`Uguu: ${err.message}`);
      }
    }

    if (!finalUrl) {
      return NextResponse.json(
        {
          error: "All video hosting services failed. Please try again or provide a direct URL.",
          details: errors,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      url: finalUrl,
      provider: chosenProvider,
    });
  } catch (err: any) {
    console.error("[upload-video] Server error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error during video upload" },
      { status: 500 }
    );
  }
}

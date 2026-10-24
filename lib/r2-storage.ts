import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getR2Client(): { s3: S3Client; bucket: string; publicDomain: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || "goodlife";
  const publicDomain = (process.env.R2_PUBLIC_DOMAIN || "").replace(/\/+$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !publicDomain) {
    return null;
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return { s3, bucket, publicDomain };
}

export function isR2Configured(): boolean {
  return getR2Client() !== null;
}

export function extractR2Key(keyOrUrl: string): string | null {
  if (!keyOrUrl || typeof keyOrUrl !== "string") return null;
  const trimmed = keyOrUrl.trim();
  if (!trimmed) return null;

  // If it's already a clean key or relative path:
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed.replace(/^\/+/, "");
  }

  try {
    const url = new URL(trimmed);
    const publicDomain = (process.env.R2_PUBLIC_DOMAIN || "").replace(/\/+$/, "");
    let pubHost = "";
    try {
      if (publicDomain) pubHost = new URL(publicDomain).hostname;
    } catch {}

    const isR2Host =
      (pubHost && url.hostname === pubHost) ||
      url.hostname.endsWith(".r2.cloudflarestorage.com") ||
      url.hostname.endsWith(".r2.dev");

    if (!isR2Host) return null;

    let pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const bucket = process.env.R2_BUCKET_NAME || "goodlife";
    if (pathname.startsWith(`${bucket}/`)) {
      pathname = pathname.slice(bucket.length + 1);
    }
    return pathname || null;
  } catch {
    return null;
  }
}

export async function createR2PresignedUpload(params: {
  filename: string;
  contentType: string;
  folder?: "videos" | "posters" | "gallery" | string;
}): Promise<{ uploadUrl: string; publicUrl: string; key: string } | null> {
  const r2 = getR2Client();
  if (!r2) return null;

  const folder = params.folder || "gallery";
  const ext = params.filename.includes(".")
    ? params.filename.split(".").pop()?.toLowerCase() || "bin"
    : "bin";
  const cleanBase = params.filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 30);
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const key = `${folder}/${Date.now()}-${cleanBase || "media"}-${randomSuffix}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: r2.bucket,
    Key: key,
    ContentType: params.contentType,
  });

  const uploadUrl = await getSignedUrl(r2.s3, command, { expiresIn: 3600 });
  const publicUrl = `${r2.publicDomain}/${key}`;

  return { uploadUrl, publicUrl, key };
}

export async function deleteR2Object(keyOrUrl: string): Promise<boolean> {
  const r2 = getR2Client();
  if (!r2) return false;

  const key = extractR2Key(keyOrUrl);
  if (!key) return false;

  try {
    const command = new DeleteObjectCommand({
      Bucket: r2.bucket,
      Key: key,
    });
    await r2.s3.send(command);
    return true;
  } catch (err) {
    console.error("[r2-storage] deleteR2Object error for key:", key, err);
    return false;
  }
}

export interface R2ObjectItem {
  key: string;
  url: string;
  size: number;
  lastModified: string;
  folder: string;
  filename: string;
  isImage: boolean;
  isVideo: boolean;
}

export async function listR2Objects(prefix?: string): Promise<R2ObjectItem[]> {
  const r2 = getR2Client();
  if (!r2) return [];

  try {
    const command = new ListObjectsV2Command({
      Bucket: r2.bucket,
      Prefix: prefix || undefined,
      MaxKeys: 1000,
    });

    const res = await r2.s3.send(command);
    const contents = res.Contents || [];

    const items: R2ObjectItem[] = contents
      .filter((obj) => obj.Key && !obj.Key.endsWith("/"))
      .map((obj) => {
        const key = obj.Key!;
        const parts = key.split("/");
        const folder = parts.length > 1 ? parts[0] : "root";
        const filename = parts[parts.length - 1] || key;
        const ext = filename.split(".").pop()?.toLowerCase() || "";
        const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext);
        const isVideo = ["mp4", "webm", "mov", "m4v", "ogg", "quicktime"].includes(ext);

        return {
          key,
          url: `${r2.publicDomain}/${key}`,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified?.toISOString() || new Date().toISOString(),
          folder,
          filename,
          isImage,
          isVideo,
        };
      });

    // Sort newest first
    items.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return items;
  } catch (err) {
    console.error("[r2-storage] listR2Objects error:", err);
    return [];
  }
}

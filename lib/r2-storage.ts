import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

export async function createR2PresignedUpload(params: {
  filename: string;
  contentType: string;
  folder?: "videos" | "posters";
}): Promise<{ uploadUrl: string; publicUrl: string; key: string } | null> {
  const r2 = getR2Client();
  if (!r2) return null;

  const folder = params.folder || "videos";
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

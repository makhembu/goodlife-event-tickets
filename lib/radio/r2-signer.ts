import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { extractR2Key } from "@/lib/r2-storage";

function getR2() {
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
    credentials: { accessKeyId, secretAccessKey },
  });

  return { s3, bucket, publicDomain };
}

export async function createRadioPresignedUpload(params: {
  filename: string;
  contentType: string;
  isHighQuality?: boolean;
}): Promise<{ uploadUrl: string; publicUrl: string; key: string } | null> {
  const r2 = getR2();
  if (!r2) return null;

  const ext = params.filename.includes(".")
    ? params.filename.split(".").pop()?.toLowerCase() || "mp3"
    : "mp3";
  const cleanBase = params.filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 30);
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const tier = params.isHighQuality ? "320k" : "192k";
  const key = `radio/${Date.now()}-${cleanBase || "set"}-${tier}-${randomSuffix}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: r2.bucket,
    Key: key,
    ContentType: params.contentType,
  });

  const uploadUrl = await getSignedUrl(r2.s3, command, { expiresIn: 3600 });
  const publicUrl = `${r2.publicDomain}/${key}`;

  return { uploadUrl, publicUrl, key };
}

// ==================== MULTIPART S3 HELPERS ====================

export async function initMultipartUpload(key: string, contentType: string) {
  const r2 = getR2();
  if (!r2) throw new Error("R2 not configured");

  const command = new CreateMultipartUploadCommand({
    Bucket: r2.bucket,
    Key: key,
    ContentType: contentType,
  });

  const res = await r2.s3.send(command);
  return { uploadId: res.UploadId, key, publicUrl: `${r2.publicDomain}/${key}` };
}

export async function signMultipartPart(key: string, uploadId: string, partNumber: number) {
  const r2 = getR2();
  if (!r2) throw new Error("R2 not configured");

  const command = new UploadPartCommand({
    Bucket: r2.bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  const presignedUrl = await getSignedUrl(r2.s3, command, { expiresIn: 1800 });
  return { presignedUrl, partNumber };
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>
) {
  const r2 = getR2();
  if (!r2) throw new Error("R2 not configured");

  const command = new CompleteMultipartUploadCommand({
    Bucket: r2.bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
    },
  });

  await r2.s3.send(command);
  return { key, publicUrl: `${r2.publicDomain}/${key}` };
}

export async function abortMultipart(key: string, uploadId: string) {
  const r2 = getR2();
  if (!r2) throw new Error("R2 not configured");

  const command = new AbortMultipartUploadCommand({
    Bucket: r2.bucket,
    Key: key,
    UploadId: uploadId,
  });

  await r2.s3.send(command);
  return { aborted: true };
}

export async function deleteRadioAudioKeys(keys: Array<string | null | undefined>): Promise<void> {
  const r2 = getR2();
  if (!r2) return;

  for (const raw of keys) {
    if (!raw) continue;
    const key = extractR2Key(raw);
    if (!key) continue;

    try {
      await r2.s3.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
    } catch (err) {
      console.error("[r2-signer] Failed to delete key:", key, err);
    }
  }
}

export async function uploadDropBufferToR2(params: {
  buffer: Buffer | Uint8Array;
  filename: string;
}): Promise<string | null> {
  const r2 = getR2();
  if (!r2) return null;

  const key = `radio/drops/${Date.now()}-${params.filename}`;
  await r2.s3.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: params.buffer,
      ContentType: "audio/mpeg",
    })
  );
  return `${r2.publicDomain}/${key}`;
}

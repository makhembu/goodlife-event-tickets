import { neonQuery } from "./supabase-db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let _s3Client: S3Client | null = null;
function getS3Client(): S3Client | null {
  if (_s3Client) return _s3Client;
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  _s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _s3Client;
}

export async function persistWebhookToOutbox(
  reference: string,
  externalReference: string,
  status: string,
  rawPayload: string | Record<string, any>
): Promise<void> {
  const payloadObj = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  const payloadStr = typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload, null, 2);

  // 1. Persist to DB Outbox table
  try {
    await neonQuery(
      `INSERT INTO payhero_webhook_outbox (reference, external_reference, status, payload, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [reference || "UNKNOWN", externalReference || "UNKNOWN", status || "unknown", JSON.stringify(payloadObj)]
    );
  } catch (dbErr: any) {
    console.error("[webhook-outbox] DB persist failed:", dbErr?.message);
  }

  // 2. Persist to R2 Durable Storage
  try {
    const s3 = getS3Client();
    const bucket = process.env.R2_BUCKET_NAME?.trim() || "goodlife";
    if (s3) {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const key = `webhooks/payhero/${dateStr}/${reference || "unknown"}_${Date.now()}.json`;

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: payloadStr,
          ContentType: "application/json",
        })
      );
    }
  } catch (r2Err: any) {
    console.warn("[webhook-outbox] R2 backup upload skipped/failed:", r2Err?.message);
  }
}

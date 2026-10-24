import { readFileSync } from "fs";
import { join } from "path";

// Load .env.local if present
try {
  const envContent = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [k, ...v] = trimmed.split("=");
    if (k && v.length) process.env[k] = v.join("=");
  }
} catch {}

import { extractR2Key, isR2Configured, createR2PresignedUpload } from "../lib/r2-storage";

let failures = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

// 1. Key extraction from various R2 URL shapes
const key1 = extractR2Key("https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/gallery/12345-photo.jpg");
assert(key1 === "gallery/12345-photo.jpg", `extractR2Key extracts from pub-*.r2.dev: got "${key1}"`);

const key2 = extractR2Key("https://8d3a6983ab6e716f64ce96d6aa506281.r2.cloudflarestorage.com/goodlife/posters/poster.png");
assert(key2 === "posters/poster.png", `extractR2Key extracts from r2.cloudflarestorage.com endpoint: got "${key2}"`);

const key3 = extractR2Key("videos/hype.mp4");
assert(key3 === "videos/hype.mp4", `extractR2Key keeps plain key: got "${key3}"`);

const key4 = extractR2Key("/gallery/event-shot.webp");
assert(key4 === "gallery/event-shot.webp", `extractR2Key strips leading slash: got "${key4}"`);

const key5 = extractR2Key("https://i.ibb.co/abc/poster.jpg");
assert(key5 === null, `extractR2Key returns null for non-R2 URL: got "${key5}"`);

const key6 = extractR2Key("");
assert(key6 === null, "extractR2Key returns null for empty string");

// 2. R2 Configuration
assert(isR2Configured() === true, "R2 is configured with environment credentials");

// 3. Presigned upload with 'gallery' folder
async function testPresigned() {
  const upload = await createR2PresignedUpload({
    filename: "crowd-energy.jpg",
    contentType: "image/jpeg",
    folder: "gallery",
  });
  assert(upload !== null, "createR2PresignedUpload returns valid upload descriptor");
  if (upload) {
    assert(upload.key.startsWith("gallery/"), `Upload key starts with gallery/: "${upload.key}"`);
    assert(upload.uploadUrl.includes("X-Amz-Signature"), "Upload URL contains presigned signature");
    assert(upload.publicUrl.includes(upload.key), "Public URL contains the key");
  }

  // 4. API endpoints check
  const r2Api = readFileSync(join(process.cwd(), "app", "api", "admin", "r2", "route.ts"), "utf8");
  assert(r2Api.includes("listR2Objects") && r2Api.includes("deleteR2Object"), "R2 API has list and delete handlers");

  const galleryApi = readFileSync(join(process.cwd(), "app", "api", "hub", "gallery", "route.ts"), "utf8");
  assert(galleryApi.includes("deleteR2Object"), "Gallery API deletes R2 object when gallery item is removed");

  const presignedApi = readFileSync(join(process.cwd(), "app", "api", "admin", "presigned-url", "route.ts"), "utf8");
  assert(presignedApi.includes("gallery"), "Presigned URL endpoint supports 'gallery' folder");

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll R2 gallery tests passed successfully.");
  }
}

testPresigned().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});

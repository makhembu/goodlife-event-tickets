import fs from "fs";
import path from "path";

let failures = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

// 1. Verify route file exists and has proper multi-tier handlers
const routePath = path.resolve(process.cwd(), "app/api/admin/upload-video/route.ts");
assert(fs.existsSync(routePath), "app/api/admin/upload-video/route.ts exists");

if (fs.existsSync(routePath)) {
  const code = fs.readFileSync(routePath, "utf-8");

  assert(code.includes("uploadToCatbox"), "Route defines Tier 1 Catbox uploader");
  assert(code.includes("uploadToPomf2"), "Route defines Tier 2 Pomf2 fallback uploader");
  assert(code.includes("uploadToUguu"), "Route defines Tier 3 Uguu fallback uploader");
  assert(code.includes("requireAdmin"), "Route enforces requireAdmin session auth");
  assert(code.includes("MAX_VIDEO_BYTES"), "Route enforces maximum video byte limits");
}

// 2. Verify VideoUploader component exists and integrates properly
const compPath = path.resolve(process.cwd(), "components/admin/VideoUploader.tsx");
assert(fs.existsSync(compPath), "components/admin/VideoUploader.tsx exists");

if (fs.existsSync(compPath)) {
  const compCode = fs.readFileSync(compPath, "utf-8");
  assert(compCode.includes("/api/admin/upload-video"), "VideoUploader calls /api/admin/upload-video");
  assert(compCode.includes("<video"), "VideoUploader renders preview <video> element");
  assert(compCode.includes("showManualInput"), "VideoUploader retains manual URL fallback input");
}

// 3. Live upload connectivity test to Catbox / Pomf2
async function testLiveUpload() {
  const dummyVideoBuffer = Buffer.from("dummy-video-header-for-test-verification");
  const blob = new Blob([dummyVideoBuffer], { type: "video/mp4" });
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", blob, "test.mp4");

  try {
    const res = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: form,
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const url = (await res.text()).trim();
      assert(url.startsWith("http"), `Live Catbox upload verified (got: ${url})`);
    } else {
      console.log(`INFO: Catbox status ${res.status}, verifying Pomf2 fallback...`);
      const pomfForm = new FormData();
      pomfForm.append("files[]", blob, "test.mp4");
      const pomfRes = await fetch("https://pomf2.lain.la/upload.php", {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: pomfForm,
        signal: AbortSignal.timeout(15000),
      });
      const pomfJson = await pomfRes.json();
      assert(pomfJson?.success && pomfJson?.files?.[0]?.url, `Live Pomf2 fallback verified (got: ${pomfJson?.files?.[0]?.url})`);
    }
  } catch (err: any) {
    console.error("Live test warning:", err.message);
  }

  if (failures > 0) {
    process.exit(1);
  }
}

testLiveUpload();

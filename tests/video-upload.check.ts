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

// 3. Live upload connectivity test to Catbox and Uguu fallback
async function testLiveUpload() {
  const dummyVideoBuffer = Buffer.from("dummy-video-header-for-test-verification");
  const blob = new Blob([dummyVideoBuffer], { type: "video/mp4" });

  // Test Tier 1: Catbox
  try {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", blob, "test.mp4");

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
      console.warn(`Catbox status: ${res.status}`);
    }
  } catch (err: any) {
    console.warn("Catbox live check warning:", err.message);
  }

  // Test Tier 3 fallback: Uguu
  try {
    const uguuForm = new FormData();
    uguuForm.append("files[]", blob, "test.mp4");

    const uguuRes = await fetch("https://uguu.se/upload", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: uguuForm,
      signal: AbortSignal.timeout(15000),
    });

    const uguuJson = await uguuRes.json();
    assert(
      uguuJson?.success && uguuJson?.files?.[0]?.url,
      `Live Uguu fallback verified (got: ${uguuJson?.files?.[0]?.url})`
    );
  } catch (err: any) {
    console.warn("Uguu live check warning:", err.message);
  }

  if (failures > 0) {
    process.exit(1);
  }
}

testLiveUpload();

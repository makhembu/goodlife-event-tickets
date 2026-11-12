import fs from "fs";
import path from "path";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) console.log(`PASS: ${message}`);
  else {
    console.error(`FAIL: ${message}`);
    failures++;
  }
}

console.log("--- Testing Radio Sharing, OG Metadata & Embed Security ---");

// 1. Verify /api/og/radio exists and has correct dimensions and caching
const ogRoutePath = path.join(process.cwd(), "app/api/og/radio/route.tsx");
assert(fs.existsSync(ogRoutePath), "app/api/og/radio/route.tsx exists");
const ogContent = fs.readFileSync(ogRoutePath, "utf8");
assert(ogContent.includes("ImageResponse"), "Route uses next/og ImageResponse");
assert(ogContent.includes("OG_SIZE"), "Route applies standard 1200x630 OG_SIZE");
assert(ogContent.includes("cache-control"), "Route sets cache-control header for edge caching");
assert(ogContent.includes("loadBrandFont"), "Route loads brand Bebas Neue display font");
assert(ogContent.includes("showSlug"), "Route handles ?show= query parameter");
assert(ogContent.includes("presenterSlug"), "Route handles ?presenter= query parameter");

// 2. Verify ShareStationModal exists with 9:16 Instagram Story canvas and WhatsApp sharing
const modalPath = path.join(process.cwd(), "components/radio/ShareStationModal.tsx");
assert(fs.existsSync(modalPath), "components/radio/ShareStationModal.tsx exists");
const modalContent = fs.readFileSync(modalPath, "utf8");
assert(modalContent.includes("1080") && modalContent.includes("1920"), "Story canvas renders 9:16 (1080x1920 HD)");
assert(modalContent.includes("api.whatsapp.com/send"), "Modal includes direct WhatsApp share link");
assert(modalContent.includes("download"), "Modal includes PNG download for Instagram Story");
assert(modalContent.includes("clipboard"), "Modal provides clipboard link copy fallback");

// 3. Verify Embed Player & CSP Headers in next.config.ts
const embedPagePath = path.join(process.cwd(), "app/radio/embed/page.tsx");
assert(fs.existsSync(embedPagePath), "app/radio/embed/page.tsx exists");
const embedContent = fs.readFileSync(embedPagePath, "utf8");
assert(embedContent.includes("useRadio"), "Embed player uses RadioContext");
assert(embedContent.includes("togglePlay"), "Embed player provides play/pause controls");
assert(embedContent.includes("switchQuality"), "Embed player includes bitrate quality switch");

const nextConfigPath = path.join(process.cwd(), "next.config.ts");
const nextConfigContent = fs.readFileSync(nextConfigPath, "utf8");
assert(nextConfigContent.includes("/radio/embed"), "next.config.ts configures dedicated headers for /radio/embed");
assert(nextConfigContent.includes("frame-ancestors *;"), "next.config.ts sets frame-ancestors * to allow embedding");
assert(!nextConfigContent.includes('key: "X-Frame-Options", value: "DENY"') || nextConfigContent.includes("((?!radio/embed).*)"), "X-Frame-Options: DENY is scoped away from /radio/embed");

// 4. Verify OpenGraph metadata on Show and Presenter pages
const showPagePath = path.join(process.cwd(), "app/radio/shows/[slug]/page.tsx");
const showPageContent = fs.readFileSync(showPagePath, "utf8");
assert(showPageContent.includes("/api/og/radio?show="), "Show detail page configures og:image pointing to /api/og/radio?show=");

const presenterPagePath = path.join(process.cwd(), "app/radio/presenters/[slug]/page.tsx");
const presenterPageContent = fs.readFileSync(presenterPagePath, "utf8");
assert(presenterPageContent.includes("/api/og/radio?presenter="), "Presenter detail page configures og:image pointing to /api/og/radio?presenter=");

// 5. Verify CatchUpVault component
const vaultPath = path.join(process.cwd(), "components/radio/CatchUpVault.tsx");
assert(fs.existsSync(vaultPath), "components/radio/CatchUpVault.tsx exists");
const vaultContent = fs.readFileSync(vaultPath, "utf8");
assert(vaultContent.includes("/api/radio/recordings"), "CatchUpVault fetches from /api/radio/recordings");
assert(vaultContent.includes("groupedByShow"), "CatchUpVault groups episodes by show");

if (failures > 0) {
  console.error(`\nFAILED: ${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nALL RADIO SHARE & EMBED CHECKS PASSED.");
}

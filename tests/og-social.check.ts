import fs from "fs";
import path from "path";

/**
 * Locks the social/SEO contract added after the 55/100 OG audit.
 *
 * The two failures this file exists to prevent:
 *   1. og:image drifting back to a portrait 896x1200 flyer of 2.8 MB - which
 *      LinkedIn refuses, WhatsApp refuses, and every platform letterboxes.
 *   2. og:image drifting back to a *hardcoded* banner per event kind, so a
 *      re-uploaded poster or a new edition shows the wrong artwork.
 */

const root = process.cwd();
const read = (p: string) => {
  const abs = path.join(root, p);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
};

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) console.log(`PASS: ${message}`);
  else {
    console.error(`FAIL: ${message}`);
    failures++;
  }
}

function pngSize(file: string): { w: number; h: number } | null {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  if (buf.length < 24) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ---------------------------------------------------------------------------
// 1. The banner is GENERATED per event, at the exact size every platform wants.
// ---------------------------------------------------------------------------
const ogLib = read("lib/og-image.tsx");
assert(ogLib !== null, "lib/og-image.tsx exists");
assert(
  !!ogLib && /export const OG_WIDTH = 1200/.test(ogLib) && /export const OG_HEIGHT = 630/.test(ogLib),
  "Banner is 1200x630 (LinkedIn/X minimum, 1.91:1)"
);
assert(
  !!ogLib && /new ImageResponse/.test(ogLib) && /ImageResponse.*from ['"]next\/og['"]/.test(ogLib),
  "Banner is rendered with next/og ImageResponse, not a checked-in image"
);
assert(
  !!ogLib && /resolveEventFlyer\(/.test(ogLib),
  "Banner artwork comes from resolveEventFlyer(), i.e. the event's own poster"
);
assert(
  !!ogLib && !/og-image\.jpg|og-park-chill\.jpg|og-goodlife\.jpg/.test(ogLib),
  "No hardcoded banner filename in the renderer"
);
assert(
  !!ogLib && /loadBrandFont|public.*BebasNeue|BebasNeue\.ttf/.test(ogLib),
  "Brand display font is loaded from public/BebasNeue.ttf"
);
assert(
  !!ogLib && /try\s*{[\s\S]*?fs\.readFile/.test(ogLib) && /catch\s*{/.test(ogLib),
  "Font/poster loading is guarded so a missing asset degrades instead of 500ing"
);

// ---------------------------------------------------------------------------
// 2. Every entry point that emits og:image is wired to the dynamic banner.
// ---------------------------------------------------------------------------
const rootImage = read("app/opengraph-image.tsx");
assert(rootImage !== null, "app/opengraph-image.tsx exists (site-wide default banner)");
assert(
  !!rootImage && /export const size = OG_SIZE/.test(rootImage) && /contentType = ['"]image\/png['"]/.test(rootImage),
  "Root banner declares the shared 1200x630 png size"
);
assert(
  !!rootImage && /resolveAnchorEvent\(\)/.test(rootImage),
  "Root banner renders the event the homepage actually anchors to"
);

const ogRoute = read("app/og/route.tsx");
assert(ogRoute !== null, "app/og/route.tsx exists (per-edition banner)");
assert(
  !!ogRoute && /searchParams\.get\(['"]event['"]\)/.test(ogRoute),
  "/og reads ?event=, so /?event=<id> shares a card for that edition"
);
assert(
  !!ogRoute && /Cache-Control/.test(ogRoute),
  "/og sets Cache-Control so scrapers do not re-render it every hit"
);
assert(
  !!ogRoute && /runtime = ['"]nodejs['"]/.test(ogRoute),
  "/og runs on the Node runtime (it queries Neon, which the Edge runtime cannot)"
);

const eventImage = read("app/events/[id]/opengraph-image.tsx");
assert(eventImage !== null, "app/events/[id]/opengraph-image.tsx exists (per-archive-page banner)");
assert(
  !!eventImage && /resolveEventByParam\(/.test(eventImage),
  "Archive banner resolves the edition from the route param"
);

// ---------------------------------------------------------------------------
// 3. Nothing may override the generated banner with the portrait flyer again.
// ---------------------------------------------------------------------------
const layout = read("app/layout.tsx");
const homepage = read("app/page.tsx");
const eventPage = read("app/events/[id]/page.tsx");

assert(
  !!layout && !/openGraph:\s*\{[\s\S]*?\bimages:/.test(layout.slice(layout.indexOf("openGraph:"))),
  "Root layout declares no openGraph.images, so opengraph-image.tsx is not overridden"
);
assert(
  !!layout && !/twitter:\s*\{[\s\S]*?\bimages:/.test(layout.slice(layout.indexOf("twitter:"))),
  "Root layout declares no twitter.images, so X inherits the generated banner"
);
assert(
  !!eventPage && !/openGraph:\s*\{[\s\S]*?\bimages:/.test(eventPage),
  "/events/[id] declares no openGraph.images, so its own banner is not overridden"
);
assert(
  !!homepage && /\/og\?event=\$\{target\.id\}/.test(homepage),
  "Homepage points og:image at /og?event=<id> (per-edition, not per-site)"
);
assert(
  !!homepage && /width: 1200/.test(homepage) && /height: 630/.test(homepage),
  "Homepage og:image declares 1200x630, not the portrait flyer's 896x1200"
);
// Exactly one og:image, and it must be the generated banner. A second 896x1200
// poster entry (added "as a fallback") made the audit tool re-report a wrong
// aspect ratio even though every platform reads the first entry.
assert(
  !/896\s*,\s*\n?\s*height: 1200|width: 896/.test(homepage || ""),
  "No 896x1200 portrait entry is advertised as og:image anywhere on the homepage"
);
assert(
  !/height: 1200/.test(homepage || "") && !/width: 896/.test(homepage || ""),
  "Homepage advertises no 1200px-tall image at all (poster dimensions only appear inside the banner)"
);
// A plain string title gets the layout template (`%s | <featured event>`)
// appended, which rendered "GOODLIFE 4 - MARARA CAMP, THIKA | GOODLIFE 4".
assert(
  !!homepage && /title:\s*\{\s*absolute:/.test(homepage),
  "Homepage title is absolute, so the layout template cannot double the event name"
);
assert(
  !!eventPage && /title:\s*\{\s*absolute:/.test(eventPage),
  "/events/[id] title is absolute, so the layout template cannot double the event name"
);

// No leftover hardcoded banner assets.
for (const stale of ["public/og-image.jpg", "public/og-park-chill.jpg", "public/og-goodlife.jpg"]) {
  assert(!fs.existsSync(path.join(root, stale)), `${stale} is gone (no hardcoded banner to go stale)`);
}
const sources = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/events/[id]/page.tsx",
  "lib/event-flyer.ts",
  "lib/seo.ts",
  "lib/og-image.tsx",
];
const offenders = sources.filter((f) => {
  const c = read(f);
  return !!c && /resolveEventOgImage|og-image\.jpg|og-park-chill\.jpg/.test(c);
});
assert(offenders.length === 0, `No source references the removed resolveEventOgImage/og-*.jpg (${offenders.join(", ") || "clean"})`);

// ---------------------------------------------------------------------------
// 4. Identity tags the audit asked for.
// ---------------------------------------------------------------------------
assert(!!layout && /siteName: SITE_NAME/.test(layout), "og:site_name present");
assert(!!layout && /locale: ['"]en_KE['"]/.test(layout), "og:locale present");
assert(!!layout && /site: TWITTER_HANDLE/.test(layout), "twitter:site present");
assert(!!layout && /apple-touch-icon\.png/.test(layout), "apple-touch-icon linked");
assert(!!layout && /favicon\.svg/.test(layout), "SVG favicon linked");
assert(!!layout && /manifest: ['"]\/site\.webmanifest['"]/.test(layout), "Web app manifest linked");
assert(
  !!layout && !/alternates:/.test(layout),
  "Root layout declares no canonical (a layout canonical would de-index every route to the homepage)"
);
assert(!!homepage && /alternates:\s*\{\s*canonical: pageUrl/.test(homepage), "Homepage declares a canonical URL");
assert(!!eventPage && /alternates:\s*\{\s*canonical: pageUrl/.test(eventPage), "/events/[id] declares a canonical URL");

// ---------------------------------------------------------------------------
// 5. Structured data, icon assets and the manifest are real files.
// ---------------------------------------------------------------------------
const structured = read("components/SeoStructuredData.tsx");
assert(!!structured, "components/SeoStructuredData.tsx exists");
assert(!!structured && /schema\.org/.test(structured) && /['"]Event['"]/.test(structured), "JSON-LD describes a schema.org Event");
assert(!!structured && /application\/ld\+json/.test(structured), "JSON-LD is emitted as ld+json");
assert(!!layout && /SeoStructuredData/.test(layout), "Root layout renders the JSON-LD");

const apple = pngSize("public/apple-touch-icon.png");
assert(apple !== null && apple.w === 180 && apple.h === 180, "public/apple-touch-icon.png is 180x180");
assert(fs.existsSync(path.join(root, "public/favicon.svg")), "public/favicon.svg exists");

const manifestPath = path.join(root, "public/site.webmanifest");
if (fs.existsSync(manifestPath)) {
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const iconsExist = Array.isArray(m.icons) && m.icons.every((i: { src: string }) => fs.existsSync(path.join(root, "public", i.src.replace(/^\//, ""))));
  assert(!!m.name && !!m.short_name && !!m.start_url, "site.webmanifest has name/short_name/start_url");
  assert(iconsExist, "every site.webmanifest icon exists on disk");
} else {
  assert(false, "public/site.webmanifest exists");
}

// ---------------------------------------------------------------------------
// 6. Copy lengths: the social description must fit a preview, the meta one the SERP.
// ---------------------------------------------------------------------------
const seoLib = read("lib/seo.ts");
assert(!!seoLib && /OG_DESCRIPTION_MAX = \d+/.test(seoLib), "Social description cap is defined");
assert(
  !!seoLib && /OG_DESCRIPTION_MAX = 124/.test(seoLib),
  "Social description cap is 124 chars (previews truncate past ~125)"
);
assert(
  !!homepage && /description: seo\.ogDescription/.test(homepage) && /description: seo\.description/.test(homepage),
  "Homepage serves the short copy to social and the long copy to search"
);
assert(
  !!seoLib && /ngrok-free\.app|localhost/.test(seoLib),
  "siteUrl() refuses to publish a tunnel/localhost as canonical or og:url"
);

if (failures > 0) {
  console.error(`\n${failures} OG/social check(s) failed.`);
  process.exit(1);
}
console.log("\nALL OG/SOCIAL CHECKS PASSED.");
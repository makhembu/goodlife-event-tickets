import { readFileSync } from "fs";
import { join } from "path";
import {
  isVideoGalleryItem,
  isVideoMediaUrl,
  resolveGalleryMediaType,
} from "../lib/gallery-media";

let failures = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

// 1. Explicit media_type wins over the URL extension.
assert(
  resolveGalleryMediaType("video", "https://i.ibb.co/poster.jpg") === "video",
  "Explicit media_type=video is trusted even when the URL looks like an image"
);
assert(
  resolveGalleryMediaType("image", "https://cdn.example.com/clip.mp4") === "image",
  "Explicit media_type=image is trusted even when the URL looks like a video"
);

// 2. Old rows (no media_type) infer from the URL, including query strings.
assert(
  resolveGalleryMediaType(undefined, "https://cdn.example.com/recap.mp4") === "video",
  "Legacy rows infer video from a .mp4 URL"
);
assert(
  resolveGalleryMediaType(undefined, "https://cdn.example.com/recap.mp4?token=abc") === "video",
  "Query strings do not hide a video extension"
);
assert(
  resolveGalleryMediaType(undefined, "https://cdn.example.com/recap.webm#t=2") === "video",
  "Fragments do not hide a video extension"
);
assert(
  resolveGalleryMediaType(undefined, "https://i.ibb.co/poster.jpg") === "image",
  "Still images infer as image"
);
assert(
  resolveGalleryMediaType(undefined, "") === "image",
  "A blank URL defaults to image instead of throwing"
);

// 3. The shared item predicate agrees with the resolver.
assert(
  isVideoGalleryItem({ media_type: "video", image_url: "https://x.test/a.jpg" }) === true,
  "isVideoGalleryItem prefers media_type"
);
assert(
  isVideoGalleryItem({ image_url: "https://x.test/a.mov" }) === true,
  "isVideoGalleryItem infers a legacy .mov item"
);
assert(
  isVideoGalleryItem({ media_type: "image", image_url: "https://x.test/a.mp4" }) === false,
  "isVideoGalleryItem respects an explicit image type"
);
assert(
  isVideoMediaUrl("javascript:alert(1)") === false,
  "Unsafe URL schemes are not treated as media"
);

// 4. The write path actually persists type + tag (this was silently dropped).
const api = readFileSync(
  join(process.cwd(), "app", "api", "hub", "gallery", "route.ts"),
  "utf8"
);
assert(
  /INSERT INTO event_gallery[\s\S]*media_type/.test(api) &&
    /INSERT INTO event_gallery[\s\S]*tag/.test(api),
  "Gallery API inserts media_type and tag, not just the legacy columns"
);
assert(
  api.includes("resolveGalleryMediaType"),
  "Gallery API normalizes media_type through the shared resolver"
);

// 5. Both surfaces render video rather than an <img> that would break.
const admin = readFileSync(
  join(process.cwd(), "app", "admin", "gallery", "page.tsx"),
  "utf8"
);
assert(
  admin.includes("uploadVideoFile") &&
    admin.includes("extractVideoPoster") &&
    admin.includes("accept=\"image/*,video/*\""),
  "Admin gallery uploads videos and extracts a poster frame"
);
assert(
  admin.includes("<video") && admin.includes("media_type: effectiveType"),
  "Admin gallery previews videos and saves their media type"
);

const publicGallery = readFileSync(
  join(process.cwd(), "app", "gallery", "page.tsx"),
  "utf8"
);
assert(
  publicGallery.includes("isVideoGalleryItem") &&
    publicGallery.includes("<video") &&
    publicGallery.includes("controls"),
  "Public gallery renders playable videos in the grid and lightbox"
);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll gallery-media tests passed successfully.");
}

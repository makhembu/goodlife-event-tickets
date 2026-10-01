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

// 1. Verify StoryDeckHero component exists
const componentPath = path.resolve(process.cwd(), "components/StoryDeckHero.tsx");
assert(fs.existsSync(componentPath), "components/StoryDeckHero.tsx file exists");

if (fs.existsSync(componentPath)) {
  const content = fs.readFileSync(componentPath, "utf-8");

  // 2. Check for dual segment story bar
  assert(
    content.includes("activeIndex") && content.includes("setActiveIndex"),
    "Component manages activeIndex state for dual media"
  );

  // 3. Check for muted state management
  assert(
    content.includes("isMuted") && content.includes("setIsMuted"),
    "Component manages audio mute/unmute state"
  );

  // 4. Check for auto-transition timer
  assert(
    content.includes("3500") || content.includes("POSTER_DURATION"),
    "Component defines auto-transition duration"
  );

  // 5. Check for video and image rendering
  assert(content.includes("<video"), "Component renders HTML5 video element");
  assert(content.includes("playsInline"), "Video element contains playsInline for mobile iOS/Android");
  assert(content.includes("Image"), "Component renders Next.js Image for poster");

  // 6. Check for tap navigation
  assert(
    content.includes("POSTER") && content.includes("TEASER"),
    "Component provides visual indicators/pills for Poster and Teaser"
  );
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll story-deck tests passed successfully.");
}

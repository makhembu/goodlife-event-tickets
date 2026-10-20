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

  // ---------------------------------------------------------------------------
  // 7. The media viewport must be the ONLY path to the lightbox, on both slides.
  //    Regression guard: invisible 30%/70% tap zones used to overlay the viewport
  //    at z-20, and the poster branch called handleSelectVideo instead of
  //    expanding. That made onExpand("poster") unreachable by tapping the poster,
  //    so the only route left was: open the video, then use the lightbox toggle.
  // ---------------------------------------------------------------------------
  assert(
    !content.includes("w-[30%]") && !content.includes("w-[70%]"),
    "No 30%/70% invisible tap zones overlay the media (they hijacked tap-to-enlarge)"
  );
  assert(
    /onClick=\{handleTriggerExpand\}/.test(content),
    "Media viewport expands on tap via handleTriggerExpand"
  );
  assert(
    content.includes('onExpand(activeIndex === 0 ? "poster" : "video")'),
    'Expand dispatches on what is on screen, so onExpand("poster") stays reachable'
  );

  // 8. The viewport is a click surface, so it must be keyboard-operable too.
  assert(
    content.includes('role="button"') &&
      content.includes("tabIndex={0}") &&
      content.includes("onKeyDown"),
    "Clickable media viewport is keyboard-operable (role/tabIndex/Enter+Space)"
  );
  assert(
    content.includes("aria-label={`Open full view of"),
    "Clickable media viewport announces what it will open"
  );

  // 9. Tapping no longer advances, so the switcher must still exist or the teaser
  //    would be reachable only by waiting out the auto-timer.
  assert(
    content.includes("handleSelectPoster") && content.includes("handleSelectVideo"),
    "POSTER/TEASER pill remains the sole slide switcher"
  );

  // 10. Dock icon buttons are 26-28px, under the 44px touch-target minimum. They
  //     carry an invisible expanded hit area so the visual size is unchanged.
  assert(
    content.includes("before:-inset-2"),
    "Dock icon buttons expose a touch target larger than their visual size"
  );

  // 11. Poster reveal is a tuned constant, not an incidental number.
  const duration = content.match(/POSTER_DURATION\s*=\s*(\d+)/);
  assert(
    duration !== null && Number(duration[1]) === 5000,
    "Poster reveal runs for 5000ms before the teaser autoplays"
  );
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll story-deck tests passed successfully.");
}

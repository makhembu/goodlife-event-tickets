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

  // 2. Ordered multi-slide deck, driven by the media array.
  assert(
    content.includes("activeIndex") && content.includes("setActiveIndex"),
    "Component manages activeIndex state for an ordered deck"
  );
  assert(
    content.includes("media?: StoryMediaItem[]") && content.includes("normalizeStoryMedia"),
    "Component accepts an ordered StoryMediaItem[] and normalizes it"
  );
  assert(
    content.includes("slides.map"),
    "Component renders one progress segment per slide"
  );
  assert(
    content.includes("handlePrev") && content.includes("handleNext"),
    "Deck exposes explicit previous/next controls for multi-slide decks"
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
  assert(
    content.includes("poster={activeSlide.poster_url || deckPoster}"),
    "Video slide paints its extracted poster (or the deck poster) while buffering"
  );

  // 6. Check for media type indicators. Multi-slide decks show a counter; a
  //    single-slide deck still names the medium.
  assert(
    content.includes("POSTER") && content.includes("TEASER"),
    "Component provides visual indicators for Poster and Teaser media"
  );

  // ---------------------------------------------------------------------------
  // 7. The media viewport must be the ONLY path to the lightbox, on every slide.
  //    Regression guard: invisible 30%/70% tap zones used to overlay the viewport
  //    at z-20, and the poster branch called the video switcher instead of
  //    expanding. Navigation lives in the dock and segment bars, never in
  //    invisible overlays.
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
    content.includes("onExpand?.(activeSlide)"),
    "Expand dispatches the slide that is actually on screen (poster or video)"
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

  // 9. Loading discipline: current video may preload; the next video gets
  //    metadata only after a delay; slides after that are never fetched.
  assert(
    content.includes('preload="auto"') &&
      content.includes('preload="metadata"') &&
      content.includes("NEXT_VIDEO_WARM_DELAY"),
    "Current video preloads, next video warms metadata only, rest stay unfetched"
  );
  assert(
    content.includes("slides[activeIndex + 1]"),
    "Warm-up is scoped to exactly one slide ahead"
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
    "Poster reveal runs for 5000ms before the deck advances"
  );

  // 12. The deck must pause when it is off-screen or the lightbox is open, so
  //     a background tab never chews through mobile data.
  assert(
    content.includes("IntersectionObserver") && content.includes("isExpanded"),
    "Deck pauses timers/video when off-screen or in the lightbox"
  );
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll story-deck tests passed successfully.");
}

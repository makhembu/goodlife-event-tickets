import {
  resolveEventFlyer,
  resolveEventVideo,
  DEFAULT_FLAGSHIP_FLYER,
  DEFAULT_MINI_FLYER,
  DEFAULT_FLAGSHIP_VIDEO,
  DEFAULT_MINI_VIDEO,
} from "../lib/event-flyer";
import { MAX_STORY_ITEMS, normalizeStoryMedia, resolveStoryMedia } from "../lib/story-media";

let failures = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

// 1. Default Flagship Video Resolution
const flagshipDefault = resolveEventVideo({
  id: 1,
  title: "GOODLIFE 5",
  category: "flagship",
  video_url: null,
});
assert(
  flagshipDefault === DEFAULT_FLAGSHIP_VIDEO,
  `Flagship event defaults to R2 bucket video (got: ${flagshipDefault})`
);

// 2. Default Park & Chill Video Resolution
const miniDefault = resolveEventVideo({
  id: 3,
  title: "Sunday Park & Chill",
  category: "mini",
  video_url: null,
});
assert(
  miniDefault === DEFAULT_MINI_VIDEO,
  `Mini event defaults to R2 bucket video (got: ${miniDefault})`
);

// 3. Custom Video URL Override
const customVideo = resolveEventVideo({
  id: 4,
  title: "Special Edition",
  video_url: "https://media.smwhr.space/special.mp4",
});
assert(
  customVideo === "https://media.smwhr.space/special.mp4",
  `Custom video_url is preserved (got: ${customVideo})`
);

// 4. Null / Undefined Event Handling
const nullEvent = resolveEventVideo(null);
assert(
  nullEvent === DEFAULT_FLAGSHIP_VIDEO,
  `Null event defaults safely to R2 bucket video (got: ${nullEvent})`
);

// 4b. Legacy local path migration
const legacyEvent = resolveEventVideo({
  id: 5,
  title: "Legacy Event",
  video_url: "/videos/goodlife-hype.mp4",
});
assert(
  legacyEvent === DEFAULT_FLAGSHIP_VIDEO,
  `Legacy /videos/goodlife-hype.mp4 path translates to Cloudflare R2 bucket (got: ${legacyEvent})`
);

// 5. Default Flagship Flyer Resolution (Unset flyer_url)
const flagshipDefaultFlyer = resolveEventFlyer({
  title: "GOODLIFE 5",
  category: "flagship",
  flyer_url: null,
});
assert(
  flagshipDefaultFlyer === DEFAULT_FLAGSHIP_FLYER,
  `Flagship event defaults to R2 bucket poster (got: ${flagshipDefaultFlyer})`
);

// 6. Default Park & Chill Flyer Resolution (Unset flyer_url)
const miniDefaultFlyer = resolveEventFlyer({
  title: "Park & Chill",
  category: "mini",
  flyer_url: null,
});
assert(
  miniDefaultFlyer === DEFAULT_MINI_FLYER,
  `Mini event defaults to R2 bucket poster (got: ${miniDefaultFlyer})`
);

// 7. Explicit /flyer.png legacy path translation
const flagshipSundayFlyer = resolveEventFlyer({
  title: "GOODLIFE 4",
  subtitle: "Live on Sunday",
  category: "flagship",
  flyer_url: "/flyer.png",
});
assert(
  flagshipSundayFlyer === DEFAULT_FLAGSHIP_FLYER,
  `Explicit /flyer.png translates to Cloudflare R2 bucket poster (got: ${flagshipSundayFlyer})`
);

// 8. Custom Flyer URL Override
const customFlyer = resolveEventFlyer({
  title: "Special Edition",
  flyer_url: "https://i.ibb.co/custom-poster.jpg",
});
assert(
  customFlyer === "https://i.ibb.co/custom-poster.jpg",
  `Custom flyer_url is preserved (got: ${customFlyer})`
);

// 9. Null / Undefined Event Flyer Handling
const nullFlyer = resolveEventFlyer(null);
assert(
  nullFlyer === DEFAULT_FLAGSHIP_FLYER,
  `Null event flyer defaults safely to R2 bucket poster (got: ${nullFlyer})`
);

// 10. Custom story media keeps its saved order and its extracted video poster.
const customStory = resolveStoryMedia({
  story_media: [
    { kind: "video", url: "https://files.catbox.moe/teaser.mp4", poster_url: "https://i.ibb.co/frame.jpg", duration: 12.5 },
    { kind: "poster", url: "https://i.ibb.co/poster-two.jpg" },
    { kind: "poster", url: "/flyer.png" },
  ],
});
assert(
  customStory.length === 3 &&
    customStory[0].kind === "video" &&
    customStory[0].poster_url === "https://i.ibb.co/frame.jpg" &&
    customStory[1].url === "https://i.ibb.co/poster-two.jpg" &&
    customStory[2].url === "/flyer.png",
  "Custom story_media is used verbatim, in order, with poster frames"
);

// 11. Empty story_media falls back to the old poster + resolved teaser pair.
const fallbackStory = resolveStoryMedia({
  story_media: [],
  flyer_url: "https://i.ibb.co/custom-poster.jpg",
  video_url: null,
  category: "flagship",
});
assert(
  fallbackStory.length === 2 &&
    fallbackStory[0].kind === "poster" &&
    fallbackStory[0].url === "https://i.ibb.co/custom-poster.jpg" &&
    fallbackStory[1].kind === "video" &&
    fallbackStory[1].url === DEFAULT_FLAGSHIP_VIDEO,
  "No story_media preserves the legacy poster + default teaser behaviour"
);

// 12. Malformed rows are dropped instead of rendered as broken slides.
const dirtyStory = normalizeStoryMedia([
  null,
  "not-an-object",
  { kind: "audio", url: "https://example.com/a.mp3" },
  { kind: "poster", url: "javascript:alert(1)" },
  { kind: "poster", url: "data:image/png;base64,AAAA" },
  { kind: "poster", url: "/ok.png" },
]);
assert(
  dirtyStory.length === 1 && dirtyStory[0].url === "/ok.png",
  "Unknown kinds and unsafe URLs are rejected; relative media survives"
);

// 13. The deck is capped so one editor cannot unload a whole season of video.
const cappedStory = normalizeStoryMedia(
  Array.from({ length: MAX_STORY_ITEMS + 4 }, (_, i) => ({
    kind: "poster",
    url: `/poster-${i}.png`,
  }))
);
assert(
  cappedStory.length === MAX_STORY_ITEMS,
  `Story decks are capped at ${MAX_STORY_ITEMS} slides (got: ${cappedStory.length})`
);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll event-media tests passed successfully.");
}

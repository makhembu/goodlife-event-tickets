import { resolveEventFlyer, resolveEventVideo } from "../lib/event-flyer";

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
  flagshipDefault === "/videos/goodlife-hype.mp4",
  `Flagship event defaults to /videos/goodlife-hype.mp4 (got: ${flagshipDefault})`
);

// 2. Default Park & Chill Video Resolution
const miniDefault = resolveEventVideo({
  id: 3,
  title: "Sunday Park & Chill",
  category: "mini",
  video_url: null,
});
assert(
  miniDefault === "/videos/park-chill-speakers.mp4",
  `Mini event defaults to /videos/park-chill-speakers.mp4 (got: ${miniDefault})`
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
  nullEvent === "/videos/goodlife-hype.mp4",
  `Null event defaults safely to /videos/goodlife-hype.mp4 (got: ${nullEvent})`
);

// 5. Default Flagship Flyer Resolution (Unset flyer_url)
const flagshipDefaultFlyer = resolveEventFlyer({
  title: "GOODLIFE 5",
  category: "flagship",
  flyer_url: null,
});
assert(
  flagshipDefaultFlyer === "/flyer.png",
  `Flagship event defaults to /flyer.png (got: ${flagshipDefaultFlyer})`
);

// 6. Default Park & Chill Flyer Resolution (Unset flyer_url)
const miniDefaultFlyer = resolveEventFlyer({
  title: "Park & Chill",
  category: "mini",
  flyer_url: null,
});
assert(
  miniDefaultFlyer === "/flyer-park-chill.png",
  `Mini event defaults to /flyer-park-chill.png (got: ${miniDefaultFlyer})`
);

// 7. Explicit /flyer.png with "Sunday" in Subtitle (Sentinel trap prevention)
const flagshipSundayFlyer = resolveEventFlyer({
  title: "GOODLIFE 4",
  subtitle: "Live on Sunday",
  category: "flagship",
  flyer_url: "/flyer.png",
});
assert(
  flagshipSundayFlyer === "/flyer.png",
  `Explicit /flyer.png is preserved even if subtitle mentions Sunday (got: ${flagshipSundayFlyer})`
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
  nullFlyer === "/flyer.png",
  `Null event flyer defaults safely to /flyer.png (got: ${nullFlyer})`
);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll event-media tests passed successfully.");
}

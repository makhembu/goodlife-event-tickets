import fs from "fs";
import path from "path";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

function runTest() {
  console.log("Running Task 6: Shared AudioContext Verification...\n");

  const scannerCode = fs.readFileSync(path.join(__dirname, "../app/scanner/page.tsx"), "utf8");

  check("Shared AudioContext ref is declared", scannerCode.includes("sharedAudioCtxRef = useRef<AudioContext | null>(null);"));
  check("initOrResumeAudio helper exists and handles suspended state", 
    scannerCode.includes("sharedAudioCtxRef.current.state === \"suspended\"") &&
    scannerCode.includes("sharedAudioCtxRef.current.resume();")
  );
  check("Global touchstart and click listeners unlock audio on first interaction", 
    scannerCode.includes('window.addEventListener("touchstart", handleFirstTap') &&
    scannerCode.includes('window.addEventListener("click", handleFirstTap')
  );
  check("Sound toggle button unlocks/resumes audio on enable", 
    scannerCode.includes("if (next) initOrResumeAudio();")
  );
  check("triggerFeedback uses shared AudioContext instead of calling new AudioCtx() each time", 
    scannerCode.includes("const ctx = sharedAudioCtxRef.current;") &&
    !scannerCode.includes("const ctx = new AudioCtx();")
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

runTest();

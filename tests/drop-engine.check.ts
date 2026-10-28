import fs from "fs";
import path from "path";
import {
  buildDropPrompt,
  validateDropScript,
  getCurrentDaypart,
  resolveDaypartPersona,
} from "../lib/radio/drop-engine";
import {
  verifyDropBeforePlayout,
  selectGenericReviewedDrop,
} from "../lib/radio/drop-gate";
import { DropVerifiedFacts, GeneratedDropRecord } from "../lib/radio/drop-types";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passCount++;
  } else {
    console.error(`  FAIL: ${name}${detail ? ` - ${detail}` : ""}`);
    failCount++;
  }
}

async function run() {
  console.log("=== Goodlife Radio 254: Drop Engine v2 & Drop Gate Verification ===\n");

  // 1. Daypart and Persona Resolution
  const morningDaypart = getCurrentDaypart(new Date("2026-10-28T05:00:00Z")); // 08:00 EAT
  assert(morningDaypart === "morning", "08:00 EAT maps to morning daypart");

  const eveningDaypart = getCurrentDaypart(new Date("2026-10-28T17:00:00Z")); // 20:00 EAT
  assert(eveningDaypart === "peak_evening", "20:00 EAT maps to peak_evening daypart");

  const amina = resolveDaypartPersona("morning");
  assert(amina.id === "amina", "Morning resolves to Amina");

  const shax = resolveDaypartPersona("peak_evening");
  assert(shax.id === "dj-shax", "Peak evening resolves to DJ Shax");

  // 2. Prompt Builder (70% English / 30% Sheng Instruction)
  const facts: DropVerifiedFacts = {
    station_callout: "GOODLIFE Radio 254",
    daypart: "afternoon",
    persona: "MC Cheche",
    current_genre: "amapiano",
    event: {
      id: 2,
      name_spoken: "Goodlife 4",
      venue_spoken: "Marara Camp",
      countdown_phrase: "in 10 days",
      gates_open_phrase: "gates open at noon",
      spoken_ticket_url: "tickets on the Goodlife website",
      tiers: [{ name: "Early Bird Pass", price: 450, price_spoken: "four hundred and fifty shillings" }],
      lineup: [],
      facts_hash: "abcd1234hash",
      valid_until: new Date("2026-10-30T18:00:00Z"),
    },
  };

  const { system, user } = buildDropPrompt(facts, 10, ["Previous drop line"]);
  assert(system.includes("70% Kenyan English, 30% Sheng"), "Prompt specifies 70% English / 30% Sheng mix");
  assert(system.includes("STRICT FORBIDDEN LIST"), "Prompt includes strict forbidden list");
  assert(user.includes("four hundred and fifty shillings"), "User facts include precomputed price in words");

  // 3. Drop Validator: Valid Pass
  const validOutput = JSON.stringify({
    tag: "[excited]",
    text: "MC Cheche on GOODLIFE Radio 254! Goodlife 4 is happening in 10 days at Marara Camp, gates open at noon. Early Bird Pass is only four hundred and fifty shillings, tickets on the Goodlife website. Wasee wa mtaa mnashika aje, rada ni safi!",
  });
  const val1 = validateDropScript(validOutput, facts, 15);
  assert(val1.valid, "Valid grounded script with 70% English & 30% Sheng passes validation", val1.errors.join("; "));

  // 4. Drop Validator: Rejects Preambles
  const preambleOutput = JSON.stringify({
    tag: "[excited]",
    text: "Here is your radio drop: MC Cheche live on air!",
  });
  const val2 = validateDropScript(preambleOutput, facts, 10);
  assert(!val2.valid && val2.errors.some((e) => e.includes("Preamble")), "Validator rejects AI preambles");

  // 5. Drop Validator: Rejects Markdown & Emojis
  const markdownOutput = JSON.stringify({
    tag: "[excited]",
    text: "**GOODLIFE Radio 254**! 🔥 Early Bird is four hundred and fifty shillings!",
  });
  const val3 = validateDropScript(markdownOutput, facts, 10);
  assert(!val3.valid && val3.errors.some((e) => e.includes("Markdown")), "Validator rejects markdown formatting");

  // 6. Drop Validator: Rejects Stray Digits (Must Use Spoken Words)
  const strayDigitsOutput = JSON.stringify({
    tag: "[excited]",
    text: "Tickets are 450 shillings on the site!",
  });
  const val4 = validateDropScript(strayDigitsOutput, facts, 10);
  assert(!val4.valid && val4.errors.some((e) => e.includes("rogue digits")), "Validator rejects raw digits like '450'");

  // 7. Drop Validator: Rejects Unconfirmed Artists
  const unconfirmedArtistOutput = JSON.stringify({
    tag: "[excited]",
    text: "Goodlife 4 with Wakadinali performing live!",
  });
  const val5 = validateDropScript(unconfirmedArtistOutput, facts, 10);
  assert(!val5.valid && val5.errors.some((e) => e.includes("unconfirmed artist")), "Validator rejects invented unconfirmed artists");

  // 8. Drop Validator: Rejects Forbidden Strings
  const forbiddenOutput = JSON.stringify({
    tag: "[excited]",
    text: "Get tickets at goodlife.co.ke on 98.4 FM!",
  });
  const val6 = validateDropScript(forbiddenOutput, facts, 10);
  assert(!val6.valid && val6.errors.length >= 2, "Validator rejects forbidden '.co.ke' and '98.4'");

  // 9. Drop Gate: Discards Expired Drops
  const expiredDrop: GeneratedDropRecord = {
    id: "drop_expired_01",
    drop_type: "ticket_push",
    persona_id: "mc-cheche",
    persona_name: "MC Cheche",
    voice_id: "6801890ec345469d8818129e5bdd50dd",
    tag: "[excited]",
    script: "Early Bird Pass four hundred and fifty shillings!",
    audio_url: "https://example.com/drop.mp3",
    event_id: 2,
    facts_hash: "hash123",
    valid_until: new Date("2026-10-30T18:00:00Z"), // Passed deadline
    created_at: new Date("2026-10-30T17:50:00Z"),
    provider: "groq",
    model_id: "qwen/qwen3.8-27b",
    latency_ms: 250,
    is_generic_fallback: false,
  };

  const gateResultExpired = await verifyDropBeforePlayout(
    expiredDrop,
    null,
    new Date("2026-10-30T18:05:00Z") // 5 mins after deadline
  );
  assert(!gateResultExpired.allowed, "Drop Gate rejects drop past valid_until");
  assert(gateResultExpired.final_drop.is_generic_fallback, "Drop Gate substitutes reviewed generic drop when expired");

  // 10. Drop Gate: Discards on Facts Hash Mismatch
  const modifiedDrop: GeneratedDropRecord = {
    ...expiredDrop,
    valid_until: new Date("2026-11-05T00:00:00Z"),
    facts_hash: "outdated_stale_hash",
  };
  const gateResultHashMismatch = await verifyDropBeforePlayout(
    modifiedDrop,
    null,
    new Date("2026-10-28T12:00:00Z")
  );
  assert(!gateResultHashMismatch.allowed, "Drop Gate rejects drop when facts_hash does not match live Neon state");
  assert(gateResultHashMismatch.reason === "facts_hash_mismatch", "Reason is facts_hash_mismatch");

  // 11. Generic Drop Library Rotation (Anti-Repetition)
  const g1 = selectGenericReviewedDrop("amina", "morning");
  const g2 = selectGenericReviewedDrop("amina", "morning");
  assert(g1.id !== g2.id, "Generic drop library rotates without immediate repeat");
  assert(!g1.script.includes("98.4"), "Generic drop contains no '98.4'");
  assert(!g1.script.includes("Marara"), "Generic drop contains no 'Marara'");

  console.log(`\nResults: ${passCount} PASSED, ${failCount} FAILED`);
  if (failCount > 0) process.exit(1);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

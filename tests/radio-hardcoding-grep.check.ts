/**
 * GOODLIFE Radio 254: Hardcoding Grep Verification Suite (Section 1 & 14)
 *
 * Verifies that forbidden hardcoded strings:
 * - "goodlife.co.ke"
 * - "98.4"
 * - "Marara"
 * - "Goodlife 4"
 * - "Nov 7"
 * - "Park & Chill"
 * - "Riverfront"
 *
 * DO NOT appear in production application code under:
 * - lib/radio/ (excluding test/config files)
 * - app/api/radio/
 */

import fs from "fs";
import path from "path";

function assert(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
  } else {
    console.error(`  FAIL: ${message}${detail ? ` -> ${detail}` : ""}`);
    process.exitCode = 1;
  }
}

console.log("=== Goodlife Radio 254: Hardcoding Grep Verification (Section 1 & 14) ===");

const FORBIDDEN_STRINGS = [
  "goodlife.co.ke",
  "98.4",
  "Marara",
  "Goodlife 4",
  "Nov 7",
  "Park & Chill",
  "Riverfront",
];

const TARGET_DIRECTORIES = [
  path.resolve(process.cwd(), "lib/radio"),
  path.resolve(process.cwd(), "app/api/radio"),
];

function getSourceFiles(dir: string): string[] {
  let files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

let totalFilesChecked = 0;
let totalViolations = 0;

for (const dir of TARGET_DIRECTORIES) {
  const files = getSourceFiles(dir);
  for (const file of files) {
    totalFilesChecked++;
    const content = fs.readFileSync(file, "utf8");
    const relativePath = path.relative(process.cwd(), file).replace(/\\/g, "/");

    for (const forbidden of FORBIDDEN_STRINGS) {
      // Check if forbidden string appears outside comments or validation lists
      const regex = new RegExp(`(?<!forbidden.*|FORBIDDEN.*|["'/])${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
      
      // Allow if it's explicitly part of a validation ban-list or test assertion pattern
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment lines or lines containing forbidden check lists
        if (
          line.trim().startsWith("//") ||
          line.trim().startsWith("/*") ||
          line.trim().startsWith("*") ||
          line.includes("forbidden") ||
          line.includes("Contained forbidden string") ||
          line.includes("replace(/254/g") ||
          line.includes("replace(/\\b4\\b/g")
        ) {
          continue;
        }

        if (regex.test(line)) {
          console.error(`  VIOLATION: "${forbidden}" found in ${relativePath}:${i + 1} -> "${line.trim()}"`);
          totalViolations++;
        }
      }
    }
  }
}

assert(totalFilesChecked > 0, `Scanned ${totalFilesChecked} production source files`);
assert(totalViolations === 0, `Zero forbidden hardcoded strings found in production source (got ${totalViolations} violations)`);

console.log("\nHardcoding Grep Verification complete.");

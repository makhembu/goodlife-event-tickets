import fs from "fs";
import path from "path";

const manifests = [
  { file: "public/manifests/vendor.json", id: "/vendor/", scope: "/vendor/", start_url: "/vendor/sell", name: "GOODLIFE Vendor POS" },
  { file: "public/manifests/scanner.json", id: "/scanner/", scope: "/scanner/", start_url: "/scanner", name: "GOODLIFE Gate Scanner" },
  { file: "public/manifests/admin.json", id: "/admin/", scope: "/admin/", start_url: "/admin/dashboard", name: "GOODLIFE Admin" },
];

let failed = false;

// Check that root app/manifest.ts does NOT exist so it doesn't bleed site-wide
const rootManifest = path.join(process.cwd(), "app/manifest.ts");
if (fs.existsSync(rootManifest)) {
  console.error("FAIL: Root app/manifest.ts still exists. It must be removed so public users aren't forced into Vendor POS.");
  failed = true;
} else {
  console.log("PASS: Root app/manifest.ts successfully removed.");
}

for (const m of manifests) {
  const filePath = path.join(process.cwd(), m.file);
  if (!fs.existsSync(filePath)) {
    console.error(`FAIL: Missing ${m.file}`);
    failed = true;
    continue;
  }
  const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (content.id !== m.id) { console.error(`FAIL: ${m.file} id expected ${m.id}, got ${content.id}`); failed = true; }
  if (content.scope !== m.scope) { console.error(`FAIL: ${m.file} scope expected ${m.scope}, got ${content.scope}`); failed = true; }
  if (content.start_url !== m.start_url) { console.error(`FAIL: ${m.file} start_url expected ${m.start_url}, got ${content.start_url}`); failed = true; }
  if (content.name !== m.name) { console.error(`FAIL: ${m.file} name expected ${m.name}, got ${content.name}`); failed = true; }
  if (content.display !== "standalone") { console.error(`FAIL: ${m.file} display expected standalone`); failed = true; }
  console.log(`PASS: Validated ${m.file} (scope=${content.scope}, start_url=${content.start_url})`);
}

if (failed) {
  console.error("Manifest tests failed.");
  process.exit(1);
}
console.log("\nALL MANIFEST TESTS PASSED.");

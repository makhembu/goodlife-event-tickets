import fs from "fs";
import path from "path";

/**
 * Static route guard verification test.
 * Scans app/api/admin/** /route.ts plus events & event-details mutation routes.
 * Fails if any exported handler lacks requireAdmin or requireScannerOrAdmin.
 *
 * 100% offline, 0 DB imports/queries.
 */

function walkDir(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else if (file === "route.ts") {
      results.push(fullPath);
    }
  }
  return results;
}

const ALLOWLIST = new Set([
  "app/api/admin/login/route.ts",
  "app/api/admin/logout/route.ts",
  "app/api/admin/me/route.ts",
]);

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

interface RouteCheckResult {
  file: string;
  exportedMethods: string[];
  passed: boolean;
  reason?: string;
}

function checkAdminRoutes(): { total: number; passed: number; failures: RouteCheckResult[] } {
  const adminRoutes = walkDir("app/api/admin");
  const failures: RouteCheckResult[] = [];
  let total = 0;

  for (const fullPath of adminRoutes) {
    const normalized = fullPath.replace(/\\/g, "/");
    total++;

    if (ALLOWLIST.has(normalized)) {
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf-8");

    // Detect exported HTTP methods
    const exportedMethods: string[] = [];
    for (const method of HTTP_METHODS) {
      const exportRegex = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`);
      if (exportRegex.test(content)) {
        exportedMethods.push(method);
      }
    }

    if (exportedMethods.length === 0) {
      continue;
    }

    const hasRequireAdmin = content.includes("requireAdmin");
    const hasRequireScanner = content.includes("requireScannerOrAdmin");

    if (!hasRequireAdmin && !hasRequireScanner) {
      failures.push({
        file: normalized,
        exportedMethods,
        passed: false,
        reason: "Lacks requireAdmin or requireScannerOrAdmin in file"
      });
    }
  }

  return { total, passed: total - failures.length, failures };
}

function checkMutationRoutes(): { file: string; method: string; passed: boolean; reason?: string }[] {
  const mutationRoutes = [
    { file: "app/api/event-details/route.ts", method: "PUT" },
    { file: "app/api/events/route.ts", method: "POST" },
    { file: "app/api/events/[id]/route.ts", method: "PUT" },
    { file: "app/api/events/[id]/archive/route.ts", method: "POST" }
  ];

  const results = [];

  for (const item of mutationRoutes) {
    const normalized = item.file.replace(/\\/g, "/");
    if (!fs.existsSync(item.file)) {
      results.push({ file: normalized, method: item.method, passed: false, reason: "File not found" });
      continue;
    }

    const content = fs.readFileSync(item.file, "utf-8");
    const exportRegex = new RegExp(`export\\s+(async\\s+)?function\\s+${item.method}\\b`);
    const exportsMethod = exportRegex.test(content);
    const hasRequireAdmin = content.includes("requireAdmin");

    if (!exportsMethod) {
      results.push({ file: normalized, method: item.method, passed: false, reason: `Does not export ${item.method}` });
    } else if (!hasRequireAdmin) {
      results.push({ file: normalized, method: item.method, passed: false, reason: `Missing requireAdmin guard` });
    } else {
      results.push({ file: normalized, method: item.method, passed: true });
    }
  }

  return results;
}

function run() {
  console.log("=== Checking Admin & Mutation Route Guards (Offline AST/Static Check) ===");

  const { total, passed, failures } = checkAdminRoutes();
  console.log(`Scanned ${total} admin routes. Passed: ${passed}, Failed: ${failures.length}`);

  if (failures.length > 0) {
    console.error("FAIL: The following admin routes are missing in-handler auth guards:");
    for (const f of failures) {
      console.error(`  - ${f.file} (methods: ${f.exportedMethods.join(", ")}): ${f.reason}`);
    }
  }

  const mutationResults = checkMutationRoutes();
  console.log(`Scanned ${mutationResults.length} non-admin mutation routes.`);
  const mutationFailures = mutationResults.filter(r => !r.passed);

  if (mutationFailures.length > 0) {
    console.error("FAIL: The following non-admin mutation routes failed guard checks:");
    for (const f of mutationFailures) {
      console.error(`  - ${f.file} [${f.method}]: ${f.reason}`);
    }
  }

  for (const m of mutationResults) {
    if (m.passed) {
      console.log(`  ✓ ${m.file} [${m.method}] properly guarded by requireAdmin`);
    }
  }

  const totalFailures = failures.length + mutationFailures.length;
  if (totalFailures === 0) {
    console.log("\nPASS: All admin and mutation routes are properly guarded.");
    process.exit(0);
  } else {
    console.error(`\nFAIL: Total failures: ${totalFailures}`);
    process.exit(1);
  }
}

run();

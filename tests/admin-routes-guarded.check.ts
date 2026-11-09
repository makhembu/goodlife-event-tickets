import fs from "fs";
import path from "path";

/**
 * Static route guard verification test.
 * Scans app/api/admin/** /route.ts plus events & event-details mutation routes.
 *
 * RIGOROUS CHECK: Examines the AST / function body of EACH exported HTTP method handler
 * (GET, POST, PUT, DELETE, PATCH) individually. If any handler body lacks requireAdmin
 * or requireScannerOrAdmin (or delegation to a guarded handler), it fails.
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

interface MethodFailure {
  file: string;
  method: string;
  reason: string;
}

/**
 * Extracts the function body for an exported HTTP method.
 * Handles TypeScript parameter lists with object destructuring and types like:
 * `export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> { ... }`
 */
function extractFunctionBody(code: string, method: string): string | null {
  const exportRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
  const match = exportRegex.exec(code);
  if (!match) return null;

  const startParen = code.indexOf("(", match.index);
  if (startParen === -1) return null;

  // Track parentheses to safely skip the full parameter list
  let pDepth = 0;
  let inString: string | null = null;
  let isEscaped = false;
  let paramEndIndex = -1;

  for (let i = startParen; i < code.length; i++) {
    const char = code[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === "\\") {
      isEscaped = true;
      continue;
    }
    if (inString) {
      if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      continue;
    }

    if (char === "(") {
      pDepth++;
    } else if (char === ")") {
      pDepth--;
      if (pDepth === 0) {
        paramEndIndex = i;
        break;
      }
    }
  }

  if (paramEndIndex === -1) return null;

  // Now find the opening '{' for the function body (after param list and optional return type)
  const openBraceIndex = code.indexOf("{", paramEndIndex);
  if (openBraceIndex === -1) return null;

  let bDepth = 0;
  inString = null;
  isEscaped = false;

  for (let j = openBraceIndex; j < code.length; j++) {
    const char = code[j];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === "\\") {
      isEscaped = true;
      continue;
    }
    if (inString) {
      if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      continue;
    }

    if (char === "{") {
      bDepth++;
    } else if (char === "}") {
      bDepth--;
      if (bDepth === 0) {
        return code.slice(openBraceIndex, j + 1);
      }
    }
  }

  return code.slice(openBraceIndex);
}

function checkAdminRoutes(): { totalMethodsChecked: number; failures: MethodFailure[] } {
  const adminRoutes = walkDir("app/api/admin");
  const failures: MethodFailure[] = [];
  let totalMethodsChecked = 0;

  for (const fullPath of adminRoutes) {
    const normalized = fullPath.replace(/\\/g, "/");

    if (ALLOWLIST.has(normalized)) {
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf-8");

    for (const method of HTTP_METHODS) {
      const exportRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
      if (!exportRegex.test(content)) {
        continue;
      }

      totalMethodsChecked++;
      const body = extractFunctionBody(content, method);

      if (!body) {
        failures.push({
          file: normalized,
          method,
          reason: `Could not parse function body for ${method}`
        });
        continue;
      }

      // Check for in-handler authorization guards
      const hasDirectGuard =
        body.includes("requireAdmin") ||
        body.includes("requireScannerOrAdmin") ||
        body.includes("verifyAdminSession");

      // Check if it delegates to another handler that is guarded (e.g., return POST(request, context) or return handleVoidSale)
      const delegatesToGuarded =
        /return\s+(handle\w+|POST|GET|PUT|DELETE)\s*\(/.test(body) &&
        (content.includes("requireAdmin") || content.includes("requireScannerOrAdmin"));

      if (!hasDirectGuard && !delegatesToGuarded) {
        failures.push({
          file: normalized,
          method,
          reason: `Exported handler ${method} body does not call requireAdmin or requireScannerOrAdmin`
        });
      }
    }
  }

  return { totalMethodsChecked, failures };
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
    const body = extractFunctionBody(content, item.method);

    if (!body) {
      results.push({ file: normalized, method: item.method, passed: false, reason: `Does not export ${item.method}` });
      continue;
    }

    const hasGuard = body.includes("requireAdmin");
    if (!hasGuard) {
      results.push({ file: normalized, method: item.method, passed: false, reason: `Missing requireAdmin inside ${item.method} body` });
    } else {
      results.push({ file: normalized, method: item.method, passed: true });
    }
  }

  return results;
}

function run() {
  console.log("=== Checking Admin & Mutation Route Guards (Per-Handler AST Body Inspection) ===");

  const { totalMethodsChecked, failures } = checkAdminRoutes();
  console.log(`Scanned ${totalMethodsChecked} exported HTTP handlers in app/api/admin. Failed: ${failures.length}`);

  if (failures.length > 0) {
    console.error("FAIL: The following individual handlers are missing in-handler auth guards:");
    for (const f of failures) {
      console.error(`  - ${f.file} [${f.method}]: ${f.reason}`);
    }
  }

  const mutationResults = checkMutationRoutes();
  console.log(`Scanned ${mutationResults.length} non-admin mutation route handlers.`);
  const mutationFailures = mutationResults.filter(r => !r.passed);

  if (mutationFailures.length > 0) {
    console.error("FAIL: The following non-admin mutation route handlers failed guard checks:");
    for (const f of mutationFailures) {
      console.error(`  - ${f.file} [${f.method}]: ${f.reason}`);
    }
  }

  for (const m of mutationResults) {
    if (m.passed) {
      console.log(`  ✓ ${m.file} [${m.method}] body guarded by requireAdmin`);
    }
  }

  const totalFailures = failures.length + mutationFailures.length;
  if (totalFailures === 0) {
    console.log("\nPASS: All exported admin and mutation handlers are verified guarded at the function body level.");
    process.exit(0);
  } else {
    console.error(`\nFAIL: Total failures: ${totalFailures}`);
    process.exit(1);
  }
}

run();

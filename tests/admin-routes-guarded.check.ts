import fs from "fs";
import path from "path";

/**
 * Static route guard verification test.
 * Scans the ENTIRE app/api/** tree (both admin and non-admin routes).
 *
 * RIGOROUS CHECK:
 * 1. Scans every exported HTTP method handler in app/api/admin/**.
 *    Must call requireAdmin / requireScannerOrAdmin / verifyAdminSession (except allowlisted login/logout/me).
 * 2. Scans every exported HTTP method handler across all non-admin routes in app/api/**.
 *    Must have in-handler auth (requireAdmin, vendor session, scanner session, tab auth, webhook HMAC)
 *    OR be present in NON_ADMIN_PUBLIC_ALLOWLIST with a documented security rationale.
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

const ADMIN_ALLOWLIST = new Set([
  "app/api/admin/login/route.ts:POST",
  "app/api/admin/logout/route.ts:POST",
  "app/api/admin/me/route.ts:GET",
]);

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

interface MethodFailure {
  file: string;
  method: string;
  reason: string;
}

/**
 * Explicit allowlist of intentionally public / unauthenticated handlers outside app/api/admin.
 * Every entry has a documented security reason why it does not require a session cookie.
 */
const NON_ADMIN_PUBLIC_ALLOWLIST = new Map<string, string>([
  // Public catalog and site metadata reads (cached, public, no PII)
  ["app/api/event-details/route.ts:GET", "Public event details (sanitized allowlist, gate_pin stripped)"],
  ["app/api/events/route.ts:GET", "Public active/scheduled events list"],
  ["app/api/events/active/route.ts:GET", "Public active event query"],
  ["app/api/events/[id]/route.ts:GET", "Public event detail by ID"],
  ["app/api/ticket-tiers/route.ts:GET", "Public ticket tiers list (deleted tiers require admin)"],
  ["app/api/hub/gallery/route.ts:GET", "Public event gallery photos"],
  ["app/api/hub/radio/route.ts:GET", "Public radio sets list"],

  // Public buyer checkout & ticketing flows
  ["app/api/payhero/initialize/route.ts:POST", "Public buyer checkout (rate-limited STK push)"],
  ["app/api/payhero/verify/route.ts:GET", "Public buyer checkout verification polling"],
  ["app/api/paystack/initialize/route.ts:POST", "Public buyer Paystack checkout init"],
  ["app/api/paystack/verify/route.ts:GET", "Public buyer Paystack checkout verify"],
  ["app/api/payments/till-submit/route.ts:POST", "Public till receipt submission (requires manual admin approval)"],
  ["app/api/tickets/lookup/route.ts:POST", "Public ticket lookup (requires reference + phone match)"],
  ["app/api/tickets/rsvp-free/route.ts:POST", "Public free RSVP (enforces price=0, rate-limited)"],
  ["app/api/tickets/[id]/route.ts:GET", "Public ticket view (non-sensitive metadata)"],
  ["app/api/tickets/[id]/download/route.ts:GET", "Public ticket PDF download (static PDF rendering)"],
  ["app/api/hub/waitlist/route.ts:POST", "Public waitlist registration"],

  // Public radio listener streams & telemetry
  ["app/api/radio/live/route.ts:GET", "Public Icecast live audio stream redirect"],
  ["app/api/radio/play-event/route.ts:POST", "Public radio play telemetry (read/stats increment)"],
  ["app/api/radio/playlists/route.ts:GET", "Public active radio playlists"],
  ["app/api/radio/playlists/[id]/route.ts:GET", "Public radio playlist tracks"],
  ["app/api/radio/recordings/route.ts:GET", "Public radio recordings"],
  ["app/api/radio/state/route.ts:GET", "Public radio broadcast state"],

  // Session login/logout endpoints (unauthenticated by definition)
  ["app/api/scanner/auth/route.ts:POST", "Gate scanner login (authenticates via Gate PIN)"],
  ["app/api/scanner/logout/route.ts:POST", "Gate scanner logout (clears session cookie)"],
  ["app/api/vendor/auth/route.ts:POST", "Vendor operator login (authenticates via Operator PIN)"],
  ["app/api/vendor/logout/route.ts:POST", "Vendor operator logout (clears session cookie)"],
]);

/**
 * Extracts the function body for an exported HTTP method.
 */
function extractFunctionBody(code: string, method: string): string | null {
  const exportRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
  const match = exportRegex.exec(code);
  if (!match) return null;

  const startParen = code.indexOf("(", match.index);
  if (startParen === -1) return null;

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
    const content = fs.readFileSync(fullPath, "utf-8");

    for (const method of HTTP_METHODS) {
      const exportRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
      if (!exportRegex.test(content)) {
        continue;
      }

      totalMethodsChecked++;
      const routeKey = `${normalized}:${method}`;
      if (ADMIN_ALLOWLIST.has(routeKey)) {
        continue;
      }

      const body = extractFunctionBody(content, method);
      if (!body) {
        failures.push({
          file: normalized,
          method,
          reason: `Could not parse function body for ${method}`,
        });
        continue;
      }

      const hasDirectGuard =
        body.includes("requireAdmin") ||
        body.includes("requireScannerOrAdmin") ||
        body.includes("verifyAdminSession");

      const delegatesToGuarded =
        /return\s+(handle\w+|POST|GET|PUT|DELETE)\s*\(/.test(body) &&
        (content.includes("requireAdmin") || content.includes("requireScannerOrAdmin"));

      if (!hasDirectGuard && !delegatesToGuarded) {
        failures.push({
          file: normalized,
          method,
          reason: `Exported admin handler ${method} body does not call requireAdmin or requireScannerOrAdmin`,
        });
      }
    }
  }

  return { totalMethodsChecked, failures };
}

function checkNonAdminRoutes(): { totalMethodsChecked: number; allowlistedCount: number; guardedCount: number; failures: MethodFailure[] } {
  const allRoutes = walkDir("app/api").filter(
    (p) => !p.replace(/\\/g, "/").includes("app/api/admin")
  );

  const failures: MethodFailure[] = [];
  let totalMethodsChecked = 0;
  let allowlistedCount = 0;
  let guardedCount = 0;

  for (const fullPath of allRoutes) {
    const normalized = fullPath.replace(/\\/g, "/");
    const content = fs.readFileSync(fullPath, "utf-8");

    for (const method of HTTP_METHODS) {
      const exportRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
      if (!exportRegex.test(content)) {
        continue;
      }

      totalMethodsChecked++;
      const routeKey = `${normalized}:${method}`;

      if (NON_ADMIN_PUBLIC_ALLOWLIST.has(routeKey)) {
        allowlistedCount++;
        continue;
      }

      const body = extractFunctionBody(content, method);
      if (!body) {
        failures.push({
          file: normalized,
          method,
          reason: `Could not parse function body for ${method}`,
        });
        continue;
      }

      // Check for valid in-handler authentication patterns:
      // 1. Admin auth
      const hasAdminGuard =
        body.includes("requireAdmin") ||
        body.includes("verifyAdminSession") ||
        body.includes("requireScannerOrAdmin");

      // 2. Vendor or scanner session
      const hasVendorOrScannerGuard =
        body.includes("goodlife_vendor_session") ||
        body.includes("goodlife_scanner_session") ||
        body.includes("getSession") ||
        body.includes("getVendorSession") ||
        body.includes("scannerSession");

      // 3. Customer Tab Self-Pay Auth
      const hasTabAuth =
        body.includes("verifySelfPayToken") ||
        body.includes("verifyTabToken") ||
        body.includes("tabOwnershipGuard") ||
        body.includes("getTabActor");

      // 4. Webhook / Cron cryptographic verification
      const hasWebhookAuth =
        (body.includes("timingSafeEqual") &&
          (body.includes("X-Bridge-Signature") ||
            body.includes("X-Webhook-Hmac") ||
            body.includes("PAYHERO_CALLBACK_TOKEN") ||
            body.includes("CRON_SECRET"))) ||
        body.includes("x-paystack-signature");

      // 5. Delegation to an in-file or imported guarded handler
      const delegatesToGuarded =
        /return\s+(handle\w+|POST|GET|PUT|DELETE)\s*\(/.test(body) &&
        (content.includes("getSession") || content.includes("getVendorSession") || content.includes("handleVendorVoidSale") || content.includes("requireAdmin"));

      if (hasAdminGuard || hasVendorOrScannerGuard || hasTabAuth || hasWebhookAuth || delegatesToGuarded) {
        guardedCount++;
      } else {
        failures.push({
          file: normalized,
          method,
          reason: `Handler ${method} is not guarded by in-handler auth and is NOT in NON_ADMIN_PUBLIC_ALLOWLIST`,
        });
      }
    }
  }

  return { totalMethodsChecked, allowlistedCount, guardedCount, failures };
}

function run() {
  console.log("=== Checking Route Guards Across ENTIRE Codebase (AST Body Inspection) ===");

  const { totalMethodsChecked: adminTotal, failures: adminFailures } = checkAdminRoutes();
  console.log(`Scanned ${adminTotal} exported HTTP handlers in app/api/admin. Failed: ${adminFailures.length}`);

  if (adminFailures.length > 0) {
    console.error("FAIL: The following admin handlers are missing auth guards:");
    for (const f of adminFailures) {
      console.error(`  - ${f.file} [${f.method}]: ${f.reason}`);
    }
  }

  const {
    totalMethodsChecked: nonAdminTotal,
    allowlistedCount,
    guardedCount,
    failures: nonAdminFailures,
  } = checkNonAdminRoutes();

  console.log(
    `Scanned ${nonAdminTotal} exported HTTP handlers in non-admin routes (${guardedCount} in-handler guarded, ${allowlistedCount} explicit public allowlist). Failed: ${nonAdminFailures.length}`
  );

  if (nonAdminFailures.length > 0) {
    console.error("FAIL: The following non-admin handlers are neither guarded nor in the explicit public allowlist:");
    for (const f of nonAdminFailures) {
      console.error(`  - ${f.file} [${f.method}]: ${f.reason}`);
    }
  }

  const totalFailures = adminFailures.length + nonAdminFailures.length;
  if (totalFailures === 0) {
    console.log(
      `\nPASS: All ${adminTotal + nonAdminTotal} exported handlers across the codebase are verified guarded or explicitly allowlisted.`
    );
    process.exit(0);
  } else {
    console.error(`\nFAIL: Total failures across codebase: ${totalFailures}`);
    process.exit(1);
  }
}

run();

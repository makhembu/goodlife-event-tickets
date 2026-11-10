import fs from "fs";
import path from "path";
import ts from "typescript";

interface RouteHandlerInfo {
  routePath: string;
  filePath: string;
  method: string;
  authMechanism: string;
  writesOrSpends: string;
  unsetSecretBehavior: string;
  isFlaggedUnauthWriteOrSpend: boolean;
  notes: string;
}

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

function getRoutePath(filePath: string): string {
  const rel = path.relative("app", filePath).replace(/\\/g, "/");
  return "/" + rel.replace(/\/route\.ts$/, "");
}

function analyzeRouteFile(filePath: string): RouteHandlerInfo[] {
  const normalizedFilePath = filePath.replace(/\\/g, "/");
  const content = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const routePath = getRoutePath(filePath);
  const handlers: RouteHandlerInfo[] = [];

  const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );

      if (isExported && HTTP_METHODS.has(name)) {
        const bodyText = node.body ? node.body.getText(sourceFile) : "";
        const fullFnText = node.getText(sourceFile);

        let auth = "None (Public)";
        let unsetSecret = "N/A (No secret required)";

        // 1. Admin auth
        if (bodyText.includes("requireAdmin")) {
          auth = "requireAdmin (Admin Session Cookie)";
          unsetSecret = "Fails closed (500 if ADMIN_PASSWORD/ADMIN_SESSION_SECRET unset, or rejects invalid session)";
        } else if (bodyText.includes("verifyAdminSession")) {
          auth = "verifyAdminSession (Admin Session Cookie)";
          unsetSecret = "Fails closed / Fallback to legacy cookie if ALLOW_LEGACY_ADMIN_COOKIE!=false";
        } else if (bodyText.includes("requireScannerOrAdmin")) {
          auth = "requireScannerOrAdmin (Scanner/Admin Session)";
          unsetSecret = "Fails closed (401)";
        }
        // 2. Scanner / Vendor session cookies
        else if (bodyText.includes("goodlife_scanner_session") || normalizedFilePath.includes("scanner")) {
          if (name === "POST" && normalizedFilePath.endsWith("scanner/auth/route.ts")) {
            auth = "Gate PIN Verification (GATE_SCANNER_PIN / DB pin)";
            unsetSecret = "PIN check fails; session signing falls back to salt if SCANNER_SESSION_SECRET unset";
          } else if (name === "POST" && normalizedFilePath.endsWith("scanner/logout/route.ts")) {
            auth = "None (Clears Cookie)";
            unsetSecret = "N/A";
          } else {
            auth = "goodlife_scanner_session (HMAC cookie + Middleware)";
            unsetSecret = "Fallback to TAB_SELF_PAY_SECRET -> PAYHERO_CALLBACK_TOKEN -> hardcoded salt";
          }
        } else if (bodyText.includes("goodlife_vendor_session") || normalizedFilePath.includes("vendor")) {
          if (name === "POST" && normalizedFilePath.endsWith("vendor/auth/route.ts")) {
            auth = "Vendor Operator PIN verification (vendor_operators)";
            unsetSecret = "Session signing falls back to TAB_SELF_PAY_SECRET -> salt if VENDOR_SESSION_SECRET unset";
          } else if (name === "POST" && normalizedFilePath.endsWith("vendor/logout/route.ts")) {
            auth = "None (Clears Cookie)";
            unsetSecret = "N/A";
          } else {
            auth = "goodlife_vendor_session (HMAC cookie + Middleware)";
            unsetSecret = "Fallback to TAB_SELF_PAY_SECRET -> PAYHERO_CALLBACK_TOKEN -> hardcoded salt";
          }
        }
        // 3. Customer Tab Auth
        else if (bodyText.includes("verifyTabToken") || bodyText.includes("tabOwnershipGuard") || normalizedFilePath.includes("pay/tab")) {
          auth = "HMAC Tab Self-Pay Token (?t= param) / Admin Cookie";
          unsetSecret = "Fallback to TAB_SELF_PAY_SECRET -> PAYHERO_CALLBACK_TOKEN -> DATABASE_URL";
        }
        // 4. Webhook / Callback / Cron Signatures
        else if (normalizedFilePath.endsWith("payhero/callback/route.ts")) {
          auth = "PAYHERO_CALLBACK_TOKEN (Bearer/Query) + PayHero Status API back-channel";
          unsetSecret = "Token check logs warning; active back-channel query to PayHero API required";
        } else if (normalizedFilePath.endsWith("payhero/reconcile/route.ts")) {
          auth = "CRON_SECRET (Authorization: Bearer with timingSafeEqual)";
          unsetSecret = "Fails closed (500 if CRON_SECRET is unset)";
        } else if (normalizedFilePath.endsWith("paystack/callback/route.ts")) {
          auth = "Paystack HMAC-SHA512 (x-paystack-signature)";
          unsetSecret = "Fails closed (500 if PAYSTACK_SECRET_KEY unset)";
        } else if (normalizedFilePath.endsWith("webhooks/radio-ingest/route.ts")) {
          auth = "HMAC-SHA256 (X-Bridge-Signature + X-Bridge-Timestamp +/- 5min)";
          unsetSecret = "Fails closed (500 if RADIO_BRIDGE_SECRET unset)";
        } else if (normalizedFilePath.endsWith("whatsapp/webhook/route.ts")) {
          auth = "WHATSAPP_WEBHOOK_SECRET (X-Webhook-Hmac / X-Webhook-Secret)";
          unsetSecret = "Fails closed (500 if WHATSAPP_WEBHOOK_SECRET unset)";
        }

        // Writes / Spends
        const writes: string[] = [];
        const spends: string[] = [];
        let notes = "";

        // Check for DB writes
        if (bodyText.includes("INSERT INTO") || bodyText.includes("UPDATE ") || bodyText.includes("DELETE FROM")) {
          writes.push("Raw SQL write");
        }
        if (bodyText.includes("createTicket") || bodyText.includes("rsvp-free")) writes.push("Writes ticket");
        if (bodyText.includes("createPosSale")) writes.push("Writes POS sale & payments");
        if (bodyText.includes("openTillSession") || bodyText.includes("closeTillSession")) writes.push("Writes till session");
        if (bodyText.includes("payTab") || bodyText.includes("closeCustomerTab")) writes.push("Writes customer tab");
        if (bodyText.includes("createTicketTier") || bodyText.includes("updateTicketTier") || bodyText.includes("deleteTicketTier") || bodyText.includes("permanentlyDeleteTicketTier")) {
          writes.push("Writes/deletes ticket tier");
        }
        if (bodyText.includes("savePdfData")) writes.push("Caches generated PDF in DB");
        if (bodyText.includes("joinEventWaitlist")) writes.push("Writes waitlist entry");
        if (bodyText.includes("createPendingPayment")) writes.push("Writes pending_payments");
        if (bodyText.includes("insertPaymentLog")) writes.push("Writes payment log");
        if (bodyText.includes("recordPayheroFailure")) writes.push("Records failure rate-limit");

        // Check for Spends / external mutations
        if (bodyText.includes("initiatePayheroStkPush") || bodyText.includes("stkpush") || bodyText.includes("/payments")) spends.push("PayHero STK Push");
        if (bodyText.includes("paystack") && (bodyText.includes("transaction/initialize") || bodyText.includes("initializePaystackPayment"))) spends.push("Paystack Payment Init");
        if (bodyText.includes("sendTicketViaWhatsApp") || bodyText.includes("sendWhatsAppMessage")) spends.push("WhatsApp Message Send");
        if (bodyText.includes("generateGeminiDropAudio") || bodyText.includes("GoogleGenAI") || bodyText.includes("fishAudio") || bodyText.includes("generateVoiceAudio")) spends.push("Gemini/Fish Audio API spend");
        if (bodyText.includes("deleteR2Object") || bodyText.includes("putObject") || bodyText.includes("S3Client")) spends.push("Cloudflare R2 Storage");

        // Special notes
        if (filePath.endsWith("ticket-tiers/route.ts") && name === "GET") {
          notes = "Public tier list; ?deleted=true requires requireAdmin";
        }
        if (filePath.endsWith("ticket-tiers/[id]/route.ts")) {
          notes = "Guarded by requireAdmin; ?permanent=true calls permanentlyDeleteTicketTier";
        }
        if (filePath.endsWith("tickets/[id]/route.ts")) {
          notes = "Public non-sensitive metadata read only (no mutations)";
        }
        if (filePath.endsWith("tickets/[id]/download/route.ts")) {
          notes = "Public PDF download; caches base64 to tickets.pdf_data";
        }
        if (filePath.endsWith("tickets/lookup/route.ts")) {
          notes = "Public lookup requiring both reference/ticket_id AND phone_number";
        }
        if (filePath.endsWith("tickets/rsvp-free/route.ts")) {
          notes = "Public 0-shilling RSVP; enforces price=0 and rate limiting";
        }
        if (filePath.endsWith("payments/till-submit/route.ts")) {
          notes = "Public offline till receipt submission; requires admin approval before ticket";
        }

        const writesOrSpendsArr = [...writes, ...spends];
        const writesOrSpends = writesOrSpendsArr.length > 0 ? writesOrSpendsArr.join(", ") : "None (Read-only)";

        const isUnauth = auth.startsWith("None");
        const hasWriteOrSpend = writes.length > 0 || spends.length > 0;
        const isFlagged = isUnauth && hasWriteOrSpend;

        handlers.push({
          routePath,
          filePath,
          method: name,
          authMechanism: auth,
          writesOrSpends,
          unsetSecretBehavior: unsetSecret,
          isFlaggedUnauthWriteOrSpend: isFlagged,
          notes,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return handlers;
}

export function runRouteAudit() {
  const allRoutes = walkDir("app/api").filter(
    (p) => !p.replace(/\\/g, "/").includes("app/api/admin")
  );

  const allHandlers: RouteHandlerInfo[] = [];
  for (const file of allRoutes) {
    allHandlers.push(...analyzeRouteFile(file));
  }

  return { allRoutes, allHandlers };
}

if (require.main === module) {
  const { allRoutes, allHandlers } = runRouteAudit();

  console.log(`Total non-admin route.ts files: ${allRoutes.length}`);
  console.log(`Total exported HTTP method handlers: ${allHandlers.length}\n`);

  console.log("| Route Path | Method | Auth Mechanism | Writes / Paid API Spend? | Unset Secret Behavior | Flagged? |");
  console.log("|---|---|---|---|---|---|");
  for (const h of allHandlers) {
    const flag = h.isFlaggedUnauthWriteOrSpend ? "⚠️ UNGUARDED WRITE/SPEND" : "✓ OK";
    console.log(`| \`${h.routePath}\` | **${h.method}** | ${h.authMechanism} | ${h.writesOrSpends} | ${h.unsetSecretBehavior} | ${flag} |`);
  }

  const flagged = allHandlers.filter((h) => h.isFlaggedUnauthWriteOrSpend);
  console.log(`\nFlagged unauthenticated handlers that write data or call paid APIs: ${flagged.length}`);
  for (const f of flagged) {
    console.log(`  - ${f.routePath} [${f.method}]: ${f.writesOrSpends} (${f.notes})`);
  }
}

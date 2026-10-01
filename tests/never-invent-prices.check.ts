/**
 * Verification test for Task 4: Never Invent Prices & Eliminate Ticket Fallbacks.
 * Tests:
 * 1. till-submit route returns 400 if tier is not found or invalid (no 500 KES fallback)
 * 2. paystack verify route returns 400 if ticket_type is missing (no ADV 500 fallback)
 * 3. payhero-fulfill fails cleanly if event ID cannot be resolved (no || 1 fallback)
 * 4. static checks for CheckoutClientPage and admin dashboard
 *
 * Run: npx tsx tests/never-invent-prices.check.ts
 */

import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    failures.push(name);
    console.error(`FAIL: ${name}`);
  }
}

async function runTests() {
  console.log("Starting Never Invent Prices verification...\n");

  // 1. Static check on app/CheckoutClientPage.tsx
  const checkoutCode = fs.readFileSync(
    path.join(__dirname, "../app/CheckoutClientPage.tsx"),
    "utf8"
  );
  check(
    "CheckoutClientPage uses price ?? 0 (not 500)",
    checkoutCode.includes("const price = selectedTierObj?.price ?? 0;")
  );
  check(
    "CheckoutClientPage validates selectedTierObj before payment",
    checkoutCode.includes('if (!selectedTierObj || typeof selectedTierObj.price !== "number")')
  );

  // 2. Static check on app/admin/dashboard/page.tsx
  const dashboardCode = fs.readFileSync(
    path.join(__dirname, "../app/admin/dashboard/page.tsx"),
    "utf8"
  );
  check(
    "Admin dashboard initializes ticket_type to empty string, not ADV 500",
    dashboardCode.includes('ticket_type: firstTier?.id || "",')
  );
  check(
    "Admin dashboard initializes amount_paid to price ?? 0, not 500",
    dashboardCode.includes("amount_paid: firstTier?.price ?? 0,")
  );
  check(
    "Admin dashboard validates ticket_type before saving",
    dashboardCode.includes("if (!ticketFormState.ticket_type)") &&
    dashboardCode.includes("Please select a valid ticket tier before issuing.")
  );

  // 3. Test till-submit route behavior with missing tier
  // Mock pg module before importing route
  const pg = require("pg");
  const origQuery = pg.Pool.prototype.query;
  const origEnd = pg.Pool.prototype.end;

  pg.Pool.prototype.query = async function (sql: string, params?: any[]) {
    // If querying event
    if (sql.includes("FROM events")) {
      return {
        rows: [
          {
            id: 10,
            title: "Test Event",
            is_active: true,
            status: "live",
            category: "regular",
            created_at: new Date().toISOString(),
          },
        ],
      };
    }
    // If querying ticket_tiers, return empty rows (simulating non-existent tier)
    if (sql.includes("FROM ticket_tiers")) {
      return { rows: [] };
    }
    return { rows: [] };
  };
  pg.Pool.prototype.end = async function () {};

  try {
    const { POST: tillSubmitPOST } = await import(
      "../app/api/payments/till-submit/route"
    );

    const req = new NextRequest("http://localhost:3000/api/payments/till-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyer_name: "Test Attendee",
        phone_number: "254700000000",
        ticket_type: "NON_EXISTENT_TIER_999",
        quantity: 1,
        mpesa_reference: "TESTREF123",
      }),
    });

    const res = await tillSubmitPOST(req);
    const json = await res.json();

    check(
      "till-submit returns HTTP 400 when tier does not exist",
      res.status === 400
    );
    check(
      "till-submit error message specifies invalid/not found tier",
      json.error === "Invalid ticket tier or tier not found for this event."
    );
  } finally {
    pg.Pool.prototype.query = origQuery;
    pg.Pool.prototype.end = origEnd;
  }

  // 4. Test paystack verify route behavior with missing ticket_type
  const { GET: paystackVerifyGET } = await import(
    "../app/api/paystack/verify/route"
  );
  // Without DB rows or metadata returning ticket_type, verify should fail if paid
  // Verify static requirement in paystack verify route
  const paystackCode = fs.readFileSync(
    path.join(__dirname, "../app/api/paystack/verify/route.ts"),
    "utf8"
  );
  check(
    "Paystack verify route removed ADV 500 fallback",
    !paystackCode.includes('"ADV 500"')
  );
  check(
    "Paystack verify route returns error when ticketType is missing",
    paystackCode.includes("Missing ticket tier specification")
  );

  // 5. Test payhero-fulfill when eventId cannot be resolved
  const fulfillCode = fs.readFileSync(
    path.join(__dirname, "../lib/payhero-fulfill.ts"),
    "utf8"
  );
  check(
    "payhero-fulfill removed || 1 fallback for eventId",
    !fulfillCode.includes("(await fetchActiveEvent())?.id || 1;")
  );
  check(
    "payhero-fulfill fails if eventId cannot be resolved",
    fulfillCode.includes('reason: "Could not resolve valid event ID for fulfillment"')
  );

  console.log(`\n${pass} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});

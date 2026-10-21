import assert from "assert";
import pg from "pg";

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

async function runTest() {
  console.log("Running Task 1: Guest Count Fulfillment verification...\n");

  const origQuery = pg.Pool.prototype.query;
  const origEnd = pg.Pool.prototype.end;

  const mockDb = {
    pending_payments: [
      {
        checkout_request_id: "GL-TEST-SQUAD",
        status: "pending",
        buyer_name: "Kevin Test",
        phone_number: "254712345678",
        whatsapp_number: "254712345678",
        ticket_type: "squad-4-pass",
        quantity: 1,
        amount: 2600,
        event_id: 2,
      },
      {
        checkout_request_id: "GL-TEST-SQUAD-QTY2",
        status: "pending",
        buyer_name: "Brian Test",
        phone_number: "254798765432",
        whatsapp_number: "254798765432",
        ticket_type: "squad-4-pass",
        quantity: 2,
        amount: 5200,
        event_id: 2,
      }
    ],
    ticket_tiers: [
      {
        id: "squad-4-pass",
        name: "Squad of 4 Pass",
        event_id: 2,
        admits_quantity: 4,
        is_camping_bundle: false,
        camping_type: "none"
      }
    ],
    tickets: [] as any[],
    payment_logs: [] as any[]
  };

  pg.Pool.prototype.query = async function (sql: string, params?: any[]) {
    const s = sql.trim();
    if (s.includes("FROM pending_payments WHERE checkout_request_id = $1")) {
      const row = mockDb.pending_payments.find(p => p.checkout_request_id === params![0]);
      return { rows: row ? [row] : [] };
    }
    if (s.includes("INSERT INTO payment_logs")) {
      mockDb.payment_logs.push(params);
      return { rows: [] };
    }
    if (s.includes("SELECT admits_quantity, is_camping_bundle, camping_type FROM ticket_tiers")) {
      const row = mockDb.ticket_tiers.find(t => t.event_id === params![0] && (t.id === params![1] || t.name.toLowerCase() === String(params![1]).toLowerCase()));
      return { rows: row ? [row] : [] };
    }
    if (s.includes("FROM ticket_tiers tt") || s.includes("SELECT * FROM ticket_tiers")) {
      const rows = mockDb.ticket_tiers.filter(t => t.event_id === params![0]);
      return { rows };
    }
    if (s.includes("INSERT INTO tickets")) {
      mockDb.tickets.push({
        id: params![0],
        ticket_type: params![3],
        guest_count: params![12],
        is_camping: params![14],
        camping_type: params![15]
      });
      return { rows: [] };
    }
    if (s.includes("UPDATE pending_payments")) {
      const ref = params![1];
      const p = mockDb.pending_payments.find(x => x.checkout_request_id === ref);
      if (p) {
        p.status = "completed";
        (p as any).ticket_id = params![0];
      }
      return { rows: [] };
    }
    return { rows: [] };
  };

  pg.Pool.prototype.end = async function () {};

  try {
    const { fulfillPayheroPayment } = await import("@/lib/payhero-fulfill");

    // Test 1: fulfill quantity 1 of a 4-guest pass
    const res1 = await fulfillPayheroPayment({
      reference: "GL-TEST-SQUAD",
      providerReference: "MPESA123",
      amountPaid: 2600,
      source: "callback"
    });

    check("Fulfill returned fulfilled: true", res1.fulfilled === true);
    check("Generated 1 ticket ID", res1.ticketIds.length === 1);
    const created1 = mockDb.tickets.find(t => t.id === "GL-TEST-SQUAD");
    check("Ticket has guest_count == 4", created1 && created1.guest_count === 4);

    // Test 2: Idempotency check on replay
    const replayRes = await fulfillPayheroPayment({
      reference: "GL-TEST-SQUAD",
      providerReference: "MPESA123",
      amountPaid: 2600,
      source: "callback"
    });
    check("Replay returns already completed", replayRes.reason === "already completed");
    check("Replay does not insert duplicate tickets", mockDb.tickets.filter(t => t.id === "GL-TEST-SQUAD").length === 1);

    // Test 3: fulfill quantity 2 of a 4-guest pass
    const res2 = await fulfillPayheroPayment({
      reference: "GL-TEST-SQUAD-QTY2",
      providerReference: "MPESA456",
      amountPaid: 5200,
      source: "callback"
    });

    check("Quantity 2 generated 2 tickets", res2.ticketIds.length === 2);
    const createdQty2_1 = mockDb.tickets.find(t => t.id === "GL-TEST-SQUAD-QTY2-1");
    const createdQty2_2 = mockDb.tickets.find(t => t.id === "GL-TEST-SQUAD-QTY2-2");
    check("Ticket 1 has guest_count == 4", createdQty2_1 && createdQty2_1.guest_count === 4);
    check("Ticket 2 has guest_count == 4", createdQty2_2 && createdQty2_2.guest_count === 4);

  } finally {
    pg.Pool.prototype.query = origQuery;
    pg.Pool.prototype.end = origEnd;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

runTest().catch(e => {
  console.error("Test execution error:", e);
  process.exit(1);
});

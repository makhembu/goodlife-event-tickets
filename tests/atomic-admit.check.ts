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
  console.log("Running Task 2: Atomic Admit Verification...\n");

  const origQuery = pg.Pool.prototype.query;
  const origEnd = pg.Pool.prototype.end;

  let currentDbTicket = {
    id: "GL-CONCURRENT-1",
    ticket_type: "REGULAR PASS",
    event_id: 1,
    guest_count: 1,
    admitted_count: 0,
    is_scanned: false,
    deleted_at: null,
    phone_number: "254700000000",
    buyer_name: "Concurrency Test",
    scanned_at: null as string | null,
    scanned_by: null as string | null
  };

  pg.Pool.prototype.query = async function (sql: string, params?: any[]) {
    const s = sql.trim();
    if (s.includes("SELECT * FROM tickets WHERE id = $1")) {
      return { rows: [ { ...currentDbTicket } ] };
    }
    if (s.includes("UPDATE tickets")) {
      const admitInc = params![0];
      const scannedAt = params![1];
      const scannedBy = params![2];
      const id = params![3];

      // Simulate conditional atomic UPDATE in Postgres:
      // WHERE id = $4 AND deleted_at IS NULL AND is_scanned = FALSE AND (admitted_count + $1 <= guest_count)
      if (
        currentDbTicket.id === id &&
        !currentDbTicket.deleted_at &&
        !currentDbTicket.is_scanned &&
        currentDbTicket.admitted_count + admitInc <= currentDbTicket.guest_count
      ) {
        currentDbTicket.admitted_count += admitInc;
        currentDbTicket.is_scanned = currentDbTicket.admitted_count >= currentDbTicket.guest_count;
        currentDbTicket.scanned_at = scannedAt;
        currentDbTicket.scanned_by = scannedBy;
        return {
          rowCount: 1,
          rows: [
            {
              admitted_count: currentDbTicket.admitted_count,
              guest_count: currentDbTicket.guest_count,
              is_scanned: currentDbTicket.is_scanned,
              scanned_at: currentDbTicket.scanned_at,
              scanned_by: currentDbTicket.scanned_by
            }
          ]
        };
      } else {
        return { rowCount: 0, rows: [] };
      }
    }
    return { rows: [] };
  };

  pg.Pool.prototype.end = async function () {};

  try {
    const { processTicketScan } = await import("@/lib/supabase-db");

    // Test: Two gates scanning the exact same single-entry ticket at the exact same moment
    const [gate1, gate2] = await Promise.all([
      processTicketScan("GL-CONCURRENT-1", "Gate Alpha", 1, 1),
      processTicketScan("GL-CONCURRENT-1", "Gate Beta", 1, 1)
    ]);

    const successes = [gate1, gate2].filter(r => r.success);
    const failures = [gate1, gate2].filter(r => !r.success);

    check("Exactly one scan succeeded", successes.length === 1);
    check("The other scan was rejected", failures.length === 1);
    check("The rejected scan indicates already scanned or admission conflict", 
      failures[0].alreadyScanned === true || failures[0].message.includes("ALREADY") || failures[0].message.includes("CONFLICT")
    );
    check("Database admitted_count equals exactly 1 (no over-admission)", currentDbTicket.admitted_count === 1);
    check("Database is_scanned is true", currentDbTicket.is_scanned === true);

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

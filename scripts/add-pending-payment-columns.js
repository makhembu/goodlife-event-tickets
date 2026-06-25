const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  try {
    await pool.query(
      `ALTER TABLE pending_payments 
       ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
       ADD COLUMN IF NOT EXISTS ticket_id TEXT`
    );
    console.log("Migration complete: added status and ticket_id columns to pending_payments");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

migrate();

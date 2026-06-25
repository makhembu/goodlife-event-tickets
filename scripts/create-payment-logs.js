const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
let dbUrl = '';

envContent.split('\n').forEach(line => {
  const match = line.match(/^DATABASE_URL=(.*)$/);
  if (match) {
    dbUrl = match[1].trim().replace(/^"|"$/g, '');
  }
});

const pool = new Pool({
  connectionString: dbUrl,
});

async function main() {
  console.log("Creating payment_logs table in Neon...");
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_logs (
        id SERIAL PRIMARY KEY,
        checkout_request_id TEXT,
        mpesa_receipt TEXT,
        phone_number TEXT,
        amount NUMERIC,
        status TEXT NOT NULL, -- 'success', 'failed', 'processing'
        result_desc TEXT,
        raw_payload JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `);
    console.log("payment_logs table created successfully!");
  } catch (err) {
    console.error("Error creating payment_logs table:", err);
  } finally {
    await pool.end();
  }
}

main();

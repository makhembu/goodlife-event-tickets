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

const url = new URL(dbUrl);
url.searchParams.delete('sslmode');
const pool = new Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function main() {
  console.log("Adding footer_title and footer_legal columns to event_details...");
  try {
    await pool.query(`
      ALTER TABLE event_details 
      ADD COLUMN IF NOT EXISTS footer_title TEXT NOT NULL 
      DEFAULT 'GOODLIFE TICKETING';
    `);
    console.log("Successfully added footer_title column!");

    await pool.query(`
      ALTER TABLE event_details 
      ADD COLUMN IF NOT EXISTS footer_legal TEXT NOT NULL 
      DEFAULT 'STRICTLY 18+ NO OUTSIDE DRINKS';
    `);
    console.log("Successfully added footer_legal column!");
  } catch (err) {
    console.error("Error updating database schema:", err);
  } finally {
    await pool.end();
  }
}

main();

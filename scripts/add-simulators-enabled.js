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
  console.log("Adding simulators_enabled column to event_details...");
  try {
    await pool.query(`
      ALTER TABLE event_details 
      ADD COLUMN IF NOT EXISTS simulators_enabled BOOLEAN NOT NULL 
      DEFAULT true;
    `);
    console.log("Successfully added simulators_enabled column!");
  } catch (err) {
    console.error("Error updating database schema:", err);
  } finally {
    await pool.end();
  }
}

main();

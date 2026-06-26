const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, '..', '.env.local');
let dbUrl = '';

try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)$/);
    if (match) {
      dbUrl = match[1].trim().replace(/^"|"$/g, '');
    }
  });
} catch (err) {
  console.error(`Failed to read .env.local from ${envPath}:`, err.message);
  process.exit(1);
}

if (!dbUrl) {
  console.error('DATABASE_URL not found in .env.local.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
});

async function main() {
  console.log("Adding operator_notifications_enabled column to event_details...");
  try {
    await pool.query(`
      ALTER TABLE event_details
      ADD COLUMN IF NOT EXISTS operator_notifications_enabled BOOLEAN NOT NULL
      DEFAULT true;
    `);
    console.log("Successfully added operator_notifications_enabled column!");
  } catch (err) {
    console.error("Error updating database schema:", err);
  } finally {
    await pool.end();
  }
}

main();

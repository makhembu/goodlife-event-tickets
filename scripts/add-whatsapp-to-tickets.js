const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
let dbUrl = '';

envContent.split('\n').forEach(line => {
  const cleanLine = line.trim();
  if (cleanLine.startsWith("DATABASE_URL=")) {
    dbUrl = cleanLine.substring("DATABASE_URL=".length).replace(/^"|"$/g, '').trim();
  }
});

const pool = new Pool({
  connectionString: dbUrl,
});

async function main() {
  console.log("Adding whatsapp_number column to tickets...");
  try {
    await pool.query(`
      ALTER TABLE tickets 
      ADD COLUMN IF NOT EXISTS whatsapp_number TEXT DEFAULT '';
    `);
    console.log("Successfully added whatsapp_number column!");
  } catch (err) {
    console.error("Error updating database schema:", err);
  } finally {
    await pool.end();
  }
}

main();

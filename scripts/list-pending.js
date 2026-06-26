const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const { rows } = await pool.query(
    "SELECT * FROM pending_payments ORDER BY created_at DESC LIMIT 5"
  );
  await pool.end();

  console.log("Recent pending payments:");
  console.log(JSON.stringify(rows, null, 2));
}

run().catch(console.error);

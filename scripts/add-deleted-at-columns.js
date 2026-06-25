const { Client } = require("pg");

const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Neon. Adding deleted_at columns...");

    await client.query(`
      ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
    `);
    console.log("Added deleted_at to tickets table.");

    await client.query(`
      ALTER TABLE ticket_tiers
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
    `);
    console.log("Added deleted_at to ticket_tiers table.");

    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Error running migration:", err);
  } finally {
    await client.end();
  }
}

main();

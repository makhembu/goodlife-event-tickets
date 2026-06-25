const { Client } = require("pg");

const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Neon. Adding hidden column...");

    await client.query(`
      ALTER TABLE ticket_tiers
      ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false;
    `);
    console.log("Added hidden column to ticket_tiers table.");

    await client.query(`
      UPDATE ticket_tiers SET hidden = false WHERE hidden IS NULL;
    `);
    console.log("Backfilled hidden = false for existing rows.");

    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Error running migration:", err);
  } finally {
    await client.end();
  }
}

main();

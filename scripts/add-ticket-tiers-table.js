const { Client } = require("pg");

const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Neon. Creating ticket_tiers table...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_tiers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC NOT NULL,
        description TEXT NOT NULL,
        tag TEXT NOT NULL,
        show_only_on_event_day BOOLEAN DEFAULT false NOT NULL,
        hide_on_event_day BOOLEAN DEFAULT false NOT NULL
      );
    `);
    console.log("Table ticket_tiers created successfully.");

    // Seed default tiers
    const defaultTiers = [
      { id: "ADV 500", name: "ADV 500", price: 500, description: "Advance Ticket entry validation", tag: "ADVANCE", show_only_on_event_day: false, hide_on_event_day: true },
      { id: "2PX CAMPING", name: "2PX CAMPING", price: 2500, description: "Includes shared tent + mattress setup", tag: "2 PEOPLE", show_only_on_event_day: false, hide_on_event_day: false },
      { id: "4PX CAMPING", name: "4PX CAMPING", price: 2400, description: "Includes tent + sleeping sleeping bag/mat", tag: "4 PEOPLE", show_only_on_event_day: false, hide_on_event_day: false },
      { id: "6PX 3000", name: "6PX 3000", price: 3000, description: "Premium group camp setting", tag: "6 PEOPLE", show_only_on_event_day: false, hide_on_event_day: false },
      { id: "GATE 700", name: "GATE 700", price: 700, description: "Gate Ticket entry validation", tag: "GATE ENTRY", show_only_on_event_day: true, hide_on_event_day: false }
    ];

    for (const tier of defaultTiers) {
      await client.query(
        `INSERT INTO ticket_tiers (id, name, price, description, tag, show_only_on_event_day, hide_on_event_day)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [tier.id, tier.name, tier.price, tier.description, tier.tag, tier.show_only_on_event_day, tier.hide_on_event_day]
      );
      console.log(`Seeded tier: ${tier.id}`);
    }

    console.log("Seeding ticket_tiers completed successfully!");
  } catch (err) {
    console.error("Error creating/seeding ticket_tiers:", err);
  } finally {
    await client.end();
  }
}

main();

const { Client } = require("pg");

const connectionString = process.env.DATABASE_URL;

const demoTickets = [
  {
    id: "GL-OJG3843XYZ",
    mpesa_receipt: "OJG3843XYZ",
    phone_number: "254702119320",
    ticket_type: "ADV 500",
    amount_paid: 500,
    purchase_time: new Date(Date.now() - 3600000 * 4).toISOString(),
    is_scanned: false,
    scanned_at: null,
    scanned_by: null,
    buyer_name: "John Doe"
  },
  {
    id: "GL-OKX4910ABC",
    mpesa_receipt: "OKX4910ABC",
    phone_number: "254712345678",
    ticket_type: "2PX CAMPING",
    amount_paid: 2500,
    purchase_time: new Date(Date.now() - 3600000 * 2).toISOString(),
    is_scanned: true,
    scanned_at: new Date(Date.now() - 3600000 * 1.5).toISOString(),
    scanned_by: "Gate 1 Main",
    buyer_name: "Alice Smith"
  },
  {
    id: "GL-OMP9892MNO",
    mpesa_receipt: "OMP9892MNO",
    phone_number: "254722999888",
    ticket_type: "6PX 3000",
    amount_paid: 3000,
    purchase_time: new Date(Date.now() - 3600000 * 12).toISOString(),
    is_scanned: false,
    scanned_at: null,
    scanned_by: null,
    buyer_name: "Bob Johnson"
  }
];

async function main() {
  console.log("Connecting to Neon Postgres to seed demo tickets...");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    for (const ticket of demoTickets) {
      await client.query(
        `INSERT INTO tickets (id, mpesa_receipt, phone_number, ticket_type, amount_paid, purchase_time, is_scanned, scanned_at, scanned_by, buyer_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          ticket.id,
          ticket.mpesa_receipt,
          ticket.phone_number,
          ticket.ticket_type,
          ticket.amount_paid,
          ticket.purchase_time,
          ticket.is_scanned,
          ticket.scanned_at,
          ticket.scanned_by,
          ticket.buyer_name
        ]
      );
      console.log(`Seeded ticket: ${ticket.id}`);
    }

    console.log("Demo tickets seeding completed successfully!");
  } catch (err) {
    console.error("Error seeding tickets:", err);
  } finally {
    await client.end();
  }
}

main();

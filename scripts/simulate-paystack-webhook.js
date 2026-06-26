const crypto = require("crypto");
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

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!PAYSTACK_SECRET_KEY) {
  console.error("Missing PAYSTACK_SECRET_KEY in environment");
  process.exit(1);
}

async function run() {
  console.log("Connecting to DB to find latest pending payment...");
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const { rows } = await pool.query(
    "SELECT * FROM pending_payments WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1"
  );
  await pool.end();

  if (rows.length === 0) {
    console.log("No pending payments found in DB.");
    return;
  }

  const payment = rows[0];
  console.log("Found latest pending payment:", payment);

  const reference = payment.checkout_request_id;
  const amountKobo = Math.round(payment.amount * 100);
  
  const payload = {
    event: "charge.success",
    data: {
      id: 123456789,
      domain: "test",
      status: "success",
      reference: reference,
      amount: amountKobo,
      gateway_response: "Approved",
      paid_at: new Date().toISOString(),
      created_at: payment.created_at,
      channel: "mobile_money",
      currency: "KES",
      customer: {
        id: 98765432,
        first_name: payment.buyer_name,
        email: `${reference.toLowerCase()}@goodlife.com`,
        phone: payment.phone_number
      },
      metadata: {
        ticket_type: payment.ticket_type,
        quantity: payment.quantity,
        buyer_name: payment.buyer_name,
        phone_number: payment.phone_number,
        whatsapp_number: payment.whatsapp_number
      }
    }
  };

  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  console.log(`Sending mock webhook for reference ${reference} with amount ${payment.amount}...`);
  try {
    const res = await fetch("http://localhost:3000/api/paystack/callback", {
      method: "POST",
      headers: {
        "x-api-key": process.env.PAYSTACK_PUBLIC_KEY || "",
        "x-paystack-signature": signature,
        "Content-Type": "application/json"
      },
      body: rawBody
    });

    console.log(`Callback response status: ${res.status}`);
    const data = await res.text();
    console.log("Callback response body:", data);
  } catch (err) {
    console.error("Failed to POST callback:", err);
  }
}

run().catch(console.error);

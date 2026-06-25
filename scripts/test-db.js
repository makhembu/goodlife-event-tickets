const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

let supabaseUrl = "";
let serviceRoleKey = "";

try {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    const lines = envContent.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key === "NEXT_PUBLIC_SUPABASE_URL") supabaseUrl = val;
        if (key === "SUPABASE_SERVICE_ROLE_KEY") serviceRoleKey = val;
      }
    }
  }
} catch (err) {}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function test() {
  console.log("Checking if 'event_details' table exists...");
  const { data: eventData, error: eventError } = await supabase
    .from("event_details")
    .select("*")
    .limit(1);

  if (eventError) {
    console.error("event_details table check failed:", eventError.message);
  } else {
    console.log("event_details table exists. Data:", eventData);
  }

  console.log("Checking if 'tickets' table exists...");
  const { data: ticketData, error: ticketError } = await supabase
    .from("tickets")
    .select("*")
    .limit(1);

  if (ticketError) {
    console.error("tickets table check failed:", ticketError.message);
  } else {
    console.log("tickets table exists.");
  }

  console.log("Checking if 'pending_payments' table exists...");
  const { data: paymentData, error: paymentError } = await supabase
    .from("pending_payments")
    .select("*")
    .limit(1);

  if (paymentError) {
    console.error("pending_payments table check failed:", paymentError.message);
  } else {
    console.log("pending_payments table exists.");
  }
}

test();

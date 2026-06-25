const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Manually parse .env.local to avoid needing external dependency dotenv
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
        // Remove quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key === "NEXT_PUBLIC_SUPABASE_URL") supabaseUrl = val;
        if (key === "SUPABASE_SERVICE_ROLE_KEY") serviceRoleKey = val;
      }
    }
  }
} catch (err) {
  console.error("Error reading .env.local:", err);
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function seedAdmin() {
  const email = "admin@goodlife.com";
  const password = "GoodlifeAdmin2026!";

  console.log(`Attempting to seed admin user via admin auth api: ${email}...`);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "admin" }
  });

  if (error) {
    console.error("Error seeding admin via service role:", error.message);
    if (error.message.includes("already registered") || error.message.includes("already exists") || error.message.includes("already exist")) {
      console.log("Admin user already exists.");
      process.exit(0);
    }
    process.exit(1);
  }

  console.log("Admin user seeded successfully with Service Role!");
  console.log("User ID:", data.user.id);
}

seedAdmin();

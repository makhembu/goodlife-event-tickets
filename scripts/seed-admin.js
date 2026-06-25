const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://kbwftozaisewcpnfzcar.supabase.co";
// Using the anon key provided
const supabaseKey = "sb_publishable_5uP5ITu8N4jiQaSmfEEQ_Q_khQsxclG";

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedAdmin() {
  const email = "admin@goodlife.com";
  const password = "GoodlifeAdmin2026!";

  console.log(`Attempting to sign up admin user: ${email}...`);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    console.error("Error signing up admin:", error.message);
    if (error.message.includes("already registered") || error.message.includes("already exists")) {
      console.log("Admin user is already seeded and ready.");
      process.exit(0);
    }
    process.exit(1);
  }

  console.log("Admin user signed up successfully!");
  console.log("User details:", data.user ? data.user.id : "No user data returned");
  console.log("Please check your email to confirm the signup if email confirmation is enabled in Supabase.");
}

seedAdmin();

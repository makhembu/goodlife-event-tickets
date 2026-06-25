const { Client } = require("pg");

const host = "aws-0-ap-south-1.pooler.supabase.com";
const password = "vlzQ3NHVuvJTrjg2";
const projectRef = "kbwftozaisewcpnfzcar";

const client = new Client({
  host,
  port: 6543,
  database: "postgres",
  user: `postgres.${projectRef}`,
  password,
  ssl: { rejectUnauthorized: false }
});

client.connect()
  .then(async () => {
    console.log("SUCCESS connected to ap-south-1!");
    await client.end();
  })
  .catch(err => {
    console.error("Failed to connect to ap-south-1:", err.message);
    process.exit(1);
  });

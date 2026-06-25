const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const connectionString = "postgresql://postgres:vlzQ3NHVuvJTrjg2@db.kbwftozaisewcpnfzcar.supabase.co:5432/postgres";

async function main() {
  const sqlPath = path.join(process.cwd(), "schema.sql");
  if (!fs.existsSync(sqlPath)) {
    console.error("schema.sql not found at:", sqlPath);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlPath, "utf8");
  console.log("Connecting to Supabase Postgres database...");

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log("Connected successfully. Running schema.sql...");
    
    await client.query(sqlContent);
    console.log("schema.sql executed successfully!");
  } catch (err) {
    console.error("Error executing schema:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

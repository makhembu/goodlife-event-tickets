const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const connectionString = process.env.DATABASE_URL;

async function main() {
  const sqlPath = path.join(process.cwd(), "schema-neon.sql");
  if (!fs.existsSync(sqlPath)) {
    console.error("schema.sql not found at:", sqlPath);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlPath, "utf8");
  console.log("Connecting to Neon Postgres database...");

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
    console.log("schema.sql executed successfully on Neon!");
  } catch (err) {
    console.error("Error executing schema on Neon:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

const { Client } = require("pg");

const regions = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
  "sa-east-1", "ca-central-1", "me-central-1", "af-south-1", "ap-south-1"
];

const password = "vlzQ3NHVuvJTrjg2";
const projectRef = "kbwftozaisewcpnfzcar";

async function findRegion() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    console.log(`Trying region ${region} on port 5432...`);
    
    const client = new Client({
      host,
      port: 5432,
      database: "postgres",
      user: `postgres.${projectRef}`,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000
    });

    try {
      await client.connect();
      console.log(`\nSUCCESS! Database is hosted in region: ${region} (port 5432)`);
      console.log(`Connection host: ${host}`);
      await client.end();
      process.exit(0);
    } catch (err) {
      console.log(`Failed ${region}: ${err.message}`);
    }
  }
  console.log("Failed to connect to any region pooler on port 5432.");
}

findRegion();

/**
 * Migration: add pdf_data column to tickets table
 * Run: node scripts/add-pdf-column.js
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// Parse .env.local manually to avoid dotenv dependency
function loadEnv() {
  const envPath = path.join(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Running migration: add pdf_data to tickets...");

    await client.query(`
      ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS pdf_data TEXT;
    `);

    console.log("✅  pdf_data column added (or already exists).");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

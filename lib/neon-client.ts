import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

let pool: Pool;

export function getDbPool(): Pool {
  if (process.env.NODE_ENV === "production") {
    if (!pool) {
      pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });
    }
    return pool;
  } else {
    if (!(global as any)._neonPool) {
      (global as any)._neonPool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });
    }
    return (global as any)._neonPool;
  }
}

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const db = getDbPool();
  try {
    const res = await db.query(text, params);
    const duration = Date.now() - start;
    // console.log("executed query", { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

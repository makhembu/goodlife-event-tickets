import fs from "fs";
import path from "path";
import zlib from "zlib";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Pool } from "pg";

function readEnv(key: string): string {
  if (process.env[key] !== undefined && process.env[key] !== "") {
    return process.env[key]!.replace(/^["']|["']$/g, "").trim();
  }
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"#\\r\\n]+?)"?\\s*$`));
        if (m) return m[1].replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch {}
  return "";
}

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    const connStr = readEnv("DATABASE_URL");
    _pool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return _pool;
}

let _s3Client: S3Client | null = null;
function getS3Client(): S3Client | null {
  if (_s3Client) return _s3Client;
  const accountId = readEnv("R2_ACCOUNT_ID");
  const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");

  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  _s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _s3Client;
}

export interface BackupResult {
  success: boolean;
  backupKey: string;
  localPath: string;
  fileSizeBytes: number;
  tableCount: number;
  rowCount: number;
  tables: Record<string, number>;
  r2Uploaded: boolean;
  error?: string;
}

/**
 * Generates a full SQL dump of all public tables and rows from Supabase,
 * compresses it with gzip, saves it locally under `backups/db/`,
 * and uploads to Cloudflare R2 for offsite redundancy.
 */
export async function executeDatabaseBackup(): Promise<BackupResult> {
  const pool = getPool();
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // 1. Enumerate all tables in the public schema
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tableNames: string[] = tablesRes.rows.map((r) => r.table_name);
    let totalRowCount = 0;
    const tableCounts: Record<string, number> = {};
    const dumpLines: string[] = [];

    const now = new Date();
    dumpLines.push(`-- ============================================================`);
    dumpLines.push(`-- GOODLIFE FESTIVAL & RADIO DATABASE BACKUP`);
    dumpLines.push(`-- Created At: ${now.toISOString()} (${now.toUTCString()})`);
    dumpLines.push(`-- Source: Supabase PostgreSQL`);
    dumpLines.push(`-- Total Tables: ${tableNames.length}`);
    dumpLines.push(`-- ============================================================\n`);
    dumpLines.push(`BEGIN;\n`);

    // 2. Dump each table's schema and data
    for (const tbl of tableNames) {
      // Get table columns
      const colsRes = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [tbl]);

      const columns = colsRes.rows.map((r) => `"${r.column_name}"`);
      const rawColNames = colsRes.rows.map((r) => r.column_name);

      // Fetch all rows
      const dataRes = await client.query(`SELECT * FROM "${tbl}"`);
      const rows = dataRes.rows;
      tableCounts[tbl] = rows.length;
      totalRowCount += rows.length;

      dumpLines.push(`-- Table: ${tbl} (${rows.length} rows)`);

      if (rows.length > 0 && columns.length > 0) {
        for (const row of rows) {
          const values = rawColNames.map((col) => {
            const val = row[col];
            if (val === null || val === undefined) return "NULL";
            if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
            if (typeof val === "number") return String(val);
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === "object") {
              const str = JSON.stringify(val).replace(/'/g, "''");
              return `'${str}'::jsonb`;
            }
            // Strings: escape single quotes
            const strVal = String(val).replace(/'/g, "''");
            return `'${strVal}'`;
          });

          dumpLines.push(
            `INSERT INTO "${tbl}" (${columns.join(", ")}) VALUES (${values.join(", ")});`
          );
        }
      }
      dumpLines.push("");
    }

    dumpLines.push(`COMMIT;\n`);
    dumpLines.push(`-- Backup completed in ${(Date.now() - startTime)}ms. Total rows: ${totalRowCount}`);

    const sqlContent = dumpLines.join("\n");
    const compressedGzip = zlib.gzipSync(Buffer.from(sqlContent, "utf8"), { level: 9 });

    // 3. Save locally in backups/db/
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestampStr = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}UTC`;
    const filename = `goodlife-db-${timestampStr}.sql.gz`;
    const localDir = path.resolve(process.cwd(), "backups", "db");
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localPath = path.join(localDir, filename);
    fs.writeFileSync(localPath, compressedGzip);

    // Prune local backups older than 30 days
    try {
      pruneLocalBackups(localDir, 30);
    } catch {}

    // 4. Store in Cloudflare R2 for offsite safety
    const backupKey = `backups/db/${filename}`;
    let r2Uploaded = false;
    const s3 = getS3Client();
    const bucket = readEnv("R2_BUCKET_NAME") || "goodlife";

    if (s3) {
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: backupKey,
            Body: compressedGzip,
            ContentType: "application/gzip",
            Metadata: {
              "x-amz-meta-tables": String(tableNames.length),
              "x-amz-meta-rows": String(totalRowCount),
              "x-amz-meta-created": now.toISOString(),
            },
          })
        );
        r2Uploaded = true;
        // Clean up R2 backups older than 30 days
        await pruneR2Backups(s3, bucket, 30);
      } catch (r2Err: any) {
        console.warn("[db-backup] R2 upload optional warning:", r2Err?.message);
      }
    }

    // 5. Record to db_backup_logs in database
    try {
      await client.query(`
        INSERT INTO db_backup_logs 
          (backup_key, file_size_bytes, table_count, row_count, storage_destination, status, created_at)
        VALUES ($1, $2, $3, $4, $5, 'success', NOW())
      `, [backupKey, compressedGzip.length, tableNames.length, totalRowCount, r2Uploaded ? "local+r2" : "local_disk"]);
    } catch (logErr: any) {
      console.warn("[db-backup] Failed to write backup log:", logErr?.message);
    }

    return {
      success: true,
      backupKey,
      localPath,
      fileSizeBytes: compressedGzip.length,
      tableCount: tableNames.length,
      rowCount: totalRowCount,
      tables: tableCounts,
      r2Uploaded,
    };
  } catch (err: any) {
    console.error("[db-backup] Execution error:", err);
    try {
      await client.query(`
        INSERT INTO db_backup_logs 
          (backup_key, file_size_bytes, table_count, row_count, storage_destination, status, error_message, created_at)
        VALUES ('FAILED', 0, 0, 0, 'none', 'failed', $1, NOW())
      `, [err.message]);
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Prune local disk backups older than `daysRetention` (default 30 days).
 */
function pruneLocalBackups(dir: string, daysRetention = 30) {
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - daysRetention * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".sql.gz") || file.endsWith(".sql")) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }
  }
}

/**
 * Prune R2 backup archives older than `daysRetention` (default 30 days).
 */
async function pruneR2Backups(s3: S3Client, bucket: string, daysRetention = 30): Promise<number> {
  const listCmd = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: "backups/db/",
  });
  const res = await s3.send(listCmd);
  if (!res.Contents || res.Contents.length === 0) return 0;

  const cutoff = Date.now() - daysRetention * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  for (const obj of res.Contents) {
    if (!obj.Key || !obj.LastModified) continue;
    if (obj.LastModified.getTime() < cutoff) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
      deletedCount++;
    }
  }

  return deletedCount;
}

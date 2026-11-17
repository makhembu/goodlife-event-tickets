import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { executeDatabaseBackup } from "@/lib/db-backup";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const res = await neonQuery(`
      SELECT id, backup_key, file_size_bytes, table_count, row_count, storage_destination, status, error_message, created_at
      FROM db_backup_logs
      ORDER BY created_at DESC
      LIMIT 20
    `);

    return NextResponse.json({
      success: true,
      backups: res.rows || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await executeDatabaseBackup();
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

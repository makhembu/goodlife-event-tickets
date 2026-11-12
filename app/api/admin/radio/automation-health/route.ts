import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req);
  if (authError) {
    return authError;
  }

  try {
    // 1. Fetch latest registered automation worker
    const { rows: workers } = await neonQuery(
      `SELECT worker_id, hostname, status, last_heartbeat, last_successful_drop, 
              last_successful_upload, current_job_id, last_error, last_error_at,
              ROUND(EXTRACT(EPOCH FROM (NOW() - last_heartbeat)))::int as heartbeat_age_sec
       FROM radio_automation_workers
       ORDER BY last_heartbeat DESC
       LIMIT 1`
    );

    const worker = workers?.[0] || null;
    let computedStatus: "ONLINE" | "IDLE" | "PROCESSING" | "DEGRADED" | "OFFLINE" = "OFFLINE";

    if (worker) {
      const ageSec = worker.heartbeat_age_sec ?? 999;
      if (ageSec > 45) {
        computedStatus = "OFFLINE";
      } else if (
        worker.status === "DEGRADED" ||
        (worker.last_error && worker.last_error_at && (Date.now() - new Date(worker.last_error_at).getTime() < 120_000))
      ) {
        computedStatus = "DEGRADED";
      } else if (worker.current_job_id !== null || worker.status === "PROCESSING") {
        computedStatus = "PROCESSING";
      } else {
        computedStatus = "IDLE";
      }
    }

    // 2. Fetch latest drop info
    const { rows: dropRows } = await neonQuery(
      `SELECT id, title, status, created_at, audio_url, completed_at, attempt_count, last_error
       FROM radio_drops
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    const latestDrop = dropRows?.[0] || null;

    // 3. Count failures in last 24h
    const { rows: failedRows } = await neonQuery(
      `SELECT COUNT(*)::int as count 
       FROM radio_drops 
       WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '24 hours'`
    );

    // 4. Active listeners count
    const { rows: listenerRows } = await neonQuery(
      `SELECT COUNT(DISTINCT session_id)::int as count 
       FROM radio_listener_pings 
       WHERE last_seen >= NOW() - INTERVAL '45 seconds'`
    );

    return NextResponse.json({
      success: true,
      worker_health: computedStatus,
      worker: worker
        ? {
            id: worker.worker_id,
            hostname: worker.hostname,
            heartbeat_age_sec: worker.heartbeat_age_sec,
            last_successful_drop: worker.last_successful_drop,
            last_successful_upload: worker.last_successful_upload,
            last_error: worker.last_error,
          }
        : null,
      active_listeners: listenerRows?.[0]?.count || 0,
      latest_drop: latestDrop,
      failed_jobs_24h: failedRows?.[0]?.count || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load automation health" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeGetJob, bridgeQueueIngest } from "@/lib/radio/bridge-client";
import { neonQuery } from "@/lib/supabase-db";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("job_id");
  if (!jobId) {
    return NextResponse.json({ error: "job_id required" }, { status: 400 });
  }

  const res = await bridgeGetJob(jobId);
  if (!res.ok) {
    return NextResponse.json({ error: res.error || "Job query failed" }, { status: 502 });
  }
  return NextResponse.json(res.data);
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const { tracks, genre, event_id, playlist_id, playlist_title, source_url } = body;

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json({ error: "Tracks array required" }, { status: 400 });
    }

    const res = await bridgeQueueIngest({
      tracks,
      genre,
      event_id,
      playlist_id: playlist_id ? Number(playlist_id) : null,
      playlist_title: playlist_title ? String(playlist_title) : undefined,
    });
    if (!res.ok) {
      return NextResponse.json({ error: res.error || "Failed to enqueue ingestion" }, { status: 502 });
    }

    if (playlist_id && res.data?.job_id) {
      try {
        await neonQuery(
          `UPDATE radio_playlists
           SET ingest_job_id = $1,
               ingest_source_url = COALESCE($2, ingest_source_url),
               updated_at = NOW()
           WHERE id = $3`,
          [res.data.job_id, source_url ? String(source_url) : null, Number(playlist_id)]
        );
      } catch {}
    }

    return NextResponse.json(res.data, { status: 202 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Invalid payload" }, { status: 400 });
  }
}

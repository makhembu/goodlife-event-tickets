import { neonQuery } from "@/lib/supabase-db";

export interface LifecycleTickPayload {
  harbor_connected: boolean;
  active_presenter_id?: number | null;
  active_slot_id?: number | null;
  disconnect_seconds?: number; // How long current harbor has been disconnected (seconds)
}

export interface LifecycleTickResult {
  broadcast_mode: "live" | "autodj" | "curated";
  live_title?: string;
  active_slot?: {
    id: number;
    show_id: number;
    show_title: string;
    presenter_id: number;
    dj_name: string;
    status: string;
  } | null;
  kick_source: boolean;
  kick_reason?: string;
  transitions_applied: string[];
}

const DEFAULT_OVERRUN_GRACE_MINUTES = 5;
const DEFAULT_DISCONNECT_GRACE_MINUTES = 5;
const DEFAULT_NOSHOW_MINUTES = 10;

/**
 * Executes a single idempotent pass of the radio programming slot lifecycle state machine.
 */
export async function executeSlotLifecycleTick(
  payload: LifecycleTickPayload
): Promise<LifecycleTickResult> {
  const overrunGraceMin = parseInt(
    process.env.OVERRUN_GRACE_MINUTES || String(DEFAULT_OVERRUN_GRACE_MINUTES),
    10
  );
  const disconnectGraceMin = parseInt(
    process.env.DISCONNECT_GRACE_MINUTES || String(DEFAULT_DISCONNECT_GRACE_MINUTES),
    10
  );
  const noshowMin = parseInt(
    process.env.NOSHOW_MINUTES || String(DEFAULT_NOSHOW_MINUTES),
    10
  );

  const now = new Date();
  const transitions: string[] = [];
  let kickSource = false;
  let kickReason: string | undefined;

  // 1. Check for No-shows: Slots that started > noshowMin ago and never connected
  const noshowLimit = new Date(now.getTime() - noshowMin * 60 * 1000);
  const noshowRes = await neonQuery(
    `UPDATE show_slots
     SET status = 'noshow',
         updated_at = NOW()
     WHERE status IN ('scheduled', 'warmup')
       AND starts_at < $1
       AND actual_started_at IS NULL
     RETURNING id, show_id, starts_at;`,
    [noshowLimit.toISOString()]
  );

  for (const row of noshowRes.rows) {
    transitions.push(`Slot #${row.id} marked NOSHOW (started at ${row.starts_at}, no source connected after ${noshowMin}m)`);
  }

  // 2. Identify currently active Live slot in database
  const liveSlotRes = await neonQuery(
    `SELECT s.id, s.show_id, s.presenter_id, s.substitute_presenter_id,
            s.starts_at, s.ends_at, s.status, s.actual_started_at,
            sh.title AS show_title, p.dj_name,
            COALESCE(sub.dj_name, p.dj_name) AS effective_dj_name
     FROM show_slots s
     JOIN shows sh ON s.show_id = sh.id
     JOIN presenters p ON s.presenter_id = p.id
     LEFT JOIN presenters sub ON s.substitute_presenter_id = sub.id
     WHERE s.status = 'live'
     ORDER BY s.starts_at ASC
     LIMIT 1;`
  );

  let currentLiveSlot = liveSlotRes.rows[0] || null;

  // 3. If harbor is CONNECTED and matches an assigned presenter slot
  if (payload.harbor_connected && payload.active_presenter_id) {
    // If no slot is marked live yet, transition candidate slot to live
    if (!currentLiveSlot) {
      const candidateRes = await neonQuery(
        `SELECT s.id, s.show_id, s.presenter_id, s.substitute_presenter_id,
                s.starts_at, s.ends_at, sh.title AS show_title,
                COALESCE(sub.dj_name, p.dj_name) AS effective_dj_name
         FROM show_slots s
         JOIN shows sh ON s.show_id = sh.id
         JOIN presenters p ON s.presenter_id = p.id
         LEFT JOIN presenters sub ON s.substitute_presenter_id = sub.id
         WHERE (s.presenter_id = $1 OR s.substitute_presenter_id = $1)
           AND s.status IN ('scheduled', 'warmup')
           AND s.starts_at <= $2
           AND s.ends_at > $3
         ORDER BY s.starts_at ASC
         LIMIT 1;`,
        [
          payload.active_presenter_id,
          new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
          now.toISOString(),
        ]
      );

      if (candidateRes.rows.length > 0) {
        const slot = candidateRes.rows[0];
        const liveTitle = `${slot.show_title} with ${slot.effective_dj_name}`;

        await neonQuery(
          `UPDATE show_slots
           SET status = 'live',
               actual_started_at = COALESCE(actual_started_at, NOW()),
               live_stream_title = $1,
               updated_at = NOW()
           WHERE id = $2;`,
          [liveTitle, slot.id]
        );

        // Update station settings automatically to LIVE with no manual admin intervention
        await neonQuery(
          `UPDATE radio_settings
           SET broadcast_mode = 'live',
               live_title = $1,
               updated_at = NOW()
           WHERE id = 1;`,
          [liveTitle]
        );

        transitions.push(`Slot #${slot.id} transitioned to LIVE ("${liveTitle}")`);
        currentLiveSlot = { ...slot, status: "live", live_stream_title: liveTitle };
      }
    }
  }

  // 4. Overrun & Handover evaluation
  if (currentLiveSlot) {
    const slotEndsAt = new Date(currentLiveSlot.ends_at);
    const overrunDeadline = new Date(slotEndsAt.getTime() + overrunGraceMin * 60 * 1000);

    if (now > overrunDeadline) {
      // Check if an upcoming slot is scheduled or waiting to start
      const upcomingRes = await neonQuery(
        `SELECT s.id, s.starts_at, sh.title AS show_title
         FROM show_slots s
         JOIN shows sh ON s.show_id = sh.id
         WHERE s.status IN ('scheduled', 'warmup')
           AND s.id != $1
           AND s.starts_at <= $2
         ORDER BY s.starts_at ASC
         LIMIT 1;`,
        [currentLiveSlot.id, new Date(now.getTime() + 15 * 60 * 1000).toISOString()]
      );

      if (upcomingRes.rows.length > 0) {
        // Next slot is due! Force handover / kick current source
        kickSource = true;
        kickReason = `Overrun grace expired (${overrunGraceMin}m past slot end). Next show "${upcomingRes.rows[0].show_title}" is ready.`;

        await neonQuery(
          `UPDATE show_slots
           SET status = 'completed',
               actual_ended_at = NOW(),
               updated_at = NOW()
           WHERE id = $1;`,
          [currentLiveSlot.id]
        );

        transitions.push(`Slot #${currentLiveSlot.id} closed due to overrun handover (${kickReason})`);
        currentLiveSlot = null;
      }
    }
  }

  // 5. Disconnect grace evaluation:
  // If slot was live, but daemon reports harbor has been DISCONNECTED past grace window
  if (currentLiveSlot && !payload.harbor_connected) {
    const disconnectSec = payload.disconnect_seconds || 0;
    const disconnectGraceSec = disconnectGraceMin * 60;

    if (disconnectSec >= disconnectGraceSec) {
      // Grace period exhausted: conclude slot
      await neonQuery(
        `UPDATE show_slots
         SET status = 'completed',
             actual_ended_at = NOW(),
             updated_at = NOW()
         WHERE id = $1;`,
        [currentLiveSlot.id]
      );

      transitions.push(
        `Slot #${currentLiveSlot.id} completed after disconnect grace window (${disconnectGraceMin}m disconnected)`
      );
      currentLiveSlot = null;
    }
  }

  // 6. Playout Mode Alignment
  // When no presenter is live, station broadcast_mode automatically returns to autodj
  let mode: "live" | "autodj" | "curated" = "autodj";
  let activeTitle: string | undefined;

  if (currentLiveSlot && payload.harbor_connected) {
    mode = "live";
    activeTitle = `${currentLiveSlot.show_title} with ${currentLiveSlot.effective_dj_name}`;
  } else {
    // Return broadcast_mode to autodj if currently live in settings
    const settingsRes = await neonQuery(
      `SELECT broadcast_mode FROM radio_settings WHERE id = 1;`
    );
    const currentMode = settingsRes.rows[0]?.broadcast_mode;
    if (currentMode === "live") {
      await neonQuery(
        `UPDATE radio_settings
         SET broadcast_mode = 'autodj',
             live_title = 'Goodlife AutoDJ Festival Playout',
             updated_at = NOW()
         WHERE id = 1;`
      );
      transitions.push("Station broadcast_mode reverted from 'live' to 'autodj'");
    }
    mode = (currentMode === "curated" ? "curated" : "autodj");
  }

  return {
    broadcast_mode: mode,
    live_title: activeTitle,
    active_slot: currentLiveSlot
      ? {
          id: currentLiveSlot.id,
          show_id: currentLiveSlot.show_id,
          show_title: currentLiveSlot.show_title,
          presenter_id: currentLiveSlot.presenter_id,
          dj_name: currentLiveSlot.effective_dj_name,
          status: currentLiveSlot.status,
        }
      : null,
    kick_source: kickSource,
    kick_reason: kickReason,
    transitions_applied: transitions,
  };
}

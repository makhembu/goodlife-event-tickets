/**
 * Verification test suite for Goodlife Radio slot lifecycle state machine,
 * handover enforcement, disconnect grace, and no-show transitions.
 *
 * Run with:
 *   .\node_modules\.bin\tsx.cmd tests/radio-lifecycle.check.ts
 */

let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.error(`  ✗ FAIL: ${name}`);
  }
}

// ------------------------------------------------------------------------------
// Pure State Machine Implementation for Offline Verification
// ------------------------------------------------------------------------------
export type SlotStatus = "scheduled" | "warmup" | "live" | "completed" | "cancelled" | "noshow";

export interface MockSlot {
  id: number;
  show_id: number;
  show_title: string;
  presenter_id: number;
  dj_name: string;
  starts_at: Date;
  ends_at: Date;
  status: SlotStatus;
  actual_started_at: Date | null;
  actual_ended_at: Date | null;
  live_stream_title?: string;
}

export interface RadioSettings {
  broadcast_mode: "live" | "autodj" | "curated";
  live_title: string;
}

export interface LifecycleContext {
  slots: MockSlot[];
  settings: RadioSettings;
  currentTime: Date;
  harbor_connected: boolean;
  active_presenter_id: number | null;
  disconnect_seconds: number;
  overrun_grace_minutes: number;
  disconnect_grace_minutes: number;
  noshow_minutes: number;
}

export interface TickOutput {
  broadcast_mode: "live" | "autodj" | "curated";
  live_title?: string;
  kick_source: boolean;
  kick_reason?: string;
  transitions: string[];
}

export function simulateLifecycleTick(ctx: LifecycleContext): TickOutput {
  const transitions: string[] = [];
  let kickSource = false;
  let kickReason: string | undefined;

  const nowMs = ctx.currentTime.getTime();
  const noshowLimitMs = nowMs - ctx.noshow_minutes * 60 * 1000;

  // 1. Mark No-Shows: scheduled slots started > noshow_minutes ago without connect
  for (const slot of ctx.slots) {
    if ((slot.status === "scheduled" || slot.status === "warmup") && slot.starts_at.getTime() < noshowLimitMs && !slot.actual_started_at) {
      slot.status = "noshow";
      transitions.push(`Slot #${slot.id} marked NOSHOW`);
    }
  }

  // 2. Identify active live slot
  let liveSlot = ctx.slots.find((s) => s.status === "live") || null;

  // 3. Connect: if harbor is connected and presenter matches an upcoming/current slot
  if (ctx.harbor_connected && ctx.active_presenter_id && !liveSlot) {
    const candidate = ctx.slots.find((s) => {
      const isPresenter = s.presenter_id === ctx.active_presenter_id;
      const inWindow = s.starts_at.getTime() - 15 * 60 * 1000 <= nowMs && s.ends_at.getTime() > nowMs;
      return isPresenter && inWindow && (s.status === "scheduled" || s.status === "warmup");
    });

    if (candidate) {
      candidate.status = "live";
      candidate.actual_started_at = candidate.actual_started_at || ctx.currentTime;
      candidate.live_stream_title = `${candidate.show_title} with ${candidate.dj_name}`;
      ctx.settings.broadcast_mode = "live";
      ctx.settings.live_title = candidate.live_stream_title;
      transitions.push(`Slot #${candidate.id} transitioned to LIVE`);
      liveSlot = candidate;
    }
  }

  // 4. Overrun & Handover evaluation
  if (liveSlot) {
    const overrunDeadlineMs = liveSlot.ends_at.getTime() + ctx.overrun_grace_minutes * 60 * 1000;
    if (nowMs > overrunDeadlineMs) {
      // Check if next slot is queued
      const hasNextSlot = ctx.slots.some(
        (s) => s.id !== liveSlot!.id && (s.status === "scheduled" || s.status === "warmup") && s.starts_at.getTime() <= nowMs + 15 * 60 * 1000
      );

      if (hasNextSlot) {
        kickSource = true;
        kickReason = `Overrun grace expired. Handover to next queued slot.`;
        liveSlot.status = "completed";
        liveSlot.actual_ended_at = ctx.currentTime;
        transitions.push(`Slot #${liveSlot.id} completed due to overrun cutoff`);
        liveSlot = null;
      }
    }
  }

  // 5. Disconnect grace evaluation
  if (liveSlot && !ctx.harbor_connected) {
    const graceSec = ctx.disconnect_grace_minutes * 60;
    if (ctx.disconnect_seconds >= graceSec) {
      liveSlot.status = "completed";
      liveSlot.actual_ended_at = ctx.currentTime;
      transitions.push(`Slot #${liveSlot.id} completed after disconnect grace`);
      liveSlot = null;
    }
  }

  // 6. Playout Mode Alignment
  if (liveSlot && ctx.harbor_connected) {
    ctx.settings.broadcast_mode = "live";
  } else {
    if (ctx.settings.broadcast_mode === "live") {
      ctx.settings.broadcast_mode = "autodj";
      ctx.settings.live_title = "Goodlife AutoDJ Festival Playout";
      transitions.push("Station broadcast_mode reverted to autodj");
    }
  }

  return {
    broadcast_mode: ctx.settings.broadcast_mode,
    live_title: liveSlot ? liveSlot.live_stream_title : ctx.settings.live_title,
    kick_source: kickSource,
    kick_reason: kickReason,
    transitions,
  };
}

async function runTests() {
  console.log("=== Goodlife Radio Slot Lifecycle Checks ===");

  // 1. Initial State & Auto-Live Transition
  const slot1: MockSlot = {
    id: 1,
    show_id: 10,
    show_title: "Afrobeats Drive",
    presenter_id: 101,
    dj_name: "DJ Khesh",
    starts_at: new Date("2026-11-20T17:00:00.000Z"),
    ends_at: new Date("2026-11-20T19:00:00.000Z"),
    status: "scheduled",
    actual_started_at: null,
    actual_ended_at: null,
  };

  const slot2: MockSlot = {
    id: 2,
    show_id: 20,
    show_title: "Late Night Amapiano",
    presenter_id: 102,
    dj_name: "DJ Next",
    starts_at: new Date("2026-11-20T19:00:00.000Z"),
    ends_at: new Date("2026-11-20T21:00:00.000Z"),
    status: "scheduled",
    actual_started_at: null,
    actual_ended_at: null,
  };

  const baseSettings: RadioSettings = {
    broadcast_mode: "autodj",
    live_title: "Goodlife AutoDJ Festival Playout",
  };

  // Test: DJ connects at 17:01 during slot1
  const ctxConnect: LifecycleContext = {
    slots: [{ ...slot1 }, { ...slot2 }],
    settings: { ...baseSettings },
    currentTime: new Date("2026-11-20T17:01:00.000Z"),
    harbor_connected: true,
    active_presenter_id: 101,
    disconnect_seconds: 0,
    overrun_grace_minutes: 5,
    disconnect_grace_minutes: 5,
    noshow_minutes: 10,
  };

  const tick1 = simulateLifecycleTick(ctxConnect);
  check("Connecting during slot transitions status to 'live'", ctxConnect.slots[0].status === "live");
  check("actual_started_at is recorded on connect", ctxConnect.slots[0].actual_started_at !== null);
  check("Station broadcast mode automatically updates to 'live'", tick1.broadcast_mode === "live");
  check("Live stream title automatically reflects show title and DJ name", tick1.live_title === "Afrobeats Drive with DJ Khesh");

  // 2. Disconnect Grace Period Simulation
  console.log("\n=== Disconnect Grace Period ===");
  // Scenario A: Brief 2-minute internet hiccup (disconnect_seconds = 120, grace = 300)
  const ctxHiccup: LifecycleContext = {
    ...ctxConnect,
    currentTime: new Date("2026-11-20T17:45:00.000Z"),
    harbor_connected: false,
    disconnect_seconds: 120,
  };
  const tickHiccup = simulateLifecycleTick(ctxHiccup);
  check("Brief disconnect (2m < 5m grace) keeps slot status as 'live'", ctxHiccup.slots[0].status === "live");
  check("Brief disconnect does not kick or terminate the show prematurely", !tickHiccup.kick_source);

  // Scenario B: Long disconnect exceeding grace window (disconnect_seconds = 305 >= 300)
  const ctxDropped: LifecycleContext = {
    ...ctxConnect,
    currentTime: new Date("2026-11-20T17:50:00.000Z"),
    harbor_connected: false,
    disconnect_seconds: 305,
  };
  const tickDropped = simulateLifecycleTick(ctxDropped);
  check("Persistent disconnect (>5m grace) concludes slot as 'completed'", ctxDropped.slots[0].status === "completed");
  check("actual_ended_at is stamped on completion", ctxDropped.slots[0].actual_ended_at !== null);
  check("Station mode reverts to 'autodj' after presenter disconnects past grace", tickDropped.broadcast_mode === "autodj");

  // 3. Overrun Handover & Cutoff
  console.log("\n=== Overrun & Handover Cutoff ===");
  // Scenario A: DJ overruns by 2 minutes (within 5m grace) -> allowed to continue
  const liveSlotOverrunSmall: MockSlot = {
    ...slot1,
    status: "live",
    actual_started_at: new Date("2026-11-20T17:00:00.000Z"),
  };
  const ctxOverrunWithinGrace: LifecycleContext = {
    slots: [{ ...liveSlotOverrunSmall }, { ...slot2 }],
    settings: { broadcast_mode: "live", live_title: "Afrobeats Drive with DJ Khesh" },
    currentTime: new Date("2026-11-20T19:02:00.000Z"), // 2 mins past 19:00 end
    harbor_connected: true,
    active_presenter_id: 101,
    disconnect_seconds: 0,
    overrun_grace_minutes: 5,
    disconnect_grace_minutes: 5,
    noshow_minutes: 10,
  };
  const tickOverrunSmall = simulateLifecycleTick(ctxOverrunWithinGrace);
  check("Overrun within 5-minute grace does not kick DJ", !tickOverrunSmall.kick_source);
  check("Slot remains 'live' during overrun grace", ctxOverrunWithinGrace.slots[0].status === "live");

  // Scenario B: DJ overruns by 6 minutes (>5m grace) AND next slot is queued -> KICK & HANDOVER
  const ctxOverrunCutoff: LifecycleContext = {
    slots: [{ ...liveSlotOverrunSmall }, { ...slot2 }],
    settings: { broadcast_mode: "live", live_title: "Afrobeats Drive with DJ Khesh" },
    currentTime: new Date("2026-11-20T19:06:00.000Z"), // 6 mins past 19:00 end
    harbor_connected: true,
    active_presenter_id: 101,
    disconnect_seconds: 0,
    overrun_grace_minutes: 5,
    disconnect_grace_minutes: 5,
    noshow_minutes: 10,
  };
  const tickCutoff = simulateLifecycleTick(ctxOverrunCutoff);
  check("Overrun past 5m grace when next slot is queued triggers harbor kick", tickCutoff.kick_source);
  check("Overrun slot is transitioned to 'completed'", ctxOverrunCutoff.slots[0].status === "completed");
  check("Overrun cutoff provides explicit kick reason", tickCutoff.kick_reason?.includes("Overrun grace expired"));

  // Scenario C: DJ overruns by 15 minutes, but NO subsequent slot exists (open air) -> Allowed to play
  const ctxOpenAirOverrun: LifecycleContext = {
    slots: [{ ...liveSlotOverrunSmall }], // No slot2 queued
    settings: { broadcast_mode: "live", live_title: "Afrobeats Drive with DJ Khesh" },
    currentTime: new Date("2026-11-20T19:15:00.000Z"),
    harbor_connected: true,
    active_presenter_id: 101,
    disconnect_seconds: 0,
    overrun_grace_minutes: 5,
    disconnect_grace_minutes: 5,
    noshow_minutes: 10,
  };
  const tickOpenAir = simulateLifecycleTick(ctxOpenAirOverrun);
  check("Overrun without queued subsequent show is allowed to continue (no harbor kick)", !tickOpenAir.kick_source);
  check("Slot remains live when extending into unbooked airtime", ctxOpenAirOverrun.slots[0].status === "live");

  // 4. No-Show Cutoff
  console.log("\n=== No-Show Transitions ===");
  // Slot scheduled at 17:00, current time is 17:11 (11 mins > 10m limit) and DJ never connected
  const unstartedSlot: MockSlot = {
    id: 99,
    show_id: 999,
    show_title: "Ghost Show",
    presenter_id: 999,
    dj_name: "DJ Ghost",
    starts_at: new Date("2026-11-20T17:00:00.000Z"),
    ends_at: new Date("2026-11-20T18:00:00.000Z"),
    status: "scheduled",
    actual_started_at: null,
    actual_ended_at: null,
  };
  const ctxNoshow: LifecycleContext = {
    slots: [{ ...unstartedSlot }],
    settings: { broadcast_mode: "autodj", live_title: "Goodlife AutoDJ Festival Playout" },
    currentTime: new Date("2026-11-20T17:11:00.000Z"),
    harbor_connected: false,
    active_presenter_id: null,
    disconnect_seconds: 0,
    overrun_grace_minutes: 5,
    disconnect_grace_minutes: 5,
    noshow_minutes: 10,
  };
  const tickNoshow = simulateLifecycleTick(ctxNoshow);
  check("Unattended slot after 10m past start is marked 'noshow'", ctxNoshow.slots[0].status === "noshow");
  check("Station remains in AutoDJ when presenter is a no-show", tickNoshow.broadcast_mode === "autodj");

  // 5. Idempotency Check
  console.log("\n=== Idempotency Verification ===");
  const ctxStable: LifecycleContext = {
    slots: [{ ...slot1, status: "live", actual_started_at: new Date("2026-11-20T17:00:00.000Z") }],
    settings: { broadcast_mode: "live", live_title: "Afrobeats Drive with DJ Khesh" },
    currentTime: new Date("2026-11-20T17:30:00.000Z"),
    harbor_connected: true,
    active_presenter_id: 101,
    disconnect_seconds: 0,
    overrun_grace_minutes: 5,
    disconnect_grace_minutes: 5,
    noshow_minutes: 10,
  };
  const tickA = simulateLifecycleTick(ctxStable);
  const tickB = simulateLifecycleTick(ctxStable);
  check("Repeated ticks during ongoing live broadcast produce 0 state mutations", tickA.transitions.length === 0 && tickB.transitions.length === 0);
  check("Repeated ticks preserve live broadcast mode and title consistently", tickA.broadcast_mode === tickB.broadcast_mode && tickA.live_title === tickB.live_title);

  console.log(`\nResults: ${pass} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

runTests();

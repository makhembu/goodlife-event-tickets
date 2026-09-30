/**
 * Server-side WAHA (WhatsApp HTTP API) client used by the admin gateway console.
 *
 * SECURITY CONTRACT
 * -----------------
 * WAHA is an unauthenticated-by-default engine that answers with free-form
 * English and sometimes HTML — e.g. "The headless Chromium session is booting
 * up. Please wait ~15 seconds". Nothing raw may leave this module:
 *
 *   - the base URL and API key are read from the environment and stay server side;
 *   - WAHA bodies are parsed, then discarded (the buffers are drained, not forwarded);
 *   - callers only ever receive `WahaStatus`, a normalized `me`, an inlined QR
 *     image and short allow-listed messages.
 *
 * Never `import` this from a client component.
 */

/** Normalized session lifecycle, in the order WAHA walks through them. */
export type WahaStatus = "STARTING" | "SCAN_QR_CODE" | "CONNECTED" | "OFFLINE";

export interface WahaMe {
  id: string | null;
  pushName: string | null;
}

export interface WahaSessionSnapshot {
  status: WahaStatus;
  me: WahaMe | null;
  /** the engine answered a request at all */
  reachable: boolean;
  /** the engine answered, but the browser session is still booting */
  warming: boolean;
  /**
   * The session reached a terminal failure (`FAILED`) and will not recover on
   * its own. Distinct from `OFFLINE`, which means "stopped / never created" —
   * both need an operator action, but only this one is a crash.
   *
   * This field exists because `FAILED` used to fall through to
   * `warming: true`. The console then sat on "warming up, please wait 15-30
   * seconds" and kept polling a session that was never going to finish
   * booting, with no way forward except an SSH session. Verified live on
   * 2026-09-30: `/api/sessions/default` returned `{"status":"FAILED"}` while
   * the page reported "warming"; a plain restart walked it to `SCAN_QR_CODE`
   * in ~20s.
   */
  failed: boolean;
}

export interface WahaQr {
  /** pairing payload, encoded to an image client side */
  raw: string | null;
  /** PNG of the same code, inlined so the browser never talks to WAHA */
  dataUrl: string | null;
}

export interface WahaSendResult {
  success: boolean;
  /** allow-listed wording, safe to render directly in the admin UI */
  message: string;
}

type Probe =
  | { kind: "json"; data: unknown }
  | { kind: "image"; dataUrl: string }
  | { kind: "error"; httpStatus: number }
  | { kind: "unreachable" };

/**
 * Gateway coordinates. `WAHA_*` wins so the admin console can be pointed at a
 * different engine without disturbing the ticket dispatcher in
 * `lib/whatsapp.ts`, which keeps using `WHATSAPP_GATEWAY_*`.
 */
export function wahaConfig() {
  if (typeof window !== "undefined") {
    throw new Error("lib/waha is server-only");
  }

  const baseUrl = (
    process.env.WAHA_BASE_URL ||
    process.env.WHATSAPP_GATEWAY_URL ||
    "https://waha.darajadigital.com"
  ).replace(/\/+$/, "");

  const apiKey =
    process.env.WAHA_API_KEY ||
    process.env.WHATSAPP_API_KEY ||
    "";

  const sessionId =
    process.env.WAHA_SESSION_ID || process.env.WHATSAPP_SESSION_ID || "default";

  return { baseUrl, apiKey, sessionId };
}

export function wahaSessionId() {
  return wahaConfig().sessionId;
}

/**
 * Single egress point to WAHA. Never throws, never returns a WAHA payload on
 * the failure paths — only the shape above.
 */
async function probe(
  path: string,
  timeoutMs: number,
  init?: { method: "GET" | "POST"; body?: unknown }
): Promise<Probe> {
  const { baseUrl, apiKey } = wahaConfig();

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "X-Api-Key": apiKey,
        Accept: "application/json, image/png",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    if (!res.ok) {
      // Drain so the socket is released. The body is deliberately thrown away:
      // this is exactly where WAHA leaks "Chromium is booting up" style text.
      await res.text().catch(() => "");
      return { kind: "error", httpStatus: res.status };
    }

    const contentType = res.headers.get("content-type") || "";

    if (contentType.startsWith("image/")) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { kind: "image", dataUrl: `data:${contentType};base64,${buf.toString("base64")}` };
    }

    return { kind: "json", data: await res.json().catch(() => null) };
  } catch (err) {
    console.warn(
      "[waha] request failed:",
      path,
      err instanceof Error ? err.message : err
    );
    return { kind: "unreachable" };
  }
}

function normalizeMe(value: unknown): WahaMe | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.slice(0, 128) : null;
  const pushName =
    typeof raw.pushName === "string" && raw.pushName.trim()
      ? raw.pushName.trim().slice(0, 80)
      : null;

  return id || pushName ? { id, pushName } : null;
}

/** Pull the pairing payload out of `{ value, mimetype }`, rejecting noise. */
function extractQrString(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;

  const value = (data as Record<string, unknown>).value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  // A real WAHA pairing payload is a long base64-ish blob. Anything shorter is
  // far more likely to be a nested error string, so refuse to echo it.
  return trimmed.length >= 20 ? trimmed : null;
}

const STOPPED_STATES = new Set(["STOPPED", "STOPPING", "ENDED", "REMOVED"]);

/**
 * Terminal crash states. WAHA sets these when the Chromium/browser session
 * dies — a crash, a lost WhatsApp pairing, or an OOM kill on the box. They are
 * NOT "still booting" and they will never resolve by waiting.
 *
 * `FAILED` is the one actually observed in production (2026-09-30). The rest
 * are listed defensively because every unrecognized state used to be reported
 * as warming, which is the bug: it converts a crash into an infinite wait.
 */
const FAILED_STATES = new Set(["FAILED", "FAILURE", "ERROR", "CRASHED"]);

/** Read the session's current lifecycle state. */
export async function getWahaSession(timeoutMs = 6000): Promise<WahaSessionSnapshot> {
  const { sessionId } = wahaConfig();
  const result = await probe(`/api/sessions/${encodeURIComponent(sessionId)}`, timeoutMs);

  if (result.kind === "unreachable") {
    return { status: "OFFLINE", me: null, reachable: false, warming: false, failed: false };
  }

  if (result.kind === "error") {
    // 404 = session never created or already removed; 401/403 = bad key.
    // 5xx = engine up but broken. None of these are linkable states.
    return {
      status: "OFFLINE",
      me: null,
      reachable: result.httpStatus < 500,
      warming: false,
      failed: false,
    };
  }

  const body =
    result.kind === "json" && result.data && typeof result.data === "object"
      ? (result.data as Record<string, unknown>)
      : {};

  const me = normalizeMe(body.me);
  const rawStatus =
    typeof body.status === "string" ? body.status.trim().toUpperCase() : "";

  if (FAILED_STATES.has(rawStatus)) {
    return { status: "OFFLINE", me: null, reachable: true, warming: false, failed: true };
  }

  if (me || rawStatus === "WORKING" || rawStatus === "CONNECTED") {
    return { status: "CONNECTED", me, reachable: true, warming: false, failed: false };
  }

  if (rawStatus === "SCAN_QR_CODE" || rawStatus === "SCAN_QR") {
    return { status: "SCAN_QR_CODE", me: null, reachable: true, warming: false, failed: false };
  }

  if (STOPPED_STATES.has(rawStatus)) {
    return { status: "OFFLINE", me: null, reachable: true, warming: false, failed: false };
  }

  // STARTING, or an unrecognized state: treat as still booting rather than
  // guessing, so the UI shows the warming state instead of a false failure.
  return { status: "STARTING", me: null, reachable: true, warming: true, failed: false };
}

/** Fetch the live pairing QR, as a raw payload or an inlined PNG. */
export async function getWahaQr(timeoutMs = 6000): Promise<WahaQr> {
  const { sessionId } = wahaConfig();
  const encoded = encodeURIComponent(sessionId);

  const raw = await probe(`/api/${encoded}/auth/qr?format=raw`, timeoutMs);
  if (raw.kind === "image") return { raw: null, dataUrl: raw.dataUrl };
  if (raw.kind === "json") {
    const value = extractQrString(raw.data);
    if (value) return { raw: value, dataUrl: null };
  }

  // Older WAHA builds ignore `?format=raw` and only serve the PNG.
  const png = await probe(`/api/${encoded}/auth/qr`, timeoutMs);
  if (png.kind === "image") return { raw: null, dataUrl: png.dataUrl };
  if (png.kind === "json") {
    const value = extractQrString(png.data);
    if (value) return { raw: value, dataUrl: null };
  }

  return { raw: null, dataUrl: null };
}

/**
 * Restart the browser session so a crashed/failed one can be recovered from
 * the admin page instead of over SSH.
 *
 * Safe to call from a client-triggered POST: it only re-launches Chromium. It
 * does not touch stored credentials, message history, or any ticket data, and a
 * session that is already healthy is re-paired from scratch either way (that is
 * inherent to WhatsApp, not to this endpoint).
 *
 * Returns the resulting status rather than the gateway body, for the same
 * sanitization reason as everything else in this module.
 */
export async function restartWahaSession(
  timeoutMs = 20000
): Promise<{ ok: boolean; status: WahaStatus | null; message: string }> {
  const { sessionId } = wahaConfig();
  const result = await probe(
    `/api/sessions/${encodeURIComponent(sessionId)}/restart`,
    timeoutMs,
    { method: "POST", body: {} }
  );

  if (result.kind === "unreachable") {
    return {
      ok: false,
      status: null,
      message: "The WhatsApp gateway is unreachable right now.",
    };
  }

  if (result.kind === "error") {
    return { ok: false, status: null, message: restartErrorMessage(result.httpStatus) };
  }

  // 201 with the fresh session, or 200 when it was already restarting.
  const body =
    result.kind === "json" && result.data && typeof result.data === "object"
      ? (result.data as Record<string, unknown>)
      : {};
  const rawStatus = typeof body.status === "string" ? body.status.trim().toUpperCase() : "";

  return {
    ok: true,
    status: rawStatus === "SCAN_QR_CODE" ? "SCAN_QR_CODE" : "STARTING",
    message: "Session restarting. The pairing code will appear in a few seconds.",
  };
}

function restartErrorMessage(httpStatus: number): string {
  if (httpStatus === 401 || httpStatus === 403) {
    return "Gateway credentials were rejected. Contact the operator.";
  }
  if (httpStatus === 404) {
    return "That WhatsApp session no longer exists on the gateway.";
  }
  if (httpStatus === 409) {
    return "The WhatsApp session is busy restarting. Give it a moment.";
  }
  if (httpStatus >= 500) {
    return "The WhatsApp gateway reported a server error. Try again shortly.";
  }
  return "The session could not be restarted. Please try again.";
}

function sendErrorMessage(httpStatus: number): string {
  if (httpStatus === 400) {
    return "The gateway rejected the message. Check the phone number and try again.";
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return "Gateway credentials were rejected. Contact the operator.";
  }
  if (httpStatus === 404) {
    return "The WhatsApp session no longer exists. Re-scan the pairing QR code.";
  }
  if (httpStatus === 409) {
    return "The WhatsApp session is busy. Wait a moment and try again.";
  }
  if (httpStatus >= 500) {
    return "The WhatsApp gateway reported a server error. Try again shortly.";
  }
  return "The message could not be sent. Please try again.";
}

/** Send a text through WAHA, reporting only allow-listed wording back. */
export async function sendWahaText(
  chatId: string,
  text: string,
  timeoutMs = 10000
): Promise<WahaSendResult> {
  const { sessionId } = wahaConfig();
  const result = await probe("/api/sendText", timeoutMs, {
    method: "POST",
    body: { session: sessionId, chatId, text },
  });

  if (result.kind === "json") {
    return { success: true, message: "Test message dispatched." };
  }
  if (result.kind === "unreachable") {
    return { success: false, message: "The WhatsApp gateway is unreachable right now." };
  }
  if (result.kind === "error") {
    return { success: false, message: sendErrorMessage(result.httpStatus) };
  }

  // An image response to a send is nonsense; treat it as a generic failure
  // rather than trusting the bytes.
  return { success: false, message: "The message could not be sent. Please try again." };
}

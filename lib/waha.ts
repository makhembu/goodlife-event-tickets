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
    "goodlife_waha_secret_2026";

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

/** Read the session's current lifecycle state. */
export async function getWahaSession(timeoutMs = 6000): Promise<WahaSessionSnapshot> {
  const { sessionId } = wahaConfig();
  const result = await probe(`/api/sessions/${encodeURIComponent(sessionId)}`, timeoutMs);

  if (result.kind === "unreachable") {
    return { status: "OFFLINE", me: null, reachable: false, warming: false };
  }

  if (result.kind === "error") {
    // 404 = session never created or already removed; 401/403 = bad key.
    // 5xx = engine up but broken. None of these are linkable states.
    return {
      status: "OFFLINE",
      me: null,
      reachable: result.httpStatus < 500,
      warming: false,
    };
  }

  const body =
    result.kind === "json" && result.data && typeof result.data === "object"
      ? (result.data as Record<string, unknown>)
      : {};

  const me = normalizeMe(body.me);
  const rawStatus =
    typeof body.status === "string" ? body.status.trim().toUpperCase() : "";

  if (me || rawStatus === "WORKING" || rawStatus === "CONNECTED") {
    return { status: "CONNECTED", me, reachable: true, warming: false };
  }

  if (rawStatus === "SCAN_QR_CODE" || rawStatus === "SCAN_QR") {
    return { status: "SCAN_QR_CODE", me: null, reachable: true, warming: false };
  }

  if (STOPPED_STATES.has(rawStatus)) {
    return { status: "OFFLINE", me: null, reachable: true, warming: false };
  }

  // STARTING, or an unrecognized state: treat as still booting rather than
  // guessing, so the UI shows the warming state instead of a false failure.
  return { status: "STARTING", me: null, reachable: true, warming: true };
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

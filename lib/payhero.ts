/**
 * PayHero M-Pesa STK Push client
 * Docs: https://docs.payhero.co.ke
 *
 * - Auth:  Basic base64(PAYHERO_USERNAME:PAYHERO_PASSWORD) from Dashboard → API Keys
 * - STK:   POST https://backend.payhero.co.ke/api/v2/payments
 * - Status:GET  https://backend.payhero.co.ke/api/v2/transaction-status?reference=<payhero_reference>
 * - Callback: JSON POST to the callback_url we provide; external_reference is echoed back.
 *
 * Settlement note: PayHero pushes to OUR OWN till/payment channel, so money lands
 * directly in the business M-Pesa account in real time (no T+1/T+2 pooling).
 */

const PAYHERO_API = "https://backend.payhero.co.ke/api/v2";

export interface PayheroStkRequest {
  customer_name: string;
  /** 2547XXXXXXXX format, no plus sign */
  phone_number: string;
  /** KES, whole shillings */
  amount: number;
  /** Our reference (pending_payments.checkout_request_id), echoed back on callback */
  external_reference: string;
  /** Payment channel ID from PayHero dashboard (Payment Channels → My Payment Channels) */
  channel_id: number;
  /** "m-pesa" (or "sasapay") */
  provider: string;
  /** Safaricom network code — do not change */
  network_code: string;
  callback_url?: string;
  credential_id?: string | null;
}

export interface PayheroInitiateResponse {
  success?: boolean;
  status?: string;
  /** PayHero's own reference — use this for transaction-status polling */
  reference?: string;
  provider_reference?: string;
  message?: string;
  [key: string]: unknown;
}

export interface PayheroStatusResponse {
  /** QUEUED | SUCCESS | FAILED | CANCELLED ... */
  status?: string;
  reference?: string;
  provider_reference?: string;
  amount?: number | string;
  external_reference?: string;
  message?: string;
  result_desc?: string;
  [key: string]: unknown;
}

export interface PayheroWalletInfo {
  ok: boolean;
  balance: number | null;
  status: string | null;
  error?: string;
}

/**
 * Fetch the service wallet balance.
 * PayHero deducts collection fees from this float — if it runs dry,
 * new STK/till collections fail (confirmed by PayHero support).
 */
export async function getPayheroServiceWallet(): Promise<PayheroWalletInfo> {
  if (!isPayheroConfigured()) {
    return { ok: false, balance: null, status: null, error: "PayHero not configured" };
  }
  try {
    const res = await fetch(`${PAYHERO_API}/wallets`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: payheroAuthHeader(),
      },
    });
    if (!res.ok) {
      return { ok: false, balance: null, status: null, error: `HTTP ${res.status}` };
    }
    const data: any = await res.json();
    const wallet = Array.isArray(data)
      ? data.find((w: any) => w.wallet_type === "service_wallet")
      : data && typeof data === "object" && data.available_balance !== undefined
        ? data
        : null;
    if (!wallet || wallet.available_balance === undefined) {
      return { ok: false, balance: null, status: null, error: "service wallet not found" };
    }
    return {
      ok: true,
      balance: Number(wallet.available_balance),
      status: wallet.wallet_status ?? null,
    };
  } catch (e: any) {
    return { ok: false, balance: null, status: null, error: e?.message || "request failed" };
  }
}

export function isPayheroConfigured(): boolean {
  return Boolean(
    process.env.PAYHERO_USERNAME &&
    process.env.PAYHERO_PASSWORD &&
    process.env.PAYHERO_CHANNEL_ID
  );
}

function payheroAuthHeader(): string {
  const username = process.env.PAYHERO_USERNAME || "";
  const password = process.env.PAYHERO_PASSWORD || "";
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

/** Normalize a Kenyan phone number to 2547XXXXXXXX (no plus sign, as PayHero expects) */
export function normalizePayheroPhone(raw: string): string {
  let digits = (raw || "").replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) digits = "254" + digits.slice(1);
  else if (digits.startsWith("7") || digits.startsWith("1")) digits = "254" + digits;
  else if (digits.startsWith("254")) { /* already normalized */ }
  return digits;
}

/** Build the webhook URL PayHero should call. Token guards the endpoint. */
export function payheroCallbackUrl(): string | undefined {
  const base = process.env.APP_URL;
  if (!base) return undefined;
  const token = process.env.PAYHERO_CALLBACK_TOKEN;
  const clean = base.replace(/\/$/, "");
  return `${clean}/api/payhero/callback${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export async function initiatePayheroStkPush(
  req: PayheroStkRequest
): Promise<{ ok: boolean; data?: PayheroInitiateResponse; error?: string; httpStatus: number }> {
  const res = await fetch(`${PAYHERO_API}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: payheroAuthHeader(),
    },
    body: JSON.stringify(req),
  });

  let data: PayheroInitiateResponse = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    const msg =
      (data as any)?.message ||
      (typeof (data as any)?.error === "string" ? (data as any).error : undefined) ||
      `PayHero STK push failed (HTTP ${res.status})`;
    return { ok: false, data, error: msg, httpStatus: res.status };
  }

  if (data.status && String(data.status).toUpperCase() === "FAILED") {
    return { ok: false, data, error: data.message || "PayHero rejected the STK push request.", httpStatus: res.status };
  }

  return { ok: true, data, httpStatus: res.status };
}

export async function getPayheroTransactionStatus(
  payheroReference: string
): Promise<{ ok: boolean; data?: PayheroStatusResponse; error?: string }> {
  const res = await fetch(
    `${PAYHERO_API}/transaction-status?reference=${encodeURIComponent(payheroReference)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: payheroAuthHeader(),
      },
    }
  );

  let data: PayheroStatusResponse = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    return {
      ok: false,
      data,
      error: (data as any)?.message || `PayHero status check failed (HTTP ${res.status})`,
    };
  }
  return { ok: true, data };
}

export function payheroStatusIsSuccess(d?: PayheroStatusResponse): boolean {
  return String(d?.status || "").toUpperCase() === "SUCCESS";
}

export function payheroStatusIsFailed(d?: PayheroStatusResponse): boolean {
  const s = String(d?.status || "").toUpperCase();
  return s === "FAILED" || s === "CANCELLED" || s === "TIMEOUT";
}

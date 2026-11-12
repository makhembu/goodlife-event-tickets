import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export function getInternalBridgeSecret(): string | null {
  const secret = (
    process.env.RADIO_BRIDGE_SECRET ||
    process.env.GOODLIFE_RADIO_SECRET_KEY ||
    ""
  ).replace(/^["']|["']$/g, "").trim();

  if (!secret) return null; // Fail-closed: no hardcoded fallback salt
  return secret;
}

/**
 * Verifies HMAC-SHA256 signature for internal daemon-to-Next.js machine calls.
 * Headers checked:
 * - X-Bridge-Timestamp & X-Bridge-Signature OR
 * - X-Goodlife-Timestamp & X-Goodlife-Radio-Key
 *
 * Scheme: HMAC(secret, `${timestamp}:${rawBody}`)
 */
export async function verifyInternalMachineAuth(
  req: NextRequest,
  rawBody: string
): Promise<NextResponse | null> {
  const secret = getInternalBridgeSecret();
  if (!secret) {
    console.error("[internal-auth] RADIO_BRIDGE_SECRET / GOODLIFE_RADIO_SECRET_KEY not configured. Failing closed.");
    return NextResponse.json(
      { error: "Internal machine auth misconfigured on server" },
      { status: 500 }
    );
  }

  const timestamp =
    req.headers.get("X-Bridge-Timestamp") ||
    req.headers.get("X-Goodlife-Timestamp");
  const signature =
    req.headers.get("X-Bridge-Signature") ||
    req.headers.get("X-Goodlife-Radio-Key");

  if (!timestamp || !signature) {
    return NextResponse.json(
      { error: "Missing required HMAC authentication headers" },
      { status: 401 }
    );
  }

  const reqTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  // 5-minute replay tolerance window
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 300) {
    return NextResponse.json(
      { error: "Authentication timestamp expired or invalid" },
      { status: 401 }
    );
  }

  try {
    const expectedSigRaw = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}:${rawBody}`)
      .digest("hex");

    const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    const expectedSigHash = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}:${bodyHash}`)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const expRawBuf = Buffer.from(expectedSigRaw, "hex");
    const expHashBuf = Buffer.from(expectedSigHash, "hex");

    const matchRaw =
      sigBuf.length === expRawBuf.length &&
      crypto.timingSafeEqual(sigBuf, expRawBuf);
    const matchHash =
      sigBuf.length === expHashBuf.length &&
      crypto.timingSafeEqual(sigBuf, expHashBuf);

    if (!matchRaw && !matchHash) {
      return NextResponse.json(
        { error: "Invalid HMAC machine signature" },
        { status: 403 }
      );
    }

    return null; // Signature verified successfully
  } catch (err: any) {
    return NextResponse.json(
      { error: "Authentication verification failed" },
      { status: 403 }
    );
  }
}

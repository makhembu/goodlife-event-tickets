"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Smartphone,
  Send,
  Server,
  Activity,
  QrCode,
  Radio,
  Thermometer
} from "lucide-react";
import QRCode from "qrcode";

type GatewayStatus = "LOADING" | "STARTING" | "SCAN_QR_CODE" | "CONNECTED" | "OFFLINE";

interface Me {
  id: string | null;
  pushName: string | null;
}

interface Snapshot {
  status: GatewayStatus;
  me: Me | null;
  qrRaw: string | null;
  qrDataUrl: string | null;
}

/**
 * Poll cadence is driven by the session state, not a countdown. CONNECTED is
 * terminal so we stop pinging; SCAN_QR_CODE stays fast because the user is
 * holding a phone up to the screen; OFFLINE backs off.
 */
const POLL_INTERVAL: Partial<Record<GatewayStatus, number>> = {
  SCAN_QR_CODE: 5000,
  STARTING: 5000,
  OFFLINE: 10000,
};

const STATUS_COPY: Record<GatewayStatus, string> = {
  LOADING: "CONNECTING TO GATEWAY...",
  CONNECTED: "CONNECTED & ACTIVE (AIRTEL / DARAJA DIGITAL)",
  SCAN_QR_CODE: "SCAN QR CODE TO LINK WHATSAPP PHONE",
  STARTING: "WHATSAPP GATEWAY IS WARMING UP",
  OFFLINE: "GATEWAY UNREACHABLE",
};

const isLinked = (status: GatewayStatus) => status === "CONNECTED";

export default function AdminWhatsAppPage() {
  const [status, setStatus] = useState<GatewayStatus>("LOADING");
  const [me, setMe] = useState<Me | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  // Test message state
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applySnapshot = useCallback(async (snap: Snapshot) => {
    // Build the QR image first so every state update lands in a single batch,
    // rather than causing a cascade of re-renders per poll.
    let nextQr: string | null = null;

    if (!isLinked(snap.status) && snap.status !== "OFFLINE") {
      if (snap.qrRaw) {
        try {
          nextQr = await QRCode.toDataURL(snap.qrRaw, {
            width: 320,
            margin: 2,
            color: { dark: "#0b192c", light: "#ffffff" }
          });
        } catch {
          nextQr = snap.qrDataUrl ?? null;
        }
      } else {
        nextQr = snap.qrDataUrl ?? null;
      }
    }

    if (!mounted.current) return;

    setStatus(snap.status);
    setMe(snap.me ?? null);
    setQrImage(nextQr);
    setCheckedAt(Date.now());
    setError(null);
  }, []);

  /**
   * Single source of truth for gateway state. Both the mount fetch and the
   * polling interval call this, so the UI can never drift from the server's
   * view. Overlapping requests are dropped rather than queued.
   */
  const loadGateway = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const res = await fetch("/api/admin/whatsapp/qr", { cache: "no-store" });

      if (res.status === 401) {
        if (mounted.current) {
          setStatus("OFFLINE");
          setError("Your admin session expired. Sign in again to view the gateway.");
        }
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "");
      }

      await applySnapshot({
        status: (data?.status ?? "OFFLINE") as GatewayStatus,
        me: data?.me ?? null,
        qrRaw: typeof data?.qrRaw === "string" ? data.qrRaw : null,
        qrDataUrl: typeof data?.qrDataUrl === "string" ? data.qrDataUrl : null
      });
    } catch {
      if (mounted.current) {
        setStatus("OFFLINE");
        setQrImage(null);
        setError("Could not reach the gateway service. Check your connection and retry.");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [applySnapshot]);

  // 1. Initial fetch on mount, before any polling is scheduled.
  useEffect(() => {
    void loadGateway();
  }, [loadGateway]);

  // 2. Event-driven polling. The interval is rebuilt only when the status
  //    changes, so reaching CONNECTED tears it down automatically.
  useEffect(() => {
    const intervalMs = POLL_INTERVAL[status];
    if (!intervalMs) return;

    const id = setInterval(() => {
      if (document.hidden) return; // no point pinging a gateway nobody is watching
      void loadGateway();
    }, intervalMs);

    return () => clearInterval(id);
  }, [status, loadGateway]);

  const handleManualRefresh = useCallback(() => {
    setRefreshing(true);
    void loadGateway();
  }, [loadGateway]);

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) return;

    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: testPhone })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: data.message || "Message dispatched." });
      } else {
        setTestResult({
          success: false,
          message: data?.error || data?.message || "Failed to send message."
        });
      }
    } catch {
      setTestResult({ success: false, message: "Network error while sending the test message." });
    } finally {
      setTestSending(false);
    }
  };

  const pollEvery = POLL_INTERVAL[status];
  const showWarmup = status === "STARTING" || (status === "SCAN_QR_CODE" && !qrImage);
  const showQr = status === "SCAN_QR_CODE" && Boolean(qrImage);

  const bannerTone = isLinked(status)
    ? "bg-emerald-500 text-white"
    : status === "SCAN_QR_CODE"
    ? "bg-amber-300 text-[var(--brand-navy)]"
    : status === "STARTING"
    ? "bg-sky-200 text-[var(--brand-navy)]"
    : "bg-stone-200 text-[var(--brand-navy)]";

  return (
    <div className="w-full min-h-screen bg-[var(--brand-off-white)] text-[var(--brand-navy)] p-4 sm:p-6 md:p-8 font-mono">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* TOP BREADCRUMB & HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-4 border-[var(--brand-navy)] pb-4 gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/dashboard"
              className="text-[var(--brand-navy)] hover:bg-brand-accent p-2 border-2 border-[var(--brand-navy)] transition-colors font-bold uppercase text-xs"
            >
              &larr; Dashboard
            </Link>
            <h1 className="text-xl md:text-2xl font-display uppercase flex items-center gap-2 font-black">
              <MessageSquare className="w-6 h-6 text-emerald-600" /> WHATSAPP GATEWAY &amp; QR PAIRING
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {pollEvery && !isLinked(status) && (
              <span className="hidden sm:inline text-[10px] font-black uppercase opacity-60">
                Auto-check every {pollEvery / 1000}s
              </span>
            )}
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="px-3 py-1.5 border-2 border-[var(--brand-navy)] bg-white text-xs font-black uppercase hover:bg-stone-100 transition-colors flex items-center gap-1.5 shadow-(--shadow-brut-xs) cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Checking..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* STATUS BANNER */}
        <div className={`p-4 border-4 border-[var(--brand-navy)] shadow-(--shadow-brut-md) flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${bannerTone}`}>
          <div className="flex items-center gap-3">
            {isLinked(status) ? (
              <CheckCircle className="w-6 h-6 text-white shrink-0" />
            ) : showQr ? (
              <QrCode className="w-6 h-6 text-[var(--brand-navy)] shrink-0 animate-pulse" />
            ) : status === "STARTING" ? (
              <Thermometer className="w-6 h-6 text-[var(--brand-navy)] shrink-0 animate-pulse" />
            ) : status === "LOADING" ? (
              <RefreshCw className="w-6 h-6 text-[var(--brand-navy)] shrink-0 animate-spin" />
            ) : (
              <Radio className="w-6 h-6 text-[var(--brand-navy)] shrink-0 animate-pulse" />
            )}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider opacity-80">GATEWAY SESSION STATUS</p>
              <p className="text-lg font-black uppercase tracking-wide">{STATUS_COPY[status]}</p>
            </div>
          </div>

          {me && (
            <div className="text-right text-xs">
              <p className="font-bold opacity-80">CONNECTED DEVICE:</p>
              <p className="font-black text-sm">
                {me.pushName || "Airtel WhatsApp"} ({me.id?.split("@")[0] || ""})
              </p>
            </div>
          )}
        </div>

        {/* MAIN INTERACTION GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* LEFT: QR CODE CARD OR CONNECTION CARD */}
          <div className="border-4 border-[var(--brand-navy)] bg-white p-5 shadow-(--shadow-brut-md) flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b-2 border-[var(--brand-navy)] pb-2 mb-4">
                <span className="font-display font-black text-base uppercase flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  {isLinked(status) ? "LINKED WHATSAPP DEVICE" : "LINK OFFICIAL PHONE"}
                </span>
                <span className="text-[10px] font-bold uppercase bg-stone-100 px-2 py-0.5 border border-stone-300">
                  SESSION: DEFAULT
                </span>
              </div>

              {isLinked(status) ? (
                <div className="py-8 text-center space-y-4">
                  <div className="w-20 h-20 bg-emerald-100 border-4 border-emerald-600 mx-auto rounded-full flex items-center justify-center text-emerald-600 shadow-(--shadow-brut-sm)">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="font-black text-xl uppercase text-emerald-800">WhatsApp is Online!</h3>
                    <p className="text-xs text-stone-600 mt-1 max-w-sm mx-auto">
                      All festival tickets, PDFs, scan notices, and waitlist broadcasts are being dispatched from this number.
                    </p>
                  </div>

                  <div className="bg-stone-50 border-2 border-[var(--brand-navy)] p-3 text-left space-y-1.5 text-xs">
                    <p>
                      <span className="opacity-60 font-bold uppercase">Line Identity:</span>{" "}
                      <strong className="font-black">{me?.pushName || "Daraja Digital"}</strong>
                    </p>
                    <p>
                      <span className="opacity-60 font-bold uppercase">WhatsApp ID:</span>{" "}
                      <strong className="font-mono">{me?.id || "default"}</strong>
                    </p>
                    <p>
                      <span className="opacity-60 font-bold uppercase">Monitoring:</span>{" "}
                      <strong className="font-mono text-[11px]">Live polling paused while connected</strong>
                    </p>
                  </div>
                </div>
              ) : showQr ? (
                <div className="space-y-4 text-center">
                  <div className="relative inline-block border-4 border-[var(--brand-navy)] bg-white p-2 shadow-(--shadow-brut-sm)">
                    <img
                      src={qrImage as string}
                      alt="WhatsApp Pairing QR Code"
                      className="w-64 h-64 mx-auto block"
                    />
                    <div className="absolute bottom-1 right-1 bg-[var(--brand-navy)] text-white text-[9px] font-bold px-1.5 py-0.5">
                      AUTO-CHECK {(POLL_INTERVAL.SCAN_QR_CODE ?? 5000) / 1000}S
                    </div>
                  </div>

                  <div className="bg-amber-50 border-2 border-amber-600 p-3 text-left space-y-1 text-xs">
                    <p className="font-black uppercase text-amber-900 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> PAIRING INSTRUCTIONS:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 text-[11px] text-amber-950 font-bold">
                      <li>Open WhatsApp on the <strong>Airtel (Daraja Digital)</strong> phone.</li>
                      <li>Tap <strong>Settings</strong> (or the 3 dots menu) then <strong>Linked Devices</strong>.</li>
                      <li>Tap <strong>Link a Device</strong> and point the camera at this QR code.</li>
                      <li>This page turns green on its own once the device is scanned.</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center space-y-3">
                  {status === "STARTING" ? (
                    <>
                      <Thermometer className="w-8 h-8 mx-auto text-sky-600 animate-pulse" />
                      <p className="text-xs font-black uppercase">
                        WhatsApp gateway is warming up, please wait 15&ndash;30 seconds&hellip;
                      </p>
                      <p className="text-[11px] text-stone-500">
                        The engine boots a browser session before a pairing code exists. This page keeps
                        checking on its own and will reveal the QR as soon as it is ready.
                      </p>
                    </>
                  ) : status === "LOADING" ? (
                    <>
                      <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[var(--brand-navy)]" />
                      <p className="text-xs font-bold uppercase">Contacting the WhatsApp gateway...</p>
                    </>
                  ) : (
                    <>
                      <Activity className="w-8 h-8 mx-auto text-red-500" />
                      <p className="text-xs font-black uppercase">No response from the gateway.</p>
                      <p className="text-[11px] text-stone-500">
                        {error || "The WhatsApp engine is not reachable right now. Retrying every 10 seconds."}
                      </p>
                    </>
                  )}

                  <button
                    onClick={handleManualRefresh}
                    disabled={refreshing}
                    className="px-3 py-1.5 bg-[var(--brand-navy)] text-white text-xs font-black uppercase hover:bg-brand-accent hover:text-[var(--brand-navy)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {refreshing ? "Checking..." : "Retry now"}
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t-2 border-[var(--brand-navy)] flex justify-between items-center text-[10px] text-stone-500">
              <span>
                {isLinked(status)
                  ? "Connected - no polling"
                  : pollEvery
                  ? `Event-driven polling every ${pollEvery / 1000}s`
                  : "Idle"}
              </span>
              <span>
                {checkedAt ? `Last checked ${new Date(checkedAt).toLocaleTimeString()}` : "Not checked yet"}
              </span>
            </div>
          </div>

          {/* RIGHT: TEST SENDER + GATEWAY INFO */}
          <div className="space-y-6">

            {/* SEND TEST MESSAGE */}
            <div className="border-4 border-[var(--brand-navy)] bg-white p-5 shadow-(--shadow-brut-md)">
              <div className="flex items-center gap-2 border-b-2 border-[var(--brand-navy)] pb-2 mb-4">
                <Send className="w-4 h-4 text-[var(--brand-navy)]" />
                <h3 className="font-display font-black text-base uppercase">TEST DISPATCH LIVE MESSAGE</h3>
              </div>

              <form onSubmit={handleSendTestMessage} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase block">Recipient Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 0712813284 or 254712813284"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    required
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                  <p className="text-[10px] text-stone-500">Kenyan mobile format (07... or 254...)</p>
                </div>

                <button
                  type="submit"
                  disabled={testSending || !isLinked(status)}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs)"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{testSending ? "SENDING MESSAGE..." : "SEND TEST WHATSAPP MESSAGE ↗"}</span>
                </button>

                {!isLinked(status) && (
                  <p className="text-[10px] text-stone-500 uppercase font-bold">
                    Link the phone by scanning the QR first.
                  </p>
                )}
              </form>

              {testResult && (
                <div className={`mt-3 p-3 border-2 text-xs font-bold uppercase ${
                  testResult.success
                    ? "bg-emerald-100 border-emerald-600 text-emerald-950"
                    : "bg-red-100 border-red-600 text-red-950"
                }`}>
                  {testResult.message}
                </div>
              )}
            </div>

            {/* GATEWAY HEALTH — deliberately shows no gateway URL or credentials */}
            <div className="border-4 border-[var(--brand-navy)] bg-white p-5 shadow-(--shadow-brut-md) space-y-3">
              <div className="flex items-center gap-2 border-b-2 border-[var(--brand-navy)] pb-2">
                <Server className="w-4 h-4 text-[var(--brand-navy)]" />
                <h3 className="font-display font-black text-base uppercase">GATEWAY HEALTH</h3>
              </div>

              <p className="text-xs text-stone-600 leading-relaxed">
                All engine traffic is proxied server side through the Goodlife API. Nothing about the
                gateway address, its credentials, or its raw responses is exposed to this browser.
              </p>

              <dl className="space-y-2 text-xs border-t-2 border-dashed border-[var(--brand-navy)] pt-3">
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-bold uppercase opacity-60">Session</dt>
                  <dd className="font-mono font-black">default</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-bold uppercase opacity-60">State</dt>
                  <dd className="font-mono font-black">{status}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-bold uppercase opacity-60">Engine</dt>
                  <dd className="font-mono font-black">
                    {status === "LOADING" ? "contacting..." : status === "OFFLINE" ? "unreachable" : "reachable"}
                  </dd>
                </div>
              </dl>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}

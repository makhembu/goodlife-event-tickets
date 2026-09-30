"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { 
  MessageSquare, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Smartphone, 
  Send, 
  ExternalLink, 
  Lock, 
  Activity,
  QrCode,
  Radio
} from "lucide-react";
import QRCode from "qrcode";

export default function AdminWhatsAppPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("LOADING");
  const [me, setMe] = useState<any>(null);
  const [qrRaw, setQrRaw] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(10);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Test Message State
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatusAndQR = async () => {
    try {
      setRefreshing(true);
      // 1. Fetch QR & status
      const res = await fetch("/api/admin/whatsapp/qr", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setStatus(data.status);
        if (data.status === "CONNECTED") {
          setMe(data.me);
          setQrRaw(null);
          setQrDataUrl(null);
        } else if (data.status === "SCAN_QR_CODE" && data.qrRaw) {
          setQrRaw(data.qrRaw);
          try {
            const url = await QRCode.toDataURL(data.qrRaw, {
              width: 320,
              margin: 2,
              color: {
                dark: "#0b192c",
                light: "#ffffff"
              }
            });
            setQrDataUrl(url);
          } catch (err) {
            console.error("Failed to generate QR data URL:", err);
          }
        }
        setError(null);
      } else {
        // If not connected, check general status
        const statRes = await fetch("/api/admin/whatsapp/status", { cache: "no-store" });
        const statData = await statRes.json();
        setStatus(statData.status || "OFFLINE");
        if (statData.me) setMe(statData.me);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to reach WhatsApp service");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setCountdown(10);
    }
  };

  useEffect(() => {
    fetchStatusAndQR();

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchStatusAndQR();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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
        setTestResult({ success: true, message: data.message || "Message dispatched successfully!" });
      } else {
        setTestResult({ success: false, message: data.error || "Failed to send message" });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Network error sending test message" });
    } finally {
      setTestSending(false);
    }
  };

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
              <MessageSquare className="w-6 h-6 text-emerald-600" /> WHATSAPP GATEWAY & QR PAIRING
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatusAndQR}
              disabled={refreshing}
              className="px-3 py-1.5 border-2 border-[var(--brand-navy)] bg-white text-xs font-black uppercase hover:bg-stone-100 transition-colors flex items-center gap-1.5 shadow-(--shadow-brut-xs) cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Refreshing..." : `Refresh (${countdown}s)`}</span>
            </button>
          </div>
        </div>

        {/* STATUS BANNER */}
        <div className={`p-4 border-4 border-[var(--brand-navy)] shadow-(--shadow-brut-md) flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          status === "CONNECTED" || status === "WORKING"
            ? "bg-emerald-500 text-white"
            : status === "SCAN_QR_CODE"
            ? "bg-amber-300 text-[var(--brand-navy)]"
            : "bg-stone-200 text-[var(--brand-navy)]"
        }`}>
          <div className="flex items-center gap-3">
            {status === "CONNECTED" || status === "WORKING" ? (
              <CheckCircle className="w-6 h-6 text-white shrink-0" />
            ) : status === "SCAN_QR_CODE" ? (
              <QrCode className="w-6 h-6 text-[var(--brand-navy)] shrink-0 animate-pulse" />
            ) : (
              <Radio className="w-6 h-6 text-[var(--brand-navy)] shrink-0 animate-pulse" />
            )}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider opacity-80">GATEWAY SESSION STATUS</p>
              <p className="text-lg font-black uppercase tracking-wide">
                {status === "CONNECTED" || status === "WORKING"
                  ? "CONNECTED & ACTIVE (AIRTEL / DARAJA DIGITAL)"
                  : status === "SCAN_QR_CODE"
                  ? "SCAN QR CODE TO LINK WHATSAPP PHONE"
                  : status === "STARTING"
                  ? "INITIALIZING WHATSAPP ENGINE..."
                  : `STATUS: ${status}`}
              </p>
            </div>
          </div>

          {me && (
            <div className="text-right text-xs">
              <p className="font-bold opacity-80">CONNECTED DEVICE:</p>
              <p className="font-black text-sm">{me.pushName || "Airtel WhatsApp"} ({me.id?.split("@")[0] || ""})</p>
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
                  {status === "CONNECTED" ? "LINKED WHATSAPP DEVICE" : "LINK OFFICIAL PHONE"}
                </span>
                <span className="text-[10px] font-bold uppercase bg-stone-100 px-2 py-0.5 border border-stone-300">
                  SESSION: DEFAULT
                </span>
              </div>

              {loading ? (
                <div className="py-16 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[var(--brand-navy)] mb-2" />
                  <p className="text-xs font-bold uppercase">Connecting to WhatsApp Gateway...</p>
                </div>
              ) : status === "CONNECTED" || status === "WORKING" ? (
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
                    <p><span className="opacity-60 font-bold uppercase">Line Identity:</span> <strong className="font-black">{me?.pushName || "Daraja Digital"}</strong></p>
                    <p><span className="opacity-60 font-bold uppercase">WhatsApp ID:</span> <strong className="font-mono">{me?.id || "default"}</strong></p>
                    <p><span className="opacity-60 font-bold uppercase">Gateway Target:</span> <strong className="font-mono text-[11px]">https://waha.darajadigital.com</strong></p>
                  </div>
                </div>
              ) : qrDataUrl ? (
                <div className="space-y-4 text-center">
                  <div className="relative inline-block border-4 border-[var(--brand-navy)] bg-white p-2 shadow-(--shadow-brut-sm)">
                    <img 
                      src={qrDataUrl} 
                      alt="WhatsApp Pairing QR Code" 
                      className="w-64 h-64 mx-auto block" 
                    />
                    <div className="absolute bottom-1 right-1 bg-[var(--brand-navy)] text-white text-[9px] font-bold px-1.5 py-0.5">
                      REFRESH IN {countdown}S
                    </div>
                  </div>

                  <div className="bg-amber-50 border-2 border-amber-600 p-3 text-left space-y-1 text-xs">
                    <p className="font-black uppercase text-amber-900 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> PAIRING INSTRUCTIONS:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 text-[11px] text-amber-950 font-bold">
                      <li>Open WhatsApp on the <strong>Airtel (Daraja Digital)</strong> phone.</li>
                      <li>Tap <strong>Settings</strong> (or 3 dots menu) &gt; <strong>Linked Devices</strong>.</li>
                      <li>Tap <strong>Link a Device</strong> and point your camera at this QR code.</li>
                      <li>This page will turn green automatically once scanned!</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center space-y-3">
                  <Activity className="w-8 h-8 mx-auto text-amber-600 animate-spin" />
                  <p className="text-xs font-black uppercase">
                    Generating live QR code from WhatsApp server...
                  </p>
                  <p className="text-[11px] text-stone-500">
                    The headless Chromium session is booting up. Please wait ~15 seconds.
                  </p>
                  <button
                    onClick={fetchStatusAndQR}
                    className="px-3 py-1.5 bg-[var(--brand-navy)] text-white text-xs font-black uppercase hover:bg-brand-accent hover:text-[var(--brand-navy)] transition-colors"
                  >
                    Check Now
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t-2 border-[var(--brand-navy)] flex justify-between items-center text-[10px] text-stone-500">
              <span>Auto-refresh enabled</span>
              <span>Next update in: {countdown}s</span>
            </div>
          </div>

          {/* RIGHT: TEST SENDER + DIRECT SERVER LINKS */}
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
                  disabled={testSending || (status !== "CONNECTED" && status !== "WORKING")}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs)"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{testSending ? "SENDING MESSAGE..." : "SEND TEST WHATSAPP MESSAGE ↗"}</span>
                </button>
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

            {/* DIRECT WAHA SERVER LINKS & CREDENTIALS */}
            <div className="border-4 border-[var(--brand-navy)] bg-white p-5 shadow-(--shadow-brut-md) space-y-3">
              <div className="flex items-center gap-2 border-b-2 border-[var(--brand-navy)] pb-2">
                <Lock className="w-4 h-4 text-[var(--brand-navy)]" />
                <h3 className="font-display font-black text-base uppercase">DIRECT WAHA ACCESS</h3>
              </div>

              <p className="text-xs text-stone-600 leading-relaxed">
                You can also access the WAHA engine directly from anywhere in the world using these endpoints:
              </p>

              <div className="space-y-2 text-xs">
                <a
                  href="https://waha.darajadigital.com"
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 border-2 border-[var(--brand-navy)] bg-stone-50 hover:bg-brand-accent hover:text-[var(--brand-navy)] flex items-center justify-between transition-colors font-bold block"
                >
                  <span>1. WAHA REST API &amp; Swagger Docs</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <a
                  href="https://waha.darajadigital.com/dashboard/"
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 border-2 border-[var(--brand-navy)] bg-yellow-100 hover:bg-yellow-200 text-[var(--brand-navy)] flex items-center justify-between transition-colors font-bold block"
                >
                  <div>
                    <span className="font-black block">2. WAHA Web Dashboard</span>
                    <span className="text-[10px] text-stone-600 block">User: <strong>admin</strong> | Pass: <strong>goodlife_waha_secret_2026</strong></span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}

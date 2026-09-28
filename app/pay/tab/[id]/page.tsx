"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { HapticFeedback } from "@/components/ui/haptic-feedback";
import {
  CreditCard,
  Phone,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Receipt,
  Store,
  Calendar,
  Lock,
} from "lucide-react";

interface TabTransaction {
  id: number;
  type: "charge" | "payment";
  amount: number;
  method?: string;
  mpesa_ref?: string;
  ordered_by?: string;
  created_at: string;
  items?: Array<{
    item_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

interface PublicTab {
  id: number;
  customer_name: string;
  customer_phone: string;
  balance: number;
  credit_limit: number;
  status: string;
  is_settled: boolean;
  vendor_name: string;
  vendor_logo?: string;
  event_title: string;
  created_at?: string;
  transactions?: TabTransaction[];
}

export default function TabSelfPayPage() {
  const params = useParams();
  const tabId = params?.id as string;

  // Signed-link token (?t=...) — required by the public API to read or pay this tab.
  const [linkToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("t") || "";
  });

  const [tab, setTab] = useState<PublicTab | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Payment form states
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [isFullPayment, setIsFullPayment] = useState(true);

  // STK Push states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stkReference, setStkReference] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(45);
  const [pollStatus, setPollStatus] = useState<"polling" | "success" | "failed" | "timeout">("polling");
  const [pollMessage, setPollMessage] = useState("");
  const [receiptCode, setReceiptCode] = useState("");
  const [showWaitingModal, setShowWaitingModal] = useState(false);

  // Load public tab details
  const fetchTabData = async () => {
    if (!tabId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/pay/tab/${tabId}?t=${encodeURIComponent(linkToken)}`);
      const data = await res.json();
      if (res.ok && data.success && data.tab) {
        setTab(data.tab);
        // Default to full balance
        const currentBal = Number(data.tab.balance) || 0;
        setAmount(currentBal > 0 ? currentBal.toString() : "0");
        // Do not pre-fill phone input if it's masked (contains '*')
        if (data.tab.customer_phone && !data.tab.customer_phone.includes("*")) {
          setPhone(data.tab.customer_phone);
        } else {
          setPhone("");
        }
      } else {
        setFetchError(data.message || "Failed to load tab details.");
      }
    } catch (err: any) {
      setFetchError("Network connection error. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load the tab whenever the id changes. fetchTabData sets its loading flag
    // before the first await, which the rule reads as a synchronous setState;
    // that flag is what keeps the pay button disabled while the request is in
    // flight, so it stays. Deferring the call behind a timeout would satisfy the
    // linter only by adding latency to the payment page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTabData();
  }, [tabId]);

  // Handle Quick Chips
  const setAmountChip = (type: "full" | "half" | "custom") => {
    if (!tab) return;
    HapticFeedback.trigger("confirmation");
    const bal = tab.balance;
    if (type === "full") {
      setAmount(bal.toString());
      setIsFullPayment(true);
    } else if (type === "half") {
      setAmount(Math.ceil(bal / 2).toString());
      setIsFullPayment(false);
    } else {
      setIsFullPayment(false);
    }
  };

  // Initiate STK Push
  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tab) return;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 1) {
      alert("Please enter a valid payment amount (minimum KES 1).");
      return;
    }

    if (numAmount > tab.balance) {
      alert(`Amount cannot exceed outstanding balance of KES ${tab.balance.toLocaleString()}.`);
      return;
    }

    if (!phone.trim()) {
      alert("Please enter a valid Safaricom M-Pesa phone number.");
      return;
    }

    setIsSubmitting(true);
    HapticFeedback.trigger("confirmation");

    try {
      const res = await fetch(`/api/pay/tab/${tabId}?t=${encodeURIComponent(linkToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          amount: numAmount,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const ref = data.checkout_request_id || data.external_reference;
        setStkReference(ref);
        setCountdown(45);
        setPollStatus("polling");
        setPollMessage("PIN prompt sent to phone. Enter your M-Pesa PIN to complete payment...");
        setShowWaitingModal(true);
      } else {
        HapticFeedback.trigger("error");
        alert(data.message || "STK Push initiation failed. Please try again.");
      }
    } catch {
      HapticFeedback.trigger("error");
      alert("Network error initiating payment. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Polling logic for STK verification (45s countdown)
  useEffect(() => {
    if (!showWaitingModal || !stkReference) return;

    let isTerminal = false;

    // Countdown interval
    const timerInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          if (!isTerminal) {
            setPollStatus("timeout");
            setPollMessage("Request timed out. If you entered your PIN, please wait a moment and refresh.");
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Polling interval
    const pollInterval = setInterval(async () => {
      if (isTerminal) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const res = await fetch(`/api/vendor/mpesa/status?reference=${encodeURIComponent(stkReference)}`);
        const data = await res.json();

        if (data.success && data.status === "SUCCESS") {
          isTerminal = true;
          clearInterval(pollInterval);
          clearInterval(timerInterval);

          const mpesaReceipt = data.mpesa_code || stkReference;
          setReceiptCode(mpesaReceipt);
          setPollStatus("success");
          HapticFeedback.trigger("success");

          // NOTE: the tab balance is credited server-side by the PayHero webhook
          // (single writer). The client never records ledger entries directly.

          // Reload tab data (may lag a few seconds behind the webhook)
          fetchTabData();
        } else if (
          data.status === "FAILED" ||
          data.status === "CANCELLED" ||
          data.status === "TIMEOUT"
        ) {
          isTerminal = true;
          clearInterval(pollInterval);
          clearInterval(timerInterval);
          HapticFeedback.trigger("error");
          setPollStatus("failed");
          setPollMessage(data.message || `Payment ${data.status.toLowerCase()}.`);
        } else if (data.message) {
          setPollMessage(data.message);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2500);

    return () => {
      clearInterval(timerInterval);
      clearInterval(pollInterval);
    };
  }, [showWaitingModal, stkReference]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-off-white flex flex-col items-center justify-center p-4 font-mono text-brand-navy">
        <div className="bg-white border-4 border-brand-navy p-8 shadow-(--shadow-brut-md) text-center max-w-sm w-full">
          <RefreshCw className="w-10 h-10 animate-spin mx-auto text-brand-navy mb-4" />
          <h2 className="font-display text-2xl uppercase tracking-wider">RETRIEVING TAB...</h2>
          <p className="text-xs uppercase font-bold opacity-70 mt-2">Connecting to Goodlife Secure Gateway</p>
        </div>
      </div>
    );
  }

  if (fetchError || !tab) {
    return (
      <div className="min-h-screen bg-brand-off-white flex flex-col items-center justify-center p-4 font-mono text-brand-navy">
        <div className="bg-white border-4 border-brand-navy p-8 shadow-(--shadow-brut-md) text-center max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-brand-danger mx-auto mb-4" />
          <h2 className="font-display text-2xl uppercase tracking-wider text-brand-danger">TAB NOT FOUND</h2>
          <p className="text-xs font-bold uppercase opacity-80 mt-2 mb-6">
            {fetchError || "The festival tab statement link is invalid or expired."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-brand-navy text-brand-accent border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none"
          >
            TRY AGAIN
          </button>
        </div>
      </div>
    );
  }

  const isTabSettled = tab.balance <= 0 || tab.is_settled;

  return (
    <div className="min-h-screen bg-brand-off-white flex flex-col items-center p-4 md:p-8 font-mono text-brand-navy">
      {/* Top Banner / Event Bar */}
      <header className="w-full max-w-md mb-6 text-center">
        <div className="inline-block bg-brand-navy text-brand-accent px-4 py-1 text-xs font-bold uppercase tracking-widest border-2 border-brand-navy shadow-(--shadow-brut-2xs) mb-2">
          {tab.event_title}
        </div>
        <h1 className="font-display text-4xl uppercase tracking-wider text-brand-navy">
          FESTIVAL TAB STATEMENT
        </h1>
        <p className="text-xs font-bold uppercase opacity-70 mt-1">
          Official Remote Self-Pay Portal
        </p>
      </header>

      {/* Main Container Card */}
      <main className="w-full max-w-md flex flex-col gap-6">
        {/* Tab Metadata Brutalist Card */}
        <div className="bg-white border-4 border-brand-navy shadow-(--shadow-brut-md) p-6">
          <div className="flex items-center justify-between border-b-2 border-brand-navy/20 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-brand-navy" />
              <div>
                <div className="text-[10px] font-bold uppercase opacity-60">Vendor Stall</div>
                <div className="font-bold text-base uppercase">{tab.vendor_name}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase opacity-60">Tab ID</div>
              <div className="font-bold text-base">#{tab.id}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-3 bg-brand-off-white border-2 border-brand-navy shadow-(--shadow-brut-2xs)">
              <div className="text-[10px] font-bold uppercase opacity-60">Attendee Name</div>
              <div className="font-bold text-sm uppercase truncate">{tab.customer_name}</div>
            </div>
            <div className="p-3 bg-brand-off-white border-2 border-brand-navy shadow-(--shadow-brut-2xs)">
              <div className="text-[10px] font-bold uppercase opacity-60">Registered Phone</div>
              <div className="font-bold text-sm truncate">{tab.customer_phone || "Not Set"}</div>
            </div>
          </div>

          {/* Balance Display */}
          <div className="bg-brand-navy text-white p-6 border-2 border-brand-navy text-center mb-2 shadow-(--shadow-brut-xs)">
            <span className="text-xs font-bold uppercase text-brand-accent tracking-widest block mb-1">
              CURRENT BALANCE DUE
            </span>
            <span className="font-display text-5xl tracking-wide text-brand-accent">
              KES {tab.balance.toLocaleString()}
            </span>
            <div className="text-[11px] font-bold uppercase opacity-70 mt-2 text-zinc-300">
              Assigned Credit Limit: KES {tab.credit_limit.toLocaleString()}
            </div>
          </div>
        </div>

        {/* State 1: TAB FULLY SETTLED CARD */}
        {isTabSettled ? (
          <div className="bg-emerald-50 border-4 border-brand-navy shadow-(--shadow-brut-md) p-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-brand-success text-brand-navy rounded-full flex items-center justify-center mx-auto mb-4 border-3 border-brand-navy shadow-(--shadow-brut-xs)">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="font-display text-3xl uppercase tracking-wider text-emerald-950 mb-1">
              TAB SETTLED!
            </h2>
            <p className="text-sm font-bold uppercase text-emerald-900 mb-4">
              You&apos;re all clear. Enjoy the festival!
            </p>
            <div className="p-4 bg-white border-2 border-brand-navy text-xs font-mono text-left mb-4 shadow-(--shadow-brut-2xs)">
              <div className="flex justify-between py-1 border-b border-zinc-200">
                <span className="opacity-70">Outstanding Due:</span>
                <span className="font-bold text-brand-success">KES 0</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-200">
                <span className="opacity-70">Status:</span>
                <span className="font-bold uppercase">Fully Paid</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="opacity-70">Cleared At:</span>
                <span className="font-bold">
                  {new Date().toLocaleDateString("en-KE", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
            <p className="text-[11px] font-bold uppercase opacity-70">
              Show this screen to {tab.vendor_name} staff if requested.
            </p>
          </div>
        ) : (
          /* State 2: ACTIVE TAB PAYDOWN FORM */
          <div className="bg-white border-4 border-brand-navy shadow-(--shadow-brut-md) p-6">
            <h3 className="font-display text-2xl uppercase tracking-wider mb-4 flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-brand-navy" />
              <span>SETTLE VIA M-PESA</span>
            </h3>

            <form onSubmit={handleInitiatePayment} className="flex flex-col gap-5">
              {/* Phone Input */}
              <div>
                <label className="block text-xs font-bold uppercase mb-1.5 flex items-center justify-between">
                  <span>M-Pesa Phone Number</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Safaricom only</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    required
                    placeholder="0712345678 or 254..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-3 bg-white border-2 border-brand-navy font-bold text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent shadow-(--shadow-brut-2xs)"
                  />
                </div>
              </div>

              {/* Amount Selection & Quick Chips */}
              <div>
                <label className="block text-xs font-bold uppercase mb-1.5">
                  Amount to Pay (KES)
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setAmountChip("full")}
                    className={`py-2 px-3 text-xs font-bold uppercase border-2 border-brand-navy transition-all ${
                      isFullPayment
                        ? "bg-brand-navy text-brand-accent shadow-(--shadow-brut-2xs)"
                        : "bg-brand-off-white text-brand-navy hover:bg-zinc-100"
                    }`}
                  >
                    Full: KES {tab.balance.toLocaleString()}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountChip("half")}
                    className={`py-2 px-3 text-xs font-bold uppercase border-2 border-brand-navy transition-all ${
                      !isFullPayment && Number(amount) === Math.ceil(tab.balance / 2)
                        ? "bg-brand-navy text-brand-accent shadow-(--shadow-brut-2xs)"
                        : "bg-brand-off-white text-brand-navy hover:bg-zinc-100"
                    }`}
                  >
                    Half: KES {Math.ceil(tab.balance / 2).toLocaleString()}
                  </button>
                </div>

                <input
                  type="number"
                  min="1"
                  max={tab.balance}
                  required
                  placeholder="Custom Amount"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setIsFullPayment(Number(e.target.value) === tab.balance);
                  }}
                  className="w-full p-3 bg-white border-2 border-brand-navy font-bold text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent shadow-(--shadow-brut-2xs)"
                />
              </div>

              {/* Payment CTA Button */}
              <button
                type="submit"
                disabled={isSubmitting || tab.balance <= 0}
                className="w-full py-4 bg-brand-navy text-brand-accent border-2 border-brand-navy font-bold text-sm uppercase tracking-wider shadow-(--shadow-brut-sm) hover:bg-brand-accent hover:text-brand-navy active:translate-y-1 active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>SENDING STK PUSH...</span>
                  </>
                ) : (
                  <>
                    <span>PAY VIA M-PESA STK PUSH</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase opacity-60 text-center">
                <Lock className="w-3.5 h-3.5" />
                <span>Instant settlement via PayHero Gateway</span>
              </div>
            </form>
          </div>
        )}

        {/* Tab Itemized History Ledger */}
        {tab.transactions && tab.transactions.length > 0 && (
          <div className="bg-white border-4 border-brand-navy shadow-(--shadow-brut-md) p-6">
            <h3 className="font-display text-xl uppercase tracking-wider mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-brand-navy" />
              <span>TAB ACTIVITY LEDGER</span>
            </h3>

            <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
              {tab.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`p-3 border-2 border-brand-navy text-xs font-mono shadow-(--shadow-brut-2xs) ${
                    tx.type === "payment" ? "bg-emerald-50" : "bg-brand-off-white"
                  }`}
                >
                  <div className="flex justify-between items-start font-bold">
                    <span className="uppercase">
                      {tx.type === "payment" ? "🟢 M-Pesa Payment" : "🔴 Order Charge"}
                    </span>
                    <span className={tx.type === "payment" ? "text-emerald-700" : "text-red-600"}>
                      {tx.type === "payment" ? "-" : "+"}KES {Number(tx.amount).toLocaleString()}
                    </span>
                  </div>

                  {tx.items && tx.items.length > 0 && (
                    <div className="mt-2 pl-2 border-l-2 border-brand-navy/30 flex flex-col gap-1 text-[11px] text-zinc-700">
                      {tx.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>
                            {item.quantity}x {item.item_name}
                          </span>
                          <span>KES {item.line_total.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-[10px] opacity-60 mt-2 flex justify-between">
                    <span>
                      {new Date(tx.created_at).toLocaleTimeString("en-KE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {tx.mpesa_ref && <span>Ref: {tx.mpesa_ref}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Waiting Modal / STK Countdown Timer */}
      {showWaitingModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-brand-navy shadow-(--shadow-brut-xl) max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200">
            {pollStatus === "polling" && (
              <>
                <div className="w-16 h-16 border-4 border-brand-navy bg-brand-accent text-brand-navy flex items-center justify-center mx-auto mb-4 animate-pulse shadow-(--shadow-brut-xs)">
                  <Clock className="w-8 h-8" />
                </div>
                <h3 className="font-display text-2xl uppercase tracking-wider mb-2">
                  CHECK YOUR PHONE
                </h3>
                <p className="text-xs font-bold uppercase opacity-75 mb-6">
                  {pollMessage}
                </p>

                {/* Countdown ring / display */}
                <div className="bg-brand-navy text-brand-accent p-4 border-2 border-brand-navy font-display text-4xl mb-6 shadow-(--shadow-brut-2xs)">
                  {countdown}s
                </div>

                <p className="text-[11px] font-bold uppercase opacity-60">
                  Do not close or reload this window while processing.
                </p>
              </>
            )}

            {pollStatus === "success" && (
              <>
                <div className="w-16 h-16 bg-brand-success text-brand-navy border-4 border-brand-navy flex items-center justify-center mx-auto mb-4 shadow-(--shadow-brut-xs)">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="font-display text-3xl uppercase tracking-wider text-brand-navy mb-2">
                  PAYMENT CONFIRMED!
                </h3>
                <p className="text-xs font-bold uppercase opacity-75 mb-4">
                  Safaricom M-Pesa Receipt Code:
                </p>
                <div className="bg-emerald-100 border-2 border-brand-navy p-3 font-mono font-bold text-sm tracking-wider mb-6">
                  {receiptCode}
                </div>

                <button
                  type="button"
                  onClick={() => setShowWaitingModal(false)}
                  className="w-full py-3 bg-brand-navy text-brand-accent border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none"
                >
                  VIEW UPDATED TAB
                </button>
              </>
            )}

            {(pollStatus === "failed" || pollStatus === "timeout") && (
              <>
                <div className="w-16 h-16 bg-brand-danger-bg text-brand-danger border-4 border-brand-navy flex items-center justify-center mx-auto mb-4 shadow-(--shadow-brut-xs)">
                  <AlertCircle className="w-10 h-10" />
                </div>
                <h3 className="font-display text-2xl uppercase tracking-wider text-brand-danger mb-2">
                  {pollStatus === "timeout" ? "REQUEST TIMED OUT" : "PAYMENT DECLINED"}
                </h3>
                <p className="text-xs font-bold uppercase opacity-75 mb-6">
                  {pollMessage}
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowWaitingModal(false);
                      setPollStatus("polling");
                    }}
                    className="w-full py-3 bg-brand-navy text-brand-accent border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none"
                  >
                    TRY AGAIN
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="w-full py-2.5 bg-white text-brand-navy border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-2xs) hover:bg-zinc-100"
                  >
                    REFRESH PAGE
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer Branding */}
      <footer className="w-full max-w-md mt-10 text-center text-[10px] font-bold uppercase opacity-50 pb-6">
        GOODLIFE EVENTS TICKETING &bull; MARARA CAMP &bull; THIKA LANDLESS
      </footer>
    </div>
  );
}

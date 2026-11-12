"use client";

import React, { useState } from "react";
import { Heart, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  presenterId?: number;
  presenterName?: string;
  showTitle?: string;
  slotId?: number;
}

const PRESET_AMOUNTS = [50, 100, 250, 500, 1000];

export default function TipModal({
  isOpen,
  onClose,
  presenterId,
  presenterName,
  showTitle,
  slotId,
}: TipModalProps) {
  const [amount, setAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [reference, setReference] = useState("");

  if (!isOpen) return null;

  const effectiveAmount = customAmount ? Number(customAmount) : amount;

  const handleSendTip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || effectiveAmount < 10) {
      alert("Please provide a valid phone number and an amount of at least KES 10.");
      return;
    }

    setLoading(true);
    setStatus("idle");
    setStatusMsg("");

    try {
      const res = await fetch("/api/radio/tips/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          amount: effectiveAmount,
          sender_name: senderName || "Anonymous",
          message,
          presenter_id: presenterId,
          slot_id: slotId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setStatusMsg(data.error || "Failed to initiate tip.");
        setLoading(false);
        return;
      }

      setReference(data.reference);
      setStatus("sent");
      setStatusMsg("M-Pesa STK Prompt sent to your phone! Please enter your PIN.");

      // Poll verification
      let attempts = 0;
      const pollTimer = setInterval(async () => {
        attempts++;
        if (attempts > 20) {
          clearInterval(pollTimer);
          setLoading(false);
          return;
        }

        try {
          const vRes = await fetch(`/api/radio/tips/verify?reference=${encodeURIComponent(data.reference)}`);
          const vData = await vRes.json();
          if (vData.status === "completed") {
            clearInterval(pollTimer);
            setStatus("success");
            setStatusMsg("Asante sana! Your tip was received successfully.");
            setLoading(false);
          } else if (vData.status === "failed") {
            clearInterval(pollTimer);
            setStatus("error");
            setStatusMsg("Payment was cancelled or failed on your phone.");
            setLoading(false);
          }
        } catch {}
      }, 3000);
    } catch {
      setStatus("error");
      setStatusMsg("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#142B4C] border-2 border-[#C8A54A] text-[#F3ECE1] w-full max-w-md p-6 relative rounded shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#F3ECE1]/60 hover:text-[#F3ECE1] cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Heart className="w-6 h-6 text-[#C8A54A] fill-[#C8A54A]" />
          <h2 className="text-xl font-black uppercase tracking-wider font-mono">
            Support GOODLIFE Radio
          </h2>
        </div>

        <p className="text-xs text-[#F3ECE1]/70 mb-4">
          {presenterName
            ? `Cheer DJ ${presenterName} on ${showTitle || "air"}. Tips support station operations and programming.`
            : "Tips directly support station infrastructure, streaming bandwidth, and Kenyan music culture."}
        </p>

        {status === "success" ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-[#C8A54A] mx-auto" />
            <h3 className="text-lg font-bold">Payment Complete</h3>
            <p className="text-sm text-[#F3ECE1]/80">{statusMsg}</p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-[#C8A54A] text-[#142B4C] font-black uppercase tracking-wider text-sm cursor-pointer hover:bg-[#d9b65b]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendTip} className="space-y-4">
            {/* Amount Presets */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#F3ECE1]/80 mb-2">
                Select Amount (KES)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {PRESET_AMOUNTS.map((val) => (
                  <button
                    type="button"
                    key={val}
                    onClick={() => {
                      setAmount(val);
                      setCustomAmount("");
                    }}
                    className={`py-2 text-xs font-bold border font-mono cursor-pointer transition-colors ${
                      amount === val && !customAmount
                        ? "bg-[#C8A54A] text-[#142B4C] border-[#C8A54A]"
                        : "bg-transparent text-[#F3ECE1] border-[#F3ECE1]/30 hover:border-[#C8A54A]"
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <input
                type="number"
                placeholder="Or custom amount (min 10)"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                min="10"
                className="mt-2 w-full px-3 py-1.5 bg-[#0F2038] border border-[#F3ECE1]/30 text-[#F3ECE1] text-xs font-mono focus:border-[#C8A54A] outline-none"
              />
            </div>

            {/* M-Pesa Phone */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#F3ECE1]/80 mb-1">
                M-Pesa Phone Number
              </label>
              <input
                type="tel"
                placeholder="07XX XXX XXX or 2547..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[#0F2038] border border-[#F3ECE1]/30 text-[#F3ECE1] text-sm font-mono focus:border-[#C8A54A] outline-none"
              />
            </div>

            {/* Listener Name */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#F3ECE1]/80 mb-1">
                Your Name (Optional)
              </label>
              <input
                type="text"
                placeholder="Anonymous Listener"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full px-3 py-2 bg-[#0F2038] border border-[#F3ECE1]/30 text-[#F3ECE1] text-sm font-mono focus:border-[#C8A54A] outline-none"
              />
            </div>

            {/* Cheer message */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#F3ECE1]/80 mb-1">
                Message or Shoutout Note (Optional)
              </label>
              <textarea
                placeholder="Big up the selection! Keep Nairobi bumping..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                maxLength={200}
                className="w-full px-3 py-2 bg-[#0F2038] border border-[#F3ECE1]/30 text-[#F3ECE1] text-xs font-mono focus:border-[#C8A54A] outline-none"
              />
            </div>

            {statusMsg && (
              <div
                className={`p-3 text-xs flex items-center gap-2 ${
                  status === "error"
                    ? "bg-red-900/50 border border-red-500 text-red-200"
                    : "bg-[#0F2038] border border-[#C8A54A] text-[#C8A54A]"
                }`}
              >
                {status === "error" ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                )}
                <span>{statusMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#C8A54A] hover:bg-[#d9b65b] text-[#142B4C] font-black uppercase tracking-wider text-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 transition-colors font-mono"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing M-Pesa...</span>
                </>
              ) : (
                <span>Send KES {effectiveAmount} Tip</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Bell, Check, AlertCircle } from "lucide-react";

interface ShowReminderButtonProps {
  showId: number;
  showTitle: string;
  className?: string;
}

export default function ShowReminderButton({
  showId,
  showTitle,
  className = "",
}: ShowReminderButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/radio/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          show_id: showId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to set reminder.");
      }

      setSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
        setPhone("");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Failed to set reminder.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded border border-brand-navy/30 bg-brand-off-white hover:bg-brand-accent hover:border-brand-navy text-brand-navy transition-colors flex items-center gap-1 cursor-pointer"
        title={`Set a reminder for ${showTitle}`}
      >
        <Bell className="w-3 h-3 text-brand-accent-vivid" />
        <span>Remind Me</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white border-3 border-brand-navy shadow-(--shadow-brut-md) p-3 rounded-lg z-30 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-brand-navy/15 mb-2">
            <span className="font-bold text-[10px] uppercase text-brand-navy">
              WhatsApp Broadcast Ping
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-brand-navy/50 hover:text-brand-navy font-bold text-xs"
            >
              ✕
            </button>
          </div>

          <p className="text-[10px] text-brand-navy/80 mb-2 leading-relaxed">
            Get an alert 15 minutes before <strong>{showTitle}</strong> goes live.
          </p>

          {success ? (
            <div className="p-2 bg-emerald-50 border border-emerald-700 text-emerald-800 text-[10px] rounded flex items-center gap-1.5 font-bold">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>Reminder confirmed!</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2">
              {error && (
                <div className="text-[10px] text-red-600 font-bold">{error}</div>
              )}
              <input
                type="tel"
                placeholder="07XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-1.5 border border-brand-navy text-xs rounded bg-brand-off-white focus:outline-hidden"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-1.5 bg-brand-navy hover:bg-brand-accent text-white hover:text-brand-navy font-bold uppercase text-[10px] border border-brand-navy transition-colors cursor-pointer disabled:opacity-50"
              >
                {loading ? "SAVING..." : "CONFIRM REMINDER"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

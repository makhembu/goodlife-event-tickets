"use client";

import React, { useState, useEffect } from "react";
import { Award, Ticket, Check, AlertCircle, Sparkles } from "lucide-react";

interface ContestItem {
  id: number;
  title: string;
  description?: string | null;
  contest_type: "passphrase" | "random_draw" | "trivia";
  event_title: string;
  max_winners: number;
  winners_awarded: number;
  ends_at?: string | null;
  dj_name?: string | null;
}

export default function LiveContestWidget() {
  const [contests, setContests] = useState<ContestItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchContests = async () => {
    try {
      const res = await fetch("/api/radio/contests");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setContests(data);
      }
    } catch {
      // Quiet
    }
  };

  useEffect(() => {
    fetchContests();
    const interval = setInterval(fetchContests, 12000);
    return () => clearInterval(interval);
  }, []);

  if (contests.length === 0) return null;

  const activeContest = contests[0];

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!name.trim() || !phone.trim() || !answer.trim()) {
      setFeedback({ type: "error", text: "Please enter your name, phone, and contest answer." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/radio/contests/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contest_id: activeContest.id,
          name: name.trim(),
          phone: phone.trim(),
          answer: answer.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit entry.");
      }

      setFeedback({
        type: data.is_winner ? "success" : "error",
        text: data.message,
      });

      if (data.is_winner) {
        setAnswer("");
        fetchContests();
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Failed to submit entry." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-4 border-brand-navy bg-linear-to-br from-amber-50 via-white to-amber-100/50 shadow-(--shadow-brut-md) rounded-xl p-5 space-y-4">
      {/* Contest Header */}
      <div className="flex items-center justify-between border-b-2 border-brand-navy/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-red-600 text-white rounded border border-brand-navy animate-pulse">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-black uppercase text-red-600 block">
              ON-AIR FESTIVAL PASS GIVEAWAY
            </span>
            <h4 className="font-display text-xl uppercase tracking-wide text-brand-navy">
              {activeContest.title}
            </h4>
          </div>
        </div>

        <span className="px-2.5 py-1 bg-amber-400 text-brand-navy font-mono text-[10px] font-black uppercase border border-brand-navy rounded shadow-xs">
          {activeContest.max_winners - activeContest.winners_awarded} PASS(ES) LEFT
        </span>
      </div>

      {activeContest.description && (
        <p className="text-xs font-mono text-brand-navy/80">
          {activeContest.description}
        </p>
      )}

      {feedback && (
        <div
          className={`p-3 rounded border-2 flex items-center gap-2 text-xs font-mono font-bold ${
            feedback.type === "success"
              ? "bg-emerald-100 border-emerald-800 text-emerald-950"
              : "bg-red-100 border-red-800 text-red-950"
          }`}
        >
          {feedback.type === "success" ? (
            <Sparkles className="w-5 h-5 shrink-0 text-emerald-700" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-red-700" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Entry Form */}
      <form onSubmit={handleEnter} className="space-y-3 font-mono text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border-2 border-brand-navy rounded bg-white text-brand-navy font-bold focus:outline-hidden"
            required
          />
          <input
            type="tel"
            placeholder="Phone (07XXXXXXXX)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full p-2 border-2 border-brand-navy rounded bg-white text-brand-navy font-bold focus:outline-hidden"
            required
          />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder={
              activeContest.contest_type === "passphrase"
                ? "Enter live spoken on-air passphrase..."
                : "Enter your answer or trivia..."
            }
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="flex-1 p-2 border-2 border-brand-navy rounded bg-white text-brand-navy font-bold focus:outline-hidden"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-mono text-xs font-black uppercase tracking-wider border-2 border-brand-navy shadow-(--shadow-brut-xs) transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            {submitting ? "CLAIMING..." : "CLAIM PASS"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { Vote, CheckCircle2, Clock, Music } from "lucide-react";

interface PollOption {
  id: number;
  text: string;
  votes: number;
  percentage: number;
}

interface PollItem {
  id: number;
  question: string;
  poll_type: "general" | "next_track" | "vibe";
  ends_at: string;
  total_votes: number;
  has_voted: boolean;
  user_voted_option_id?: number | null;
  options: PollOption[];
  dj_name?: string | null;
}

export default function LivePollWidget() {
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [phone, setPhone] = useState("");

  const fetchPolls = async () => {
    try {
      const res = await fetch("/api/radio/polls");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setPolls(data);
      }
    } catch {
      // Quiet
    }
  };

  useEffect(() => {
    fetchPolls();
    const interval = setInterval(fetchPolls, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleVote = async (pollId: number, optionId: number) => {
    setVotingId(optionId);
    try {
      const res = await fetch("/api/radio/polls/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poll_id: pollId,
          option_id: optionId,
          phone: phone.trim() || undefined,
        }),
      });

      if (res.ok) {
        await fetchPolls();
      }
    } catch {
      // Quiet
    } finally {
      setVotingId(null);
    }
  };

  if (polls.length === 0) return null;

  return (
    <div className="space-y-4">
      {polls.map((poll) => (
        <div
          key={poll.id}
          className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl p-5 space-y-4"
        >
          {/* Poll Header */}
          <div className="flex items-center justify-between border-b-2 border-brand-navy/20 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-brand-accent text-brand-navy border border-brand-navy rounded">
                <Vote className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-mono font-black uppercase text-brand-accent-vivid block">
                  {poll.poll_type === "next_track" ? "🎵 VOTE NEXT TRACK" : "LIVE LISTENER POLL"}
                </span>
                <h4 className="font-display text-lg sm:text-xl uppercase tracking-wide text-brand-navy leading-tight">
                  {poll.question}
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-1 text-[11px] font-mono text-brand-navy/70">
              <Clock className="w-3 h-3" />
              <span>LIVE</span>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2.5">
            {poll.options.map((opt) => {
              const isSelected = poll.user_voted_option_id === opt.id;

              return (
                <div key={opt.id} className="space-y-1">
                  <button
                    type="button"
                    disabled={poll.has_voted || votingId !== null}
                    onClick={() => handleVote(poll.id, opt.id)}
                    className={`w-full p-3 rounded-lg border-2 border-brand-navy text-left font-mono text-xs transition-all relative overflow-hidden flex items-center justify-between cursor-pointer disabled:cursor-default ${
                      isSelected
                        ? "bg-brand-accent text-brand-navy font-bold shadow-xs ring-2 ring-brand-navy"
                        : poll.has_voted
                        ? "bg-neutral-50 text-neutral-700"
                        : "bg-brand-off-white hover:bg-brand-accent/20 active:scale-98"
                    }`}
                  >
                    {/* Progress Bar Background (if voted) */}
                    {poll.has_voted && (
                      <div
                        className="absolute inset-y-0 left-0 bg-brand-accent/30 pointer-events-none transition-all duration-500"
                        style={{ width: `${opt.percentage}%` }}
                      />
                    )}

                    <div className="relative z-10 flex items-center gap-2">
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-navy shrink-0" />}
                      <span className="font-display text-base uppercase text-brand-navy leading-none">
                        {opt.text}
                      </span>
                    </div>

                    <div className="relative z-10 font-bold font-mono text-xs">
                      {poll.has_voted ? `${opt.percentage}% (${opt.votes})` : "VOTE"}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="flex items-center justify-between text-[11px] font-mono text-brand-navy/60 pt-1">
            <span>{poll.total_votes} votes cast</span>
            {poll.poll_type === "next_track" && (
              <span className="italic text-brand-navy/80">
                Winning track suggested directly to the DJ's live decks
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Vote, Award, Plus, Check, AlertCircle } from "lucide-react";

export default function PresenterInteractionTools() {
  // Poll State
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollType, setPollType] = useState<"general" | "next_track">("general");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDuration, setPollDuration] = useState("15");
  const [pollSubmitting, setPollSubmitting] = useState(false);
  const [pollFeedback, setPollFeedback] = useState<string | null>(null);

  // Contest State
  const [contestTitle, setContestTitle] = useState("");
  const [contestPassphrase, setContestPassphrase] = useState("");
  const [contestWinners, setContestWinners] = useState("1");
  const [contestSubmitting, setContestSubmitting] = useState(false);
  const [contestFeedback, setContestFeedback] = useState<string | null>(null);

  const handleAddOption = () => {
    if (pollOptions.length < 4) {
      setPollOptions([...pollOptions, ""]);
    }
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    setPollFeedback(null);
    setPollSubmitting(true);

    try {
      const res = await fetch("/api/radio/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: pollQuestion,
          poll_type: pollType,
          options: pollOptions.filter((o) => o.trim().length > 0),
          duration_minutes: parseInt(pollDuration, 10),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create poll");

      setPollFeedback("Live poll launched! Listeners can now vote on /radio.");
      setPollQuestion("");
      setPollOptions(["", ""]);
    } catch (err: any) {
      setPollFeedback(`Error: ${err.message}`);
    } finally {
      setPollSubmitting(false);
    }
  };

  const handleCreateContest = async (e: React.FormEvent) => {
    e.preventDefault();
    setContestFeedback(null);
    setContestSubmitting(true);

    try {
      // Find event (event 1 or 2)
      const res = await fetch("/api/radio/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: contestTitle,
          passphrase: contestPassphrase,
          contest_type: "passphrase",
          event_id: 1, // Default flagship/active festival
          tier_id: "general_early_1",
          max_winners: parseInt(contestWinners, 10),
          duration_minutes: 20,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create contest");

      setContestFeedback("Contest launched! Giving away real festival tickets to listeners.");
      setContestTitle("");
      setContestPassphrase("");
    } catch (err: any) {
      setContestFeedback(`Error: ${err.message}`);
    } finally {
      setContestSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono">
      {/* Poll Creation Card */}
      <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
        <div className="flex items-center gap-2 border-b-2 border-brand-navy pb-3">
          <Vote className="w-5 h-5 text-brand-accent" />
          <h3 className="font-display text-lg uppercase text-brand-navy">
            Launch On-Air Poll
          </h3>
        </div>

        {pollFeedback && (
          <div className="p-2 text-xs bg-amber-50 border border-brand-navy text-brand-navy font-bold">
            {pollFeedback}
          </div>
        )}

        <form onSubmit={handleCreatePoll} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-neutral-700 mb-1">Question</label>
            <input
              type="text"
              placeholder="e.g. Next track vibe: Afro House or Amapiano?"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              className="w-full p-2 border border-brand-navy rounded bg-neutral-50"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-neutral-700 mb-1">Type</label>
              <select
                value={pollType}
                onChange={(e: any) => setPollType(e.target.value)}
                className="w-full p-2 border border-brand-navy rounded bg-neutral-50"
              >
                <option value="general">General Poll</option>
                <option value="next_track">Vote Next Track</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-neutral-700 mb-1">Duration</label>
              <select
                value={pollDuration}
                onChange={(e) => setPollDuration(e.target.value)}
                className="w-full p-2 border border-brand-navy rounded bg-neutral-50"
              >
                <option value="10">10 Minutes</option>
                <option value="15">15 Minutes</option>
                <option value="30">30 Minutes</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-neutral-700">Options (2 to 4)</label>
            {pollOptions.map((opt, idx) => (
              <input
                key={idx}
                type="text"
                placeholder={`Option ${idx + 1}`}
                value={opt}
                onChange={(e) => {
                  const updated = [...pollOptions];
                  updated[idx] = e.target.value;
                  setPollOptions(updated);
                }}
                className="w-full p-2 border border-brand-navy rounded bg-neutral-50"
                required={idx < 2}
              />
            ))}
            {pollOptions.length < 4 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="text-[10px] text-brand-navy font-bold flex items-center gap-1 hover:underline pt-1"
              >
                <Plus className="w-3 h-3" /> Add Option
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={pollSubmitting}
            className="w-full py-2 bg-brand-navy hover:bg-brand-accent text-white hover:text-brand-navy font-bold uppercase transition-colors rounded cursor-pointer"
          >
            {pollSubmitting ? "Launching..." : "Launch Poll Live"}
          </button>
        </form>
      </div>

      {/* Contest Giveaway Card */}
      <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
        <div className="flex items-center gap-2 border-b-2 border-brand-navy pb-3">
          <Award className="w-5 h-5 text-red-600" />
          <h3 className="font-display text-lg uppercase text-brand-navy">
            On-Air Pass Giveaway
          </h3>
        </div>

        {contestFeedback && (
          <div className="p-2 text-xs bg-emerald-50 border border-emerald-700 text-emerald-800 font-bold">
            {contestFeedback}
          </div>
        )}

        <form onSubmit={handleCreateContest} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-neutral-700 mb-1">Contest Title</label>
            <input
              type="text"
              placeholder="e.g. Festival VIP Pass Giveaway #1"
              value={contestTitle}
              onChange={(e) => setContestTitle(e.target.value)}
              className="w-full p-2 border border-brand-navy rounded bg-neutral-50"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-neutral-700 mb-1">Spoken Passphrase</label>
              <input
                type="text"
                placeholder="e.g. mararavibes254"
                value={contestPassphrase}
                onChange={(e) => setContestPassphrase(e.target.value)}
                className="w-full p-2 border border-brand-navy rounded bg-neutral-50"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-neutral-700 mb-1">Max Winners (Cap)</label>
              <select
                value={contestWinners}
                onChange={(e) => setContestWinners(e.target.value)}
                className="w-full p-2 border border-brand-navy rounded bg-neutral-50"
              >
                <option value="1">1 Winner Pass</option>
                <option value="2">2 Winner Passes</option>
                <option value="3">3 Winner Passes</option>
              </select>
            </div>
          </div>

          <p className="text-[10px] text-neutral-500 leading-relaxed">
            Announce the secret passphrase live on mic. The first listener(s) to enter it on the site will automatically be issued a genuine digital ticket pass sent directly to their phone.
          </p>

          <button
            type="submit"
            disabled={contestSubmitting}
            className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold uppercase transition-colors rounded cursor-pointer"
          >
            {contestSubmitting ? "Starting Contest..." : "Start On-Air Giveaway"}
          </button>
        </form>
      </div>
    </div>
  );
}

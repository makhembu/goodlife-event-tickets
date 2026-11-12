"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar,
  UserPlus,
  Tv,
  Clock,
  Check,
  AlertTriangle,
  RefreshCw,
  Copy,
  UserCheck,
  Plus,
  Trash2,
  Edit2,
  X,
} from "lucide-react";

interface Presenter {
  id: number;
  full_name: string;
  dj_name: string;
  slug: string;
  email: string;
  status: string;
}

interface Show {
  id: number;
  title: string;
  slug: string;
  genre: string;
  primary_presenter_id: number;
  dj_name?: string;
  recurrence_pattern: string;
  recurrence_days: string[];
  default_start_time: string;
}

interface Slot {
  id: number;
  show_id: number;
  show_title: string;
  presenter_id: number;
  presenter_dj_name: string;
  substitute_presenter_id?: number | null;
  substitute_dj_name?: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes?: string | null;
}

export default function ScheduleManager() {
  const [activeSubTab, setActiveSubTab] = useState<"slots" | "shows" | "presenters">("slots");
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // New Presenter Modal
  const [showPresenterModal, setShowPresenterModal] = useState(false);
  const [newPresName, setNewPresName] = useState("");
  const [newPresDj, setNewPresDj] = useState("");
  const [newPresEmail, setNewPresEmail] = useState("");
  const [newPresPhone, setNewPresPhone] = useState("");
  const [tempPasswordShow, setTempPasswordShow] = useState<string | null>(null);
  const [copiedPwd, setCopiedPwd] = useState(false);

  // New Show Modal
  const [showShowModal, setShowShowModal] = useState(false);
  const [newShowTitle, setNewShowTitle] = useState("");
  const [newShowGenre, setNewShowGenre] = useState("Afrobeats");
  const [newShowDjId, setNewShowDjId] = useState<number | "">("");
  const [newShowPattern, setNewShowPattern] = useState("weekly");
  const [newShowDay, setNewShowDay] = useState("Friday");
  const [newShowTime, setNewShowTime] = useState("20:00:00");
  const [newShowDuration, setNewShowDuration] = useState("120");

  // Reassign / Edit Slot Modal
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [reassignSubDjId, setReassignSubDjId] = useState<number | "">("");
  const [slotStatus, setSlotStatus] = useState("scheduled");
  const [slotNotes, setSlotNotes] = useState("");

  // Generating 30 Days State
  const [generating, setGenerating] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pRes, sRes, slRes] = await Promise.all([
        fetch("/api/admin/radio/presenters"),
        fetch("/api/admin/radio/shows"),
        fetch("/api/admin/radio/schedule"),
      ]);

      if (pRes.ok) setPresenters((await pRes.json()).presenters || []);
      if (sRes.ok) setShows((await sRes.json()).shows || []);
      if (slRes.ok) setSlots((await slRes.json()).slots || []);
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerate30Days = async () => {
    setGenerating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/radio/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setMsg({
        type: "success",
        text: `Generated ${data.totalGenerated} slots for next 30 days! (${data.totalSkipped} skipped as existing/overlaps)`,
      });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleCreatePresenter = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/admin/radio/presenters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: newPresName,
          dj_name: newPresDj,
          email: newPresEmail,
          phone: newPresPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create presenter");

      setTempPasswordShow(data.temporary_password);
      setShowPresenterModal(false);
      setNewPresName("");
      setNewPresDj("");
      setNewPresEmail("");
      setNewPresPhone("");
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    }
  };

  const handleCreateShow = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/admin/radio/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newShowTitle,
          genre: newShowGenre,
          primary_presenter_id: newShowDjId,
          recurrence_pattern: newShowPattern,
          recurrence_days: [newShowDay],
          default_start_time: newShowTime,
          default_duration_min: parseInt(newShowDuration, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create show");

      setShowShowModal(false);
      setNewShowTitle("");
      setMsg({ type: "success", text: `Show "${data.show.title}" successfully created.` });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    }
  };

  const handleUpdateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/radio/schedule/${editingSlot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          substitute_presenter_id: reassignSubDjId || null,
          status: slotStatus,
          notes: slotNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update slot");

      setEditingSlot(null);
      setMsg({ type: "success", text: `Slot #${editingSlot.id} updated.` });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    }
  };

  const handleCancelSlot = async (slotId: number) => {
    if (!confirm("Are you sure you want to cancel this scheduled slot?")) return;
    try {
      const res = await fetch(`/api/admin/radio/schedule/${slotId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to cancel slot");
      setMsg({ type: "success", text: "Slot cancelled." });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    }
  };

  return (
    <div className="space-y-6 font-mono text-brand-navy">
      {/* Header & Quick Action */}
      <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-accent block">
            STATION PROGRAMMING
          </span>
          <h2 className="text-2xl font-display font-black uppercase text-brand-navy">
            Timetable, Shows & Presenter Roster
          </h2>
          <p className="text-xs text-neutral-600 mt-0.5">
            Manage weekly recurring shows, generate timetable slots, and manage DJ credentials.
          </p>
        </div>

        <button
          onClick={handleGenerate30Days}
          disabled={generating}
          className="px-4 py-2.5 bg-brand-accent text-brand-navy border-2 border-brand-navy font-display text-base uppercase tracking-wider hover:bg-brand-navy hover:text-white transition-all shadow-[2px_2px_0px_#142B4C] flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Generating..." : "Generate Next 30 Days"}
        </button>
      </div>

      {msg && (
        <div
          className={`p-3 border-2 text-xs font-bold flex items-center justify-between ${
            msg.type === "success"
              ? "bg-green-100 border-green-700 text-green-900"
              : "bg-red-100 border-red-700 text-red-900"
          }`}
        >
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex border-b-2 border-brand-navy gap-2">
        <button
          onClick={() => setActiveSubTab("slots")}
          className={`px-5 py-2.5 font-display text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer ${
            activeSubTab === "slots"
              ? "bg-white text-brand-navy font-black shadow-xs"
              : "bg-neutral-200 text-neutral-600 hover:bg-white"
          }`}
        >
          Schedule Slots ({slots.length})
        </button>
        <button
          onClick={() => setActiveSubTab("shows")}
          className={`px-5 py-2.5 font-display text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer ${
            activeSubTab === "shows"
              ? "bg-white text-brand-navy font-black shadow-xs"
              : "bg-neutral-200 text-neutral-600 hover:bg-white"
          }`}
        >
          Shows ({shows.length})
        </button>
        <button
          onClick={() => setActiveSubTab("presenters")}
          className={`px-5 py-2.5 font-display text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer ${
            activeSubTab === "presenters"
              ? "bg-white text-brand-navy font-black shadow-xs"
              : "bg-neutral-200 text-neutral-600 hover:bg-white"
          }`}
        >
          Presenter Roster ({presenters.length})
        </button>
      </div>

      {/* 1. SLOTS TAB */}
      {activeSubTab === "slots" && (
        <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3">
            <h3 className="font-display text-lg uppercase text-brand-navy">
              Upcoming Scheduled Slots (Africa/Nairobi UTC+3)
            </h3>
            <span className="text-xs text-neutral-500">
              Station is a single broadcast channel. Overlaps are strictly prevented.
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs animate-pulse">Loading slots...</div>
          ) : slots.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-500">
              No slots generated. Click "Generate Next 30 Days" above or add recurring shows.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-brand-navy bg-neutral-100 text-[10px] font-black uppercase text-brand-navy">
                    <th className="p-2.5">Air Date & Time (EAT)</th>
                    <th className="p-2.5">Show</th>
                    <th className="p-2.5">Primary DJ</th>
                    <th className="p-2.5">Cover / Substitute</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 font-mono">
                  {slots.map((s) => {
                    const start = new Date(s.starts_at);
                    const end = new Date(s.ends_at);
                    return (
                      <tr key={s.id} className="hover:bg-neutral-50">
                        <td className="p-2.5 font-bold">
                          {start.toLocaleDateString([], {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            timeZone: "Africa/Nairobi",
                          })}{" "}
                          ·{" "}
                          {start.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Africa/Nairobi",
                          })}
                          –
                          {end.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Africa/Nairobi",
                          })}
                        </td>
                        <td className="p-2.5 font-bold text-brand-navy">{s.show_title}</td>
                        <td className="p-2.5">{s.presenter_dj_name}</td>
                        <td className="p-2.5 text-amber-700 font-bold">
                          {s.substitute_dj_name || "—"}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-black uppercase rounded ${
                              s.status === "scheduled"
                                ? "bg-blue-100 text-blue-800"
                                : s.status === "live"
                                ? "bg-red-500 text-white animate-pulse"
                                : s.status === "completed"
                                ? "bg-green-100 text-green-800"
                                : "bg-neutral-200 text-neutral-700"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-right space-x-2">
                          <button
                            onClick={() => {
                              setEditingSlot(s);
                              setReassignSubDjId(s.substitute_presenter_id || "");
                              setSlotStatus(s.status);
                              setSlotNotes(s.notes || "");
                            }}
                            className="p-1 hover:text-brand-accent cursor-pointer"
                            title="Edit / Reassign Slot"
                          >
                            <Edit2 className="w-4 h-4 inline" />
                          </button>
                          {s.status !== "cancelled" && (
                            <button
                              onClick={() => handleCancelSlot(s.id)}
                              className="p-1 hover:text-red-600 cursor-pointer"
                              title="Cancel Slot"
                            >
                              <Trash2 className="w-4 h-4 inline" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. SHOWS TAB */}
      {activeSubTab === "shows" && (
        <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3">
            <h3 className="font-display text-lg uppercase text-brand-navy">Recurring Show Titles</h3>
            <button
              onClick={() => setShowShowModal(true)}
              className="px-3 py-1.5 bg-brand-navy text-white text-xs font-bold uppercase border border-brand-navy flex items-center gap-1.5 cursor-pointer shadow-xs hover:bg-brand-accent hover:text-brand-navy"
            >
              <Plus className="w-3.5 h-3.5" /> New Show
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shows.map((sh) => (
              <div key={sh.id} className="border-2 border-brand-navy p-4 bg-brand-off-white/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="bg-brand-accent text-brand-navy text-[10px] font-black uppercase px-2 py-0.5 border border-brand-navy">
                    {sh.genre}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-bold uppercase">
                    {sh.recurrence_pattern} · {Array.isArray(sh.recurrence_days) ? sh.recurrence_days.join(", ") : "Weekly"}
                  </span>
                </div>
                <h4 className="font-display text-xl font-black uppercase text-brand-navy">{sh.title}</h4>
                <p className="text-xs text-neutral-700">
                  Host: <span className="font-bold">{sh.dj_name || "Primary Host"}</span>
                </p>
                <p className="text-xs text-neutral-500">
                  Air time: <span className="font-bold">{sh.default_start_time} EAT</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. PRESENTERS TAB */}
      {activeSubTab === "presenters" && (
        <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3">
            <h3 className="font-display text-lg uppercase text-brand-navy">Resident Presenter Roster</h3>
            <button
              onClick={() => setShowPresenterModal(true)}
              className="px-3 py-1.5 bg-brand-navy text-white text-xs font-bold uppercase border border-brand-navy flex items-center gap-1.5 cursor-pointer shadow-xs hover:bg-brand-accent hover:text-brand-navy"
            >
              <UserPlus className="w-3.5 h-3.5" /> Add Presenter
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {presenters.map((p) => (
              <div key={p.id} className="border-2 border-brand-navy p-4 bg-brand-off-white/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-lg font-black uppercase text-brand-navy">{p.dj_name}</h4>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-green-100 text-green-800 rounded">
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-neutral-600">{p.full_name}</p>
                <p className="text-xs font-bold text-neutral-700 truncate">{p.email}</p>
                <p className="text-[10px] text-neutral-500">Slug: /radio/presenters/{p.slug}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Temporary Password Show-Once Alert Modal */}
      {tempPasswordShow && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4">
            <div className="flex items-center gap-2 text-green-700 font-bold">
              <Check className="w-5 h-5" />
              <h3 className="font-display text-xl uppercase font-black">Presenter Created!</h3>
            </div>
            <p className="text-xs text-neutral-700">
              Provide this temporary password to the presenter. It will be shown{" "}
              <strong className="text-red-700 uppercase">only once</strong>. They will be forced to change it at first login:
            </p>

            <div className="p-3 bg-neutral-100 border-2 border-brand-navy flex items-center justify-between">
              <span className="font-mono text-base font-black tracking-wider text-brand-navy">
                {tempPasswordShow}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(tempPasswordShow);
                  setCopiedPwd(true);
                  setTimeout(() => setCopiedPwd(false), 2000);
                }}
                className="px-3 py-1 bg-brand-accent text-brand-navy text-xs font-bold border border-brand-navy flex items-center gap-1 cursor-pointer"
              >
                {copiedPwd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedPwd ? "Copied" : "Copy"}
              </button>
            </div>

            <button
              onClick={() => setTempPasswordShow(null)}
              className="w-full py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy"
            >
              I Have Saved This Password
            </button>
          </div>
        </div>
      )}

      {/* New Presenter Modal */}
      {showPresenterModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2">
              <h3 className="font-display text-xl font-black uppercase text-brand-navy">Add New Presenter</h3>
              <button onClick={() => setShowPresenterModal(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePresenter} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold uppercase mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={newPresName}
                  onChange={(e) => setNewPresName(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">DJ / On-Air Name</label>
                <input
                  type="text"
                  required
                  value={newPresDj}
                  onChange={(e) => setNewPresDj(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Station Email</label>
                <input
                  type="email"
                  required
                  value={newPresEmail}
                  onChange={(e) => setNewPresEmail(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Phone Number (Optional)</label>
                <input
                  type="text"
                  value={newPresPhone}
                  onChange={(e) => setNewPresPhone(e.target.value)}
                  placeholder="0712345678"
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPresenterModal(false)}
                  className="px-4 py-2 border font-bold uppercase text-neutral-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy"
                >
                  Create Presenter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Show Modal */}
      {showShowModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2">
              <h3 className="font-display text-xl font-black uppercase text-brand-navy">Create Recurring Show</h3>
              <button onClick={() => setShowShowModal(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateShow} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold uppercase mb-1">Show Title</label>
                <input
                  type="text"
                  required
                  value={newShowTitle}
                  onChange={(e) => setNewShowTitle(e.target.value)}
                  placeholder="e.g. Afro Heat Drive"
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Genre</label>
                <input
                  type="text"
                  value={newShowGenre}
                  onChange={(e) => setNewShowGenre(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Primary Host</label>
                <select
                  required
                  value={newShowDjId}
                  onChange={(e) => setNewShowDjId(Number(e.target.value))}
                  className="w-full border-2 border-brand-navy p-2 bg-white"
                >
                  <option value="">Select Host Presenter...</option>
                  {presenters.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.dj_name} ({p.full_name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold uppercase mb-1">Cadence</label>
                  <select
                    value={newShowPattern}
                    onChange={(e) => setNewShowPattern(e.target.value)}
                    className="w-full border-2 border-brand-navy p-2 bg-white"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold uppercase mb-1">Weekday</label>
                  <select
                    value={newShowDay}
                    onChange={(e) => setNewShowDay(e.target.value)}
                    className="w-full border-2 border-brand-navy p-2 bg-white"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold uppercase mb-1">Start Time (EAT)</label>
                  <input
                    type="time"
                    step="1"
                    value={newShowTime}
                    onChange={(e) => setNewShowTime(e.target.value)}
                    className="w-full border-2 border-brand-navy p-2"
                  />
                </div>

                <div>
                  <label className="block font-bold uppercase mb-1">Duration (Min)</label>
                  <input
                    type="number"
                    value={newShowDuration}
                    onChange={(e) => setNewShowDuration(e.target.value)}
                    className="w-full border-2 border-brand-navy p-2"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowShowModal(false)}
                  className="px-4 py-2 border font-bold uppercase text-neutral-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy"
                >
                  Save Show
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign / Slot Edit Drawer Modal */}
      {editingSlot && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2">
              <h3 className="font-display text-xl font-black uppercase text-brand-navy">
                Slot Reassign & Edit
              </h3>
              <button onClick={() => setEditingSlot(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSlot} className="space-y-3 text-xs">
              <p className="font-bold text-sm text-brand-navy">{editingSlot.show_title}</p>
              <p className="text-neutral-600">Primary DJ: {editingSlot.presenter_dj_name}</p>

              <div>
                <label className="block font-bold uppercase mb-1">
                  Assign Substitute / Cover DJ
                </label>
                <select
                  value={reassignSubDjId}
                  onChange={(e) => setReassignSubDjId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full border-2 border-brand-navy p-2 bg-white"
                >
                  <option value="">None (Primary DJ performs)</option>
                  {presenters
                    .filter((p) => p.id !== editingSlot.presenter_id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        Cover: {p.dj_name} ({p.full_name})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Slot Status</label>
                <select
                  value={slotStatus}
                  onChange={(e) => setSlotStatus(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2 bg-white"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="noshow">No-show</option>
                </select>
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Slot Notes</label>
                <textarea
                  rows={2}
                  value={slotNotes}
                  onChange={(e) => setSlotNotes(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSlot(null)}
                  className="px-4 py-2 border font-bold uppercase text-neutral-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

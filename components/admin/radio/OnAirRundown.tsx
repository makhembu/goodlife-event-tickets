"use client";

import React, { useState, useEffect } from "react";
import { ListMusic, Trash2, RefreshCw, Clock, Disc3, Layers } from "lucide-react";

export default function OnAirRundown() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/radio/azuracast/queue");
      if (res.ok) {
        const data = await res.json();
        setQueue(Array.isArray(data.queue) ? data.queue : []);
      }
    } catch (err) {
      console.error("Failed to fetch rundown queue:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("CONFIRM REMOVAL: Remove this upcoming item from the live broadcast queue?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/radio/azuracast/queue/${id}`, { method: "DELETE" });
      if (res.ok) {
        setQueue((prev) => prev.filter((item) => (item.id || item.sh_id) !== id));
      } else {
        alert("Failed to remove queue item.");
      }
    } catch {
      alert("Network timeout removing item.");
    } finally {
      setDeletingId(null);
    }
  };

  const formatSecs = (sec: number) => {
    if (!sec || isNaN(sec)) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 shadow-xl flex flex-col h-full space-y-4">
      {/* Rundown Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="font-mono text-xs font-black tracking-widest uppercase text-white">
            ON-AIR RUNDOWN &amp; UP NEXT
          </h3>
        </div>
        <button
          onClick={fetchQueue}
          disabled={loading}
          className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title="Refresh Queue"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
        </button>
      </div>

      {/* List of upcoming items */}
      <div className="flex-1 overflow-y-auto space-y-2 max-h-[380px] pr-1">
        {queue.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/30">
            <Disc3 className="w-8 h-8 text-zinc-700 mx-auto mb-2 animate-spin [animation-duration:10s]" />
            <p className="font-mono text-xs font-bold text-zinc-400 uppercase">
              AUTODJ ROTATION ENGAGED
            </p>
            <p className="font-mono text-[11px] text-zinc-600 mt-1">
              Active festival playlist scheduled continuously. Manual requests will appear here as Slot #1.
            </p>
          </div>
        ) : (
          queue.map((item: any, idx: number) => {
            const song = item.song || {};
            const qId = item.id || item.sh_id;
            return (
              <div
                key={qId || idx}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="font-mono font-bold text-xs text-zinc-500 w-5">
                    #{idx + 1}
                  </span>
                  <div className="truncate">
                    <p className="font-mono text-xs font-bold text-zinc-100 truncate group-hover:text-cyan-400 transition-colors">
                      {song.title || "Untitled Track"}
                    </p>
                    <p className="font-mono text-[10px] text-zinc-400 truncate">
                      {song.artist || "Goodlife Resident"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 ml-2 flex-shrink-0">
                  <span className="font-mono text-[10px] text-zinc-400 flex items-center gap-1 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                    <Clock className="w-3 h-3 text-zinc-500" />
                    {formatSecs(song.duration)}
                  </span>
                  {qId && (
                    <button
                      onClick={() => handleDelete(qId)}
                      disabled={deletingId === qId}
                      className="p-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-900/40 transition-colors cursor-pointer"
                      title="Remove from queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

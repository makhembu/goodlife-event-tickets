"use client";

import React, { useState, useEffect } from "react";
import { ListMusic, Trash2, ArrowUp, RefreshCw, Music2, Clock } from "lucide-react";

export default function AzuraCastQueueCard() {
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
      console.error("Failed to fetch AzuraCast queue:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this upcoming song from the broadcast queue?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/radio/azuracast/queue/${id}`, { method: "DELETE" });
      if (res.ok) {
        setQueue((prev) => prev.filter((item) => (item.id || item.sh_id) !== id));
      } else {
        alert("Failed to delete queued track");
      }
    } catch {
      alert("Network error removing track");
    } finally {
      setDeletingId(null);
    }
  };

  const formatSecs = (sec: number) => {
    if (!sec) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="bg-white border-4 border-black p-4 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] flex flex-col h-full">
      <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-3">
        <div className="flex items-center gap-2">
          <ListMusic className="w-5 h-5 text-black" />
          <h2 className="font-black text-sm tracking-wide uppercase">AZURACAST UPCOMING QUEUE</h2>
        </div>
        <button
          onClick={fetchQueue}
          disabled={loading}
          className="p-1.5 border-2 border-black bg-zinc-100 hover:bg-zinc-200 text-black active:translate-x-0.5 active:translate-y-0.5"
          title="Refresh Queue"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 max-h-[420px] pr-1">
        {queue.length === 0 ? (
          <div className="text-center py-8 text-zinc-400 font-mono text-xs border-2 border-dashed border-zinc-300 p-4">
            {loading ? "FETCHING BROADCAST QUEUE..." : "AUTO-DJ RUNNING ACTIVE ROTATION (QUEUE EMPTY)"}
          </div>
        ) : (
          queue.map((item: any, idx: number) => {
            const song = item.song || {};
            const qId = item.id || item.sh_id;
            return (
              <div
                key={qId || idx}
                className="flex items-center justify-between p-2.5 bg-zinc-50 border-2 border-black hover:bg-yellow-50/50 transition-colors"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="font-mono font-black text-xs text-zinc-500 w-5">
                    #{idx + 1}
                  </span>
                  <div className="truncate">
                    <p className="font-bold text-xs text-black truncate">{song.title || "Unknown Title"}</p>
                    <p className="font-mono text-[11px] text-zinc-600 truncate">{song.artist || "Unknown Artist"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <span className="font-mono text-[10px] text-zinc-500 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {formatSecs(song.duration)}
                  </span>
                  {qId && (
                    <button
                      onClick={() => handleDelete(qId)}
                      disabled={deletingId === qId}
                      className="p-1 border border-black bg-red-100 hover:bg-red-600 hover:text-white text-red-700 transition-colors"
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

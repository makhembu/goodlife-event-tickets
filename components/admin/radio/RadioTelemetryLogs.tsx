"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Radio,
  Play,
  Pause,
  RefreshCw,
  Sparkles,
  Clock,
  MapPin,
  Users,
  Volume2,
  CloudSun,
  Car,
  Newspaper,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { RadioSet } from "@/lib/radio/types";
import { formatTrackTitle } from "@/lib/radio/media-helpers";

interface DropRecord {
  id: number;
  persona: string;
  mood: string;
  title: string;
  script: string;
  audio_url: string;
  target_track_id?: number | null;
  target_track_title?: string | null;
  target_artist?: string | null;
  timing_type?: string;
  play_count?: number;
  created_at: string;
}

interface TelemetryData {
  broadcast: {
    currentIndex: number;
    currentTrack: RadioSet;
    nextTrack: RadioSet;
    offsetSec: number;
    durationSec: number;
    timeLeftSec: number;
    progressPercent: number;
    totalTracks: number;
  } | null;
  telemetry: {
    listenersCount: number;
    nairobiTimeEAT: string;
    nairobiTime12h: string;
    timeSlot: string;
    timeSlotLabel: string;
    weather: string;
    trafficBulletin: string;
    entertainmentNews: string;
    activeCities: string[];
    venue: string;
    frequency: string;
  };
  drops: DropRecord[];
  stats: {
    totalDropsGenerated: number;
    totalPlays: number;
    activeListeners: number;
  };
  cityBreakdown: Array<{ city: string; count: number }>;
}

export default function RadioTelemetryLogs({ library }: { library: RadioSet[] }) {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playingDropId, setPlayingDropId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Manual generation state
  const [generating, setGenerating] = useState(false);
  const [genPersona, setGenPersona] = useState("DJ Shax");
  const [selectedTrackId, setSelectedTrackId] = useState<number | "next">("next");
  const [genStatus, setGenStatus] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/admin/radio/logs");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.warn("Failed to load radio logs:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000); // Live poll every 15s
    return () => clearInterval(interval);
  }, []);

  const formatSecs = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handlePlayDrop = (drop: DropRecord) => {
    if (playingDropId === drop.id) {
      audioRef.current?.pause();
      setPlayingDropId(null);
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setPlayingDropId(null);
      audioRef.current.onerror = () => setPlayingDropId(null);
    }

    audioRef.current.src = drop.audio_url;
    audioRef.current.play().catch(() => setPlayingDropId(null));
    setPlayingDropId(drop.id);
  };

  const handleManualGenerate = async () => {
    setGenerating(true);
    setGenStatus(null);
    try {
      let targetTrack: RadioSet | undefined;
      if (selectedTrackId === "next" && data?.broadcast?.nextTrack) {
        targetTrack = data.broadcast.nextTrack;
      } else if (typeof selectedTrackId === "number") {
        targetTrack = library.find((s) => s.id === selectedTrackId);
      }

      const personaIdMap: Record<string, string> = {
        "DJ Fusion": "dj-fusion",
        "DJ Sudi": "dj-sudi",
        "DJ Sney": "dj-sney",
        "MC Cheche": "mc-cheche",
        "DJ Shax": "dj-shax",
        "Amina": "amina",
        "Bwana Mkubwa": "bwana-mkubwa",
        "Malkia Kenya": "malkia-kenya",
        "Wigman": "wigman",
        "Zari": "zari",
      };

      const res = await fetch("/api/radio/drops/dynamic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nextTrackId: targetTrack?.id,
          nextTrackTitle: targetTrack?.title || "Festival Jam",
          nextTrackArtist: targetTrack?.dj_name || "Nairobi DJ",
          nextTrackGenre: targetTrack?.genre || "Afrobeats",
          currentTrackTitle: data?.broadcast?.currentTrack?.title || "Airwave Anthem",
          currentTrackArtist: data?.broadcast?.currentTrack?.dj_name || "Goodlife Allstars",
          timingType: "outro",
          preferredPersonaId: personaIdMap[genPersona] || "dj-fusion",
          preferredMood: genPersona === "Amina" ? "sensual" : genPersona === "MC Cheche" ? "comedic" : "hype",
          forceNew: true, // force a fresh generation
        }),
      });

      if (res.ok) {
        const drop = await res.json();
        setGenStatus(`Success: Generated drop for ${targetTrack?.title || "Next Track"}!`);
        await fetchLogs();
        if (drop.drop_url && audioRef.current) {
          audioRef.current.src = drop.drop_url;
          audioRef.current.play().catch(() => {});
        }
      } else {
        setGenStatus("Generation failed. Check server logs.");
      }
    } catch (err: any) {
      setGenStatus(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const getPersonaBadge = (persona: string) => {
    switch (persona) {
      case "DJ Fusion":
        return "bg-rose-500/20 text-rose-300 border-rose-500/40";
      case "DJ Sudi":
        return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
      case "DJ Sney":
        return "bg-orange-500/20 text-orange-300 border-orange-500/40";
      case "DJ Shax":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
      case "Amina":
        return "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40";
      case "MC Cheche":
        return "bg-amber-500/20 text-amber-300 border-amber-500/40";
      case "Bwana Mkubwa":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
      case "Malkia Kenya":
        return "bg-pink-500/20 text-pink-300 border-pink-500/40";
      case "Wigman":
        return "bg-sky-500/20 text-sky-300 border-sky-500/40";
      case "Zari":
        return "bg-teal-500/20 text-teal-300 border-teal-500/40";
      default:
        return "bg-brand-accent/20 text-brand-accent border-brand-accent/40";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header / Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-brand-navy-light/40 border-2 border-brand-navy-light p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-bold font-mono uppercase tracking-wider text-brand-off-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-brand-accent animate-pulse" />
            Live Broadcast Telemetry & AI Drops Log
          </h2>
          <p className="text-xs text-brand-off-white/60 font-mono mt-0.5">
            Real-time audio playhead timeline, listener telemetry, and synchronized AI imaging transcripts
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={refreshing}
          className="px-3.5 py-1.5 bg-brand-navy border-2 border-brand-navy-light hover:border-brand-accent text-brand-off-white font-mono text-xs font-bold uppercase rounded-lg flex items-center gap-2 cursor-pointer transition-all active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-brand-accent" : ""}`} />
          Refresh Airwaves
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-brand-off-white/50 font-mono text-sm animate-pulse">
          Loading live broadcast airwaves telemetry...
        </div>
      ) : !data ? (
        <div className="py-12 text-center text-red-400 font-mono text-sm">
          Failed to connect to broadcast telemetry engine.
        </div>
      ) : (
        <>
          {/* 1. BROADCAST PLAYHEAD & TIMELINE MONITOR */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Current Playing Track */}
            <div className="md:col-span-2 bg-brand-navy-light/30 border-2 border-brand-navy-light p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  24/7 ON AIR NOW
                </span>
                <span className="text-xs font-mono text-brand-off-white/60">
                  Track {((data.broadcast?.currentIndex ?? 0) + 1)} of {data.broadcast?.totalTracks ?? 0}
                </span>
              </div>

              {data.broadcast?.currentTrack ? (
                <div>
                  <h3 className="text-lg font-bold text-brand-off-white truncate font-sans">
                    {formatTrackTitle(data.broadcast.currentTrack.title)}
                  </h3>
                  <p className="text-xs font-mono text-brand-accent truncate">
                    {data.broadcast.currentTrack.dj_name} · {data.broadcast.currentTrack.genre || "Afrobeats"}
                  </p>

                  {/* Audio Progress Bar */}
                  <div className="mt-3 space-y-1">
                    <div className="w-full bg-brand-navy h-2.5 rounded-full overflow-hidden border border-brand-navy-light">
                      <div
                        className="bg-brand-accent h-full transition-all duration-300"
                        style={{ width: `${Math.min(100, data.broadcast.progressPercent)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] font-mono text-brand-off-white/60">
                      <span>{formatSecs(data.broadcast.offsetSec)} elapsed</span>
                      <span className="text-brand-accent">
                        {formatSecs(data.broadcast.timeLeftSec)} left until drop transition
                      </span>
                      <span>{formatSecs(data.broadcast.durationSec)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-mono text-brand-off-white/60">No active track playing.</p>
              )}
            </div>

            {/* Upcoming Track Next */}
            <div className="bg-brand-navy-light/30 border-2 border-brand-navy-light p-4 rounded-xl space-y-2 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 bg-brand-accent/20 text-brand-accent border border-brand-accent/30 rounded">
                  UP NEXT ON AIR
                </span>
                {data.broadcast?.nextTrack ? (
                  <div className="mt-2.5">
                    <h4 className="text-sm font-bold text-brand-off-white truncate">
                      {formatTrackTitle(data.broadcast.nextTrack.title)}
                    </h4>
                    <p className="text-xs font-mono text-brand-accent/80 truncate">
                      {data.broadcast.nextTrack.dj_name}
                    </p>
                    <p className="text-[11px] font-mono text-brand-off-white/50 mt-1">
                      Length: {formatSecs(data.broadcast.nextTrack.duration_sec || 180)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs font-mono text-brand-off-white/50 mt-2">Queue loop</p>
                )}
              </div>

              <div className="pt-2 border-t border-brand-navy-light/60 text-[11px] font-mono text-brand-off-white/60 flex items-center justify-between">
                <span>Sidechain Duck: -12dB</span>
                <span className="text-emerald-400 font-bold">Outro ~10s</span>
              </div>
            </div>
          </div>

          {/* 2. LIVE TELEMETRY STATS CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-brand-navy-light/20 border border-brand-navy-light p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-brand-off-white/60 font-mono">
                <Users className="w-3.5 h-3.5 text-brand-accent" />
                <span>Listeners</span>
              </div>
              <p className="text-lg font-bold font-mono text-brand-off-white">
                {data.stats.activeListeners.toLocaleString()}
              </p>
            </div>

            <div className="bg-brand-navy-light/20 border border-brand-navy-light p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-brand-off-white/60 font-mono">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nairobi Time</span>
              </div>
              <p className="text-lg font-bold font-mono text-brand-off-white">
                {data.telemetry.nairobiTime12h}
              </p>
            </div>

            <div className="bg-brand-navy-light/20 border border-brand-navy-light p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-brand-off-white/60 font-mono">
                <CloudSun className="w-3.5 h-3.5 text-amber-400" />
                <span>Weather</span>
              </div>
              <p className="text-xs font-mono text-brand-off-white truncate" title={data.telemetry.weather}>
                {data.telemetry.weather}
              </p>
            </div>

            <div className="bg-brand-navy-light/20 border border-brand-navy-light p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-brand-off-white/60 font-mono">
                <Car className="w-3.5 h-3.5 text-sky-400" />
                <span>Traffic</span>
              </div>
              <p className="text-xs font-mono text-brand-off-white truncate" title={data.telemetry.trafficBulletin}>
                Thika Superhighway
              </p>
            </div>

            <div className="bg-brand-navy-light/20 border border-brand-navy-light p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-brand-off-white/60 font-mono">
                <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>Drops Done</span>
              </div>
              <p className="text-lg font-bold font-mono text-brand-off-white">
                {data.stats.totalDropsGenerated}
              </p>
            </div>

            <div className="bg-brand-navy-light/20 border border-brand-navy-light p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-brand-off-white/60 font-mono">
                <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Total Plays</span>
              </div>
              <p className="text-lg font-bold font-mono text-brand-off-white">
                {data.stats.totalPlays.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Active Cities Breakdown */}
          {data.cityBreakdown && data.cityBreakdown.length > 0 && (
            <div className="bg-brand-navy-light/20 border border-brand-navy-light p-3 rounded-xl flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono uppercase text-brand-off-white/60 flex items-center gap-1 mr-2">
                <MapPin className="w-3.5 h-3.5 text-red-400" />
                Listener Cities (Last 24h):
              </span>
              {data.cityBreakdown.map((c, i) => (
                <span
                  key={i}
                  className="px-2.5 py-0.5 bg-brand-navy border border-brand-navy-light rounded-full text-xs font-mono text-brand-off-white flex items-center gap-1.5"
                >
                  <span className="font-bold text-brand-accent">{c.city}</span>
                  <span className="text-brand-off-white/40 text-[10px]">({c.count})</span>
                </span>
              ))}
            </div>
          )}

          {/* 3. TEST / MANUAL GENERATOR BAR */}
          <div className="bg-gradient-to-r from-brand-navy-light/40 to-brand-navy/60 border-2 border-brand-accent/40 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold font-mono uppercase text-brand-accent flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-accent" />
                On-Demand Dynamic Drop Master
              </h4>
              <span className="text-[11px] font-mono text-brand-off-white/50">
                NVIDIA NIM Llama-3.2 + Fish Audio s2.1-pro-free
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-mono text-brand-off-white/60 uppercase block mb-1">
                  Target Track to Tease
                </label>
                <select
                  value={selectedTrackId}
                  onChange={(e) => setSelectedTrackId(e.target.value === "next" ? "next" : Number(e.target.value))}
                  className="w-full bg-brand-navy border border-brand-navy-light text-brand-off-white text-xs font-mono p-2 rounded-lg"
                >
                  <option value="next">
                    [Upcoming Next Track] {data.broadcast?.nextTrack ? formatTrackTitle(data.broadcast.nextTrack.title) : "Default"}
                  </option>
                  {library.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatTrackTitle(s.title)} ({s.dj_name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-[180px]">
                <label className="text-[10px] font-mono text-brand-off-white/60 uppercase block mb-1">
                  Voice Persona
                </label>
                <select
                  value={genPersona}
                  onChange={(e) => setGenPersona(e.target.value)}
                  className="w-full bg-brand-navy border border-brand-navy-light text-brand-off-white text-xs font-mono p-2 rounded-lg"
                >
                  <option value="DJ Fusion">DJ Fusion (Resident / 30%)</option>
                  <option value="DJ Sudi">DJ Sudi (Swahili Drops)</option>
                  <option value="DJ Sney">DJ Sney (Hype Mixtape)</option>
                  <option value="MC Cheche">MC Cheche (Slick Sheng)</option>
                  <option value="DJ Shax">DJ Shax (Festival Hype)</option>
                  <option value="Amina">Amina (Sunset Queen)</option>
                  <option value="Bwana Mkubwa">Bwana Mkubwa (Baritone Swahili)</option>
                  <option value="Malkia Kenya">Malkia Kenya (Vibrant Presenter)</option>
                  <option value="Wigman">Wigman (Club Commander)</option>
                  <option value="Zari">Zari (Coastal Breeze)</option>
                </select>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleManualGenerate}
                  disabled={generating}
                  className="px-4 py-2 bg-brand-accent text-brand-navy font-mono text-xs font-black uppercase rounded-lg hover:bg-brand-accent-vivid cursor-pointer transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />
                  {generating ? "Synthesizing AI Drop..." : "Generate Drop Now"}
                </button>
              </div>
            </div>

            {genStatus && (
              <p
                className={`text-xs font-mono ${
                  genStatus.startsWith("Success") ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {genStatus}
              </p>
            )}
          </div>

          {/* 4. RECENT GENERATED DROPS TABLE */}
          <div className="bg-brand-navy-light/20 border-2 border-brand-navy-light rounded-xl overflow-hidden">
            <div className="p-3.5 bg-brand-navy-light/40 border-b border-brand-navy-light flex items-center justify-between">
              <span className="text-xs font-bold font-mono uppercase text-brand-off-white tracking-wider">
                Recent Drops Generated & Broadcast Transcripts ({data.drops.length})
              </span>
              <span className="text-[10px] font-mono text-brand-off-white/50">
                Synced from Neon Postgres `radio_drops`
              </span>
            </div>

            {data.drops.length === 0 ? (
              <div className="py-12 text-center text-brand-off-white/40 font-mono text-xs">
                No drops logged yet. Trigger the dynamic drop master above or let the 24/7 broadcast run!
              </div>
            ) : (
              <div className="divide-y divide-brand-navy-light/40 max-h-[600px] overflow-y-auto font-mono">
                {data.drops.map((drop) => {
                  const isPlaying = playingDropId === drop.id;
                  return (
                    <div
                      key={drop.id}
                      className="p-3.5 hover:bg-brand-navy-light/30 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Play Preview Button */}
                          <button
                            onClick={() => handlePlayDrop(drop)}
                            className={`p-1.5 rounded-md border text-xs flex items-center gap-1 cursor-pointer transition-all active:scale-95 ${
                              isPlaying
                                ? "bg-red-500 text-white border-red-400"
                                : "bg-brand-accent text-brand-navy border-brand-accent hover:bg-white"
                            }`}
                            title={isPlaying ? "Stop preview" : "Listen to drop"}
                          >
                            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                            <span className="font-bold text-[10px]">{isPlaying ? "PAUSE" : "PLAY"}</span>
                          </button>

                          {/* Persona Badge */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getPersonaBadge(
                              drop.persona
                            )}`}
                          >
                            {drop.persona}
                          </span>

                          {/* Mood Badge */}
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-brand-navy border border-brand-navy-light text-brand-off-white/70">
                            {drop.mood}
                          </span>

                          {/* Target Track */}
                          {drop.target_track_title && (
                            <span className="text-brand-off-white/80 font-bold">
                              Target: {drop.target_track_title}
                              {drop.target_artist ? ` (${drop.target_artist})` : ""}
                            </span>
                          )}

                          <span className="text-[10px] text-brand-off-white/40 ml-auto">
                            {new Date(drop.created_at).toLocaleTimeString("en-KE", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </div>

                        {/* Spoken Script Transcript */}
                        <div className="bg-brand-navy/60 p-2.5 rounded-lg border border-brand-navy-light/60 text-brand-off-white/90 text-xs leading-relaxed font-sans">
                          {drop.script}
                        </div>
                      </div>

                      <div className="flex md:flex-col items-center md:items-end justify-between gap-1 text-[10px] text-brand-off-white/50 shrink-0">
                        <a
                          href={drop.audio_url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-brand-accent flex items-center gap-1 underline underline-offset-2"
                        >
                          R2 MP3 <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        <span>Slot: {drop.timing_type || "outro"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

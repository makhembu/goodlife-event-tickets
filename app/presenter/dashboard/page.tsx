"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Radio,
  Calendar,
  User,
  LogOut,
  Clock,
  Check,
  AlertCircle,
  ExternalLink,
  Shield,
  Save,
  RadioTower,
  Key,
  Copy,
  RefreshCw,
  Headphones,
  Music,
  Lock,
  Globe,
  Sliders,
  HelpCircle,
} from "lucide-react";

interface PresenterProfile {
  id: number;
  full_name: string;
  dj_name: string;
  slug: string;
  email: string;
  phone?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  social_links?: Record<string, string>;
  must_change_password: boolean;
}

interface SlotItem {
  id: number;
  show_id: number;
  show_title: string;
  show_slug: string;
  show_genre: string;
  primary_dj_name: string;
  substitute_dj_name?: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes?: string | null;
  cover_requested?: boolean;
  cover_request_reason?: string | null;
}

interface RecordingItem {
  id: number;
  title: string;
  dj_name: string;
  audio_url: string;
  duration: number;
  file_size: number;
  bitrate: number;
  genre: string;
  recorded_at: string;
  is_public: boolean;
  show_title?: string;
  show_slug?: string;
}

interface ConnectionStatusData {
  has_stream_key: boolean;
  key_prefix: string;
  allowed_now: boolean;
  status_message: string;
  allowed_starting_at?: string | null;
  stream_config: {
    host: string;
    port: number;
    mount: string;
    username: string;
    format: string;
  };
  next_slot?: SlotItem | null;
}

export default function PresenterDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<PresenterProfile | null>(null);
  const [upcomingSlots, setUpcomingSlots] = useState<SlotItem[]>([]);
  const [pastSlots, setPastSlots] = useState<SlotItem[]>([]);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [connStatus, setConnStatus] = useState<ConnectionStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"go-live" | "slots" | "recordings" | "profile">("go-live");

  // Profile Edit State
  const [djName, setDjName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [instaUrl, setInstaUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Change Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState(false);

  // Stream Key Generation & Display Modal State
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyRegenLoading, setKeyRegenLoading] = useState(false);

  // Cover Request Modal State
  const [coverSlot, setCoverSlot] = useState<SlotItem | null>(null);
  const [coverReason, setCoverReason] = useState("");
  const [coverSubmitting, setCoverSubmitting] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverSuccess, setCoverSuccess] = useState(false);

  // Setup Guide software tab
  const [activeGuide, setActiveGuide] = useState<"vDJ" | "mixxx" | "butt" | "obs">("butt");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [meRes, slotsRes, recRes, connRes] = await Promise.all([
        fetch("/api/presenter/me"),
        fetch("/api/presenter/slots"),
        fetch("/api/presenter/recordings"),
        fetch("/api/presenter/connection-status"),
      ]);

      if (meRes.status === 401) {
        router.push("/presenter/login");
        return;
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        setProfile(meData.presenter);
        setDjName(meData.presenter.dj_name || "");
        setBio(meData.presenter.bio || "");
        setAvatarUrl(meData.presenter.avatar_url || "");
        setInstaUrl(meData.presenter.social_links?.instagram || "");
        setTwitterUrl(meData.presenter.social_links?.twitter || "");

        if (meData.presenter.must_change_password) {
          setShowPasswordModal(true);
        }
      }

      if (slotsRes.ok) {
        const slotsData = await slotsRes.json();
        setUpcomingSlots(slotsData.upcoming_slots || []);
        setPastSlots(slotsData.past_slots || []);
      }

      if (recRes.ok) {
        const recData = await recRes.json();
        setRecordings(recData.recordings || []);
      }

      if (connRes.ok) {
        const cData = await connRes.json();
        setConnStatus(cData);
      }
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/presenter/auth/logout", { method: "POST" });
    router.push("/presenter/login");
  };

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 2500);
    }
  };

  const handleRegenerateKey = async () => {
    if (!confirm("Are you sure you want to regenerate your stream key? Your previous key will be immediately revoked.")) {
      return;
    }
    setKeyRegenLoading(true);
    try {
      const res = await fetch("/api/presenter/stream-key/regenerate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to regenerate key");

      setNewlyGeneratedKey(data.fullKey);
      if (connStatus) {
        setConnStatus({
          ...connStatus,
          has_stream_key: true,
          key_prefix: data.prefix,
        });
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setKeyRegenLoading(false);
    }
  };

  const handleToggleRecordingPublic = async (recId: number) => {
    try {
      const res = await fetch(`/api/presenter/recordings/${recId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update recording");

      setRecordings((prev) =>
        prev.map((r) => (r.id === recId ? { ...r, is_public: data.is_public } : r))
      );
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleRequestCoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coverSlot) return;
    setCoverSubmitting(true);
    setCoverError(null);

    try {
      const res = await fetch(`/api/presenter/slots/${coverSlot.id}/request-cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: coverReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit request");

      setCoverSuccess(true);
      setTimeout(() => {
        setCoverSuccess(false);
        setCoverSlot(null);
        setCoverReason("");
        loadData();
      }, 1500);
    } catch (err: any) {
      setCoverError(err.message);
    } finally {
      setCoverSubmitting(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("Saving...");
    try {
      const res = await fetch("/api/presenter/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dj_name: djName,
          bio,
          avatar_url: avatarUrl,
          social_links: {
            instagram: instaUrl,
            twitter: twitterUrl,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to update profile");
      const data = await res.json();
      setProfile(data.presenter);
      setSaveStatus("Saved successfully!");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message}`);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);

    if (newPassword !== confirmPassword) {
      setPwdError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setPwdError("New password must be at least 8 characters");
      return;
    }

    try {
      const res = await fetch("/api/presenter/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Password change failed");

      setPwdSuccess(true);
      setTimeout(() => {
        setShowPasswordModal(false);
        setProfile((prev) => (prev ? { ...prev, must_change_password: false } : null));
      }, 1500);
    } catch (err: any) {
      setPwdError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-mono font-bold text-brand-navy animate-pulse">
        LOADING PRESENTER STUDIO...
      </div>
    );
  }

  const host = connStatus?.stream_config.host || "live-dj.goodlife.co.ke";
  const port = connStatus?.stream_config.port || 8005;
  const mount = connStatus?.stream_config.mount || "/live";
  const username = connStatus?.stream_config.username || `dj_${profile?.slug}`;

  return (
    <div className="min-h-screen bg-brand-off-white text-brand-navy font-mono pb-20">
      {/* Top Header */}
      <header className="border-b-4 border-brand-navy bg-brand-navy text-brand-off-white px-4 py-3 sm:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-brand-accent text-brand-navy border border-brand-navy">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-accent block">
                PRESENTER STUDIO
              </span>
              <h1 className="text-lg sm:text-xl font-display font-black uppercase text-white leading-tight">
                {profile?.dj_name || "Resident Presenter"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href={`/radio/presenters/${profile?.slug}`}
              target="_blank"
              className="hidden sm:flex items-center gap-1 text-xs font-bold uppercase text-brand-accent hover:text-white"
            >
              Public Profile <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-mono text-xs font-bold uppercase border border-brand-navy flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 py-6 sm:px-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap border-b-2 border-brand-navy gap-1 sm:gap-2">
          <button
            onClick={() => setActiveTab("go-live")}
            className={`px-4 sm:px-5 py-2 font-display text-base sm:text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer transition-all flex items-center gap-1.5 ${
              activeTab === "go-live"
                ? "bg-white text-brand-navy font-black shadow-xs"
                : "bg-neutral-200 text-neutral-600 hover:bg-white"
            }`}
          >
            <RadioTower className="w-4 h-4 text-brand-accent" />
            <span>Go Live & Stream Setup</span>
          </button>

          <button
            onClick={() => setActiveTab("slots")}
            className={`px-4 sm:px-5 py-2 font-display text-base sm:text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer transition-all flex items-center gap-1.5 ${
              activeTab === "slots"
                ? "bg-white text-brand-navy font-black shadow-xs"
                : "bg-neutral-200 text-neutral-600 hover:bg-white"
            }`}
          >
            <Calendar className="w-4 h-4 text-brand-accent" />
            <span>My Air Slots ({upcomingSlots.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("recordings")}
            className={`px-4 sm:px-5 py-2 font-display text-base sm:text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer transition-all flex items-center gap-1.5 ${
              activeTab === "recordings"
                ? "bg-white text-brand-navy font-black shadow-xs"
                : "bg-neutral-200 text-neutral-600 hover:bg-white"
            }`}
          >
            <Music className="w-4 h-4 text-brand-accent" />
            <span>My Recordings ({recordings.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 sm:px-5 py-2 font-display text-base sm:text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer transition-all flex items-center gap-1.5 ${
              activeTab === "profile"
                ? "bg-white text-brand-navy font-black shadow-xs"
                : "bg-neutral-200 text-neutral-600 hover:bg-white"
            }`}
          >
            <User className="w-4 h-4 text-brand-accent" />
            <span>Edit Profile</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: GO LIVE & STREAM SETUP                                             */}
        {/* ========================================================================= */}
        {activeTab === "go-live" && (
          <div className="space-y-6">
            {/* Live Connection Pre-Flight Status Bar */}
            <div className={`border-3 border-brand-navy p-5 shadow-[4px_4px_0px_#142B4C] ${
              connStatus?.allowed_now ? "bg-emerald-50 border-emerald-800" : "bg-white"
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${
                      connStatus?.allowed_now ? "bg-emerald-500 animate-ping" : "bg-neutral-400"
                    }`} />
                    <span className="font-mono text-xs font-black uppercase tracking-wider text-brand-navy">
                      CONNECTION PRE-FLIGHT STATUS
                    </span>
                  </div>
                  <p className="font-mono text-xs font-bold text-neutral-800">
                    {connStatus?.status_message}
                  </p>
                </div>

                <div className="shrink-0">
                  <span className={`inline-block px-3 py-1 text-xs font-black uppercase font-mono border-2 border-brand-navy ${
                    connStatus?.allowed_now
                      ? "bg-emerald-500 text-brand-navy shadow-xs animate-pulse"
                      : "bg-neutral-200 text-neutral-700"
                  }`}>
                    {connStatus?.allowed_now ? "HARBOR READY · CONNECT NOW" : "HARBOR STANDBY"}
                  </span>
                </div>
              </div>
            </div>

            {/* Stream Credentials Card */}
            <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-brand-navy pb-3">
                <div>
                  <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy flex items-center gap-2">
                    <Key className="w-5 h-5 text-brand-accent" /> Personal Stream Encoder Settings
                  </h2>
                  <p className="text-[11px] text-neutral-600 font-mono mt-0.5">
                    Connect directly using your DJ mixing software (VirtualDJ, Mixxx, BUTT, OBS).
                  </p>
                </div>

                <button
                  onClick={handleRegenerateKey}
                  disabled={keyRegenLoading}
                  className="px-3 py-1.5 bg-brand-navy hover:bg-brand-accent text-white hover:text-brand-navy font-mono text-xs font-bold uppercase border-2 border-brand-navy flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${keyRegenLoading ? "animate-spin" : ""}`} />
                  <span>Regenerate Stream Key</span>
                </button>
              </div>

              {/* Grid of connection parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
                {/* Host */}
                <div className="bg-brand-off-white/60 p-3 border-2 border-brand-navy flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-neutral-500 font-bold block uppercase">Server / Host</span>
                    <span className="font-bold text-brand-navy">{host}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(host, "host")}
                    className="p-1 text-neutral-500 hover:text-brand-accent"
                    title="Copy Host"
                  >
                    {copiedField === "host" ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {/* Port */}
                <div className="bg-brand-off-white/60 p-3 border-2 border-brand-navy flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-neutral-500 font-bold block uppercase">Port</span>
                    <span className="font-bold text-brand-navy">{port}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(String(port), "port")}
                    className="p-1 text-neutral-500 hover:text-brand-accent"
                    title="Copy Port"
                  >
                    {copiedField === "port" ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {/* Mount */}
                <div className="bg-brand-off-white/60 p-3 border-2 border-brand-navy flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-neutral-500 font-bold block uppercase">Mountpoint</span>
                    <span className="font-bold text-brand-navy">{mount}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(mount, "mount")}
                    className="p-1 text-neutral-500 hover:text-brand-accent"
                    title="Copy Mountpoint"
                  >
                    {copiedField === "mount" ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {/* Username */}
                <div className="bg-brand-off-white/60 p-3 border-2 border-brand-navy flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-neutral-500 font-bold block uppercase">Username</span>
                    <span className="font-bold text-brand-navy">{username}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(username, "user")}
                    className="p-1 text-neutral-500 hover:text-brand-accent"
                    title="Copy Username"
                  >
                    {copiedField === "user" ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Stream Key Preview row */}
              <div className="p-3 bg-brand-off-white/80 border-2 border-brand-navy flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-neutral-500 font-black uppercase block">Active Stream Key</span>
                  <div className="font-mono text-xs font-bold text-brand-navy flex items-center gap-2">
                    <span className="bg-white px-2 py-0.5 border border-brand-navy/30">
                      {connStatus?.key_prefix || "gl_live_••••••••••••"}
                    </span>
                    <span className="text-[11px] text-neutral-500 font-normal">
                      (Secret key stored as secure SHA-256 hash)
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-neutral-600 font-mono">
                  Audio format: <strong className="text-brand-navy">MP3 320kbps Stereo (44.1 kHz)</strong>
                </div>
              </div>
            </div>

            {/* Software Setup Guides */}
            <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
              <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3">
                <h3 className="font-display text-lg uppercase tracking-wide text-brand-navy flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-brand-accent" /> Software Setup Guides
                </h3>
                <span className="font-mono text-[11px] text-neutral-500 hidden sm:inline">
                  Step-by-step encoder configuration
                </span>
              </div>

              {/* Software tabs */}
              <div className="flex border-2 border-brand-navy overflow-hidden bg-brand-off-white">
                <button
                  onClick={() => setActiveGuide("butt")}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase transition-colors ${
                    activeGuide === "butt" ? "bg-brand-navy text-white" : "hover:bg-brand-accent"
                  }`}
                >
                  BUTT (Broadcast Using This Tool)
                </button>
                <button
                  onClick={() => setActiveGuide("vDJ")}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase transition-colors ${
                    activeGuide === "vDJ" ? "bg-brand-navy text-white" : "hover:bg-brand-accent"
                  }`}
                >
                  VirtualDJ
                </button>
                <button
                  onClick={() => setActiveGuide("mixxx")}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase transition-colors ${
                    activeGuide === "mixxx" ? "bg-brand-navy text-white" : "hover:bg-brand-accent"
                  }`}
                >
                  Mixxx
                </button>
                <button
                  onClick={() => setActiveGuide("obs")}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase transition-colors ${
                    activeGuide === "obs" ? "bg-brand-navy text-white" : "hover:bg-brand-accent"
                  }`}
                >
                  OBS Studio
                </button>
              </div>

              {/* Guide Contents */}
              <div className="p-4 bg-brand-off-white/40 border-2 border-brand-navy text-xs space-y-3 font-mono">
                {activeGuide === "butt" && (
                  <div className="space-y-2">
                    <p className="font-bold text-brand-navy uppercase">Configuring BUTT (Recommended standalone audio streamer):</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-neutral-700">
                      <li>Open BUTT and click <strong>Settings</strong> &gt; <strong>Main</strong> tab.</li>
                      <li>Under Server, click <strong>Add</strong> and select <strong>Type: Icecast</strong>.</li>
                      <li>Set <strong>Address:</strong> <code className="bg-white px-1 border">{host}</code>, <strong>Port:</strong> <code className="bg-white px-1 border">{port}</code>.</li>
                      <li>Set <strong>Icecast Mount:</strong> <code className="bg-white px-1 border">{mount}</code> and <strong>Icecast User:</strong> <code className="bg-white px-1 border">{username}</code>.</li>
                      <li>In <strong>Password</strong>, paste your secret stream key (<code className="bg-white px-1 border">gl_live_...</code>).</li>
                      <li>In the <strong>Audio</strong> tab, set Codec to <strong>MP3</strong> and Bitrate to <strong>320k</strong> (or 256k on mobile data).</li>
                      <li>Click the Play button on the main BUTT window when your slot opens!</li>
                    </ol>
                  </div>
                )}

                {activeGuide === "vDJ" && (
                  <div className="space-y-2">
                    <p className="font-bold text-brand-navy uppercase">Configuring VirtualDJ:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-neutral-700">
                      <li>Go to <strong>Settings</strong> &gt; <strong>Broadcast</strong> tab.</li>
                      <li>Choose <strong>Broadcast to a radio server</strong>.</li>
                      <li>Select Protocol: <strong>Icecast2</strong>.</li>
                      <li>Set Server: <code className="bg-white px-1 border">{host}:{port}</code>.</li>
                      <li>Set Mount: <code className="bg-white px-1 border">{mount}</code>.</li>
                      <li>Set Login: <code className="bg-white px-1 border">{username}</code> and Password: your stream key.</li>
                      <li>Click <strong>Start Broadcast</strong> when your warmup window commences.</li>
                    </ol>
                  </div>
                )}

                {activeGuide === "mixxx" && (
                  <div className="space-y-2">
                    <p className="font-bold text-brand-navy uppercase">Configuring Mixxx:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-neutral-700">
                      <li>Open <strong>Preferences</strong> &gt; <strong>Live Broadcasting</strong>.</li>
                      <li>Select Server Type: <strong>Icecast 2</strong>.</li>
                      <li>Host: <code className="bg-white px-1 border">{host}</code>, Port: <code className="bg-white px-1 border">{port}</code>, Mount: <code className="bg-white px-1 border">{mount}</code>.</li>
                      <li>Login: <code className="bg-white px-1 border">{username}</code> and Password: your stream key.</li>
                      <li>Encoding: <strong>MP3</strong> at <strong>320 kbps</strong>, Stereo.</li>
                      <li>Press <strong>Ctrl + L</strong> (or Cmd + L) to connect!</li>
                    </ol>
                  </div>
                )}

                {activeGuide === "obs" && (
                  <div className="space-y-2">
                    <p className="font-bold text-brand-navy uppercase">Configuring OBS Studio (Audio stream):</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-neutral-700">
                      <li>Go to <strong>Settings</strong> &gt; <strong>Stream</strong>.</li>
                      <li>Service: <strong>Custom...</strong></li>
                      <li>Server: <code className="bg-white px-1 border">icecast://{host}:{port}{mount}</code>.</li>
                      <li>Stream Key: paste your <code className="bg-white px-1 border">{username}:gl_live_...</code> pair.</li>
                      <li>Under Output &gt; Audio, set Track 1 Bitrate to 320 kbps.</li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: MY AIR SLOTS                                                       */}
        {/* ========================================================================= */}
        {activeTab === "slots" && (
          <div className="space-y-6">
            <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-brand-navy pb-3">
                <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-brand-accent" /> Upcoming Assigned Broadcasts
                </h2>
                <Link
                  href="/radio/schedule"
                  className="text-xs font-bold uppercase underline hover:text-brand-accent font-mono"
                >
                  Full Station Timetable →
                </Link>
              </div>

              {upcomingSlots.length === 0 ? (
                <div className="py-12 text-center text-neutral-500 font-mono text-xs">
                  You have no upcoming live slots scheduled in the next 30 days. Contact your station manager to assign your show.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {upcomingSlots.map((slot) => {
                    const d = new Date(slot.starts_at);
                    const end = new Date(slot.ends_at);
                    const isCover = slot.substitute_dj_name && slot.substitute_dj_name === profile?.dj_name;

                    return (
                      <div
                        key={slot.id}
                        className="border-2 border-brand-navy p-4 bg-brand-off-white/40 shadow-xs space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="bg-brand-accent text-brand-navy text-[10px] font-black uppercase px-2 py-0.5 border border-brand-navy">
                            {slot.show_genre || "Live Show"}
                          </span>
                          {isCover ? (
                            <span className="bg-amber-300 text-amber-900 text-[10px] font-bold uppercase px-1.5 py-0.5 border border-amber-600">
                              Cover Host
                            </span>
                          ) : slot.cover_requested ? (
                            <span className="bg-yellow-200 text-yellow-900 text-[10px] font-bold uppercase px-1.5 py-0.5 border border-yellow-500">
                              Cover Requested
                            </span>
                          ) : null}
                        </div>

                        <div>
                          <h3 className="font-display font-black text-xl uppercase text-brand-navy truncate">
                            {slot.show_title}
                          </h3>
                          <div className="text-xs text-neutral-700 flex items-center gap-2 pt-1 font-mono">
                            <Clock className="w-4 h-4 text-brand-accent shrink-0" />
                            <span>
                              {d.toLocaleDateString([], {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                timeZone: "Africa/Nairobi",
                              })}{" "}
                              ·{" "}
                              {d.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "Africa/Nairobi",
                              })}{" "}
                              –{" "}
                              {end.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "Africa/Nairobi",
                              })}{" "}
                              EAT
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="pt-2 border-t border-brand-navy/15 flex items-center justify-between">
                          {slot.cover_requested ? (
                            <span className="text-[10px] text-amber-800 font-bold">
                              Substitute request pending admin assignment
                            </span>
                          ) : (
                            <button
                              onClick={() => setCoverSlot(slot)}
                              className="px-2.5 py-1 text-[11px] font-bold uppercase bg-white hover:bg-brand-accent text-brand-navy border border-brand-navy transition-colors cursor-pointer"
                            >
                              Request Cover DJ
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Past broadcast sets */}
            {pastSlots.length > 0 && (
              <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-3">
                <h3 className="font-display text-lg uppercase tracking-wide text-brand-navy border-b-2 border-brand-navy pb-2">
                  Past Completed Airings
                </h3>
                <div className="space-y-2">
                  {pastSlots.slice(0, 5).map((ps) => (
                    <div
                      key={ps.id}
                      className="p-2.5 bg-neutral-50 border border-neutral-300 flex items-center justify-between text-xs font-mono"
                    >
                      <span className="font-bold text-brand-navy truncate">{ps.show_title}</span>
                      <span className="text-neutral-500 text-[11px] shrink-0">
                        {new Date(ps.starts_at).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: MY RECORDINGS & ARCHIVES                                           */}
        {/* ========================================================================= */}
        {activeTab === "recordings" && (
          <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-brand-navy pb-3">
              <div>
                <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy flex items-center gap-2">
                  <Music className="w-5 h-5 text-brand-accent" /> Master Live Set Recordings
                </h2>
                <p className="text-[11px] text-neutral-600 font-mono mt-0.5">
                  Raw 320kbps master recordings captured during your live broadcasts. Recordings are private by default.
                </p>
              </div>
            </div>

            {recordings.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 font-mono text-xs">
                No archived sets found for your account yet. When you conclude a live broadcast, Liquidsoap captures and masters your set here automatically.
              </div>
            ) : (
              <div className="space-y-3">
                {recordings.map((rec) => {
                  const minutes = Math.floor(rec.duration / 60);
                  const seconds = rec.duration % 60;
                  const durationStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

                  return (
                    <div
                      key={rec.id}
                      className="p-4 border-2 border-brand-navy bg-brand-off-white/40 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-[9px] font-black uppercase border ${
                            rec.is_public
                              ? "bg-emerald-100 text-emerald-900 border-emerald-500"
                              : "bg-neutral-200 text-neutral-800 border-neutral-400"
                          }`}>
                            {rec.is_public ? "Public Vault Release" : "Private Archive"}
                          </span>
                          <span className="text-[11px] text-neutral-500">
                            {new Date(rec.recorded_at).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}
                          </span>
                        </div>

                        <h4 className="font-display font-black text-lg text-brand-navy uppercase truncate">
                          {rec.title}
                        </h4>

                        <div className="text-[11px] text-neutral-600 flex items-center gap-3">
                          <span>⏱️ {durationStr}</span>
                          <span>🔊 {rec.bitrate} kbps</span>
                          <span>📁 {(rec.file_size / (1024 * 1024)).toFixed(1)} MB</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {rec.audio_url && (
                          <a
                            href={rec.audio_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 border border-brand-navy bg-white hover:bg-neutral-100 font-bold uppercase text-[11px] flex items-center gap-1"
                          >
                            <Headphones className="w-3.5 h-3.5" /> Preview
                          </a>
                        )}

                        <button
                          onClick={() => handleToggleRecordingPublic(rec.id)}
                          className={`px-3 py-1.5 border-2 border-brand-navy font-bold uppercase text-[11px] cursor-pointer shadow-xs transition-colors ${
                            rec.is_public
                              ? "bg-red-50 hover:bg-red-100 text-red-800"
                              : "bg-brand-accent hover:bg-brand-navy hover:text-white text-brand-navy"
                          }`}
                        >
                          {rec.is_public ? "Make Private" : "Approve for Public Vault"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: PROFILE EDITOR                                                     */}
        {/* ========================================================================= */}
        {activeTab === "profile" && (
          <div className="border-3 border-brand-navy bg-white p-6 shadow-[4px_4px_0px_#142B4C] max-w-2xl">
            <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy border-b-2 border-brand-navy pb-3 mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-brand-accent" /> Presenter Profile Details
            </h2>

            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs font-mono">
              {saveStatus && (
                <div
                  className={`p-3 border-2 text-xs font-bold ${
                    saveStatus.startsWith("Error")
                      ? "bg-red-100 border-red-600 text-red-800"
                      : "bg-emerald-100 border-emerald-600 text-emerald-800"
                  }`}
                >
                  {saveStatus}
                </div>
              )}

              <div>
                <label className="block font-bold uppercase text-brand-navy mb-1">
                  DJ / Moniker Name
                </label>
                <input
                  type="text"
                  required
                  value={djName}
                  onChange={(e) => setDjName(e.target.value)}
                  className="w-full p-2.5 border-2 border-brand-navy bg-brand-off-white/40 focus:outline-none focus:bg-white text-brand-navy font-bold"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-brand-navy mb-1">
                  Biography (Shown on station site)
                </label>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full p-2.5 border-2 border-brand-navy bg-brand-off-white/40 focus:outline-none focus:bg-white text-brand-navy"
                  placeholder="Tell listeners about your music style, genres, and sets..."
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-brand-navy mb-1">
                  Avatar / Profile Photo URL
                </label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full p-2.5 border-2 border-brand-navy bg-brand-off-white/40 focus:outline-none focus:bg-white text-brand-navy"
                  placeholder="https://..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold uppercase text-brand-navy mb-1">
                    Instagram Handle
                  </label>
                  <input
                    type="text"
                    value={instaUrl}
                    onChange={(e) => setInstaUrl(e.target.value)}
                    className="w-full p-2.5 border-2 border-brand-navy bg-brand-off-white/40 focus:outline-none focus:bg-white text-brand-navy"
                    placeholder="@djkmr"
                  />
                </div>

                <div>
                  <label className="block font-bold uppercase text-brand-navy mb-1">
                    Twitter / X Handle
                  </label>
                  <input
                    type="text"
                    value={twitterUrl}
                    onChange={(e) => setTwitterUrl(e.target.value)}
                    className="w-full p-2.5 border-2 border-brand-navy bg-brand-off-white/40 focus:outline-none focus:bg-white text-brand-navy"
                    placeholder="@djkmr"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-brand-navy hover:bg-brand-accent text-white hover:text-brand-navy font-bold uppercase border-2 border-brand-navy shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" /> Save Profile Details
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: NEW STREAM KEY DISPLAY (SHOW ONCE)                              */}
      {/* ========================================================================= */}
      {newlyGeneratedKey && (
        <div className="fixed inset-0 bg-brand-navy/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-brand-navy p-6 max-w-lg w-full shadow-[8px_8px_0px_#142B4C] space-y-4 font-mono text-xs">
            <div className="flex items-center gap-2 text-brand-navy border-b-2 border-brand-navy pb-3">
              <Key className="w-6 h-6 text-brand-accent" />
              <h2 className="font-display text-xl uppercase tracking-wide">
                NEW STREAM KEY GENERATED
              </h2>
            </div>

            <div className="p-3 bg-amber-50 border-2 border-amber-500 text-amber-900 font-bold space-y-1">
              <p>⚠️ IMPORTANT: COPY THIS KEY RIGHT NOW!</p>
              <p className="font-normal text-[11px]">
                For security, this key is only displayed once and is never stored in plaintext on our servers. If you lose it, you will need to regenerate a new one.
              </p>
            </div>

            <div className="p-3 bg-neutral-900 text-emerald-400 font-mono text-sm break-all border-2 border-brand-navy">
              {newlyGeneratedKey}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText(newlyGeneratedKey);
                    setKeyCopied(true);
                    setTimeout(() => setKeyCopied(false), 2000);
                  }
                }}
                className="flex-1 py-2.5 bg-brand-accent text-brand-navy font-bold uppercase border-2 border-brand-navy flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {keyCopied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                <span>{keyCopied ? "COPIED TO CLIPBOARD!" : "COPY STREAM KEY"}</span>
              </button>

              <button
                onClick={() => setNewlyGeneratedKey(null)}
                className="px-4 py-2.5 bg-brand-navy text-white font-bold uppercase border-2 border-brand-navy cursor-pointer hover:bg-neutral-800"
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: REQUEST COVER MODAL                                              */}
      {/* ========================================================================= */}
      {coverSlot && (
        <div className="fixed inset-0 bg-brand-navy/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-brand-navy p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3">
              <h3 className="font-display text-lg uppercase tracking-wide text-brand-navy">
                Request Substitute DJ
              </h3>
              <button
                onClick={() => setCoverSlot(null)}
                className="font-bold text-neutral-500 hover:text-brand-navy"
              >
                ✕
              </button>
            </div>

            <p className="text-neutral-700">
              Request a cover presenter for <strong>{coverSlot.show_title}</strong> on{" "}
              {new Date(coverSlot.starts_at).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}.
            </p>

            {coverError && (
              <div className="p-2 bg-red-100 text-red-800 border border-red-500">
                {coverError}
              </div>
            )}
            {coverSuccess && (
              <div className="p-2 bg-emerald-100 text-emerald-800 border border-emerald-500 font-bold">
                Cover request submitted!
              </div>
            )}

            <form onSubmit={handleRequestCoverSubmit} className="space-y-3">
              <div>
                <label className="block font-bold uppercase text-brand-navy mb-1">
                  Reason for Cover Request *
                </label>
                <textarea
                  required
                  rows={3}
                  value={coverReason}
                  onChange={(e) => setCoverReason(e.target.value)}
                  placeholder="e.g. Gig clash, travel out of town, or medical emergency..."
                  className="w-full p-2 border-2 border-brand-navy bg-brand-off-white/40 focus:outline-none focus:bg-white text-brand-navy"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={coverSubmitting}
                  className="flex-1 py-2 bg-brand-navy text-white hover:bg-brand-accent hover:text-brand-navy font-bold uppercase border-2 border-brand-navy cursor-pointer transition-colors shadow-xs"
                >
                  {coverSubmitting ? "Submitting..." : "Submit Cover Request"}
                </button>
                <button
                  type="button"
                  onClick={() => setCoverSlot(null)}
                  className="px-4 py-2 border-2 border-brand-navy text-neutral-600 hover:bg-neutral-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: MANDATORY PASSWORD CHANGE MODAL                                  */}
      {/* ========================================================================= */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-brand-navy/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-brand-navy p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4 font-mono text-xs">
            <div className="flex items-center gap-2 text-brand-navy border-b-2 border-brand-navy pb-3">
              <Shield className="w-5 h-5 text-brand-accent" />
              <h2 className="font-display text-xl uppercase tracking-wide">
                Set Permanent Password
              </h2>
            </div>

            <p className="text-neutral-600">
              You are signed in with a temporary password. Please set a secure permanent password to continue.
            </p>

            {pwdError && (
              <div className="p-2.5 bg-red-100 border border-red-400 text-red-800">
                {pwdError}
              </div>
            )}
            {pwdSuccess && (
              <div className="p-2.5 bg-emerald-100 border border-emerald-500 text-emerald-800 font-bold">
                Password updated successfully! Redirecting...
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block font-bold uppercase text-brand-navy mb-1">
                  Current (Temporary) Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full p-2 border-2 border-brand-navy bg-brand-off-white/40 focus:outline-none focus:bg-white text-brand-navy"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-brand-navy mb-1">
                  New Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-2 border-2 border-brand-navy bg-brand-off-white/40 focus:outline-none focus:bg-white text-brand-navy"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-brand-navy mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-2 border-2 border-brand-navy bg-brand-off-white/40 focus:outline-none focus:bg-white text-brand-navy"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-brand-navy hover:bg-brand-accent text-white hover:text-brand-navy font-bold uppercase border-2 border-brand-navy transition-colors shadow-xs"
                >
                  Save New Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

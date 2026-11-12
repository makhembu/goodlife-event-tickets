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
}

export default function PresenterDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<PresenterProfile | null>(null);
  const [upcomingSlots, setUpcomingSlots] = useState<SlotItem[]>([]);
  const [pastSlots, setPastSlots] = useState<SlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"slots" | "profile">("slots");

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

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [meRes, slotsRes] = await Promise.all([
          fetch("/api/presenter/me"),
          fetch("/api/presenter/slots"),
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
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/presenter/auth/logout", { method: "POST" });
    router.push("/presenter/login");
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
                PRESENTER PORTAL
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
        <div className="flex border-b-2 border-brand-navy gap-2">
          <button
            onClick={() => setActiveTab("slots")}
            className={`px-5 py-2.5 font-display text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer transition-all ${
              activeTab === "slots"
                ? "bg-white text-brand-navy font-black shadow-xs"
                : "bg-neutral-200 text-neutral-600 hover:bg-white"
            }`}
          >
            My Air Slots ({upcomingSlots.length})
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-5 py-2.5 font-display text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer transition-all ${
              activeTab === "profile"
                ? "bg-white text-brand-navy font-black shadow-xs"
                : "bg-neutral-200 text-neutral-600 hover:bg-white"
            }`}
          >
            Edit Profile
          </button>
        </div>

        {/* Tab 1: Slots */}
        {activeTab === "slots" && (
          <div className="space-y-6">
            <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C]">
              <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3 mb-4">
                <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-brand-accent" /> Upcoming Assigned Broadcasts
                </h2>
                <Link
                  href="/radio/schedule"
                  className="text-xs font-bold uppercase underline hover:text-brand-accent"
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
                        className="border-2 border-brand-navy p-4 bg-brand-off-white/40 shadow-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="bg-brand-accent text-brand-navy text-[10px] font-black uppercase px-2 py-0.5 border border-brand-navy">
                            {slot.show_genre || "Live Show"}
                          </span>
                          {isCover && (
                            <span className="bg-amber-300 text-amber-900 text-[10px] font-bold uppercase px-1.5 py-0.5 border border-amber-600">
                              Cover Host
                            </span>
                          )}
                        </div>

                        <h3 className="font-display font-black text-xl uppercase text-brand-navy truncate">
                          {slot.show_title}
                        </h3>

                        <div className="text-xs text-neutral-700 flex items-center gap-2 pt-1">
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
                    );
                  })}
                </div>
              )}
            </div>

            {/* Note on Phase 2 Streaming Credentials */}
            <div className="border-2 border-dashed border-brand-navy/40 p-4 bg-neutral-100 rounded text-xs text-neutral-600 flex items-start gap-3">
              <Shield className="w-5 h-5 text-brand-navy shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-brand-navy uppercase mb-0.5">
                  Stream Encoder Details (Coming in Phase 2)
                </p>
                <p>
                  Personal Icecast encoder keys, VirtualDJ/Mixxx connection guides, and live handover testing tools will unlock in Phase 2.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Profile Editor */}
        {activeTab === "profile" && (
          <div className="border-3 border-brand-navy bg-white p-6 shadow-[4px_4px_0px_#142B4C] max-w-2xl">
            <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy border-b-2 border-brand-navy pb-3 mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-brand-accent" /> Presenter Profile Details
            </h2>

            {saveStatus && (
              <div className="mb-4 p-3 bg-brand-accent/20 border-2 border-brand-navy text-xs font-bold text-brand-navy">
                {saveStatus}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-brand-navy mb-1">
                  On-Air DJ / Presenter Name
                </label>
                <input
                  type="text"
                  required
                  value={djName}
                  onChange={(e) => setDjName(e.target.value)}
                  className="w-full border-2 border-brand-navy px-3 py-2 text-sm focus:outline-hidden focus:bg-brand-accent/10"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-brand-navy mb-1">
                  Biography (Displayed on Show & Profile Pages)
                </label>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share your musical background, resident genres, and festival experience..."
                  className="w-full border-2 border-brand-navy p-3 text-sm focus:outline-hidden focus:bg-brand-accent/10"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-brand-navy mb-1">
                  Avatar / Profile Photo URL
                </label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border-2 border-brand-navy px-3 py-2 text-sm focus:outline-hidden focus:bg-brand-accent/10"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-brand-navy mb-1">
                    Instagram URL
                  </label>
                  <input
                    type="url"
                    value={instaUrl}
                    onChange={(e) => setInstaUrl(e.target.value)}
                    placeholder="https://instagram.com/..."
                    className="w-full border-2 border-brand-navy px-3 py-2 text-sm focus:outline-hidden focus:bg-brand-accent/10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-brand-navy mb-1">
                    X / Twitter URL
                  </label>
                  <input
                    type="url"
                    value={twitterUrl}
                    onChange={(e) => setTwitterUrl(e.target.value)}
                    placeholder="https://x.com/..."
                    className="w-full border-2 border-brand-navy px-3 py-2 text-sm focus:outline-hidden focus:bg-brand-accent/10"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="submit"
                  className="py-2.5 px-6 bg-brand-navy text-brand-off-white hover:bg-brand-accent hover:text-brand-navy font-display text-base uppercase border-2 border-brand-navy shadow-sm transition-all cursor-pointer flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Save Profile Changes
                </button>

                <button
                  type="button"
                  onClick={() => setShowPasswordModal(true)}
                  className="text-xs font-bold uppercase underline text-neutral-600 hover:text-brand-navy"
                >
                  Change Password
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Mandatory / Optional Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="border-4 border-brand-navy bg-white shadow-[8px_8px_0px_#142B4C] p-6 sm:p-8 max-w-md w-full font-mono">
            <h3 className="font-display text-2xl font-black uppercase text-brand-navy mb-1">
              {profile?.must_change_password ? "Password Setup Required" : "Change Password"}
            </h3>
            <p className="text-xs text-neutral-600 mb-4">
              {profile?.must_change_password
                ? "Your account was created with a temporary password. You must set a permanent password to continue."
                : "Enter your current password and choose a new password (min 8 chars)."}
            </p>

            {pwdError && (
              <div className="mb-4 p-2.5 bg-red-100 border border-red-700 text-red-900 text-xs font-bold">
                {pwdError}
              </div>
            )}
            {pwdSuccess && (
              <div className="mb-4 p-2.5 bg-green-100 border border-green-700 text-green-900 text-xs font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Password updated successfully!
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-brand-navy mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full border-2 border-brand-navy px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-brand-navy mb-1">
                  New Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border-2 border-brand-navy px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-brand-navy mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border-2 border-brand-navy px-3 py-2 text-sm"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                {!profile?.must_change_password && (
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 text-xs font-bold uppercase text-neutral-600 hover:text-brand-navy"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className="px-6 py-2 bg-brand-navy text-white hover:bg-brand-accent hover:text-brand-navy font-display text-base uppercase border-2 border-brand-navy transition-colors"
                >
                  Set New Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

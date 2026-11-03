"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Volume2,
  VolumeX,
  Mic,
  Play,
  Pause,
  Sparkles,
  Sliders,
  Radio,
  Activity,
  Square,
  X,
  Headphones,
  Edit3,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  FolderOpen,
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Upload,
} from "lucide-react";
import { SoundboardBankItem, SoundboardPadItem, DropVaultOption } from "@/lib/radio/soundboard-helpers";
import { useSoundboard } from "@/context/SoundboardContext";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";

export interface SoundPad {
  id: number;
  bank_id?: number;
  position?: number;
  name: string;
  emoji: string;
  soundType: "synth" | "audio";
  audioUrl?: string;
  category: "FX" | "VOICE" | "STATION" | "CUSTOM";
  color?: string;
  drop_id?: number | null;
}

export interface PerformanceSoundboardProps {
  onFireOnAir?: (padName: string, audioUrl?: string) => void;
  onSendToCue?: (pad: SoundPad) => void;
  onChoke?: () => void;
}

// 1. Static Initial Fallback Banks (Ensures soundboard NEVER renders blank)
const STATIC_DJ_PADS: SoundPad[] = [
  { id: 1, name: "DJ Fusion", emoji: "🔥", soundType: "audio", audioUrl: "/drops/samples/dj-fusion_context_drop.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 2, name: "DJ Sudi", emoji: "💿", soundType: "audio", audioUrl: "/drops/samples/dj-sudi_context_drop.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 3, name: "DJ Sney", emoji: "⚡", soundType: "audio", audioUrl: "/drops/samples/dj-sney_context_drop.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 4, name: "MC Cheche", emoji: "🎙️", soundType: "audio", audioUrl: "/drops/samples/mc-cheche_context_drop.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 5, name: "DJ Shax", emoji: "🔊", soundType: "audio", audioUrl: "/drops/samples/dj-shax_context_drop.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 6, name: "Amina", emoji: "🌅", soundType: "audio", audioUrl: "/drops/samples/amina_context_drop.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 7, name: "Bwana Mkubwa", emoji: "📻", soundType: "audio", audioUrl: "/drops/samples/bwana-mkubwa_context_drop.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 8, name: "Malkia Kenya", emoji: "✨", soundType: "audio", audioUrl: "/drops/samples/malkia-kenya_context_drop.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 9, name: "Wigman", emoji: "🎧", soundType: "audio", audioUrl: "/drops/samples/wigman_context_drop.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 10, name: "Zari", emoji: "🌊", soundType: "audio", audioUrl: "/drops/samples/zari_context_drop.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 11, name: "Gemini Aoede", emoji: "🌟", soundType: "audio", audioUrl: "/drops/sample_aoede.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 12, name: "Gemini Puck", emoji: "🚀", soundType: "audio", audioUrl: "/drops/sample_puck.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 13, name: "Gemini Charon", emoji: "🌌", soundType: "audio", audioUrl: "/drops/sample_charon.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 14, name: "Gemini Fenrir", emoji: "⚡", soundType: "audio", audioUrl: "/drops/sample_fenrir.mp3", category: "VOICE", color: "#DFBB7D" },
  { id: 15, name: "Gemini Kore", emoji: "🌸", soundType: "audio", audioUrl: "/drops/sample_kore.mp3", category: "VOICE", color: "#DFBB7D" },
];

const STATIC_FX_PADS: SoundPad[] = [
  { id: 16, name: "DJ Fusion (Marara)", emoji: "🔥", soundType: "audio", audioUrl: "/drops/samples/dj_fusion_marara_drop.mp3", category: "VOICE", color: "#F5C842" },
  { id: 17, name: "DJ Fusion (English)", emoji: "🎙️", soundType: "audio", audioUrl: "/drops/samples/dj_fusion_english_drop.mp3", category: "VOICE", color: "#F5C842" },
  { id: 18, name: "Nairobi Sunrise", emoji: "☀️", soundType: "audio", audioUrl: "/drops/samples/kenyan_vibes_5.mp3", category: "STATION", color: "#DFBB7D" },
  { id: 19, name: "Festival Heat", emoji: "✨", soundType: "audio", audioUrl: "/drops/samples/kenyan_vibes_2.mp3", category: "STATION", color: "#DFBB7D" },
  { id: 20, name: "Wazi 254 Hype", emoji: "🇰🇪", soundType: "audio", audioUrl: "/drops/wazi-254.mp3", category: "STATION", color: "#10B981" },
  { id: 21, name: "DIY Recorded Drop", emoji: "🎤", soundType: "audio", audioUrl: "/drops/samples/kenyan_vibes_6.mp3", category: "CUSTOM", color: "#10B981" },
];

const EMOJI_PRESETS = [
  "🔥", "💿", "⚡", "🎙️", "🔊", "🌅", "📻", "✨", "🎧", "🌊", "🚀", "🌌", "👑", "🎵", "🚨", "📢", "💥", "🎉"
];

const COLOR_PRESETS = [
  { label: "Gold", value: "#DFBB7D" },
  { label: "Amber", value: "#F59E0B" },
  { label: "Emerald", value: "#10B981" },
  { label: "Crimson", value: "#E84855" },
  { label: "Sky", value: "#0EA5E9" },
  { label: "Purple", value: "#A855F7" },
];

export default function PerformanceSoundboard({
  onFireOnAir,
  onSendToCue,
  onChoke,
}: PerformanceSoundboardProps) {
  // Operational state
  const [activePad, setActivePad] = useState<number | null>(null);
  const [playingPads, setPlayingPads] = useState<Map<number, HTMLAudioElement>>(new Map());
  const [padCountdowns, setPadCountdowns] = useState<Map<number, number>>(new Map());
  const [volume, setVolume] = useState<number>(0.85);
  const [muted, setMuted] = useState<boolean>(false);
  const [broadcastMode, setBroadcastMode] = useState<"local" | "on_air">("local");

  // Shared Soundboard State from Context
  const {
    banks,
    setBanks,
    activeBankId,
    setActiveBankId,
    vaultDrops,
    createBank,
    renameBank,
    deleteBank,
    reorderPads,
    movePadToBank,
    toastMsg,
    showToast,
  } = useSoundboard();

  // Drag and drop state for desktop pad reordering
  const [draggedPadId, setDraggedPadId] = useState<number | null>(null);
  const [dragOverPadId, setDragOverPadId] = useState<number | null>(null);

  // Edit Mode & Pad Editor Modal State
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPad, setEditingPad] = useState<SoundPad | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editEmoji, setEditEmoji] = useState("🔥");
  const [editColor, setEditColor] = useState("#DFBB7D");
  const [editAudioUrl, setEditAudioUrl] = useState<string | null>(null);
  const [editDropId, setEditDropId] = useState<number | null>(null);
  const [savingPad, setSavingPad] = useState(false);
  const [deletingPad, setDeletingPad] = useState(false);
  const [dropSearch, setDropSearch] = useState("");
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Clip assignment source tab: Vault | Upload | Record
  const [clipSourceTab, setClipSourceTab] = useState<"vault" | "upload" | "record">("vault");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploadingRecord, setIsUploadingRecord] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Audio Recorder Hook for live recording in Pad Editor
  const {
    isRecording,
    recordingDuration,
    audioBlob: recordedBlob,
    audioUrl: recordedLocalUrl,
    error: recorderError,
    startRecording,
    stopRecording,
    resetRecording,
  } = useAudioRecorder();

  const touchTimerRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const didLongPressRef = useRef<Map<number, boolean>>(new Map());

  // Helper: map DB Pad to SoundPad
  const mapDbPadToSoundPad = (p: SoundboardPadItem): SoundPad => ({
    id: p.id,
    bank_id: p.bank_id,
    position: p.position,
    name: p.label,
    emoji: p.emoji || "🔥",
    soundType: "audio",
    audioUrl: p.audio_url || undefined,
    category: p.audio_url?.includes("sample") ? "VOICE" : "CUSTOM",
    color: p.color || "#DFBB7D",
    drop_id: p.drop_id,
  });

  // Cleanup touch timers and preview audio on unmount
  useEffect(() => {
    const timers = touchTimerRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  // Static fallback is ONLY active if the API failed to load AND local cache is empty
  const isUsingStaticFallback = banks.length === 0;

  // Compute active pads for the selected bank (Deterministic: only plays DB audio_url)
  const activePads: SoundPad[] = useMemo(() => {
    if (isUsingStaticFallback) {
      // Banks failed to load from DB and cache: use static defaults in read-only mode
      return activeBankId === 2 ? STATIC_FX_PADS : STATIC_DJ_PADS;
    }

    const currentBank = banks.find((b) => b.id === activeBankId);
    if (!currentBank) return [];

    return (currentBank.pads || []).map(mapDbPadToSoundPad);
  }, [banks, activeBankId, isUsingStaticFallback]);

  // Touch Handlers for PFL Audition Long Press
  const handleTouchStart = (pad: SoundPad) => {
    if (isEditMode) return;
    didLongPressRef.current.set(pad.id, false);
    const timer = setTimeout(() => {
      didLongPressRef.current.set(pad.id, true);
      if (onSendToCue) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate(60);
          } catch {}
        }
        onSendToCue(pad);
      }
    }, 450);
    touchTimerRef.current.set(pad.id, timer);
  };

  const handleTouchEnd = (pad: SoundPad) => {
    const timer = touchTimerRef.current.get(pad.id);
    if (timer) {
      clearTimeout(timer);
      touchTimerRef.current.delete(pad.id);
    }
    // If long press was triggered, preserve flag briefly so synthetic click is swallowed, then reset
    if (didLongPressRef.current.get(pad.id)) {
      setTimeout(() => {
        didLongPressRef.current.set(pad.id, false);
      }, 400);
    }
  };

  // Emergency Choke All (Works in both Perform and Edit modes)
  const stopAllPads = () => {
    playingPads.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    setPlayingPads(new Map());
    setPadCountdowns(new Map());
    setActivePad(null);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewingUrl(null);
    }
    if (onChoke) onChoke();
  };

  // Open Pad Editor
  const openPadEditor = useCallback((pad: SoundPad) => {
    setEditingPad(pad);
    setEditLabel(pad.name === "New Pad" ? "" : pad.name);
    setEditEmoji(pad.emoji || "🔥");
    setEditColor(pad.color || "#DFBB7D");
    setEditAudioUrl(pad.audioUrl || null);
    setEditDropId(pad.drop_id || null);
    setClipSourceTab("vault");
    setUploadError(null);
    resetRecording();
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewingUrl(null);
    }
  }, [resetRecording]);

  // Trigger Pad in Perform Mode
  const triggerPad = (pad: SoundPad) => {
    // If this click is the tail end of a long-press audition, absorb it and do not fire
    if (didLongPressRef.current.get(pad.id)) {
      didLongPressRef.current.set(pad.id, false);
      return;
    }

    // If in Edit Mode, clicking pad opens the editor instead of playing!
    if (isEditMode) {
      openPadEditor(pad);
      return;
    }

    // Inert if no audio is assigned
    if (!pad.audioUrl) {
      showToast(`Pad "${pad.name}" has no audio clip assigned. Tap Edit to assign one.`, "error");
      return;
    }

    // If already playing, choke this specific pad
    if (playingPads.has(pad.id)) {
      const existing = playingPads.get(pad.id);
      existing?.pause();
      setPlayingPads((prev) => {
        const next = new Map(prev);
        next.delete(pad.id);
        return next;
      });
      setPadCountdowns((prev) => {
        const next = new Map(prev);
        next.delete(pad.id);
        return next;
      });
      return;
    }

    setActivePad(pad.id);

    if (broadcastMode === "on_air" && onFireOnAir) {
      onFireOnAir(pad.name, pad.audioUrl);
    }

    try {
      const audio = new Audio(pad.audioUrl);
      audio.volume = muted ? 0 : volume;

      audio.onloadedmetadata = () => {
        const dur = audio.duration || 4;
        setPadCountdowns((prev) => new Map(prev).set(pad.id, dur));
      };

      audio.ontimeupdate = () => {
        const rem = Math.max(0, (audio.duration || 0) - audio.currentTime);
        setPadCountdowns((prev) => new Map(prev).set(pad.id, rem));
      };

      audio.onended = () => {
        setPlayingPads((prev) => {
          const next = new Map(prev);
          next.delete(pad.id);
          return next;
        });
        setPadCountdowns((prev) => {
          const next = new Map(prev);
          next.delete(pad.id);
          return next;
        });
        setActivePad(null);
      };

      audio.play().then(() => {
        setPlayingPads((prev) => new Map(prev).set(pad.id, audio));
      }).catch((err) => {
        console.warn("Audio playback fallback:", err);
      });
    } catch (err) {
      console.warn("Audio playback error:", err);
    }
  };

  // Keyboard shortcut listener (1-9, 0 for pad 10)
  // Disabled in Edit Mode or when Editor is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape ALWAYS triggers CHOKE ALL globally
      if (e.key === "Escape") {
        stopAllPads();
        return;
      }

      // Check if user is typing in an input, textarea, select, or contenteditable element
      const target = e.target as HTMLElement | null;
      const isInput = target && (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      );
      if (isInput) return;

      // Space chokes ONLY when not typing in an input/editable field
      if (e.key === " ") {
        e.preventDefault();
        stopAllPads();
        return;
      }

      // If in Edit Mode or Editor is open, suppress 1-0 hotkeys so user can configure
      if (isEditMode || editingPad !== null) return;

      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        const pad = activePads[idx];
        if (pad) triggerPad(pad);
      } else if (e.key === "0") {
        const pad = activePads[9];
        if (pad) triggerPad(pad);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePads, volume, muted, broadcastMode, playingPads, isEditMode, editingPad]);

  // Handle direct audio file upload via Presigned R2 URL
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploadError(null);

    // Validate MIME and extension
    const isAudioType = file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i.test(file.name);
    if (!isAudioType) {
      setUploadError("Invalid file type. Please upload an audio file (MP3, WAV, AAC, etc.).");
      return;
    }

    // Max 10MB
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError("Audio file exceeds maximum allowed size of 10MB.");
      return;
    }

    setIsUploadingFile(true);
    setUploadProgress(5);

    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const presignRes = await fetch("/api/admin/radio/multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "presigned",
          filename: `soundboard_${Date.now()}_${cleanName}`,
          contentType: file.type || "audio/mpeg",
          isHighQuality: true,
        }),
      });

      if (!presignRes.ok) {
        const errJson = await presignRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate presigned upload URL.");
      }

      const { uploadUrl, publicUrl } = await presignRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 90);
            setUploadProgress(Math.max(5, pct));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage provider rejected upload (HTTP ${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during audio upload"));
        xhr.send(file);
      });

      setUploadProgress(100);
      setEditAudioUrl(publicUrl);
      setEditDropId(null);
      if (!editLabel || editLabel === "New Pad") {
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
        setEditLabel(baseName.slice(0, 50));
      }
      showToast("Audio file uploaded and attached to pad!", "success");
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload audio file.");
    } finally {
      setIsUploadingFile(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Upload recorded mic audio to R2
  const handleUploadRecordedAudio = async () => {
    if (!recordedBlob || recordedBlob.size === 0) return;
    setIsUploadingRecord(true);
    setUploadError(null);

    try {
      const presignRes = await fetch("/api/admin/radio/multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "presigned",
          filename: `soundboard_mic_${Date.now()}.webm`,
          contentType: recordedBlob.type || "audio/webm",
          isHighQuality: true,
        }),
      });

      if (!presignRes.ok) {
        const errJson = await presignRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate presigned URL for recording.");
      }

      const { uploadUrl, publicUrl } = await presignRes.json();

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": recordedBlob.type || "audio/webm" },
        body: recordedBlob,
      });

      if (!putRes.ok) {
        throw new Error(`Failed to upload recording (HTTP ${putRes.status})`);
      }

      setEditAudioUrl(publicUrl);
      setEditDropId(null);
      if (!editLabel || editLabel === "New Pad") {
        setEditLabel("Live Mic Drop");
      }
      resetRecording();
      showToast("Live mic recording uploaded and attached to pad!", "success");
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload mic recording.");
    } finally {
      setIsUploadingRecord(false);
    }
  };

  // Private Cue Headphone Audition (Local only, never on-air, never ducking)
  const togglePreviewAudio = (url: string) => {
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(url);
      previewAudioRef.current.onended = () => setPreviewingUrl(null);
    }

    if (previewingUrl === url) {
      previewAudioRef.current.pause();
      setPreviewingUrl(null);
    } else {
      previewAudioRef.current.src = url;
      previewAudioRef.current.play().then(() => setPreviewingUrl(url)).catch(() => {});
    }
  };

  // Step reordering inside pad editor (Move Earlier / Later)
  const handleMoveStep = async (direction: "earlier" | "later") => {
    if (!editingPad || editingPad.id < 0) return;
    const currentIds = activePads.map((p) => p.id);
    const curIdx = currentIds.indexOf(editingPad.id);
    if (curIdx === -1) return;
    const targetIdx = direction === "earlier" ? curIdx - 1 : curIdx + 1;
    if (targetIdx < 0 || targetIdx >= currentIds.length) return;

    const reordered = [...currentIds];
    const [removed] = reordered.splice(curIdx, 1);
    reordered.splice(targetIdx, 0, removed);
    await reorderPads(activeBankId, reordered);
  };

  // Move pad across banks
  const handleMovePadBank = async (newBankId: number) => {
    if (!editingPad || newBankId === activeBankId) return;
    if (editingPad.id < 0) {
      setEditingPad((prev) => (prev ? { ...prev, bank_id: newBankId } : null));
      setActiveBankId(newBankId);
      return;
    }
    const success = await movePadToBank(editingPad.id, newBankId);
    if (success) {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      setPreviewingUrl(null);
      setEditingPad(null);
    }
  };

  // Add a New Pad (Draft pad in memory until Save is pressed)
  const handleAddNewPad = () => {
    const currentBank = banks.find((b) => b.id === activeBankId);
    const nextPos = (currentBank?.pads?.length || 0) + 1;
    const draftPad: SoundPad = {
      id: -Date.now(),
      bank_id: activeBankId,
      position: nextPos,
      name: "New Pad",
      emoji: "🔥",
      color: "#DFBB7D",
      soundType: "audio",
      category: "CUSTOM",
    };
    openPadEditor(draftPad);
  };

  // Save Pad Changes to Database (Handles both Draft creation and Existing Pad update)
  const handleSavePad = async () => {
    if (!editingPad) return;
    setSavingPad(true);

    const isDraft = editingPad.id < 0;
    const payload = {
      bank_id: activeBankId,
      label: editLabel.trim() || "Untitled Pad",
      emoji: editEmoji,
      color: editColor,
      audio_url: editAudioUrl,
      drop_id: editDropId,
    };

    if (isDraft) {
      // POST new pad to database
      try {
        const res = await fetch("/api/admin/radio/soundboard/pads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create pad");
        }

        const resData = await res.json();
        if (resData.pad) {
          const updatedBanks = banks.map((b) =>
            b.id === activeBankId ? { ...b, pads: [...b.pads, resData.pad] } : b
          );
          setBanks(updatedBanks);
          try {
            localStorage.setItem("goodlife_soundboard_cache", JSON.stringify(updatedBanks));
          } catch {}
          showToast(`Pad "${payload.label}" created!`, "success");
        }
        if (previewAudioRef.current) {
          previewAudioRef.current.pause();
          setPreviewingUrl(null);
        }
        setEditingPad(null);
      } catch (err: any) {
        showToast(err.message || "Failed to create pad", "error");
      } finally {
        setSavingPad(false);
      }
      return;
    }

    // Existing pad update (PATCH)
    const padId = editingPad.id;
    const previousBanks = banks;
    const optimisticBanks = banks.map((b) => ({
      ...b,
      pads: b.pads.map((p) =>
        p.id === padId
          ? { ...p, label: payload.label, emoji: payload.emoji, color: payload.color, audio_url: payload.audio_url, drop_id: payload.drop_id }
          : p
      ),
    }));
    setBanks(optimisticBanks);

    try {
      const res = await fetch(`/api/admin/radio/soundboard/pads/${padId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update pad");
      }

      const resData = await res.json();
      const updatedBanks = optimisticBanks.map((b) => ({
        ...b,
        pads: b.pads.map((p) => (p.id === padId && resData.pad ? resData.pad : p)),
      }));
      setBanks(updatedBanks);

      try {
        localStorage.setItem("goodlife_soundboard_cache", JSON.stringify(updatedBanks));
      } catch {}

      showToast(`Pad "${payload.label}" saved successfully!`, "success");
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        setPreviewingUrl(null);
      }
      setEditingPad(null);
    } catch (err: any) {
      setBanks(previousBanks);
      showToast(err.message || "Failed to save pad changes", "error");
    } finally {
      setSavingPad(false);
    }
  };

  // Remove Pad from Database
  const handleDeletePad = async () => {
    if (!editingPad) return;

    if (editingPad.id < 0) {
      // Draft pad was never created in DB
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        setPreviewingUrl(null);
      }
      setEditingPad(null);
      return;
    }

    if (!confirm(`Are you sure you want to remove pad "${editingPad.name}"? This removes the pad from the soundboard but does NOT delete any audio from the Drops Vault.`)) {
      return;
    }

    setDeletingPad(true);
    const padId = editingPad.id;
    const previousBanks = banks;
    const optimisticBanks = banks.map((b) => ({
      ...b,
      pads: b.pads.filter((p) => p.id !== padId),
    }));
    setBanks(optimisticBanks);

    try {
      const res = await fetch(`/api/admin/radio/soundboard/pads/${padId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete pad");
      }

      try {
        localStorage.setItem("goodlife_soundboard_cache", JSON.stringify(optimisticBanks));
      } catch {}

      showToast("Pad removed from soundboard.", "success");
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        setPreviewingUrl(null);
      }
      setEditingPad(null);
    } catch (err: any) {
      setBanks(previousBanks);
      showToast(err.message || "Failed to remove pad", "error");
    } finally {
      setDeletingPad(false);
    }
  };

  // Bank Management Handlers
  const handleAddBank = async () => {
    const name = prompt("Enter new bank name:", `Bank ${banks.length + 1}`);
    if (name && name.trim()) {
      await createBank(name.trim());
    }
  };

  const handleRenameActiveBank = async () => {
    const cur = banks.find((b) => b.id === activeBankId);
    if (!cur) return;
    const name = prompt("Rename bank:", cur.name);
    if (name && name.trim() && name.trim() !== cur.name) {
      await renameBank(cur.id, name.trim());
    }
  };

  const handleDeleteActiveBank = async () => {
    await deleteBank(activeBankId);
  };

  const handleMoveBank = async (direction: "left" | "right") => {
    const idx = banks.findIndex((b) => b.id === activeBankId);
    if (idx < 0) return;
    const targetIdx = direction === "left" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= banks.length) return;

    const newBanks = [...banks];
    const [moved] = newBanks.splice(idx, 1);
    newBanks.splice(targetIdx, 0, moved);

    const reordered = newBanks.map((b, i) => ({ ...b, position: i }));
    setBanks(reordered);
    try {
      localStorage.setItem("goodlife_soundboard_cache", JSON.stringify(reordered));
      await Promise.all([
        fetch(`/api/admin/radio/soundboard/banks/${moved.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: targetIdx }),
        }),
        fetch(`/api/admin/radio/soundboard/banks/${banks[targetIdx].id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: idx }),
        }),
      ]);
    } catch {
      showToast("Failed to save bank order", "error");
    }
  };

  const filteredVaultDrops = useMemo(() => {
    if (!dropSearch.trim()) return vaultDrops;
    const q = dropSearch.toLowerCase();
    return vaultDrops.filter(
      (d) =>
        d.title?.toLowerCase().includes(q) ||
        d.persona?.toLowerCase().includes(q) ||
        d.mood?.toLowerCase().includes(q) ||
        d.script?.toLowerCase().includes(q)
    );
  }, [vaultDrops, dropSearch]);

  return (
    <div className={`bg-[#16181D] text-[#FBF9F6] border-2 transition-all p-3 sm:p-4 shadow-[4px_4px_0px_#DFBB7D] space-y-3 sm:space-y-4 ${
      isEditMode ? "border-[#F5C842] shadow-[0_0_20px_rgba(245,200,66,0.3)]" : "border-[#16181D]"
    }`}>
      {/* Toast Notification */}
      {toastMsg && (
        <div className={`p-2.5 rounded font-mono text-xs flex items-center space-x-2 animate-in fade-in duration-150 ${
          toastMsg.type === "success"
            ? "bg-[#10B981]/20 border border-[#10B981] text-emerald-200"
            : "bg-[#E84855]/20 border border-[#E84855] text-red-200"
        }`}>
          {toastMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span className="truncate">{toastMsg.text}</span>
        </div>
      )}

      {/* Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2">
          <div className={`p-1.5 font-bold shrink-0 transition-colors ${
            isEditMode ? "bg-[#F5C842] text-[#16181D]" : "bg-[#DFBB7D] text-[#16181D]"
          }`}>
            <Radio className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-xs sm:text-sm font-bold tracking-wider uppercase text-white truncate">
                CARTWALL SOUNDBOARD · {banks.find((b) => b.id === activeBankId)?.name || (activeBankId === 2 ? "STATION FX" : "15 DJ DROPS")}
              </h3>
              {isUsingStaticFallback && (
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[9px] font-bold uppercase rounded">
                  OFFLINE DEFAULTS
                </span>
              )}
              {isEditMode && (
                <span className="px-2 py-0.5 bg-[#F5C842] text-[#16181D] font-mono text-[9px] font-black uppercase rounded animate-pulse">
                  EDIT MODE
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-[11px] font-mono text-[#DFBB7D] truncate">
              {isEditMode ? (
                "Tap any pad to edit label, emoji, color or re-assign audio clip"
              ) : (
                <>
                  <span className="hidden sm:inline">Keys 1-0 · </span>Tap to {broadcastMode === "on_air" ? "fire ON-AIR" : "audition LOCAL PFL"} · Mid-song ducking (-12dB)
                </>
              )}
            </p>
          </div>
        </div>

        {/* Bank Switcher, Mode Toggle & Edit Mode Toggle */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Dynamic Bank Tabs (Horizontally scrollable on mobile) */}
          <div className="flex items-center border border-white/20 p-0.5 bg-black/40 overflow-x-auto max-w-[calc(100vw-3rem)] sm:max-w-xs md:max-w-md shrink-0">
            {(banks.length > 0 ? banks : [{ id: 1, name: "15 DJ DROPS" }, { id: 2, name: "STATION FX" }]).map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveBankId(b.id)}
                className={`px-2.5 py-1.5 sm:py-1 font-mono text-xs font-bold transition-all text-center cursor-pointer shrink-0 whitespace-nowrap ${
                  activeBankId === b.id
                    ? "bg-[#DFBB7D] text-[#16181D]"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {b.name}
              </button>
            ))}
            {isEditMode && (
              <button
                onClick={handleAddBank}
                title="Create a new soundboard bank"
                className="px-2.5 py-1 font-mono text-xs font-bold text-[#DFBB7D] hover:bg-[#DFBB7D]/20 cursor-pointer shrink-0 border-l border-white/20 whitespace-nowrap"
              >
                + Bank
              </button>
            )}
          </div>

          {/* Tactile On-Air vs Local PFL Mode Switcher (Visible in Perform Mode) */}
          {!isEditMode && (
            <div className="flex items-center border border-white/20 p-0.5 bg-black/40">
              <button
                onClick={() => setBroadcastMode("on_air")}
                title="Broadcast drops live to stream audience"
                className={`px-2 py-1 font-mono text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  broadcastMode === "on_air"
                    ? "bg-[#E84855] text-white shadow-[0_0_10px_#E84855]"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${broadcastMode === "on_air" ? "bg-white animate-ping" : "bg-white/40"}`} />
                <span>ON AIR</span>
              </button>
              <button
                onClick={() => setBroadcastMode("local")}
                title="Test drops locally in monitor/headphones only"
                className={`px-2 py-1 font-mono text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  broadcastMode === "local"
                    ? "bg-[#10B981] text-[#16181D] font-black"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <Headphones className="w-3 h-3" />
                <span>LOCAL PFL</span>
              </button>
            </div>
          )}

          {/* EDIT MODE TOGGLE BUTTON */}
          <button
            onClick={() => {
              if (isUsingStaticFallback) {
                showToast("Soundboard is running offline defaults. Database needed to edit pads.", "error");
                return;
              }
              setIsEditMode(!isEditMode);
            }}
            title={isEditMode ? "Exit Edit Mode and return to Perform Mode" : "Configure pads, assign clips and rename"}
            className={`px-3 py-1.5 sm:py-1 font-mono text-xs font-bold flex items-center space-x-1.5 border transition-all cursor-pointer ${
              isEditMode
                ? "bg-[#F5C842] text-[#16181D] border-[#F5C842] shadow-[0_0_12px_rgba(245,200,66,0.6)]"
                : "bg-white/10 hover:bg-white/20 text-white border-white/20"
            }`}
          >
            {isEditMode ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Edit3 className="w-3.5 h-3.5" />}
            <span>{isEditMode ? "DONE EDITING" : "EDIT PADS"}</span>
          </button>

          {/* Desktop/Tablet CHOKE ALL */}
          <button
            onClick={stopAllPads}
            title="Choke / Silence All Soundboard Drops Immediately (Esc)"
            className="hidden lg:flex px-3 py-1.5 sm:py-1 bg-[#E84855] hover:bg-red-600 text-white font-mono text-xs font-bold border border-white/20 items-center space-x-1 shrink-0 active:scale-95 transition-transform shadow-[2px_2px_0px_#DFBB7D] cursor-pointer"
          >
            <X className="w-3.5 h-3.5 stroke-[3]" />
            <span>CHOKE ALL</span>
          </button>
        </div>
      </div>

      {/* Edit Mode Notice Banner & Bank Controls */}
      {isEditMode && (
        <div className="p-3 bg-[#F5C842]/15 border-2 border-[#F5C842] rounded-lg text-[#F5C842] font-mono text-xs space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Edit3 className="w-4 h-4 shrink-0 animate-bounce" />
              <span>EDIT MODE · Tap any pad to edit, drag or reorder pads, or manage banks below.</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleAddBank}
                className="px-2.5 py-1 bg-black/40 hover:bg-black/60 text-[#DFBB7D] border border-white/20 font-bold rounded flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Bank</span>
              </button>
              <button
                onClick={handleAddNewPad}
                className="px-2.5 py-1 bg-[#DFBB7D] text-[#16181D] font-bold rounded flex items-center space-x-1 hover:bg-[#F5C842] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Pad</span>
              </button>
            </div>
          </div>

          {/* Active Bank Quick Management Toolbar */}
          <div className="pt-2 border-t border-[#F5C842]/30 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="text-white/80 font-bold">
                Bank &ldquo;{banks.find((b) => b.id === activeBankId)?.name}&rdquo;:
              </span>
              <button
                onClick={handleRenameActiveBank}
                className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded cursor-pointer"
              >
                Rename
              </button>
              <button
                onClick={() => handleMoveBank("left")}
                disabled={banks.findIndex((b) => b.id === activeBankId) === 0}
                className="px-2 py-0.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white rounded cursor-pointer"
                title="Move bank left"
              >
                ← Left
              </button>
              <button
                onClick={() => handleMoveBank("right")}
                disabled={banks.findIndex((b) => b.id === activeBankId) === banks.length - 1}
                className="px-2 py-0.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white rounded cursor-pointer"
                title="Move bank right"
              >
                Right →
              </button>
            </div>
            <button
              onClick={handleDeleteActiveBank}
              disabled={banks.length <= 1}
              className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white border border-red-500/40 disabled:opacity-30 rounded cursor-pointer flex items-center space-x-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete Bank</span>
            </button>
          </div>
        </div>
      )}

      {/* Cartwall Pads Grid */}
      <div className="grid gap-2 sm:gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
        {activePads.length === 0 && !isUsingStaticFallback ? (
          <div className="col-span-full py-10 px-4 text-center border-2 border-dashed border-white/20 bg-white/5 rounded-lg space-y-3">
            <p className="font-mono text-xs text-white/70">No pads in this bank yet. All pads have been removed.</p>
            <button
              onClick={handleAddNewPad}
              className="px-3 py-1.5 bg-[#DFBB7D] text-[#16181D] font-mono text-xs font-bold rounded inline-flex items-center space-x-1.5 hover:bg-[#F5C842] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Add First Pad</span>
            </button>
          </div>
        ) : (
          activePads.map((pad, idx) => {
            const isPlaying = playingPads.has(pad.id);
            const rem = padCountdowns.get(pad.id);
            const hasClip = Boolean(pad.audioUrl);
            const padColor = pad.color || "#DFBB7D";

            return (
              <div
                key={pad.id}
                draggable={isEditMode}
                onDragStart={(e) => {
                  if (!isEditMode) return;
                  e.dataTransfer.setData("text/plain", String(pad.id));
                  setDraggedPadId(pad.id);
                }}
                onDragOver={(e) => {
                  if (!isEditMode || !draggedPadId || draggedPadId === pad.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverPadId !== pad.id) setDragOverPadId(pad.id);
                }}
                onDragLeave={() => {
                  if (dragOverPadId === pad.id) setDragOverPadId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!isEditMode || !draggedPadId || draggedPadId === pad.id) return;
                  const currentIds = activePads.map((p) => p.id);
                  const fromIdx = currentIds.indexOf(draggedPadId);
                  const toIdx = currentIds.indexOf(pad.id);
                  if (fromIdx !== -1 && toIdx !== -1) {
                    const reordered = [...currentIds];
                    const [removed] = reordered.splice(fromIdx, 1);
                    reordered.splice(toIdx, 0, removed);
                    reorderPads(activeBankId, reordered);
                  }
                  setDraggedPadId(null);
                  setDragOverPadId(null);
                }}
                onDragEnd={() => {
                  setDraggedPadId(null);
                  setDragOverPadId(null);
                }}
                className={`relative group transition-all ${
                  isEditMode ? "cursor-grab active:cursor-grabbing" : ""
                } ${
                  draggedPadId === pad.id ? "opacity-30 scale-95" : ""
                } ${
                  dragOverPadId === pad.id ? "ring-2 ring-[#F5C842] scale-105 z-10" : ""
                }`}
              >
                <button
                  onClick={() => triggerPad(pad)}
                  onTouchStart={() => handleTouchStart(pad)}
                  onTouchEnd={() => handleTouchEnd(pad)}
                  onTouchCancel={() => handleTouchEnd(pad)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (didLongPressRef.current.get(pad.id)) return;
                    if (!isEditMode && onSendToCue) onSendToCue(pad);
                  }}
                  title={
                    isEditMode
                      ? `Click to edit Pad #${idx + 1}: ${pad.name}`
                      : `Pad #${idx + 1}: ${pad.name} (Hold or right-click to audition in Cue)`
                  }
                  style={
                    isPlaying
                      ? { borderColor: "#F5C842", backgroundColor: padColor, color: "#16181D", boxShadow: `0 0 16px ${padColor}80` }
                      : hasClip
                      ? { borderColor: `${padColor}60`, backgroundColor: "rgba(255,255,255,0.03)" }
                      : undefined
                  }
                  className={`w-full min-h-[82px] sm:min-h-[94px] h-auto p-2 sm:p-2.5 text-left border-2 transition-all flex flex-col justify-between relative overflow-hidden select-none cursor-pointer active:scale-[0.98] ${
                    isEditMode
                      ? "border-dashed border-[#F5C842] hover:bg-[#F5C842]/10 bg-white/5"
                      : isPlaying
                      ? ""
                      : !hasClip
                      ? "bg-white/5 border-dashed border-white/20 text-white/50 hover:border-white/40"
                      : "hover:border-[#DFBB7D] hover:bg-[#DFBB7D]/10 text-white"
                  }`}
                >
                  {/* Top Row: Key Number & Emoji */}
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center space-x-1.5">
                      {isEditMode && (
                        <GripVertical className="w-3.5 h-3.5 text-white/50 cursor-grab shrink-0" />
                      )}
                      <span
                        className={`font-mono text-xs font-bold px-1.5 py-0.5 border ${
                          isPlaying
                            ? "bg-[#16181D] text-[#DFBB7D] border-[#16181D]"
                            : "bg-black/40 text-white/70 border-white/10"
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      {hasClip && !isPlaying && (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: padColor }}
                          title={`Color: ${padColor}`}
                        />
                      )}
                    </div>
                    <span className="text-lg mr-6">{pad.emoji}</span>
                  </div>

                  {/* Bottom Row: Name & Clip State */}
                  <div>
                    <div className="font-mono text-xs font-bold truncate leading-tight">
                      {pad.name}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono mt-0.5 opacity-80">
                      <span className="uppercase tracking-wider text-[9px] truncate">
                        {isEditMode ? "TAP TO EDIT" : hasClip ? pad.category || "CLIP" : "NO CLIP ASSIGNED"}
                      </span>
                      {isPlaying && rem !== undefined && (
                        <span className="font-bold text-[#E84855] animate-pulse">
                          {rem.toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Active Playing Indicator Strip */}
                  {isPlaying && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#E84855] animate-pulse" />
                  )}
                </button>

                {/* Edit Mode Pencil Badge / Perform Mode Headphone Cue Button */}
                {isEditMode ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openPadEditor(pad);
                    }}
                    title="Configure pad"
                    aria-label="Edit pad"
                    className="absolute top-1.5 right-1.5 z-10 p-1.5 min-w-[28px] min-h-[28px] flex items-center justify-center bg-[#F5C842] text-[#16181D] border border-black text-[9px] font-mono transition-all rounded shadow-md cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  onSendToCue &&
                  hasClip && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSendToCue(pad);
                      }}
                      aria-label={`Audition ${pad.name} in PFL Cue`}
                      title="Audition in Cue Dock (PFL)"
                      className="absolute top-1.5 right-1.5 z-10 p-1.5 min-w-[28px] min-h-[28px] flex items-center justify-center bg-black/75 hover:bg-[#DFBB7D] text-[#DFBB7D] hover:text-[#16181D] border border-white/20 text-[9px] font-mono transition-all rounded active:scale-90 cursor-pointer"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>
            );
          })
        )}

        {/* Append Pad Tile (+) in Edit Mode */}
        {isEditMode && (
          <button
            onClick={handleAddNewPad}
            className="w-full min-h-[82px] sm:min-h-[94px] h-auto p-3 text-center border-2 border-dashed border-[#DFBB7D]/60 hover:border-[#DFBB7D] bg-[#DFBB7D]/5 hover:bg-[#DFBB7D]/15 text-[#DFBB7D] font-mono flex flex-col items-center justify-center space-y-1 transition-all rounded cursor-pointer"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
            <span className="text-xs font-bold uppercase tracking-wider">Add Pad</span>
          </button>
        )}
      </div>

      {/* Mobile Floating Sticky Emergency Action Bar (< lg) */}
      <div className="lg:hidden fixed bottom-16 left-2 right-2 z-30 flex items-center justify-between p-2 bg-[#16181D]/95 backdrop-blur-md border-2 border-[#DFBB7D] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.85)]">
        {/* Tactile Mode Switcher or Edit Indicator */}
        {isEditMode ? (
          <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-[#F5C842] px-2 py-1 bg-black/60 rounded">
            <Edit3 className="w-3.5 h-3.5" />
            <span>EDITING PADS</span>
          </div>
        ) : (
          <div className="flex items-center border border-white/20 p-0.5 bg-black/60 rounded">
            <button
              onClick={() => setBroadcastMode("on_air")}
              className={`px-2 py-1 font-mono text-[10px] font-bold flex items-center gap-1.5 transition-all rounded ${
                broadcastMode === "on_air"
                  ? "bg-[#E84855] text-white shadow-[0_0_8px_#E84855]"
                  : "text-white/50"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${broadcastMode === "on_air" ? "bg-white animate-ping" : "bg-white/30"}`} />
              <span>ON AIR</span>
            </button>
            <button
              onClick={() => setBroadcastMode("local")}
              className={`px-2 py-1 font-mono text-[10px] font-bold flex items-center gap-1.5 transition-all rounded ${
                broadcastMode === "local"
                  ? "bg-[#10B981] text-[#16181D]"
                  : "text-white/50"
              }`}
            >
              <Headphones className="w-3 h-3" />
              <span>LOCAL</span>
            </button>
          </div>
        )}

        {/* Sticky CHOKE ALL Button (Always Active) */}
        <button
          onClick={stopAllPads}
          className="px-3.5 py-1.5 bg-[#E84855] active:bg-red-700 text-white font-mono text-xs font-black border border-white/30 flex items-center space-x-1.5 shadow-[2px_2px_0px_#DFBB7D] active:translate-y-0.5 transition-all rounded cursor-pointer"
        >
          <X className="w-3.5 h-3.5 stroke-[3]" />
          <span>CHOKE ALL</span>
        </button>
      </div>

      {/* 2. PAD EDITOR MODAL / MOBILE BOTTOM SHEET */}
      {editingPad && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => {
              if (previewAudioRef.current) previewAudioRef.current.pause();
              setPreviewingUrl(null);
              resetRecording();
              setEditingPad(null);
            }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs z-[60] animate-in fade-in duration-150"
          />

          {/* Drawer Container: Bottom Sheet on Mobile, Centered Modal on Desktop */}
          <div className="fixed bottom-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 left-0 right-0 z-[70] bg-[#16181D] border-t-2 sm:border-2 border-[#DFBB7D] rounded-t-2xl sm:rounded-xl p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom,20px))] shadow-2xl max-w-xl w-full max-h-[90dvh] overflow-y-auto space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            {/* Header with 1-based pad position number */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-2xl">{editEmoji}</span>
                <div>
                  <h4 className="font-mono text-sm sm:text-base font-bold text-white uppercase">
                    {(() => {
                      const editingIndex = activePads.findIndex((p) => p.id === editingPad.id);
                      const padNum = editingIndex >= 0 ? editingIndex + 1 : (editingPad.position || 1);
                      return `Configure Pad #${padNum} · ${editingPad.name}`;
                    })()}
                  </h4>
                  <p className="text-[11px] font-mono text-[#DFBB7D]">
                    Deterministic audio trigger · One fixed clip per pad
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (previewAudioRef.current) previewAudioRef.current.pause();
                  setPreviewingUrl(null);
                  resetRecording();
                  setEditingPad(null);
                }}
                className="p-1.5 text-white/60 hover:text-white rounded hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Label Input (16px / text-base on mobile to prevent iOS auto-zoom) */}
            <div>
              <label className="block text-xs font-mono uppercase text-white/70 tracking-wider mb-1">
                Pad Label / Display Name:
              </label>
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                maxLength={60}
                placeholder="e.g. DJ Fusion Live"
                className="w-full bg-[#1A1D24] text-white font-mono text-base sm:text-xs p-3 border border-white/20 focus:border-[#DFBB7D] focus:outline-none rounded"
              />
            </div>

            {/* Emoji & Color Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono uppercase text-white/70 tracking-wider mb-1.5">
                  Pad Icon Emoji:
                </label>
                <div className="flex flex-wrap gap-1.5 bg-[#1A1D24] p-2 border border-white/10 rounded max-h-28 overflow-y-auto">
                  {EMOJI_PRESETS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setEditEmoji(em)}
                      className={`min-w-[44px] min-h-[44px] w-11 h-11 text-xl flex items-center justify-center rounded transition-all touch-manipulation cursor-pointer ${
                        editEmoji === em
                          ? "bg-[#DFBB7D] text-black shadow-md scale-105"
                          : "hover:bg-white/10 bg-white/5"
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-white/70 tracking-wider mb-1.5">
                  Pad Color Theme:
                </label>
                <div className="flex flex-wrap gap-1.5 bg-[#1A1D24] p-2 border border-white/10 rounded">
                  {COLOR_PRESETS.map((col) => (
                    <button
                      key={col.value}
                      type="button"
                      onClick={() => setEditColor(col.value)}
                      className={`min-h-[40px] px-3 py-2 font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-all touch-manipulation cursor-pointer ${
                        editColor === col.value
                          ? "border-2 border-white shadow-md"
                          : "opacity-75 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: col.value, color: "#16181D" }}
                    >
                      {editColor === col.value && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      <span>{col.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Position in Bank & Bank Movement Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-white/10 pt-3">
              <div>
                <label className="block text-xs font-mono uppercase text-white/70 tracking-wider mb-1.5">
                  Pad Position:
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleMoveStep("earlier")}
                    disabled={
                      editingPad.id < 0 ||
                      activePads.findIndex((p) => p.id === editingPad.id) <= 0
                    }
                    className="flex-1 min-h-[44px] px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none text-white font-mono text-xs font-bold rounded flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Move Earlier</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveStep("later")}
                    disabled={
                      editingPad.id < 0 ||
                      activePads.findIndex((p) => p.id === editingPad.id) === -1 ||
                      activePads.findIndex((p) => p.id === editingPad.id) >= activePads.length - 1
                    }
                    className="flex-1 min-h-[44px] px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none text-white font-mono text-xs font-bold rounded flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                  >
                    <span>Move Later</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-white/70 tracking-wider mb-1.5">
                  Move to Bank:
                </label>
                <select
                  value={editingPad.bank_id || activeBankId}
                  onChange={(e) => handleMovePadBank(Number(e.target.value))}
                  className="w-full min-h-[44px] bg-[#1A1D24] text-white font-mono text-base sm:text-xs p-2.5 border border-white/20 focus:border-[#DFBB7D] focus:outline-none rounded cursor-pointer"
                >
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.id === activeBankId ? "(Current Bank)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Audio Clip Status & Assignment */}
            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono uppercase text-[#DFBB7D] font-bold tracking-wider">
                  Assigned Audio Clip:
                </label>
                {editAudioUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditAudioUrl(null);
                      setEditDropId(null);
                    }}
                    className="text-[11px] font-mono text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear Clip</span>
                  </button>
                )}
              </div>

              {editAudioUrl ? (
                <div className="p-3 bg-[#1A1D24] border border-white/20 rounded flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-mono text-emerald-400 block font-bold">
                      ✓ AUDIO ATTACHED
                    </span>
                    <p className="text-xs font-mono text-white truncate" title={editAudioUrl}>
                      {editAudioUrl.split("/").pop()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePreviewAudio(editAudioUrl)}
                    className="px-3 py-1.5 bg-[#DFBB7D] text-[#16181D] font-mono text-xs font-bold rounded flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {previewingUrl === editAudioUrl ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>{previewingUrl === editAudioUrl ? "PAUSE" : "AUDITION"}</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-red-500/10 border border-dashed border-red-500/30 rounded text-center text-xs font-mono text-red-300">
                  No audio clip attached. This pad is currently inert. Select a clip below.
                </div>
              )}
            </div>

            {/* Choose Clip Source: 3 Tabs (Vault, Upload, Record) */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
                <span className="text-xs font-mono uppercase text-[#DFBB7D] font-bold tracking-wider">
                  Assign Audio Clip:
                </span>
                <div className="flex items-center border border-white/20 p-0.5 bg-black/40 rounded shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setClipSourceTab("vault");
                      setUploadError(null);
                    }}
                    className={`px-2.5 py-1 font-mono text-[11px] font-bold flex items-center space-x-1 rounded cursor-pointer transition-colors ${
                      clipSourceTab === "vault"
                        ? "bg-[#DFBB7D] text-[#16181D]"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    <FolderOpen className="w-3 h-3" />
                    <span>Vault ({filteredVaultDrops.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setClipSourceTab("upload");
                      setUploadError(null);
                    }}
                    className={`px-2.5 py-1 font-mono text-[11px] font-bold flex items-center space-x-1 rounded cursor-pointer transition-colors ${
                      clipSourceTab === "upload"
                        ? "bg-[#DFBB7D] text-[#16181D]"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setClipSourceTab("record");
                      setUploadError(null);
                    }}
                    className={`px-2.5 py-1 font-mono text-[11px] font-bold flex items-center space-x-1 rounded cursor-pointer transition-colors ${
                      clipSourceTab === "record"
                        ? "bg-[#DFBB7D] text-[#16181D]"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    <Mic className="w-3 h-3" />
                    <span>Record Mic</span>
                  </button>
                </div>
              </div>

              {/* Upload Error Banner */}
              {uploadError && (
                <div className="p-2.5 bg-red-500/20 border border-red-500/40 rounded text-red-200 text-xs font-mono flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="truncate">{uploadError}</span>
                </div>
              )}

              {/* TAB 1: DROPS VAULT */}
              {clipSourceTab === "vault" && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      type="text"
                      value={dropSearch}
                      onChange={(e) => setDropSearch(e.target.value)}
                      placeholder="Search drops by title, persona or script..."
                      className="w-full bg-[#1A1D24] text-white font-mono text-base sm:text-xs pl-9 pr-3 py-2.5 sm:py-2 border border-white/10 rounded focus:border-[#DFBB7D] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {filteredVaultDrops.length === 0 ? (
                      <div className="py-6 text-center text-white/40 font-mono text-xs">
                        No drops found.
                      </div>
                    ) : (
                      filteredVaultDrops.map((d) => {
                        const isSelected = editAudioUrl === d.audio_url;
                        return (
                          <div
                            key={d.id}
                            className={`p-2 rounded border flex items-center justify-between gap-2 font-mono text-xs transition-colors ${
                              isSelected
                                ? "bg-[#DFBB7D]/20 border-[#DFBB7D] text-white"
                                : "bg-white/5 border-white/10 hover:bg-white/10"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-bold truncate text-white">{d.title}</div>
                              <div className="text-[10px] text-[#DFBB7D] truncate">
                                {d.persona} · {d.mood}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => togglePreviewAudio(d.audio_url)}
                                title="Audition in headphones"
                                className="p-2 bg-black/50 text-[#DFBB7D] hover:text-white rounded border border-white/10 cursor-pointer"
                              >
                                {previewingUrl === d.audio_url ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditAudioUrl(d.audio_url);
                                  setEditDropId(d.id);
                                  if (!editLabel || editLabel === "New Pad") {
                                    setEditLabel(d.title.slice(0, 50));
                                  }
                                }}
                                className={`px-3 py-1.5 text-[11px] font-bold rounded transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-emerald-500 text-black font-black"
                                    : "bg-[#DFBB7D] text-[#16181D] hover:bg-[#F5C842]"
                                }`}
                              >
                                {isSelected ? "ATTACHED" : "SELECT"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: UPLOAD AUDIO FILE */}
              {clipSourceTab === "upload" && (
                <div className="p-4 bg-[#1A1D24] border border-white/10 rounded space-y-3 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    className="hidden"
                    id="soundboard-pad-file-input"
                  />
                  <label
                    htmlFor="soundboard-pad-file-input"
                    className="min-h-[52px] py-4 px-3 border-2 border-dashed border-white/20 hover:border-[#DFBB7D] rounded flex flex-col items-center justify-center space-y-1.5 cursor-pointer bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <Upload className="w-6 h-6 text-[#DFBB7D]" />
                    <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                      {isUploadingFile ? `Uploading (${uploadProgress}%)...` : "Select Audio File to Upload"}
                    </span>
                    <span className="font-mono text-[10px] text-white/50">
                      MP3, WAV, AAC, WebM (Max 10MB) · Direct to Cloudflare R2
                    </span>
                  </label>

                  {isUploadingFile && (
                    <div className="space-y-1 pt-1">
                      <div className="w-full bg-black/40 h-2 rounded overflow-hidden">
                        <div
                          className="bg-[#DFBB7D] h-full transition-all duration-150"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="font-mono text-[10px] text-[#DFBB7D] text-right">
                        {uploadProgress}%
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: RECORD MIC */}
              {clipSourceTab === "record" && (
                <div className="p-4 bg-[#1A1D24] border border-white/10 rounded space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-white/70">
                      Live Mic Recording:
                    </span>
                    {isRecording && (
                      <span className="flex items-center space-x-1.5 text-xs font-mono font-bold text-[#E84855] animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-[#E84855]" />
                        <span>REC {Math.floor(recordingDuration / 60).toString().padStart(2, "0")}:{(recordingDuration % 60).toString().padStart(2, "0")} / 02:00</span>
                      </span>
                    )}
                  </div>

                  {recorderError && (
                    <div className="p-2.5 bg-red-500/20 border border-red-500/40 rounded text-red-200 text-xs font-mono flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{recorderError}</span>
                    </div>
                  )}

                  {!recordedBlob && !isRecording && (
                    <button
                      type="button"
                      onClick={() => startRecording()}
                      className="w-full min-h-[44px] py-3 px-4 bg-[#E84855] hover:bg-red-600 text-white font-mono text-xs font-bold rounded flex items-center justify-center space-x-2 cursor-pointer transition-colors shadow-md"
                    >
                      <Mic className="w-4 h-4" />
                      <span>Start Recording Live Drop</span>
                    </button>
                  )}

                  {isRecording && (
                    <button
                      type="button"
                      onClick={() => stopRecording()}
                      className="w-full min-h-[44px] py-3 px-4 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-mono text-xs font-black rounded flex items-center justify-center space-x-2 cursor-pointer transition-colors shadow-md"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>Stop & Review Recording</span>
                    </button>
                  )}

                  {recordedBlob && !isRecording && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between p-2.5 bg-black/40 border border-white/10 rounded">
                        <div className="font-mono text-xs text-white">
                          <span className="text-emerald-400 font-bold block text-[10px]">RECORDED AUDIO READY</span>
                          <span>Duration: {recordingDuration}s · {(recordedBlob.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          {recordedLocalUrl && (
                            <button
                              type="button"
                              onClick={() => togglePreviewAudio(recordedLocalUrl)}
                              title="Audition recorded audio locally in headphones"
                              className="px-2.5 py-1.5 bg-[#DFBB7D] text-[#16181D] font-mono text-xs font-bold rounded flex items-center space-x-1 cursor-pointer"
                            >
                              {previewingUrl === recordedLocalUrl ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                              <span>{previewingUrl === recordedLocalUrl ? "PAUSE" : "AUDITION"}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => resetRecording()}
                            className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded cursor-pointer"
                          >
                            Re-record
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleUploadRecordedAudio}
                        disabled={isUploadingRecord}
                        className="w-full min-h-[44px] py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-black rounded flex items-center justify-center space-x-2 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <Upload className="w-4 h-4" />
                        <span>{isUploadingRecord ? "Uploading to Cloud..." : "Upload & Attach Recording to Pad"}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={handleDeletePad}
                disabled={deletingPad}
                className="min-h-[44px] px-3.5 py-2.5 bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white border border-red-500/40 font-mono text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deletingPad ? "Removing..." : "Remove Pad"}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (previewAudioRef.current) previewAudioRef.current.pause();
                    setPreviewingUrl(null);
                    resetRecording();
                    setEditingPad(null);
                  }}
                  className="min-h-[44px] px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold rounded transition-colors flex-1 sm:flex-none text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePad}
                  disabled={savingPad}
                  className="min-h-[44px] px-5 py-2.5 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-mono text-xs font-black rounded flex items-center justify-center gap-1.5 transition-all shadow-md flex-1 sm:flex-none cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{savingPad ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

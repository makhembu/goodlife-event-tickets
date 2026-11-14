"use client";

import React, { useState, useEffect, useRef } from "react";
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
  FileText,
  Key,
  ExternalLink,
  Shield,
  CheckCircle,
  XCircle,
  MessageSquare,
  Send,
  Upload,
  Image as ImageIcon,
  Phone,
  HelpCircle,
  CheckSquare,
  Square,
  Filter,
  Search,
  SlidersHorizontal,
  Layers,
} from "lucide-react";

interface Presenter {
  id: number;
  full_name: string;
  dj_name: string;
  slug: string;
  email: string;
  phone?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  status: string;
  stream_key_prefix?: string | null;
}

interface Show {
  id: number;
  title: string;
  slug: string;
  genre: string;
  description?: string | null;
  cover_image_url?: string | null;
  primary_presenter_id: number;
  dj_name?: string;
  recurrence_pattern: string;
  recurrence_days: string[];
  default_start_time: string;
  default_duration_min?: number;
  is_active?: boolean;
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
  cover_requested?: boolean;
  cover_request_reason?: string | null;
}

interface Application {
  id: number;
  full_name: string;
  dj_name: string;
  email: string;
  phone: string;
  bio: string;
  show_concept: string;
  genre: string;
  sample_mix_url: string;
  social_links?: any;
  status: string;
  admin_notes?: string | null;
  created_at: string;
}

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

interface PromptDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  defaultValue?: string;
  confirmText: string;
  onConfirm: (val: string) => Promise<void> | void;
}

export default function ScheduleManager() {
  const [activeSubTab, setActiveSubTab] = useState<"slots" | "shows" | "presenters" | "applications">("slots");
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Custom Modal Dialogs (replaces window.confirm / prompt / alert)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [promptDialog, setPromptDialog] = useState<PromptDialogState | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [dialogLoading, setDialogLoading] = useState(false);

  // Bulk Slot Selection & Filtering
  const [selectedSlotIds, setSelectedSlotIds] = useState<number[]>([]);
  const [filterShowId, setFilterShowId] = useState<string>("all");
  const [filterPresenterId, setFilterPresenterId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [slotSearch, setSlotSearch] = useState<string>("");
  const [showBulkReassignModal, setShowBulkReassignModal] = useState(false);
  const [bulkReassignDjId, setBulkReassignDjId] = useState<number | "">("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Credentials Issued / Show-Once Modal
  const [tempCredentialsShow, setTempCredentialsShow] = useState<{
    dj_name: string;
    email: string;
    phone?: string;
    temporary_password?: string;
    stream_key?: string;
    whatsapp_message?: string;
    whatsapp_url?: string;
    waha_sent?: boolean;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [wahaSending, setWahaSending] = useState(false);
  const [wahaDirectStatus, setWahaDirectStatus] = useState<string | null>(null);

  // New Presenter Modal
  const [showPresenterModal, setShowPresenterModal] = useState(false);
  const [newPresName, setNewPresName] = useState("");
  const [newPresDj, setNewPresDj] = useState("");
  const [newPresEmail, setNewPresEmail] = useState("");
  const [newPresPhone, setNewPresPhone] = useState("");
  const [newPresBio, setNewPresBio] = useState("");
  const [newPresAvatar, setNewPresAvatar] = useState("");
  const [uploadingPresAvatar, setUploadingPresAvatar] = useState(false);
  const presFileInputRef = useRef<HTMLInputElement>(null);

  // Edit Presenter Modal
  const [editingPresenter, setEditingPresenter] = useState<Presenter | null>(null);
  const [editPresName, setEditPresName] = useState("");
  const [editPresDj, setEditPresDj] = useState("");
  const [editPresEmail, setEditPresEmail] = useState("");
  const [editPresPhone, setEditPresPhone] = useState("");
  const [editPresBio, setEditPresBio] = useState("");
  const [editPresAvatar, setEditPresAvatar] = useState("");
  const [editPresStatus, setEditPresStatus] = useState("active");
  const [uploadingEditPresAvatar, setUploadingEditPresAvatar] = useState(false);
  const editPresFileInputRef = useRef<HTMLInputElement>(null);

  // New Show Modal
  const [showShowModal, setShowShowModal] = useState(false);
  const [newShowTitle, setNewShowTitle] = useState("");
  const [newShowGenre, setNewShowGenre] = useState("Afrobeats");
  const [newShowDescription, setNewShowDescription] = useState("");
  const [newShowDjId, setNewShowDjId] = useState<number | "">("");
  const [newShowPattern, setNewShowPattern] = useState("weekly");
  const [newShowDay, setNewShowDay] = useState("Friday");
  const [newShowTime, setNewShowTime] = useState("20:00:00");
  const [newShowDuration, setNewShowDuration] = useState("120");
  const [newShowCover, setNewShowCover] = useState("");
  const [newShowAutoGenerate, setNewShowAutoGenerate] = useState(true);
  const [uploadingShowCover, setUploadingShowCover] = useState(false);
  const showCoverInputRef = useRef<HTMLInputElement>(null);

  // Edit Show Modal
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [editShowTitle, setEditShowTitle] = useState("");
  const [editShowGenre, setEditShowGenre] = useState("Afrobeats");
  const [editShowDescription, setEditShowDescription] = useState("");
  const [editShowDjId, setEditShowDjId] = useState<number | "">("");
  const [editShowPattern, setEditShowPattern] = useState("weekly");
  const [editShowDay, setEditShowDay] = useState("Friday");
  const [editShowTime, setEditShowTime] = useState("20:00:00");
  const [editShowDuration, setEditShowDuration] = useState("120");
  const [editShowCover, setEditShowCover] = useState("");
  const [editShowActive, setEditShowActive] = useState(true);
  const [uploadingEditShowCover, setUploadingEditShowCover] = useState(false);
  const editShowCoverInputRef = useRef<HTMLInputElement>(null);

  // Reassign / Edit Slot Modal
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [reassignSubDjId, setReassignSubDjId] = useState<number | "">("");
  const [slotStatus, setSlotStatus] = useState("scheduled");
  const [slotNotes, setSlotNotes] = useState("");

  // Generating 30 Days State
  const [generating, setGenerating] = useState(false);
  const [generatingShowId, setGeneratingShowId] = useState<number | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pRes, sRes, slRes, appRes] = await Promise.all([
        fetch("/api/admin/radio/presenters"),
        fetch("/api/admin/radio/shows"),
        fetch("/api/admin/radio/schedule"),
        fetch("/api/admin/radio/applications"),
      ]);

      if (pRes.ok) setPresenters((await pRes.json()).presenters || []);
      if (sRes.ok) setShows((await sRes.json()).shows || []);
      if (slRes.ok) setSlots((await slRes.json()).slots || []);
      if (appRes.ok) setApplications((await appRes.json()).applications || []);
    } catch (err: any) {
      setMsg({ type: "error", text: "Failed to load schedule data" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Helper for image upload to /api/admin/upload-image
  const uploadImageFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/admin/upload-image", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Image upload failed");
    }
    return data.url;
  };

  // Direct WAHA Dispatch helper
  const handleSendViaWaha = async (phone: string, text: string) => {
    setWahaSending(true);
    setWahaDirectStatus(null);
    try {
      const res = await fetch("/api/admin/radio/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "WAHA delivery failed");
      }
      setWahaDirectStatus("✅ Dispatched via WAHA directly to WhatsApp!");
      if (tempCredentialsShow) {
        setTempCredentialsShow({ ...tempCredentialsShow, waha_sent: true });
      }
    } catch (err: any) {
      setWahaDirectStatus(`⚠️ WAHA send failed: ${err.message}. You can still use the wa.me link below.`);
    } finally {
      setWahaSending(false);
    }
  };

  const handleGenerate30Days = async () => {
    setGenerating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/radio/schedule/generate", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      setMsg({
        type: "success",
        text: `Generated ${data.totalGenerated} slots across next 30 days (${data.totalSkipped} existing slots preserved).`,
      });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateForShow = async (sh: Show) => {
    setGeneratingShowId(sh.id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/radio/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30, show_id: sh.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      setMsg({
        type: "success",
        text: `Generated ${data.totalGenerated} slots for "${sh.title}" across next 30 days (${data.totalSkipped} existing slots preserved).`,
      });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setGeneratingShowId(null);
    }
  };

  // CLEAR ALL FUTURE SLOTS
  const handleClearAllFutureSlots = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Wipe All Future Broadcast Slots",
      message: "Are you sure you want to delete ALL future scheduled slots (starting from now onwards)? This clears the calendar cleanly so you can re-run 'Generate Next 30 Days' without old duplicates.",
      confirmText: "Wipe All Future Slots",
      isDestructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch("/api/admin/radio/schedule/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "clear_future" }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to wipe future slots");

          setSelectedSlotIds([]);
          setMsg({ type: "success", text: data.message || "Future slots cleared." });
          setConfirmDialog(null);
          await loadData();
        } catch (err: any) {
          setMsg({ type: "error", text: err.message });
          setConfirmDialog(null);
        }
      },
    });
  };

  // FILTERED SLOTS
  const filteredSlots = slots.filter((s) => {
    if (filterShowId !== "all" && String(s.show_id) !== filterShowId) return false;
    if (
      filterPresenterId !== "all" &&
      String(s.presenter_id) !== filterPresenterId &&
      String(s.substitute_presenter_id) !== filterPresenterId
    ) {
      return false;
    }
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (slotSearch.trim()) {
      const q = slotSearch.toLowerCase();
      const matchTitle = (s.show_title || "").toLowerCase().includes(q);
      const matchDj = (s.presenter_dj_name || "").toLowerCase().includes(q);
      const matchSub = (s.substitute_dj_name || "").toLowerCase().includes(q);
      if (!matchTitle && !matchDj && !matchSub) return false;
    }
    return true;
  });

  const allFilteredSelected =
    filteredSlots.length > 0 &&
    filteredSlots.every((s) => selectedSlotIds.includes(s.id));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIdSet = new Set(filteredSlots.map((s) => s.id));
      setSelectedSlotIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
    } else {
      const newIds = Array.from(
        new Set([...selectedSlotIds, ...filteredSlots.map((s) => s.id)])
      );
      setSelectedSlotIds(newIds);
    }
  };

  const handleToggleSelectSlot = (id: number) => {
    setSelectedSlotIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // BULK ACTIONS
  const handleBulkCancel = () => {
    if (selectedSlotIds.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: `Bulk Cancel ${selectedSlotIds.length} Slots`,
      message: `Cancel ${selectedSlotIds.length} selected broadcast slot(s)? They will remain in history as 'cancelled' and will not air.`,
      confirmText: `Cancel ${selectedSlotIds.length} Slots`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch("/api/admin/radio/schedule/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel", slot_ids: selectedSlotIds }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Bulk cancel failed");

          setSelectedSlotIds([]);
          setMsg({ type: "success", text: data.message });
          setConfirmDialog(null);
          await loadData();
        } catch (err: any) {
          setMsg({ type: "error", text: err.message });
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleBulkDelete = () => {
    if (selectedSlotIds.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: `Permanently Delete ${selectedSlotIds.length} Slots`,
      message: `Are you sure you want to permanently DELETE ${selectedSlotIds.length} selected slot(s) from the database? This cannot be undone.`,
      confirmText: `Delete ${selectedSlotIds.length} Slots Permanently`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch("/api/admin/radio/schedule/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", slot_ids: selectedSlotIds }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Bulk delete failed");

          setSelectedSlotIds([]);
          setMsg({ type: "success", text: data.message });
          setConfirmDialog(null);
          await loadData();
        } catch (err: any) {
          setMsg({ type: "error", text: err.message });
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleBulkReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSlotIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/radio/schedule/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reassign",
          slot_ids: selectedSlotIds,
          substitute_presenter_id: bulkReassignDjId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk reassign failed");

      setShowBulkReassignModal(false);
      setSelectedSlotIds([]);
      setMsg({ type: "success", text: data.message });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedSlotIds.length === 0) return;
    try {
      const res = await fetch("/api/admin/radio/schedule/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          slot_ids: selectedSlotIds,
          status: newStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk status change failed");

      setSelectedSlotIds([]);
      setMsg({ type: "success", text: data.message });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    }
  };

  // CREATE PRESENTER
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
          bio: newPresBio,
          avatar_url: newPresAvatar,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create presenter");

      setTempCredentialsShow({
        dj_name: data.presenter.dj_name,
        email: data.presenter.email,
        phone: data.presenter.phone || newPresPhone,
        temporary_password: data.temporary_password,
        stream_key: data.stream_key,
        whatsapp_message: data.whatsapp_message,
        whatsapp_url: data.whatsapp_url,
        waha_sent: data.waha_sent,
      });
      setWahaDirectStatus(
        data.waha_sent
          ? "✅ Login details sent automatically to presenter via WAHA!"
          : null
      );
      setShowPresenterModal(false);
      setNewPresName("");
      setNewPresDj("");
      setNewPresEmail("");
      setNewPresPhone("");
      setNewPresBio("");
      setNewPresAvatar("");
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    }
  };

  // EDIT PRESENTER
  const openEditPresenter = (p: Presenter) => {
    setEditingPresenter(p);
    setEditPresName(p.full_name);
    setEditPresDj(p.dj_name);
    setEditPresEmail(p.email);
    setEditPresPhone(p.phone || "");
    setEditPresBio(p.bio || "");
    setEditPresAvatar(p.avatar_url || "");
    setEditPresStatus(p.status || "active");
  };

  const handleUpdatePresenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPresenter) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/radio/presenters/${editingPresenter.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editPresName,
          dj_name: editPresDj,
          email: editPresEmail,
          phone: editPresPhone,
          bio: editPresBio,
          avatar_url: editPresAvatar,
          status: editPresStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update presenter");

      setEditingPresenter(null);
      setMsg({ type: "success", text: `Presenter "${data.presenter.dj_name}" updated.` });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    }
  };

  // REGENERATE KEY (triggers custom confirm modal)
  const triggerRegenerateKey = (presenter: Presenter) => {
    setConfirmDialog({
      isOpen: true,
      title: `Regenerate Stream Key: ${presenter.dj_name}`,
      message: `Are you sure you want to regenerate the encoder stream key for ${presenter.dj_name}? The previous key will be immediately revoked and live broadcasts using the old key will disconnect.`,
      confirmText: "Regenerate & Issue",
      isDestructive: false,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/radio/presenters/${presenter.id}/stream-key`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "regenerate", send_whatsapp: true }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to regenerate stream key");

          setTempCredentialsShow({
            dj_name: presenter.dj_name,
            email: `dj_${data.slug}`,
            phone: presenter.phone || undefined,
            stream_key: data.fullKey,
            whatsapp_message: data.whatsapp_message,
            whatsapp_url: data.whatsapp_url,
            waha_sent: data.waha_sent,
          });
          setWahaDirectStatus(
            data.waha_sent
              ? "✅ New stream key sent automatically to presenter's WhatsApp via WAHA!"
              : null
          );
          setConfirmDialog(null);
          await loadData();
        } catch (err: any) {
          setMsg({ type: "error", text: err.message });
          setConfirmDialog(null);
        }
      },
    });
  };

  // REVOKE KEY (triggers custom confirm modal)
  const triggerRevokeKey = (presenter: Presenter) => {
    setConfirmDialog({
      isOpen: true,
      title: `Revoke Stream Key: ${presenter.dj_name}`,
      message: `Revoke stream key for ${presenter.dj_name}? They will not be able to connect to the harbor live mount until a new key is issued.`,
      confirmText: "Revoke Key",
      isDestructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/radio/presenters/${presenter.id}/stream-key`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "revoke" }),
          });
          if (!res.ok) throw new Error("Failed to revoke stream key");
          setMsg({ type: "success", text: `Stream key revoked for ${presenter.dj_name}.` });
          setConfirmDialog(null);
          await loadData();
        } catch (err: any) {
          setMsg({ type: "error", text: err.message });
          setConfirmDialog(null);
        }
      },
    });
  };

  // RESET PASSWORD / SEND WHATSAPP CREDENTIALS
  const handleResetPassword = async (presenter: Presenter) => {
    setConfirmDialog({
      isOpen: true,
      title: `Reset & Send Studio Login: ${presenter.dj_name}`,
      message: `Generate a new temporary password (GL-XXXX) for ${presenter.dj_name} and send their studio login link directly via WAHA?`,
      confirmText: "Reset & Send WhatsApp",
      isDestructive: false,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/radio/presenters/${presenter.id}/reset-password`, {
            method: "POST",
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to reset password");

          setTempCredentialsShow({
            dj_name: presenter.dj_name,
            email: data.email,
            phone: data.phone,
            temporary_password: data.temporary_password,
            whatsapp_message: data.whatsapp_message,
            whatsapp_url: data.whatsapp_url,
            waha_sent: data.waha_sent,
          });
          setWahaDirectStatus(
            data.waha_sent
              ? "✅ New login credentials dispatched automatically to WhatsApp via WAHA!"
              : null
          );
          setConfirmDialog(null);
          await loadData();
        } catch (err: any) {
          setMsg({ type: "error", text: err.message });
          setConfirmDialog(null);
        }
      },
    });
  };

  // CREATE SHOW
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
          description: newShowDescription,
          cover_image_url: newShowCover || null,
          primary_presenter_id: newShowDjId,
          recurrence_pattern: newShowPattern,
          recurrence_days:
            newShowPattern === "daily"
              ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
              : newShowPattern === "weekdays"
              ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
              : newShowPattern === "weekends"
              ? ["Saturday", "Sunday"]
              : [newShowDay],
          default_start_time: newShowTime,
          default_duration_min: parseInt(newShowDuration, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create show");

      let autoGenMsg = "";
      if (newShowAutoGenerate && data.show?.id) {
        try {
          const genRes = await fetch("/api/admin/radio/schedule/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ days: 30, show_id: data.show.id }),
          });
          const genData = await genRes.json();
          if (genData.totalGenerated > 0) {
            autoGenMsg = ` & ${genData.totalGenerated} upcoming broadcast slots added to roster`;
          }
        } catch {}
      }

      setShowShowModal(false);
      setNewShowTitle("");
      setNewShowDescription("");
      setNewShowCover("");
      setMsg({ type: "success", text: `Show "${data.show.title}" successfully created${autoGenMsg}.` });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    }
  };

  // OPEN EDIT SHOW MODAL
  const openEditShow = (sh: Show) => {
    setEditingShow(sh);
    setEditShowTitle(sh.title);
    setEditShowGenre(sh.genre || "Afrobeats");
    setEditShowDescription(sh.description || "");
    setEditShowDjId(sh.primary_presenter_id);
    setEditShowPattern(sh.recurrence_pattern || "weekly");
    setEditShowDay(
      Array.isArray(sh.recurrence_days) && sh.recurrence_days[0]
        ? sh.recurrence_days[0]
        : "Friday"
    );
    setEditShowTime(sh.default_start_time || "20:00:00");
    setEditShowDuration(String(sh.default_duration_min || 120));
    setEditShowCover(sh.cover_image_url || "");
    setEditShowActive(sh.is_active !== false);
  };

  // UPDATE SHOW
  const handleUpdateShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShow) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/radio/shows/${editingShow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editShowTitle,
          genre: editShowGenre,
          description: editShowDescription,
          cover_image_url: editShowCover || null,
          primary_presenter_id: editShowDjId,
          recurrence_pattern: editShowPattern,
          recurrence_days:
            editShowPattern === "daily"
              ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
              : editShowPattern === "weekdays"
              ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
              : editShowPattern === "weekends"
              ? ["Saturday", "Sunday"]
              : [editShowDay],
          default_start_time: editShowTime,
          default_duration_min: parseInt(editShowDuration, 10),
          is_active: editShowActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update show");

      setEditingShow(null);
      setMsg({ type: "success", text: `Show "${data.show.title}" updated successfully.` });
      await loadData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    }
  };

  // DELETE SHOW (triggers custom confirm modal)
  const triggerDeleteShow = (sh: Show) => {
    setConfirmDialog({
      isOpen: true,
      title: `Deactivate Show: ${sh.title}`,
      message: `Are you sure you want to deactivate "${sh.title}"? Existing historical slots will remain, but upcoming generation will exclude this title.`,
      confirmText: "Deactivate Show",
      isDestructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/radio/shows/${sh.id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("Failed to deactivate show");
          setMsg({ type: "success", text: `Show "${sh.title}" deactivated.` });
          setConfirmDialog(null);
          await loadData();
        } catch (err: any) {
          setMsg({ type: "error", text: err.message });
          setConfirmDialog(null);
        }
      },
    });
  };

  // UPDATE SLOT
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

  // CANCEL SLOT (triggers custom confirm modal)
  const triggerCancelSlot = (slotId: number) => {
    setConfirmDialog({
      isOpen: true,
      title: `Cancel Broadcast Slot #${slotId}`,
      message: "Are you sure you want to cancel this scheduled radio broadcast slot? The slot will be marked cancelled and won't air.",
      confirmText: "Cancel Slot",
      isDestructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/radio/schedule/${slotId}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("Failed to cancel slot");
          setMsg({ type: "success", text: "Slot cancelled." });
          setConfirmDialog(null);
          await loadData();
        } catch (err: any) {
          setMsg({ type: "error", text: err.message });
          setConfirmDialog(null);
        }
      },
    });
  };

  // APPLICATION REVIEW
  const triggerApproveApp = (app: Application) => {
    setConfirmDialog({
      isOpen: true,
      title: `Approve Application: ${app.dj_name}`,
      message: `Approve presenter application for ${app.dj_name} (${app.full_name})? This will create a new resident presenter account with live stream encoder credentials and temporary studio password, dispatched via WAHA if phone is present.`,
      confirmText: "Approve & Onboard",
      isDestructive: false,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/radio/applications/${app.id}/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "approve" }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to approve application");

          setTempCredentialsShow({
            dj_name: data.presenter.dj_name,
            email: data.presenter.email,
            phone: app.phone,
            temporary_password: data.presenter.tempPassword,
            stream_key: data.presenter.streamKey,
          });
          setConfirmDialog(null);
          setMsg({ type: "success", text: `Application for ${app.dj_name} approved!` });
          await loadData();
        } catch (err: any) {
          setMsg({ type: "error", text: err.message });
          setConfirmDialog(null);
        }
      },
    });
  };

  const triggerRejectApp = (appId: number) => {
    setPromptValue("Not a fit for current programming window");
    setPromptDialog({
      isOpen: true,
      title: "Decline Talent Application",
      message: "Enter the internal rejection note or feedback for records:",
      defaultValue: "Not a fit for current programming window",
      confirmText: "Confirm Decline",
      onConfirm: async (reason: string) => {
        try {
          const res = await fetch(`/api/admin/radio/applications/${appId}/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reject", admin_notes: reason }),
          });
          if (!res.ok) throw new Error("Failed to reject application");
          setPromptDialog(null);
          setMsg({ type: "success", text: "Application marked rejected." });
          await loadData();
        } catch (err: any) {
          setMsg({ type: "error", text: err.message });
          setPromptDialog(null);
        }
      },
    });
  };

  const pendingAppsCount = applications.filter((a) => a.status === "pending").length;
  const coverRequestsCount = slots.filter((s) => s.cover_requested).length;

  return (
    <div className="space-y-6 font-mono text-brand-navy">
      {/* Header & Quick Actions */}
      <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-accent block">
            STATION PROGRAMMING
          </span>
          <h2 className="text-2xl font-display font-black uppercase text-brand-navy">
            Timetable, Shows & Presenter Roster
          </h2>
          <p className="text-xs text-neutral-600 mt-0.5">
            Manage weekly & daily recurring shows, generate timetable slots, review applications, and dispatch DJ credentials via WAHA.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={handleClearAllFutureSlots}
            className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border-2 border-red-300 font-display text-sm uppercase tracking-wider transition-all shadow-[2px_2px_0px_#dc2626] flex items-center gap-1.5 cursor-pointer"
            title="Wipe upcoming broadcast slots from today onwards"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Wipe Future Slots</span>
          </button>

          <button
            onClick={handleGenerate30Days}
            disabled={generating}
            className="px-4 py-2 bg-brand-accent text-brand-navy border-2 border-brand-navy font-display text-sm uppercase tracking-wider hover:bg-brand-navy hover:text-white transition-all shadow-[2px_2px_0px_#142B4C] flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Generating..." : "Generate Next 30 Days"}
          </button>
        </div>
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
      <div className="flex flex-wrap border-b-2 border-brand-navy gap-2">
        <button
          onClick={() => setActiveSubTab("slots")}
          className={`px-4 sm:px-5 py-2 font-display text-base sm:text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === "slots"
              ? "bg-white text-brand-navy font-black shadow-xs"
              : "bg-neutral-200 text-neutral-600 hover:bg-white"
          }`}
        >
          <span>Schedule Slots ({slots.length})</span>
          {coverRequestsCount > 0 && (
            <span className="bg-amber-400 text-brand-navy text-[10px] font-black px-1.5 py-0.2 rounded-xs">
              {coverRequestsCount} COVER
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab("shows")}
          className={`px-4 sm:px-5 py-2 font-display text-base sm:text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer ${
            activeSubTab === "shows"
              ? "bg-white text-brand-navy font-black shadow-xs"
              : "bg-neutral-200 text-neutral-600 hover:bg-white"
          }`}
        >
          Shows ({shows.length})
        </button>

        <button
          onClick={() => setActiveSubTab("presenters")}
          className={`px-4 sm:px-5 py-2 font-display text-base sm:text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer ${
            activeSubTab === "presenters"
              ? "bg-white text-brand-navy font-black shadow-xs"
              : "bg-neutral-200 text-neutral-600 hover:bg-white"
          }`}
        >
          Presenter Roster ({presenters.length})
        </button>

        <button
          onClick={() => setActiveSubTab("applications")}
          className={`px-4 sm:px-5 py-2 font-display text-base sm:text-lg uppercase tracking-wide border-t-2 border-x-2 border-brand-navy -mb-0.5 cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === "applications"
              ? "bg-white text-brand-navy font-black shadow-xs"
              : "bg-neutral-200 text-neutral-600 hover:bg-white"
          }`}
        >
          <span>Applications</span>
          {pendingAppsCount > 0 && (
            <span className="bg-emerald-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-xs">
              {pendingAppsCount} NEW
            </span>
          )}
        </button>
      </div>

      {/* 1. SLOTS TAB */}
      {activeSubTab === "slots" && (
        <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-brand-navy pb-3 gap-2">
            <div>
              <h3 className="font-display text-lg uppercase text-brand-navy">Upcoming Broadcast Schedule</h3>
              <p className="text-xs text-neutral-500">
                Showing {filteredSlots.length} of {slots.length} total scheduled slots.
              </p>
            </div>

            {/* Quick Filter Controls */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Show filter */}
              <select
                value={filterShowId}
                onChange={(e) => setFilterShowId(e.target.value)}
                className="border-2 border-brand-navy p-1.5 bg-white text-xs font-bold"
              >
                <option value="all">All Shows ({shows.length})</option>
                {shows.map((sh) => (
                  <option key={sh.id} value={sh.id}>
                    {sh.title}
                  </option>
                ))}
              </select>

              {/* DJ filter */}
              <select
                value={filterPresenterId}
                onChange={(e) => setFilterPresenterId(e.target.value)}
                className="border-2 border-brand-navy p-1.5 bg-white text-xs font-bold"
              >
                <option value="all">All DJs ({presenters.length})</option>
                {presenters.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.dj_name}
                  </option>
                ))}
              </select>

              {/* Status filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border-2 border-brand-navy p-1.5 bg-white text-xs font-bold"
              >
                <option value="all">All Statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              {/* Search text */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search slots..."
                  value={slotSearch}
                  onChange={(e) => setSlotSearch(e.target.value)}
                  className="border-2 border-brand-navy py-1.5 pl-6 pr-2 text-xs w-36 sm:w-44"
                />
                <Search className="w-3 h-3 text-neutral-400 absolute left-2 top-2.5" />
              </div>

              {(filterShowId !== "all" || filterPresenterId !== "all" || filterStatus !== "all" || slotSearch) && (
                <button
                  onClick={() => {
                    setFilterShowId("all");
                    setFilterPresenterId("all");
                    setFilterStatus("all");
                    setSlotSearch("");
                  }}
                  className="p-1 text-xs text-neutral-500 hover:text-brand-navy underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* FLOATING BULK ACTIONS TOOLBAR */}
          {selectedSlotIds.length > 0 && (
            <div className="bg-brand-navy text-white p-3 border-2 border-brand-accent shadow-[4px_4px_0px_#C8A54A] flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <span className="bg-brand-accent text-brand-navy font-black text-xs px-2.5 py-1 uppercase tracking-wider border border-brand-navy flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  {selectedSlotIds.length} SLOTS SELECTED
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSlotIds([])}
                  className="text-xs text-neutral-300 hover:text-white underline cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
                {/* Reassign DJ */}
                <button
                  type="button"
                  onClick={() => setShowBulkReassignModal(true)}
                  className="px-3 py-1.5 bg-white text-brand-navy uppercase hover:bg-brand-accent cursor-pointer flex items-center gap-1 border border-brand-navy shadow-xs"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Reassign DJ</span>
                </button>

                {/* Mark as Completed */}
                <button
                  type="button"
                  onClick={() => handleBulkStatusChange("completed")}
                  className="px-3 py-1.5 bg-neutral-200 text-neutral-800 uppercase hover:bg-neutral-300 cursor-pointer flex items-center gap-1 border border-brand-navy shadow-xs"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Mark Completed</span>
                </button>

                {/* Bulk Cancel */}
                <button
                  type="button"
                  onClick={handleBulkCancel}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-brand-navy font-black uppercase cursor-pointer flex items-center gap-1 border border-amber-700 shadow-xs"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancel Slots</span>
                </button>

                {/* Bulk Delete */}
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-black uppercase cursor-pointer flex items-center gap-1 border border-red-900 shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Permanently</span>
                </button>
              </div>
            </div>
          )}

          {slots.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 text-xs">
              No schedule slots generated yet. Click "Generate Next 30 Days" above to build the broadcast timetable.
            </div>
          ) : filteredSlots.length === 0 ? (
            <div className="py-8 text-center text-neutral-500 text-xs">
              No schedule slots match the current filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-brand-navy">
                <thead className="bg-brand-navy text-brand-off-white font-display uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-2.5 w-10 text-center">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="cursor-pointer inline-flex items-center justify-center p-0.5 text-brand-accent hover:text-white"
                        title={allFilteredSelected ? "Deselect All" : "Select All Visible"}
                      >
                        {allFilteredSelected ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="p-2.5">Date & Time (EAT)</th>
                    <th className="p-2.5">Show Title</th>
                    <th className="p-2.5">Scheduled Host</th>
                    <th className="p-2.5">Substitute / Cover</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-navy/20">
                  {filteredSlots.map((s) => {
                    const start = new Date(s.starts_at);
                    const end = new Date(s.ends_at);
                    const dateStr = start.toLocaleDateString("en-KE", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      timeZone: "Africa/Nairobi",
                    });
                    const timeStr = `${start.toLocaleTimeString("en-KE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: "Africa/Nairobi",
                    })} - ${end.toLocaleTimeString("en-KE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: "Africa/Nairobi",
                    })}`;

                    const isSelected = selectedSlotIds.includes(s.id);

                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors ${
                          isSelected ? "bg-amber-50/80 font-semibold" : "hover:bg-neutral-50"
                        }`}
                      >
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectSlot(s.id)}
                            className="cursor-pointer inline-flex items-center justify-center text-brand-navy hover:text-brand-accent"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-brand-accent fill-brand-navy" />
                            ) : (
                              <Square className="w-4 h-4 text-neutral-400" />
                            )}
                          </button>
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="font-bold text-brand-navy block">{dateStr}</span>
                          <span className="text-[10px] text-neutral-500">{timeStr}</span>
                        </td>
                        <td className="p-2.5 font-bold text-brand-navy">{s.show_title}</td>
                        <td className="p-2.5 text-neutral-700">{s.presenter_dj_name}</td>
                        <td className="p-2.5">
                          {s.substitute_dj_name ? (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-xs font-bold text-[10px]">
                              COVER: {s.substitute_dj_name}
                            </span>
                          ) : s.cover_requested ? (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-900 border border-red-300 rounded-xs font-black text-[10px] animate-pulse">
                              COVER REQUESTED
                            </span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded-xs ${
                              s.status === "scheduled"
                                ? "bg-blue-100 text-blue-800"
                                : s.status === "live"
                                ? "bg-red-600 text-white animate-pulse"
                                : s.status === "completed"
                                ? "bg-neutral-200 text-neutral-700"
                                : s.status === "cancelled"
                                ? "bg-red-100 text-red-800"
                                : s.status === "warmup"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-right whitespace-nowrap space-x-1">
                          <button
                            onClick={() => {
                              setEditingSlot(s);
                              setReassignSubDjId(s.substitute_presenter_id || "");
                              setSlotStatus(s.status);
                              setSlotNotes(s.notes || "");
                            }}
                            className="p-1 hover:text-brand-accent cursor-pointer"
                            title="Edit or Reassign Substitute"
                          >
                            <Edit2 className="w-4 h-4 inline" />
                          </button>
                          {s.status !== "cancelled" && s.status !== "completed" && (
                            <button
                              onClick={() => triggerCancelSlot(s.id)}
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
            <div>
              <h3 className="font-display text-lg uppercase text-brand-navy">Recurring Show Titles</h3>
              <p className="text-xs text-neutral-500">Configure weekly, biweekly or daily programming blocks with host DJs.</p>
            </div>
            <button
              onClick={() => setShowShowModal(true)}
              className="px-3 py-1.5 bg-brand-navy text-white text-xs font-bold uppercase border border-brand-navy flex items-center gap-1.5 cursor-pointer shadow-xs hover:bg-brand-accent hover:text-brand-navy"
            >
              <Plus className="w-3.5 h-3.5" /> New Show
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shows.map((sh) => (
              <div key={sh.id} className="border-2 border-brand-navy p-4 bg-brand-off-white/40 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {sh.cover_image_url ? (
                        <img
                          src={sh.cover_image_url}
                          alt={sh.title}
                          className="w-12 h-12 object-cover border border-brand-navy shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-brand-navy text-brand-off-white flex items-center justify-center font-display font-black text-base shrink-0 border border-brand-navy">
                          <Tv className="w-5 h-5 text-brand-accent" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="bg-brand-accent text-brand-navy text-[10px] font-black uppercase px-2 py-0.5 border border-brand-navy">
                            {sh.genre}
                          </span>
                          <span className="text-[10px] bg-neutral-200 text-neutral-800 font-bold uppercase px-1.5 py-0.5">
                            {sh.recurrence_pattern}
                          </span>
                        </div>
                        <h4 className="font-display text-xl font-black uppercase text-brand-navy mt-0.5 leading-tight">
                          {sh.title}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => handleGenerateForShow(sh)}
                        disabled={generatingShowId === sh.id}
                        className="px-2 py-1 bg-brand-accent text-brand-navy border border-brand-navy hover:bg-brand-navy hover:text-white cursor-pointer font-bold text-[10px] flex items-center gap-1 shadow-xs transition-colors disabled:opacity-50"
                        title="Generate next 30 days of upcoming broadcast slots in the timetable roster"
                      >
                        <RefreshCw className={`w-3 h-3 ${generatingShowId === sh.id ? "animate-spin" : ""}`} />
                        <span>Populate Roster</span>
                      </button>
                      <button
                        onClick={() => openEditShow(sh)}
                        className="p-1.5 bg-white border border-brand-navy text-brand-navy hover:bg-brand-accent cursor-pointer"
                        title="Edit Show"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => triggerDeleteShow(sh)}
                        className="p-1.5 bg-red-50 border border-red-300 text-red-700 hover:bg-red-100 cursor-pointer"
                        title="Deactivate Show"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {sh.description && (
                    <p className="text-xs text-neutral-600 line-clamp-2 italic">
                      "{sh.description}"
                    </p>
                  )}

                  <div className="pt-2 border-t border-brand-navy/15 text-xs space-y-1">
                    <p className="text-neutral-700">
                      Host: <span className="font-bold text-brand-navy">{sh.dj_name || "Primary Host"}</span>
                    </p>
                    <p className="text-neutral-700">
                      Air time:{" "}
                      <span className="font-bold text-brand-navy">
                        {sh.default_start_time} EAT
                      </span>{" "}
                      ({sh.default_duration_min || 120} min)
                    </p>
                    <p className="text-[11px] text-neutral-500 font-bold">
                      {sh.recurrence_pattern === "daily"
                        ? "Broadcasts Daily (Mon–Sun)"
                        : sh.recurrence_pattern === "weekdays"
                        ? "Broadcasts Weekdays (Mon–Fri)"
                        : sh.recurrence_pattern === "weekends"
                        ? "Broadcasts Weekends (Sat–Sun)"
                        : `Airs ${sh.recurrence_pattern}: ${Array.isArray(sh.recurrence_days) ? sh.recurrence_days.join(", ") : "Weekly"}`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. PRESENTERS TAB */}
      {activeSubTab === "presenters" && (
        <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3">
            <div>
              <h3 className="font-display text-lg uppercase text-brand-navy">Resident Presenter Roster</h3>
              <p className="text-xs text-neutral-500">Talent directory with stream keys, passwords, and 1-click WAHA direct dispatch.</p>
            </div>
            <button
              onClick={() => setShowPresenterModal(true)}
              className="px-3 py-1.5 bg-brand-navy text-white text-xs font-bold uppercase border border-brand-navy flex items-center gap-1.5 cursor-pointer shadow-xs hover:bg-brand-accent hover:text-brand-navy"
            >
              <UserPlus className="w-3.5 h-3.5" /> Add Presenter
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {presenters.map((p) => (
              <div key={p.id} className="border-2 border-brand-navy p-4 bg-brand-off-white/40 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          alt={p.dj_name}
                          className="w-12 h-12 object-cover border-2 border-brand-navy shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-brand-navy text-brand-accent flex items-center justify-center font-display font-black text-xl shrink-0 border-2 border-brand-navy">
                          {p.dj_name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h4 className="font-display text-lg font-black uppercase text-brand-navy leading-tight">
                          {p.dj_name}
                        </h4>
                        <p className="text-xs text-neutral-600 font-bold">{p.full_name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 border ${
                        p.status === "active"
                          ? "bg-green-100 text-green-800 border-green-300"
                          : "bg-neutral-200 text-neutral-700 border-neutral-300"
                      }`}>
                        {p.status}
                      </span>
                      <button
                        onClick={() => openEditPresenter(p)}
                        className="p-1 bg-white border border-brand-navy hover:bg-brand-accent text-brand-navy cursor-pointer ml-1"
                        title="Edit Presenter"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs space-y-0.5">
                    <p className="font-mono text-neutral-700 truncate">📧 {p.email}</p>
                    {p.phone ? (
                      <p className="font-mono text-neutral-700">📱 {p.phone}</p>
                    ) : (
                      <p className="text-[11px] text-neutral-400 italic">No phone set (needed for WhatsApp)</p>
                    )}
                  </div>

                  {/* Stream Key Prefix row */}
                  <div className="pt-2 border-t border-brand-navy/15 flex items-center justify-between text-[11px]">
                    <span className="text-neutral-500">Harbor Key:</span>
                    <span className="font-bold text-brand-navy bg-white px-1.5 py-0.5 border font-mono">
                      {p.stream_key_prefix ? `${p.stream_key_prefix}...` : "None"}
                    </span>
                  </div>
                </div>

                {/* Presenter Actions */}
                <div className="space-y-1.5 pt-2 border-t border-brand-navy/15">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleResetPassword(p)}
                      className="flex-1 py-1.5 px-2 text-[10px] font-black uppercase bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-900 flex items-center justify-center gap-1 cursor-pointer"
                      title="Generate new GL-XXXX temporary password and send login details via WAHA"
                    >
                      <MessageSquare className="w-3 h-3 text-emerald-200" />
                      <span>WhatsApp Login</span>
                    </button>

                    <button
                      onClick={() => triggerRegenerateKey(p)}
                      className="flex-1 py-1.5 px-2 text-[10px] font-bold uppercase bg-white hover:bg-brand-accent text-brand-navy border border-brand-navy flex items-center justify-center gap-1 cursor-pointer"
                      title="Regenerate live Harbor encoder stream key"
                    >
                      <Key className="w-3 h-3" />
                      <span>Regen Key</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[10px]">
                    <button
                      onClick={() => openEditPresenter(p)}
                      className="text-neutral-600 hover:text-brand-navy underline cursor-pointer"
                    >
                      Edit details & photo
                    </button>

                    <button
                      onClick={() => triggerRevokeKey(p)}
                      className="text-red-600 hover:text-red-800 underline cursor-pointer"
                    >
                      Revoke Key
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. APPLICATIONS TAB */}
      {activeSubTab === "applications" && (
        <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3">
            <div>
              <h3 className="font-display text-lg uppercase text-brand-navy">
                Presenter Applications Queue
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Review applicant mix submissions and onboard selected DJs with 1-click credential issuance.
              </p>
            </div>
          </div>

          {applications.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 text-xs">
              No applications submitted yet. Applicants submit via /radio/apply.
            </div>
          ) : (
            <div className="space-y-4">
              {applications.map((app) => (
                <div
                  key={app.id}
                  className={`border-2 border-brand-navy p-4 space-y-3 ${
                    app.status === "pending"
                      ? "bg-brand-off-white/80"
                      : app.status === "approved"
                      ? "bg-emerald-50/50"
                      : "bg-neutral-100 opacity-60"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-navy/15 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-display text-xl uppercase font-black text-brand-navy">
                          {app.dj_name}
                        </h4>
                        <span className="text-xs text-neutral-600 font-mono">({app.full_name})</span>
                        <span className={`px-2 py-0.5 text-[9px] font-black uppercase border ${
                          app.status === "pending"
                            ? "bg-amber-200 text-amber-900 border-amber-500"
                            : app.status === "approved"
                            ? "bg-emerald-200 text-emerald-900 border-emerald-600"
                            : "bg-red-100 text-red-800 border-red-400"
                        }`}>
                          {app.status}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 font-mono">
                        {app.email} · {app.phone} · Genre: <strong className="text-brand-navy">{app.genre}</strong>
                      </p>
                    </div>

                    <div className="text-[11px] text-neutral-500">
                      Applied: {new Date(app.created_at).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-neutral-800 font-mono">
                    <p><strong>Show Concept:</strong> {app.show_concept}</p>
                    <p><strong>Bio:</strong> {app.bio}</p>
                    <div className="pt-1">
                      <a
                        href={app.sample_mix_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1 bg-brand-navy text-brand-off-white hover:bg-brand-accent hover:text-brand-navy font-bold uppercase text-[11px] border border-brand-navy"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Listen to Sample Mix
                      </a>
                    </div>
                  </div>

                  {app.status === "pending" && (
                    <div className="pt-2 border-t border-brand-navy/15 flex items-center justify-end gap-2">
                      <button
                        onClick={() => triggerRejectApp(app.id)}
                        className="px-3 py-1.5 text-xs font-bold uppercase bg-red-100 hover:bg-red-200 text-red-800 border border-red-400 cursor-pointer"
                      >
                        Decline
                      </button>

                      <button
                        onClick={() => triggerApproveApp(app)}
                        className="px-4 py-1.5 text-xs font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white border border-brand-navy cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve & Create Presenter
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* BULK REASSIGN MODAL                                            */}
      {/* ============================================================== */}
      {showBulkReassignModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2">
              <h3 className="font-display text-xl font-black uppercase text-brand-navy flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-brand-accent" />
                Bulk Reassign {selectedSlotIds.length} Slots
              </h3>
              <button onClick={() => setShowBulkReassignModal(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBulkReassignSubmit} className="space-y-3 text-xs">
              <p className="text-neutral-700 font-mono">
                Select a substitute / cover DJ to assign across all {selectedSlotIds.length} selected broadcast slots:
              </p>

              <div>
                <label className="block font-bold uppercase mb-1">Substitute / Cover DJ</label>
                <select
                  value={bulkReassignDjId}
                  onChange={(e) => setBulkReassignDjId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full border-2 border-brand-navy p-2 bg-white font-bold"
                >
                  <option value="">Clear Substitute (Revert to Primary Host)</option>
                  {presenters.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.dj_name} ({p.full_name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-brand-navy/15 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkReassignModal(false)}
                  className="px-4 py-2 border font-bold uppercase text-neutral-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkLoading}
                  className="px-5 py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy cursor-pointer disabled:opacity-50"
                >
                  {bulkLoading ? "Updating..." : `Reassign ${selectedSlotIds.length} Slots`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CUSTOM IN-APP MODAL: CONFIRM DIALOG (Replaces window.confirm) */}
      {/* ============================================================== */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4">
            <div className="flex items-center gap-2 border-b-2 border-brand-navy pb-3">
              <AlertTriangle className={`w-6 h-6 ${confirmDialog.isDestructive ? "text-red-600" : "text-amber-600"}`} />
              <h3 className="font-display text-xl uppercase font-black text-brand-navy">
                {confirmDialog.title}
              </h3>
            </div>

            <p className="text-xs text-neutral-700 leading-relaxed font-mono">
              {confirmDialog.message}
            </p>

            <div className="pt-3 border-t border-brand-navy/15 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                disabled={dialogLoading}
                className="px-4 py-2 border-2 border-neutral-300 font-bold uppercase text-xs text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              >
                {confirmDialog.cancelText || "Cancel"}
              </button>

              <button
                type="button"
                disabled={dialogLoading}
                onClick={async () => {
                  setDialogLoading(true);
                  try {
                    await confirmDialog.onConfirm();
                  } finally {
                    setDialogLoading(false);
                  }
                }}
                className={`px-5 py-2 font-display text-base uppercase border-2 border-brand-navy cursor-pointer shadow-xs ${
                  confirmDialog.isDestructive
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-brand-navy text-white hover:bg-brand-accent hover:text-brand-navy"
                }`}
              >
                {dialogLoading ? "Processing..." : confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CUSTOM IN-APP MODAL: PROMPT DIALOG (Replaces window.prompt)   */}
      {/* ============================================================== */}
      {promptDialog && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3">
              <h3 className="font-display text-xl uppercase font-black text-brand-navy">
                {promptDialog.title}
              </h3>
              <button onClick={() => setPromptDialog(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-700">{promptDialog.message}</p>

            <div>
              <textarea
                rows={3}
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                className="w-full border-2 border-brand-navy p-2 text-xs"
                placeholder="Enter details..."
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPromptDialog(null)}
                className="px-4 py-2 border-2 border-neutral-300 font-bold uppercase text-xs text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => promptDialog.onConfirm(promptValue)}
                className="px-5 py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy cursor-pointer"
              >
                {promptDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CREDENTIALS ISSUED / SHOW-ONCE MODAL WITH WHATSAPP DISPATCH   */}
      {/* ============================================================== */}
      {tempCredentialsShow && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-lg w-full shadow-[8px_8px_0px_#142B4C] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 text-green-700 font-bold border-b-2 border-brand-navy pb-3">
              <Check className="w-6 h-6" />
              <h3 className="font-display text-2xl uppercase font-black text-brand-navy">
                Credentials Issued for {tempCredentialsShow.dj_name}!
              </h3>
            </div>

            <p className="text-xs text-neutral-700">
              Provide these credentials to the presenter. They are shown{" "}
              <strong className="text-red-700 uppercase">only once</strong>:
            </p>

            {tempCredentialsShow.temporary_password && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-neutral-500 uppercase">Temporary Studio Password</span>
                <div className="p-2.5 bg-neutral-100 border-2 border-brand-navy flex items-center justify-between">
                  <span className="font-mono text-sm font-black text-brand-navy">
                    {tempCredentialsShow.temporary_password}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tempCredentialsShow.temporary_password || "");
                      setCopiedField("pwd");
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="px-2 py-1 bg-brand-accent text-brand-navy text-[10px] font-bold border border-brand-navy flex items-center gap-1 cursor-pointer"
                  >
                    {copiedField === "pwd" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === "pwd" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
            )}

            {tempCredentialsShow.stream_key && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-neutral-500 uppercase">Secret Stream Key (Harbor Ingest)</span>
                <div className="p-2.5 bg-neutral-900 border-2 border-brand-navy flex items-center justify-between text-emerald-400 font-mono text-xs break-all">
                  <span>{tempCredentialsShow.stream_key}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tempCredentialsShow.stream_key || "");
                      setCopiedField("key");
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="px-2 py-1 bg-brand-accent text-brand-navy text-[10px] font-bold border border-brand-navy flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                  >
                    {copiedField === "key" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === "key" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* WAHA & WhatsApp Dispatch Section */}
            <div className="p-3 bg-emerald-50 border-2 border-emerald-600 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm uppercase font-black text-emerald-900 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-emerald-700" /> WhatsApp Credential Dispatch
                </span>
                {tempCredentialsShow.waha_sent && (
                  <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 text-[10px] font-bold uppercase rounded border border-emerald-400">
                    WAHA Dispatched
                  </span>
                )}
              </div>

              {wahaDirectStatus && (
                <p className="text-[11px] font-bold text-emerald-800 bg-white p-2 border border-emerald-300">
                  {wahaDirectStatus}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                {tempCredentialsShow.phone ? (
                  <button
                    type="button"
                    disabled={wahaSending}
                    onClick={() =>
                      handleSendViaWaha(
                        tempCredentialsShow.phone!,
                        tempCredentialsShow.whatsapp_message ||
                          `Goodlife Radio credentials for ${tempCredentialsShow.dj_name}: Pass: ${tempCredentialsShow.temporary_password || ""}, Stream Key: ${tempCredentialsShow.stream_key || ""}`
                      )
                    }
                    className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 border border-emerald-900 shadow-xs"
                  >
                    <Send className={`w-3.5 h-3.5 ${wahaSending ? "animate-spin" : ""}`} />
                    <span>{wahaSending ? "Dispatching..." : "Send via WAHA Direct"}</span>
                  </button>
                ) : (
                  <div className="text-[11px] text-amber-800 italic bg-amber-50 p-1.5 border border-amber-300">
                    No phone number on profile. Add a phone number in Presenter Edit to dispatch directly via WAHA.
                  </div>
                )}

                {tempCredentialsShow.whatsapp_url && (
                  <a
                    href={tempCredentialsShow.whatsapp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 bg-white hover:bg-neutral-100 text-emerald-800 border border-emerald-700 font-bold text-xs uppercase flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in WhatsApp</span>
                  </a>
                )}
              </div>

              {tempCredentialsShow.whatsapp_message && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(tempCredentialsShow.whatsapp_message || "");
                      setCopiedField("allmsg");
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="w-full py-1 text-[10px] text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100 font-bold uppercase flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedField === "allmsg" ? "Full Message Copied!" : "Copy Full Message Text"}</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setTempCredentialsShow(null);
                setWahaDirectStatus(null);
              }}
              className="w-full py-2.5 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy cursor-pointer"
            >
              I Have Saved These Credentials
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* NEW PRESENTER MODAL                                            */}
      {/* ============================================================== */}
      {showPresenterModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4 max-h-[90vh] overflow-y-auto">
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
                  placeholder="e.g. Felix Ochieng"
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
                  placeholder="e.g. DJ FELLO"
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Station / Login Email</label>
                <input
                  type="email"
                  required
                  value={newPresEmail}
                  onChange={(e) => setNewPresEmail(e.target.value)}
                  placeholder="fello@gmail.com"
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">WhatsApp Phone Number</label>
                <input
                  type="text"
                  value={newPresPhone}
                  onChange={(e) => setNewPresPhone(e.target.value)}
                  placeholder="0712345678 or 254712345678"
                  className="w-full border-2 border-brand-navy p-2"
                />
                <span className="text-[10px] text-neutral-500">Used for direct WhatsApp credentials dispatch via WAHA.</span>
              </div>

              {/* Photo / Avatar Section */}
              <div className="space-y-1.5 p-2 bg-neutral-50 border border-brand-navy/20">
                <label className="block font-bold uppercase text-[11px]">Presenter Photo / Avatar</label>
                <div className="flex items-center gap-2">
                  {newPresAvatar ? (
                    <img
                      src={newPresAvatar}
                      alt="Preview"
                      className="w-12 h-12 object-cover border-2 border-brand-navy shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-neutral-200 border-2 border-dashed border-neutral-400 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-5 h-5 text-neutral-500" />
                    </div>
                  )}

                  <div className="flex-1 space-y-1">
                    <input
                      type="file"
                      ref={presFileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingPresAvatar(true);
                        try {
                          const url = await uploadImageFile(file);
                          setNewPresAvatar(url);
                        } catch (err: any) {
                          setMsg({ type: "error", text: err.message });
                        } finally {
                          setUploadingPresAvatar(false);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploadingPresAvatar}
                      onClick={() => presFileInputRef.current?.click()}
                      className="px-3 py-1 bg-white border border-brand-navy hover:bg-neutral-100 font-bold uppercase text-[10px] flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{uploadingPresAvatar ? "Uploading..." : "Upload Photo"}</span>
                    </button>
                    <input
                      type="text"
                      value={newPresAvatar}
                      onChange={(e) => setNewPresAvatar(e.target.value)}
                      placeholder="Or paste image URL"
                      className="w-full border border-neutral-300 p-1 text-[10px]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Bio / Profile Notes</label>
                <textarea
                  rows={2}
                  value={newPresBio}
                  onChange={(e) => setNewPresBio(e.target.value)}
                  placeholder="Short DJ bio..."
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPresenterModal(false)}
                  className="px-4 py-2 border font-bold uppercase text-neutral-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy cursor-pointer"
                >
                  Create & Issue Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* EDIT PRESENTER MODAL                                           */}
      {/* ============================================================== */}
      {editingPresenter && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2">
              <h3 className="font-display text-xl font-black uppercase text-brand-navy">
                Edit Presenter: {editingPresenter.dj_name}
              </h3>
              <button onClick={() => setEditingPresenter(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePresenter} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold uppercase mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={editPresName}
                  onChange={(e) => setEditPresName(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">DJ / On-Air Name</label>
                <input
                  type="text"
                  required
                  value={editPresDj}
                  onChange={(e) => setEditPresDj(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Station / Login Email</label>
                <input
                  type="email"
                  required
                  value={editPresEmail}
                  onChange={(e) => setEditPresEmail(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">WhatsApp Phone Number</label>
                <input
                  type="text"
                  value={editPresPhone}
                  onChange={(e) => setEditPresPhone(e.target.value)}
                  placeholder="0712345678 or 254712345678"
                  className="w-full border-2 border-brand-navy p-2"
                />
                <span className="text-[10px] text-neutral-500">Used by WAHA to dispatch credentials & schedule notifications.</span>
              </div>

              {/* Photo / Avatar Section */}
              <div className="space-y-1.5 p-2 bg-neutral-50 border border-brand-navy/20">
                <label className="block font-bold uppercase text-[11px]">Presenter Photo / Avatar</label>
                <div className="flex items-center gap-2">
                  {editPresAvatar ? (
                    <img
                      src={editPresAvatar}
                      alt="Preview"
                      className="w-12 h-12 object-cover border-2 border-brand-navy shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-neutral-200 border-2 border-dashed border-neutral-400 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-5 h-5 text-neutral-500" />
                    </div>
                  )}

                  <div className="flex-1 space-y-1">
                    <input
                      type="file"
                      ref={editPresFileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingEditPresAvatar(true);
                        try {
                          const url = await uploadImageFile(file);
                          setEditPresAvatar(url);
                        } catch (err: any) {
                          setMsg({ type: "error", text: err.message });
                        } finally {
                          setUploadingEditPresAvatar(false);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploadingEditPresAvatar}
                      onClick={() => editPresFileInputRef.current?.click()}
                      className="px-3 py-1 bg-white border border-brand-navy hover:bg-neutral-100 font-bold uppercase text-[10px] flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{uploadingEditPresAvatar ? "Uploading..." : "Upload Photo"}</span>
                    </button>
                    <input
                      type="text"
                      value={editPresAvatar}
                      onChange={(e) => setEditPresAvatar(e.target.value)}
                      placeholder="Or paste image URL"
                      className="w-full border border-neutral-300 p-1 text-[10px]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Bio / Profile Notes</label>
                <textarea
                  rows={2}
                  value={editPresBio}
                  onChange={(e) => setEditPresBio(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Status</label>
                <select
                  value={editPresStatus}
                  onChange={(e) => setEditPresStatus(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2 bg-white"
                >
                  <option value="active">Active (Permitted to broadcast)</option>
                  <option value="suspended">Suspended (Access revoked)</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPresenter(null)}
                  className="px-4 py-2 border font-bold uppercase text-neutral-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy cursor-pointer"
                >
                  Save Presenter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* NEW SHOW MODAL (WITH CONDITIONAL CADENCE UI)                   */}
      {/* ============================================================== */}
      {showShowModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4 max-h-[90vh] overflow-y-auto">
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
                <label className="block font-bold uppercase mb-1">Primary Host DJ</label>
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

              {/* Cover Image Upload */}
              <div className="space-y-1.5 p-2 bg-neutral-50 border border-brand-navy/20">
                <label className="block font-bold uppercase text-[11px]">Show Cover Artwork</label>
                <div className="flex items-center gap-2">
                  {newShowCover ? (
                    <img
                      src={newShowCover}
                      alt="Cover Preview"
                      className="w-12 h-12 object-cover border-2 border-brand-navy shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-neutral-200 border-2 border-dashed border-neutral-400 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-5 h-5 text-neutral-500" />
                    </div>
                  )}

                  <div className="flex-1 space-y-1">
                    <input
                      type="file"
                      ref={showCoverInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingShowCover(true);
                        try {
                          const url = await uploadImageFile(file);
                          setNewShowCover(url);
                        } catch (err: any) {
                          setMsg({ type: "error", text: err.message });
                        } finally {
                          setUploadingShowCover(false);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploadingShowCover}
                      onClick={() => showCoverInputRef.current?.click()}
                      className="px-3 py-1 bg-white border border-brand-navy hover:bg-neutral-100 font-bold uppercase text-[10px] flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{uploadingShowCover ? "Uploading..." : "Upload Cover"}</span>
                    </button>
                    <input
                      type="text"
                      value={newShowCover}
                      onChange={(e) => setNewShowCover(e.target.value)}
                      placeholder="Or paste artwork URL"
                      className="w-full border border-neutral-300 p-1 text-[10px]"
                    />
                  </div>
                </div>
              </div>

              {/* CONDITIONAL CADENCE FIELDS */}
              <div className="space-y-2 p-2 bg-brand-off-white/80 border-2 border-brand-navy">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold uppercase mb-1">Cadence</label>
                    <select
                      value={newShowPattern}
                      onChange={(e) => setNewShowPattern(e.target.value)}
                      className="w-full border-2 border-brand-navy p-2 bg-white font-bold"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="daily">Daily</option>
                      <option value="weekdays">Weekdays Only (Mon–Fri)</option>
                      <option value="weekends">Weekends Only (Sat–Sun)</option>
                    </select>
                  </div>

                  {newShowPattern === "daily" ? (
                    <div className="flex flex-col justify-center">
                      <span className="block font-bold uppercase mb-1 text-neutral-400">Weekday</span>
                      <div className="p-2 bg-neutral-200 border-2 border-neutral-300 text-neutral-600 font-bold text-center">
                        All Days (Mon–Sun)
                      </div>
                    </div>
                  ) : newShowPattern === "weekdays" ? (
                    <div className="flex flex-col justify-center">
                      <span className="block font-bold uppercase mb-1 text-neutral-400">Weekday</span>
                      <div className="p-2 bg-neutral-200 border-2 border-neutral-300 text-neutral-600 font-bold text-center">
                        Weekdays (Mon–Fri)
                      </div>
                    </div>
                  ) : newShowPattern === "weekends" ? (
                    <div className="flex flex-col justify-center">
                      <span className="block font-bold uppercase mb-1 text-neutral-400">Weekday</span>
                      <div className="p-2 bg-neutral-200 border-2 border-neutral-300 text-neutral-600 font-bold text-center">
                        Weekends (Sat–Sun)
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block font-bold uppercase mb-1">Weekday</label>
                      <select
                        value={newShowDay}
                        onChange={(e) => setNewShowDay(e.target.value)}
                        className="w-full border-2 border-brand-navy p-2 bg-white font-bold"
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
                  )}
                </div>

                {/* Helpful condition notice */}
                <div className="text-[11px] font-bold text-brand-navy bg-white p-2 border border-brand-navy/30">
                  {newShowPattern === "daily" && (
                    <span>📅 <strong>Daily Programming:</strong> Broadcasts every single day (Monday to Sunday) at designated air time.</span>
                  )}
                  {newShowPattern === "weekdays" && (
                    <span>📅 <strong>Weekdays Programming:</strong> Broadcasts Monday through Friday at designated air time.</span>
                  )}
                  {newShowPattern === "weekends" && (
                    <span>📅 <strong>Weekends Programming:</strong> Broadcasts Saturday and Sunday at designated air time.</span>
                  )}
                  {newShowPattern === "weekly" && (
                    <span>📅 <strong>Weekly Programming:</strong> Broadcasts every <strong>{newShowDay}</strong>.</span>
                  )}
                  {newShowPattern === "biweekly" && (
                    <span>📅 <strong>Biweekly Programming:</strong> Broadcasts every 2 weeks on <strong>{newShowDay}</strong>.</span>
                  )}
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

              <div>
                <label className="block font-bold uppercase mb-1">Description / Concept</label>
                <textarea
                  rows={2}
                  value={newShowDescription}
                  onChange={(e) => setNewShowDescription(e.target.value)}
                  placeholder="Show synopsis..."
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div className="p-2.5 bg-brand-off-white border-2 border-brand-navy flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoGenSlots"
                  checked={newShowAutoGenerate}
                  onChange={(e) => setNewShowAutoGenerate(e.target.checked)}
                  className="w-4 h-4 accent-brand-navy cursor-pointer"
                />
                <label htmlFor="autoGenSlots" className="text-[11px] font-bold text-brand-navy cursor-pointer select-none">
                  ⚡ Auto-populate timetable roster with next 30 days of upcoming broadcast slots
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowShowModal(false)}
                  className="px-4 py-2 border font-bold uppercase text-neutral-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy cursor-pointer"
                >
                  Save Show
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* EDIT SHOW MODAL (WITH CONDITIONAL CADENCE UI)                  */}
      {/* ============================================================== */}
      {editingShow && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="border-4 border-brand-navy bg-white p-6 max-w-md w-full shadow-[8px_8px_0px_#142B4C] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2">
              <h3 className="font-display text-xl font-black uppercase text-brand-navy">
                Edit Show: {editingShow.title}
              </h3>
              <button onClick={() => setEditingShow(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateShow} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold uppercase mb-1">Show Title</label>
                <input
                  type="text"
                  required
                  value={editShowTitle}
                  onChange={(e) => setEditShowTitle(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Genre</label>
                <input
                  type="text"
                  value={editShowGenre}
                  onChange={(e) => setEditShowGenre(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Primary Host DJ</label>
                <select
                  required
                  value={editShowDjId}
                  onChange={(e) => setEditShowDjId(Number(e.target.value))}
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

              {/* Cover Image Upload */}
              <div className="space-y-1.5 p-2 bg-neutral-50 border border-brand-navy/20">
                <label className="block font-bold uppercase text-[11px]">Show Cover Artwork</label>
                <div className="flex items-center gap-2">
                  {editShowCover ? (
                    <img
                      src={editShowCover}
                      alt="Cover Preview"
                      className="w-12 h-12 object-cover border-2 border-brand-navy shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-neutral-200 border-2 border-dashed border-neutral-400 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-5 h-5 text-neutral-500" />
                    </div>
                  )}

                  <div className="flex-1 space-y-1">
                    <input
                      type="file"
                      ref={editShowCoverInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingEditShowCover(true);
                        try {
                          const url = await uploadImageFile(file);
                          setEditShowCover(url);
                        } catch (err: any) {
                          setMsg({ type: "error", text: err.message });
                        } finally {
                          setUploadingEditShowCover(false);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploadingEditShowCover}
                      onClick={() => editShowCoverInputRef.current?.click()}
                      className="px-3 py-1 bg-white border border-brand-navy hover:bg-neutral-100 font-bold uppercase text-[10px] flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{uploadingEditShowCover ? "Uploading..." : "Upload Cover"}</span>
                    </button>
                    <input
                      type="text"
                      value={editShowCover}
                      onChange={(e) => setEditShowCover(e.target.value)}
                      placeholder="Or paste artwork URL"
                      className="w-full border border-neutral-300 p-1 text-[10px]"
                    />
                  </div>
                </div>
              </div>

              {/* CONDITIONAL CADENCE FIELDS */}
              <div className="space-y-2 p-2 bg-brand-off-white/80 border-2 border-brand-navy">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold uppercase mb-1">Cadence</label>
                    <select
                      value={editShowPattern}
                      onChange={(e) => setEditShowPattern(e.target.value)}
                      className="w-full border-2 border-brand-navy p-2 bg-white font-bold"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="daily">Daily</option>
                      <option value="weekdays">Weekdays Only (Mon–Fri)</option>
                      <option value="weekends">Weekends Only (Sat–Sun)</option>
                    </select>
                  </div>

                  {editShowPattern === "daily" ? (
                    <div className="flex flex-col justify-center">
                      <span className="block font-bold uppercase mb-1 text-neutral-400">Weekday</span>
                      <div className="p-2 bg-neutral-200 border-2 border-neutral-300 text-neutral-600 font-bold text-center">
                        All Days (Mon–Sun)
                      </div>
                    </div>
                  ) : editShowPattern === "weekdays" ? (
                    <div className="flex flex-col justify-center">
                      <span className="block font-bold uppercase mb-1 text-neutral-400">Weekday</span>
                      <div className="p-2 bg-neutral-200 border-2 border-neutral-300 text-neutral-600 font-bold text-center">
                        Weekdays (Mon–Fri)
                      </div>
                    </div>
                  ) : editShowPattern === "weekends" ? (
                    <div className="flex flex-col justify-center">
                      <span className="block font-bold uppercase mb-1 text-neutral-400">Weekday</span>
                      <div className="p-2 bg-neutral-200 border-2 border-neutral-300 text-neutral-600 font-bold text-center">
                        Weekends (Sat–Sun)
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block font-bold uppercase mb-1">Weekday</label>
                      <select
                        value={editShowDay}
                        onChange={(e) => setEditShowDay(e.target.value)}
                        className="w-full border-2 border-brand-navy p-2 bg-white font-bold"
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
                  )}
                </div>

                {/* Helpful condition notice */}
                <div className="text-[11px] font-bold text-brand-navy bg-white p-2 border border-brand-navy/30">
                  {editShowPattern === "daily" && (
                    <span>📅 <strong>Daily Programming:</strong> Broadcasts every single day (Monday to Sunday) at designated air time.</span>
                  )}
                  {editShowPattern === "weekdays" && (
                    <span>📅 <strong>Weekdays Programming:</strong> Broadcasts Monday through Friday at designated air time.</span>
                  )}
                  {editShowPattern === "weekends" && (
                    <span>📅 <strong>Weekends Programming:</strong> Broadcasts Saturday and Sunday at designated air time.</span>
                  )}
                  {editShowPattern === "weekly" && (
                    <span>📅 <strong>Weekly Programming:</strong> Broadcasts every <strong>{editShowDay}</strong>.</span>
                  )}
                  {editShowPattern === "biweekly" && (
                    <span>📅 <strong>Biweekly Programming:</strong> Broadcasts every 2 weeks on <strong>{editShowDay}</strong>.</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold uppercase mb-1">Start Time (EAT)</label>
                  <input
                    type="time"
                    step="1"
                    value={editShowTime}
                    onChange={(e) => setEditShowTime(e.target.value)}
                    className="w-full border-2 border-brand-navy p-2"
                  />
                </div>

                <div>
                  <label className="block font-bold uppercase mb-1">Duration (Min)</label>
                  <input
                    type="number"
                    value={editShowDuration}
                    onChange={(e) => setEditShowDuration(e.target.value)}
                    className="w-full border-2 border-brand-navy p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Description / Concept</label>
                <textarea
                  rows={2}
                  value={editShowDescription}
                  onChange={(e) => setEditShowDescription(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                />
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Status</label>
                <select
                  value={editShowActive ? "true" : "false"}
                  onChange={(e) => setEditShowActive(e.target.value === "true")}
                  className="w-full border-2 border-brand-navy p-2 bg-white font-bold"
                >
                  <option value="true">Active (Scheduled in Timetable)</option>
                  <option value="false">Inactive (Suspended)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingShow(null)}
                  className="px-4 py-2 border font-bold uppercase text-neutral-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy cursor-pointer"
                >
                  Save Show Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* REASSIGN / SLOT EDIT MODAL                                     */}
      {/* ============================================================== */}
      {editingSlot && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
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

              {editingSlot.cover_requested && (
                <div className="p-2.5 bg-amber-50 border border-amber-400 text-amber-900 space-y-1">
                  <p className="font-black uppercase text-[10px]">DJ Cover Request Note:</p>
                  <p className="italic text-xs">"{editingSlot.cover_request_reason || "No reason specified"}"</p>
                </div>
              )}

              <div>
                <label className="block font-bold uppercase mb-1">
                  Assign Substitute / Cover DJ
                </label>
                <select
                  value={reassignSubDjId}
                  onChange={(e) => setReassignSubDjId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full border-2 border-brand-navy p-2 bg-white"
                >
                  <option value="">No substitute (Primary DJ airs)</option>
                  {presenters.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.dj_name} ({p.full_name})
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
                  <option value="warmup">Warmup</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                  <option value="noshow">No-show</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block font-bold uppercase mb-1">Internal Notes</label>
                <textarea
                  rows={2}
                  value={slotNotes}
                  onChange={(e) => setSlotNotes(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2"
                  placeholder="Programming notes..."
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSlot(null)}
                  className="px-4 py-2 border font-bold uppercase text-neutral-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-navy text-white font-display text-base uppercase border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy cursor-pointer"
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

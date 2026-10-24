"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Image as ImageIcon,
  Plus,
  Upload,
  X,
  CheckCircle,
  Loader2,
  Trash2,
  Play,
  Cloud,
  Copy,
  Check,
  Folder,
  RefreshCw,
  ExternalLink,
  Search,
  Film,
  Download,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Filter,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { isVideoMediaUrl, resolveGalleryMediaType, type GalleryMediaType } from "@/lib/gallery-media";
import { extractVideoPoster, uploadImageFile, uploadVideoFile, type ExtractedPosterMeta } from "@/lib/media-upload-client";

const TAGS = ["POSTER", "PHOTO", "RECAP", "PROMO", "FLYER", "VIDEO"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

type GalleryImage = {
  id: number;
  event_id: number;
  image_url: string;
  thumbnail_url: string;
  caption: string;
  tag: string;
  media_type?: GalleryMediaType;
};

type Event = { id: number; title: string };

export interface R2ObjectItem {
  key: string;
  url: string;
  size: number;
  lastModified: string;
  folder: string;
  filename: string;
  isImage: boolean;
  isVideo: boolean;
}

type LightboxItem = {
  type: "gallery" | "r2";
  url: string;
  poster?: string;
  isVideo: boolean;
  title: string;
  subtitle?: string;
  tag?: string;
  size?: number;
  date?: string;
  galleryId?: number;
  r2Key?: string;
  raw?: any;
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatKenyaDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("en-KE", {
      timeZone: "Africa/Nairobi",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

export default function AdminGalleryPage() {
  const [activeTab, setActiveTab] = useState<"gallery" | "r2">("gallery");

  // Gallery items state
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [eventLoadError, setEventLoadError] = useState("");

  // Curated gallery filter state
  const [galleryEventFilter, setGalleryEventFilter] = useState<string>("all");
  const [galleryTagFilter, setGalleryTagFilter] = useState<string>("all");
  const [gallerySearch, setGallerySearch] = useState<string>("");

  // Cloudflare R2 bucket state
  const [r2Objects, setR2Objects] = useState<R2ObjectItem[]>([]);
  const [r2Loading, setR2Loading] = useState(false);
  const [r2Error, setR2Error] = useState("");
  const [r2FolderFilter, setR2FolderFilter] = useState<"all" | "gallery" | "posters" | "videos">("all");
  const [r2Search, setR2Search] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deletingR2Key, setDeletingR2Key] = useState<string | null>(null);

  // Lightbox player state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxItems, setLightboxItems] = useState<LightboxItem[]>([]);

  // Form state
  const [modalMode, setModalMode] = useState<"curated" | "direct_r2">("curated");
  const [r2UploadFolder, setR2UploadFolder] = useState<"gallery" | "posters" | "videos">("gallery");
  const [eventId, setEventId] = useState("");
  const [caption, setCaption] = useState("");
  const [tag, setTag] = useState("PHOTO");
  const [imageUrl, setImageUrl] = useState(""); // manual URL fallback
  const [urlMode, setUrlMode] = useState(false);
  const [mediaType, setMediaType] = useState<GalleryMediaType>("image");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Release the object URL when preview unmounts or replaces
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Load curated gallery + events
  const loadGallery = useCallback(async () => {
    try {
      const [galleryRes, eventsRes] = await Promise.all([
        fetch("/api/hub/gallery").then((r) => r.json()).catch(() => []),
        fetch("/api/events").then(async (r) => {
          const body = await r.json().catch(() => null);
          if (!r.ok) {
            throw new Error(
              (body && (body.error || body.message)) || `Events request failed (HTTP ${r.status})`
            );
          }
          return body;
        }),
      ]);

      const imgs = Array.isArray(galleryRes) ? galleryRes : galleryRes?.images || [];
      const evts: Event[] = Array.isArray(eventsRes)
        ? eventsRes
        : (eventsRes as any)?.events || [];

      setImages(imgs);
      setEvents(evts);
      setEventLoadError("");

      if (evts.length > 0) {
        const preferred = evts.find((e: any) => e.is_active) || evts[0];
        setEventId(String(preferred.id));
      } else {
        setEventId("");
      }
    } catch (err: any) {
      setImages([]);
      setEvents([]);
      setEventId("");
      setEventLoadError(err?.message || "Could not load the event list.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Cloudflare R2 bucket items
  const loadR2Objects = useCallback(async () => {
    setR2Loading(true);
    setR2Error("");
    try {
      const res = await fetch("/api/admin/r2");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Failed to list R2 bucket (HTTP ${res.status})`);
      }
      setR2Objects(Array.isArray(data?.objects) ? data.objects : []);
    } catch (err: any) {
      console.error("Error loading R2 objects:", err);
      setR2Error(err?.message || "Could not load Cloudflare bucket items.");
      setR2Objects([]);
    } finally {
      setR2Loading(false);
    }
  }, []);

  useEffect(() => {
    loadGallery();
    loadR2Objects();
  }, [loadGallery, loadR2Objects]);

  // File pick / drag-drop
  const handleFile = (f: File) => {
    const isVideo = f.type.startsWith("video/") || isVideoMediaUrl(f.name);
    const isImage = f.type.startsWith("image/");

    if (!isImage && !isVideo) {
      setUploadError("Please select an image or video file.");
      return;
    }
    if (isVideo && f.size > MAX_VIDEO_BYTES) {
      setUploadError("Max 150 MB per video.");
      return;
    }
    if (isImage && f.size > MAX_IMAGE_BYTES) {
      setUploadError("Max 10 MB per image.");
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setMediaType(isVideo ? "video" : "image");
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setUploadError("");
    setUrlMode(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setUploadError("");
    setUploadProgress(null);
    try {
      let finalUrl = imageUrl.trim();
      let thumbnailUrl = "";
      const effectiveType: GalleryMediaType = urlMode
        ? isVideoMediaUrl(finalUrl)
          ? "video"
          : "image"
        : mediaType;

      if (!urlMode && file) {
        setUploading(true);
        const folderTarget = modalMode === "direct_r2" ? r2UploadFolder : "gallery";
        if (effectiveType === "video") {
          const posterPromise = extractVideoPoster(file).catch((): ExtractedPosterMeta => ({}));
          finalUrl = await uploadVideoFile(
            file,
            (percent) => setUploadProgress(percent),
            folderTarget === "posters" ? "gallery" : folderTarget
          );
          const meta = await posterPromise;
          thumbnailUrl = meta.poster_url || "";
        } else {
          finalUrl = await uploadImageFile(file, folderTarget === "videos" ? "gallery" : folderTarget);
        }
        setUploading(false);
      }

      if (!finalUrl) {
        setUploadError("Please pick a file or enter a URL.");
        setSaving(false);
        return;
      }

      // If Direct R2 Upload mode, just upload and refresh R2
      if (modalMode === "direct_r2") {
        if (preview) URL.revokeObjectURL(preview);
        setFile(null);
        setPreview(null);
        setImageUrl("");
        setShowModal(false);
        await loadR2Objects();
        return;
      }

      // Curated Gallery mode: requires an event assignment
      if (!eventId) {
        setUploadError(
          eventLoadError
            ? "Could not load the event list, so there is nothing to file this under. Close the dialog and retry."
            : "Please choose an event for this item."
        );
        setSaving(false);
        return;
      }

      const res = await fetch("/api/hub/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: parseInt(eventId),
          image_url: finalUrl,
          thumbnail_url: thumbnailUrl || undefined,
          caption: caption.trim(),
          tag,
          media_type: effectiveType,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to save media");
      }

      // Reset + reload both curated gallery and Cloudflare R2 list
      if (preview) URL.revokeObjectURL(preview);
      setFile(null);
      setPreview(null);
      setCaption("");
      setImageUrl("");
      setTag("PHOTO");
      setMediaType("image");
      setShowModal(false);
      await Promise.all([loadGallery(), loadR2Objects()]);
    } catch (err: any) {
      setUploadError(err.message || "Something went wrong.");
      setUploading(false);
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  // Delete from Curated Event Gallery (also cleans up Cloudflare R2 file)
  const handleDelete = async (id: number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this gallery item? If hosted on Cloudflare R2, it will also be permanently deleted from storage."
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/hub/gallery?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to delete image");
      }
      if (lightboxIndex !== null) {
        setLightboxIndex(null);
      }
      await Promise.all([loadGallery(), loadR2Objects()]);
    } catch (err: any) {
      alert(err.message || "Failed to delete image");
    } finally {
      setDeletingId(null);
    }
  };

  // Delete directly from Cloudflare R2 bucket
  const handleDeleteR2 = async (key: string) => {
    if (!window.confirm(`Permanently delete "${key}" from Cloudflare R2 bucket? This cannot be undone.`)) {
      return;
    }
    setDeletingR2Key(key);
    try {
      const res = await fetch(`/api/admin/r2?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete file from Cloudflare R2");
      }
      setR2Objects((prev) => prev.filter((o) => o.key !== key));
      if (lightboxIndex !== null) {
        setLightboxIndex(null);
      }
      loadGallery();
    } catch (err: any) {
      alert(err.message || "Failed to delete file from Cloudflare R2");
    } finally {
      setDeletingR2Key(null);
    }
  };

  // Copy public URL to clipboard
  const handleCopyUrl = (url: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      });
    }
  };

  // Quick Add an existing R2 item to an Event Gallery
  const handleQuickAddToEvent = (obj: R2ObjectItem) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setImageUrl(obj.url);
    setUrlMode(true);
    setModalMode("curated");
    setCaption(obj.filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    setTag(obj.isVideo ? "VIDEO" : obj.folder === "posters" ? "POSTER" : "PHOTO");
    setMediaType(obj.isVideo ? "video" : "image");
    setUploadError("");
    setUploading(false);
    setShowModal(true);
  };

  const openModal = (mode: "curated" | "direct_r2" = "curated") => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setCaption("");
    setImageUrl("");
    setTag("PHOTO");
    setUploadError("");
    setUrlMode(false);
    setUploading(false);
    setUploadProgress(null);
    setMediaType("image");
    setModalMode(mode);
    setShowModal(true);
  };

  const visibleImages = images.filter(
    (img) => !img.image_url?.includes("photo-1540039155732") && !img.image_url?.includes("photo-1470229722913")
  );

  // Filter curated gallery items
  const filteredCuratedImages = visibleImages.filter((img) => {
    if (galleryEventFilter !== "all" && String(img.event_id) !== galleryEventFilter) {
      return false;
    }
    if (galleryTagFilter !== "all" && img.tag !== galleryTagFilter) {
      return false;
    }
    if (gallerySearch.trim()) {
      const q = gallerySearch.toLowerCase().trim();
      const captionMatch = (img.caption || "").toLowerCase().includes(q);
      const eventMatch = (events.find((e) => e.id === img.event_id)?.title || "").toLowerCase().includes(q);
      const tagMatch = (img.tag || "").toLowerCase().includes(q);
      return captionMatch || eventMatch || tagMatch;
    }
    return true;
  });

  // Filter R2 objects
  const filteredR2Objects = r2Objects.filter((obj) => {
    if (r2FolderFilter !== "all" && obj.folder !== r2FolderFilter) return false;
    if (r2Search.trim()) {
      const q = r2Search.toLowerCase().trim();
      return obj.filename.toLowerCase().includes(q) || obj.key.toLowerCase().includes(q);
    }
    return true;
  });

  // Open Lightbox for Curated Gallery
  const openCuratedLightbox = (index: number) => {
    const items: LightboxItem[] = filteredCuratedImages.map((img) => {
      const isVideo = resolveGalleryMediaType(img.media_type, img.image_url) === "video";
      const poster = img.thumbnail_url && !isVideoMediaUrl(img.thumbnail_url) ? img.thumbnail_url : "";
      return {
        type: "gallery",
        url: img.image_url,
        poster,
        isVideo,
        title: img.caption || "Festival Highlight",
        subtitle: events.find((e) => e.id === img.event_id)?.title || `Event #${img.event_id}`,
        tag: img.tag,
        galleryId: img.id,
        raw: img,
      };
    });
    setLightboxItems(items);
    setLightboxIndex(index);
  };

  // Open Lightbox for R2 Bucket Media
  const openR2Lightbox = (index: number) => {
    const items: LightboxItem[] = filteredR2Objects.map((obj) => {
      return {
        type: "r2",
        url: obj.url,
        isVideo: obj.isVideo,
        title: obj.filename,
        subtitle: `Cloudflare Folder: ${obj.folder.toUpperCase()}`,
        tag: obj.folder.toUpperCase(),
        size: obj.size,
        date: obj.lastModified,
        r2Key: obj.key,
        raw: obj,
      };
    });
    setLightboxItems(items);
    setLightboxIndex(index);
  };

  const handlePrevLightbox = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : lightboxItems.length - 1));
  }, [lightboxItems.length]);

  const handleNextLightbox = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null && prev < lightboxItems.length - 1 ? prev + 1 : 0));
  }, [lightboxItems.length]);

  // Keyboard controls for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") handlePrevLightbox();
      if (e.key === "ArrowRight") handleNextLightbox();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex, handlePrevLightbox, handleNextLightbox]);

  const currentLightboxItem: LightboxItem | null =
    lightboxIndex !== null && lightboxItems[lightboxIndex] ? lightboxItems[lightboxIndex] : null;

  const totalR2Bytes = r2Objects.reduce((acc, o) => acc + (o.size || 0), 0);
  const galleryFolderCount = r2Objects.filter((o) => o.folder === "gallery").length;
  const postersFolderCount = r2Objects.filter((o) => o.folder === "posters").length;
  const videosFolderCount = r2Objects.filter((o) => o.folder === "videos").length;

  return (
    <div className="w-full min-h-screen bg-brand-off-white text-brand-navy p-4 md:p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-8 border-brand-navy pb-6 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/admin/dashboard"
                className="p-2 border-2 border-brand-navy bg-white hover:bg-brand-accent transition-colors font-bold"
              >
                ←
              </Link>
              <h1 className="font-display text-3xl md:text-4xl uppercase tracking-wider flex items-center gap-3">
                <ImageIcon className="w-7 h-7 text-brand-accent" />
                Media &amp; Gallery Hub
              </h1>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-xs font-bold uppercase tracking-widest opacity-80">
              <span className="flex items-center gap-1.5 text-emerald-800 bg-emerald-100 border border-emerald-500 px-2 py-0.5">
                <Cloud className="w-3.5 h-3.5 text-emerald-600" /> Cloudflare R2 Connected
              </span>
              <span>·</span>
              <span>{visibleImages.length} Curated Item{visibleImages.length !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span>{r2Objects.length} Bucket Object{r2Objects.length !== 1 ? "s" : ""} ({formatBytes(totalR2Bytes)})</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                loadGallery();
                loadR2Objects();
              }}
              title="Refresh Media"
              className="p-3 bg-white border-4 border-brand-navy shadow-(--shadow-brut-sm) hover:bg-brand-accent transition-colors font-bold cursor-pointer"
            >
              <RefreshCw className={`w-5 h-5 ${loading || r2Loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => openModal(activeTab === "r2" ? "direct_r2" : "curated")}
              className="flex items-center gap-2 bg-brand-accent text-brand-navy px-5 py-3 border-4 border-brand-navy shadow-(--shadow-brut-md) hover:bg-brand-navy hover:text-brand-accent font-bold uppercase transition-colors cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              {activeTab === "r2" ? "Upload to Bucket" : "Add Gallery Media"}
            </button>
          </div>
        </header>

        {/* View Switcher Tabs */}
        <div className="flex border-4 border-brand-navy bg-white p-1 gap-1 max-w-md shadow-(--shadow-brut-sm)">
          <button
            type="button"
            onClick={() => setActiveTab("gallery")}
            className={`flex-1 py-2.5 px-3 font-bold uppercase text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "gallery"
                ? "bg-brand-navy text-brand-off-white"
                : "text-brand-navy hover:bg-brand-navy/10"
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Curated Gallery ({visibleImages.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("r2")}
            className={`flex-1 py-2.5 px-3 font-bold uppercase text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "r2"
                ? "bg-brand-navy text-brand-off-white"
                : "text-brand-navy hover:bg-brand-navy/10"
            }`}
          >
            <Cloud className="w-4 h-4 text-brand-accent" />
            Cloudflare R2 Bucket ({r2Objects.length})
          </button>
        </div>

        {/* ── TAB 1: CURATED EVENT GALLERY ─────────────────────────── */}
        {activeTab === "gallery" && (
          <div className="space-y-4">
            {/* Filter toolbar */}
            <div className="bg-white border-4 border-brand-navy p-4 shadow-(--shadow-brut-sm) flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Event Selector */}
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-brand-navy/60" />
                  <select
                    value={galleryEventFilter}
                    onChange={(e) => setGalleryEventFilter(e.target.value)}
                    className="p-1.5 border-2 border-brand-navy text-xs font-bold bg-white focus:outline-none"
                  >
                    <option value="all">All Events ({visibleImages.length})</option>
                    {events.map((ev) => {
                      const count = visibleImages.filter((img) => img.event_id === ev.id).length;
                      return (
                        <option key={ev.id} value={String(ev.id)}>
                          {ev.title} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Tag Pills */}
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] font-bold uppercase opacity-60 ml-1">Tag:</span>
                  <button
                    type="button"
                    onClick={() => setGalleryTagFilter("all")}
                    className={`px-2.5 py-1 border border-brand-navy text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                      galleryTagFilter === "all"
                        ? "bg-brand-navy text-brand-off-white"
                        : "bg-white text-brand-navy hover:bg-brand-accent/40"
                    }`}
                  >
                    All
                  </button>
                  {TAGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setGalleryTagFilter(t)}
                      className={`px-2.5 py-1 border border-brand-navy text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                        galleryTagFilter === t
                          ? "bg-brand-navy text-brand-off-white"
                          : "bg-white text-brand-navy hover:bg-brand-accent/40"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                <input
                  type="text"
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  placeholder="Search caption or event…"
                  className="w-full pl-9 pr-7 py-1.5 border-2 border-brand-navy text-xs font-bold focus:outline-none focus:bg-brand-accent/20"
                />
                {gallerySearch && (
                  <button
                    type="button"
                    onClick={() => setGallerySearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-navy/60 hover:text-brand-navy"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-3 font-bold uppercase text-lg py-16 justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-brand-accent" /> Loading Gallery…
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredCuratedImages.map((img, index) => {
                  const isVideo = resolveGalleryMediaType(img.media_type, img.image_url) === "video";
                  const poster = img.thumbnail_url && !isVideoMediaUrl(img.thumbnail_url) ? img.thumbnail_url : "";
                  return (
                    <div
                      key={img.id}
                      className="bg-white border-4 border-brand-navy shadow-(--shadow-brut-md) flex flex-col group relative"
                    >
                      {/* Media container - Click to open Lightbox player */}
                      <div
                        onClick={() => openCuratedLightbox(index)}
                        className="aspect-square bg-brand-navy/10 overflow-hidden relative cursor-pointer select-none"
                        title="Click to view & play in Theater Lightbox"
                        onMouseEnter={(e) => {
                          const v = e.currentTarget.querySelector("video");
                          if (v) v.play().catch(() => {});
                        }}
                        onMouseLeave={(e) => {
                          const v = e.currentTarget.querySelector("video");
                          if (v) {
                            v.pause();
                            v.currentTime = 0;
                          }
                        }}
                      >
                        {isVideo ? (
                          poster ? (
                            <img
                              src={poster}
                              alt={img.caption}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <video
                              src={img.image_url}
                              muted
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          )
                        ) : (
                          <img
                            src={img.image_url}
                            alt={img.caption}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        )}

                        {isVideo && (
                          <>
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="bg-brand-navy/80 text-brand-off-white border-2 border-brand-off-white p-3 shadow-md group-hover:bg-brand-accent group-hover:text-brand-navy transition-colors">
                                <Play className="w-6 h-6" />
                              </span>
                            </div>
                            <span className="absolute bottom-2 left-2 bg-brand-accent text-brand-navy border-2 border-brand-navy text-[9px] font-black px-1.5 py-0.5 uppercase pointer-events-none">
                              VIDEO
                            </span>
                          </>
                        )}

                        {/* Top action overlay */}
                        <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyUrl(img.image_url, `gallery-${img.id}`);
                            }}
                            className="bg-white text-brand-navy p-2 border-2 border-brand-navy shadow-(--shadow-brut-sm) hover:bg-brand-accent transition-colors cursor-pointer"
                            title="Copy media URL"
                          >
                            {copiedKey === `gallery-${img.id}` ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(img.id);
                            }}
                            disabled={deletingId === img.id}
                            className="bg-red-600 text-white p-2 border-2 border-brand-navy shadow-(--shadow-brut-sm) hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors"
                            title={isVideo ? "Delete video" : "Delete image"}
                          >
                            {deletingId === img.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {/* View full hint */}
                        <div className="absolute bottom-2 right-2 bg-brand-navy/90 text-brand-off-white border border-brand-off-white px-2 py-0.5 text-[9px] font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <Maximize2 className="w-2.5 h-2.5" /> Open
                        </div>
                      </div>

                      <div className="p-3 flex items-start justify-between gap-2 border-t-2 border-brand-navy">
                        <div className="min-w-0">
                          <div className="font-bold text-sm uppercase truncate">{img.caption || "No Caption"}</div>
                          <div className="text-[10px] uppercase font-bold opacity-60 mt-0.5">
                            {events.find((e) => e.id === img.event_id)?.title || `Event ${img.event_id}`}
                          </div>
                        </div>
                        <span className="bg-brand-navy text-brand-off-white text-[9px] font-bold px-2 py-1 uppercase shrink-0">
                          {img.tag}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {filteredCuratedImages.length === 0 && (
                  <div className="col-span-full py-16 text-center border-4 border-dashed border-brand-navy font-bold uppercase text-lg opacity-60 bg-white">
                    No curated gallery media found matching your filter.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: CLOUDFLARE R2 BUCKET BROWSER ──────────────────── */}
        {activeTab === "r2" && (
          <div className="space-y-4">
            {/* Filter and search toolbar */}
            <div className="bg-white border-4 border-brand-navy p-4 shadow-(--shadow-brut-sm) flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider mr-1 opacity-70">Folder:</span>
                <button
                  type="button"
                  onClick={() => setR2FolderFilter("all")}
                  className={`px-3 py-1.5 border-2 border-brand-navy text-xs font-bold uppercase transition-colors cursor-pointer ${
                    r2FolderFilter === "all"
                      ? "bg-brand-navy text-brand-off-white"
                      : "bg-white hover:bg-brand-accent"
                  }`}
                >
                  All ({r2Objects.length})
                </button>
                <button
                  type="button"
                  onClick={() => setR2FolderFilter("gallery")}
                  className={`px-3 py-1.5 border-2 border-brand-navy text-xs font-bold uppercase transition-colors cursor-pointer ${
                    r2FolderFilter === "gallery"
                      ? "bg-brand-navy text-brand-off-white"
                      : "bg-white hover:bg-brand-accent"
                  }`}
                >
                  Gallery ({galleryFolderCount})
                </button>
                <button
                  type="button"
                  onClick={() => setR2FolderFilter("posters")}
                  className={`px-3 py-1.5 border-2 border-brand-navy text-xs font-bold uppercase transition-colors cursor-pointer ${
                    r2FolderFilter === "posters"
                      ? "bg-brand-navy text-brand-off-white"
                      : "bg-white hover:bg-brand-accent"
                  }`}
                >
                  Posters ({postersFolderCount})
                </button>
                <button
                  type="button"
                  onClick={() => setR2FolderFilter("videos")}
                  className={`px-3 py-1.5 border-2 border-brand-navy text-xs font-bold uppercase transition-colors cursor-pointer ${
                    r2FolderFilter === "videos"
                      ? "bg-brand-navy text-brand-off-white"
                      : "bg-white hover:bg-brand-accent"
                  }`}
                >
                  Videos ({videosFolderCount})
                </button>
              </div>

              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                <input
                  type="text"
                  value={r2Search}
                  onChange={(e) => setR2Search(e.target.value)}
                  placeholder="Filter files…"
                  className="w-full pl-9 pr-3 py-1.5 border-2 border-brand-navy text-xs font-bold focus:outline-none focus:bg-brand-accent/20"
                />
              </div>
            </div>

            {r2Error && (
              <div className="bg-red-100 border-4 border-red-600 text-red-800 p-4 font-bold text-xs uppercase">
                {r2Error}
              </div>
            )}

            {/* Bucket Grid */}
            {r2Loading ? (
              <div className="flex items-center gap-3 font-bold uppercase text-lg py-16 justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-brand-accent" /> Loading Cloudflare Bucket Media…
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredR2Objects.map((obj, index) => (
                  <div
                    key={obj.key}
                    className="bg-white border-4 border-brand-navy shadow-(--shadow-brut-md) flex flex-col group relative"
                  >
                    {/* Media preview - Click to open Lightbox player */}
                    <div
                      onClick={() => openR2Lightbox(index)}
                      className="aspect-square bg-stone-100 overflow-hidden relative border-b-2 border-brand-navy flex items-center justify-center cursor-pointer select-none"
                      title="Click to view & play in Theater Lightbox"
                      onMouseEnter={(e) => {
                        const v = e.currentTarget.querySelector("video");
                        if (v) v.play().catch(() => {});
                      }}
                      onMouseLeave={(e) => {
                        const v = e.currentTarget.querySelector("video");
                        if (v) {
                          v.pause();
                          v.currentTime = 0;
                        }
                      }}
                    >
                      {obj.isImage ? (
                        <img
                          src={obj.url}
                          alt={obj.filename}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : obj.isVideo ? (
                        <div className="w-full h-full bg-brand-navy/90 flex flex-col items-center justify-center relative">
                          <video
                            src={obj.url}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="bg-brand-navy/80 text-brand-off-white border-2 border-brand-off-white p-3 shadow-md group-hover:bg-brand-accent group-hover:text-brand-navy transition-colors">
                              <Play className="w-6 h-6" />
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                          <Folder className="w-12 h-12 opacity-40 text-brand-navy" />
                          <span className="text-xs font-bold uppercase">{obj.filename}</span>
                        </div>
                      )}

                      {/* Folder badge */}
                      <span className="absolute top-2 left-2 bg-brand-navy text-brand-off-white border-2 border-brand-navy text-[9px] font-black px-2 py-0.5 uppercase">
                        {obj.folder}
                      </span>

                      {/* Delete button on hover */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteR2(obj.key);
                        }}
                        disabled={deletingR2Key === obj.key}
                        className="absolute top-2 right-2 bg-red-600 text-white p-2 border-2 border-brand-navy shadow-(--shadow-brut-sm) opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                        title="Delete from Cloudflare R2"
                      >
                        {deletingR2Key === obj.key ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>

                      {/* Open lightbox hint */}
                      <div className="absolute bottom-2 right-2 bg-brand-navy/90 text-brand-off-white border border-brand-off-white px-2 py-0.5 text-[9px] font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <Maximize2 className="w-2.5 h-2.5" /> Play / View
                      </div>
                    </div>

                    {/* Metadata & Actions */}
                    <div className="p-3 flex flex-col justify-between flex-1 gap-3">
                      <div>
                        <div className="font-bold text-xs uppercase truncate" title={obj.filename}>
                          {obj.filename}
                        </div>
                        <div className="flex items-center justify-between text-[10px] uppercase font-bold opacity-60 mt-1">
                          <span>{formatBytes(obj.size)}</span>
                          <span>{formatKenyaDate(obj.lastModified)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-brand-navy/20">
                        <button
                          type="button"
                          onClick={() => handleCopyUrl(obj.url, obj.key)}
                          className="flex-1 py-1.5 px-2 bg-stone-100 hover:bg-brand-accent border-2 border-brand-navy text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Copy Public URL"
                        >
                          {copiedKey === obj.key ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-700" /> Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy URL
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleQuickAddToEvent(obj)}
                          className="flex-1 py-1.5 px-2 bg-brand-accent text-brand-navy hover:bg-brand-navy hover:text-brand-accent border-2 border-brand-navy text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          title="Attach to an Event Gallery"
                        >
                          <Plus className="w-3 h-3" /> Tag Event
                        </button>

                        <a
                          href={obj.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 bg-white hover:bg-brand-navy hover:text-white border-2 border-brand-navy transition-colors shrink-0"
                          title="Open original"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}

                {filteredR2Objects.length === 0 && (
                  <div className="col-span-full py-16 text-center border-4 border-dashed border-brand-navy font-bold uppercase text-lg opacity-60 bg-white">
                    No files found in Cloudflare R2 bucket matching your filter.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── THEATER LIGHTBOX MODAL ───────────────────────────────────── */}
      {currentLightboxItem && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col p-3 md:p-6 select-none animate-in fade-in duration-200"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Top Control Bar */}
          <div
            className="flex items-center justify-between gap-4 pb-3 border-b-2 border-white/20 text-white shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="bg-brand-accent text-brand-navy text-[11px] font-black px-2 py-0.5 uppercase border border-brand-navy shrink-0">
                {currentLightboxItem.isVideo ? "VIDEO" : "PHOTO"}
              </span>
              <h2 className="font-display text-lg md:text-xl uppercase tracking-wider truncate text-white">
                {currentLightboxItem.title}
              </h2>
              {currentLightboxItem.subtitle && (
                <span className="hidden sm:inline-block text-xs font-mono opacity-60 truncate">
                  · {currentLightboxItem.subtitle}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-mono opacity-70">
                {lightboxIndex + 1} / {lightboxItems.length}
              </span>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="p-1.5 bg-white/10 hover:bg-white text-white hover:text-brand-navy border border-white/30 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Center Stage with Prev / Next */}
          <div
            className="flex-1 relative flex items-center justify-center min-h-0 my-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Prev Button */}
            {lightboxItems.length > 1 && (
              <button
                type="button"
                onClick={handlePrevLightbox}
                className="absolute left-2 md:left-4 z-10 p-3 bg-brand-navy/80 hover:bg-brand-accent text-white hover:text-brand-navy border-2 border-white/50 transition-colors cursor-pointer shadow-lg"
                title="Previous (Left Arrow)"
              >
                <ChevronLeft className="w-6 h-6 md:w-8 md:h-8" />
              </button>
            )}

            {/* Media Player */}
            <div className="max-w-full max-h-[72vh] flex items-center justify-center">
              {currentLightboxItem.isVideo ? (
                <video
                  key={currentLightboxItem.url}
                  src={currentLightboxItem.url}
                  poster={currentLightboxItem.poster}
                  controls
                  autoPlay
                  playsInline
                  loop
                  preload="auto"
                  className="max-w-full max-h-[72vh] object-contain border-4 border-brand-navy shadow-2xl bg-black"
                />
              ) : (
                <img
                  key={currentLightboxItem.url}
                  src={currentLightboxItem.url}
                  alt={currentLightboxItem.title}
                  className="max-w-full max-h-[72vh] object-contain border-4 border-brand-navy shadow-2xl"
                />
              )}
            </div>

            {/* Next Button */}
            {lightboxItems.length > 1 && (
              <button
                type="button"
                onClick={handleNextLightbox}
                className="absolute right-2 md:right-4 z-10 p-3 bg-brand-navy/80 hover:bg-brand-accent text-white hover:text-brand-navy border-2 border-white/50 transition-colors cursor-pointer shadow-lg"
                title="Next (Right Arrow)"
              >
                <ChevronRight className="w-6 h-6 md:w-8 md:h-8" />
              </button>
            )}
          </div>

          {/* Bottom Action & Metadata Toolbar */}
          <div
            className="border-t-2 border-white/20 pt-3 text-white flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-mono opacity-80 flex items-center gap-3 flex-wrap">
              {currentLightboxItem.size && (
                <span>Size: <strong className="text-brand-accent">{formatBytes(currentLightboxItem.size)}</strong></span>
              )}
              {currentLightboxItem.date && (
                <span>Updated: {formatKenyaDate(currentLightboxItem.date)}</span>
              )}
              {currentLightboxItem.tag && (
                <span className="bg-white/20 text-white px-2 py-0.5 text-[10px] uppercase font-bold">
                  {currentLightboxItem.tag}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Copy URL */}
              <button
                type="button"
                onClick={() => handleCopyUrl(currentLightboxItem.url, "lightbox-copy")}
                className="px-3 py-1.5 bg-white/10 hover:bg-white text-white hover:text-brand-navy border border-white/40 text-xs font-bold uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {copiedKey === "lightbox-copy" ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy Link
                  </>
                )}
              </button>

              {/* Tag to Event (if R2 item) */}
              {currentLightboxItem.type === "r2" && currentLightboxItem.raw && (
                <button
                  type="button"
                  onClick={() => {
                    const rawObj = currentLightboxItem.raw;
                    setLightboxIndex(null);
                    handleQuickAddToEvent(rawObj);
                  }}
                  className="px-3 py-1.5 bg-brand-accent text-brand-navy hover:bg-white border-2 border-brand-navy text-xs font-bold uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Tag Event
                </button>
              )}

              {/* Download High-Res */}
              <a
                href={currentLightboxItem.url}
                download
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-white/10 hover:bg-white text-white hover:text-brand-navy border border-white/40 text-xs font-bold uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>

              {/* Delete item */}
              <button
                type="button"
                onClick={() => {
                  if (currentLightboxItem.type === "gallery" && currentLightboxItem.galleryId) {
                    handleDelete(currentLightboxItem.galleryId);
                  } else if (currentLightboxItem.type === "r2" && currentLightboxItem.r2Key) {
                    handleDeleteR2(currentLightboxItem.r2Key);
                  }
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white border border-red-400 text-xs font-bold uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD MEDIA / UPLOAD MODAL ─────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-brand-navy/80 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-brand-off-white border-4 border-brand-navy w-full max-w-lg shadow-(--shadow-brut-2xl) max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b-4 border-brand-navy px-6 py-4 bg-brand-navy text-brand-off-white">
              <h2 className="font-display text-2xl uppercase tracking-wider flex items-center gap-2">
                <Cloud className="w-5 h-5 text-brand-accent" />
                {modalMode === "direct_r2" ? "Upload Directly to Cloudflare R2" : "Add Gallery Media"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:text-brand-accent transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Mode switch */}
              <div className="flex border-2 border-brand-navy p-1 bg-white gap-1">
                <button
                  type="button"
                  onClick={() => setModalMode("curated")}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase transition-colors cursor-pointer ${
                    modalMode === "curated"
                      ? "bg-brand-navy text-brand-off-white"
                      : "text-brand-navy hover:bg-brand-accent/20"
                  }`}
                >
                  Attach to Event Gallery
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode("direct_r2")}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase transition-colors cursor-pointer ${
                    modalMode === "direct_r2"
                      ? "bg-brand-navy text-brand-off-white"
                      : "text-brand-navy hover:bg-brand-accent/20"
                  }`}
                >
                  Direct Cloudflare Storage
                </button>
              </div>

              {/* Event picker (for curated mode) */}
              {modalMode === "curated" ? (
                <div>
                  <label className="block text-xs font-bold uppercase mb-2 tracking-widest">
                    Target Event
                  </label>
                  {events.length === 0 ? (
                    <>
                      <select
                        value=""
                        disabled
                        className="w-full p-3 border-4 border-brand-navy bg-stone-100 text-stone-500 font-bold text-sm cursor-not-allowed"
                      >
                        <option value="">No events available</option>
                      </select>
                      {eventLoadError ? (
                        <p className="mt-2 text-xs font-bold uppercase text-red-700">
                          Could not load events: {eventLoadError}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs font-bold uppercase text-stone-500">
                          No events exist yet. Create an event in the dashboard first.
                        </p>
                      )}
                    </>
                  ) : (
                    <select
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                      className="w-full p-3 border-4 border-brand-navy bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-bold text-sm cursor-pointer"
                    >
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                /* Target Folder selector (for direct R2 mode) */
                <div>
                  <label className="block text-xs font-bold uppercase mb-2 tracking-widest">
                    Destination Folder
                  </label>
                  <div className="flex gap-2">
                    {(["gallery", "posters", "videos"] as const).map((folder) => (
                      <button
                        key={folder}
                        type="button"
                        onClick={() => setR2UploadFolder(folder)}
                        className={`flex-1 py-2 border-2 border-brand-navy text-xs font-bold uppercase transition-colors cursor-pointer ${
                          r2UploadFolder === folder
                            ? "bg-brand-navy text-brand-off-white"
                            : "bg-white text-brand-navy hover:bg-brand-accent"
                        }`}
                      >
                        {folder}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload / URL toggle */}
              <div>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setUrlMode(false)}
                    className={`flex-1 py-2 border-2 border-brand-navy text-xs font-bold uppercase transition-colors cursor-pointer ${
                      !urlMode ? "bg-brand-navy text-brand-off-white" : "bg-white hover:bg-brand-accent"
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5 inline mr-1" /> Direct Upload (R2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrlMode(true)}
                    className={`flex-1 py-2 border-2 border-brand-navy text-xs font-bold uppercase transition-colors cursor-pointer ${
                      urlMode ? "bg-brand-navy text-brand-off-white" : "bg-white hover:bg-brand-accent"
                    }`}
                  >
                    🔗 Media URL
                  </button>
                </div>

                {urlMode ? (
                  <>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://pub-...r2.dev/gallery/photo.jpg or video.mp4"
                      className="w-full p-3 border-4 border-brand-navy bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-bold text-sm"
                    />
                    <p className="mt-2 text-[10px] font-bold uppercase opacity-60">
                      Supports direct Cloudflare R2 URLs, external CDN links, or MP4/WEBM video URLs.
                    </p>
                  </>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-4 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 p-8 ${
                      dragging
                        ? "border-brand-navy bg-brand-accent/30"
                        : "border-brand-navy/40 hover:border-brand-navy hover:bg-brand-accent/10"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                    />
                    {preview ? (
                      <>
                        {mediaType === "video" ? (
                          <video
                            src={preview}
                            controls
                            muted
                            playsInline
                            className="max-h-40 object-contain border-2 border-brand-navy"
                          />
                        ) : (
                          <img
                            src={preview}
                            alt="preview"
                            className="max-h-40 object-contain border-2 border-brand-navy"
                          />
                        )}
                        <span className="text-xs font-bold uppercase opacity-70">
                          {file?.name} · {mediaType === "video" ? "VIDEO" : "IMAGE"}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (preview) URL.revokeObjectURL(preview);
                            setFile(null);
                            setPreview(null);
                            setMediaType("image");
                          }}
                          className="absolute top-2 right-2 bg-red-600 text-white p-1 hover:bg-red-700 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 opacity-40 text-brand-navy" />
                        <div className="text-center">
                          <div className="font-bold uppercase text-sm">Drop image or video here</div>
                          <div className="text-xs opacity-60 mt-1">
                            Uploaded directly to Cloudflare R2 bucket · JPG, PNG, WEBP, MP4, MOV · Images up to 10 MB · Videos up to 150 MB
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Upload progress */}
              {uploadProgress !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold uppercase">
                    <span>Uploading to Cloudflare R2…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-3 bg-brand-navy/20 border-2 border-brand-navy">
                    <div
                      className="h-full bg-brand-accent transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Caption & Tag (curated mode only) */}
              {modalMode === "curated" && (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase mb-2 tracking-widest">
                      Caption / Title
                    </label>
                    <input
                      type="text"
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Official Festival Poster / Stage Highlights"
                      className="w-full p-3 border-4 border-brand-navy bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-bold text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase mb-2 tracking-widest">Tag</label>
                    <div className="flex flex-wrap gap-2">
                      {TAGS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTag(t)}
                          className={`px-3 py-1.5 border-2 border-brand-navy text-xs font-bold uppercase transition-colors cursor-pointer ${
                            tag === t ? "bg-brand-navy text-brand-off-white" : "bg-white hover:bg-brand-accent"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Error */}
              {uploadError && (
                <div className="bg-red-100 border-2 border-red-600 text-red-700 text-xs font-bold uppercase px-4 py-3">
                  {uploadError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 bg-white border-4 border-brand-navy font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading || (!file && !imageUrl.trim())}
                  className="flex-1 px-4 py-3 bg-brand-accent text-brand-navy border-4 border-brand-navy font-bold uppercase hover:bg-brand-navy hover:text-brand-accent shadow-(--shadow-brut-md) transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Uploading to R2…
                    </>
                  ) : saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      {modalMode === "direct_r2" ? "Upload to Storage" : "Save Media"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

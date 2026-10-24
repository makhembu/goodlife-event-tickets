"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Image as ImageIcon, Plus, Upload, X, CheckCircle, Loader2, Trash2, Play } from "lucide-react";
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

export default function AdminGalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  // Separate from `uploadError`: this is "the picker has nothing to offer",
  // which must not be confused with "your upload failed".
  const [eventLoadError, setEventLoadError] = useState("");

  // form state
  const [eventId, setEventId] = useState("");
  const [caption, setCaption] = useState("");
  const [tag, setTag] = useState("PHOTO");
  const [imageUrl, setImageUrl] = useState(""); // manual URL fallback
  const [urlMode, setUrlMode] = useState(false);
  const [mediaType, setMediaType] = useState<GalleryMediaType>("image");

  // upload state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Release the object URL when the picker closes or a new file replaces it.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // load gallery + events
  //
  // The events request used to target `/api/admin/events`, which does not exist
  // — the only events endpoints are `/api/events`, `/api/events/active` and
  // `/api/events/[id]`. So the request 404'd, `.catch(() => [])` swallowed it,
  // and the Event picker rendered empty with no indication anything had failed.
  // Every other admin page (settlements, dashboard, EventSelector) already uses
  // `/api/events`; this was the sole outlier.
  //
  // `GET /api/events` returns a bare array of full event rows and is gated on
  // the admin cookie, which this page already holds.
  const loadGallery = useCallback(async () => {
    try {
      const [galleryRes, eventsRes] = await Promise.all([
        fetch("/api/hub/gallery").then(r => r.json()).catch(() => []),
        fetch("/api/events")
          .then(async (r) => {
            const body = await r.json().catch(() => null);
            if (!r.ok) {
              // Report rather than degrade to "no events exist" — an empty
              // picker reads as "this festival has no editions", which is a
              // different and much more alarming claim than "the list failed".
              throw new Error(
                (body && (body.error || body.message)) || `Events request failed (HTTP ${r.status})`
              );
            }
            return body;
          }),
      ]);

      const imgs = Array.isArray(galleryRes) ? galleryRes : (galleryRes?.images || []);
      const evts: Event[] = Array.isArray(eventsRes)
        ? eventsRes
        : ((eventsRes as any)?.events || []);

      setImages(imgs);
      setEvents(evts);
      setEventLoadError("");

      if (evts.length > 0) {
        // Default to the HOMEPAGE event, not merely the first row. `fetchAllEvents`
        // orders by created_at DESC, so `evts[0]` is the newest edition — which
        // for an archived-then-reopened festival is not the event currently
        // selling. This matches app/admin/settlements/page.tsx.
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

  useEffect(() => { loadGallery(); }, [loadGallery]);

  // file pick / drag-drop
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
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setUploadError("");
    try {
      let finalUrl = imageUrl.trim();
      let thumbnailUrl = "";
      const effectiveType: GalleryMediaType = urlMode
        ? (isVideoMediaUrl(finalUrl) ? "video" : "image")
        : mediaType;

      if (!urlMode && file) {
        setUploading(true);
        if (effectiveType === "video") {
          // Upload the video and extract its poster in parallel. The poster is
          // what the public grid paints; the video is only fetched on open.
          const posterPromise = extractVideoPoster(file).catch((): ExtractedPosterMeta => ({}));
          finalUrl = await uploadVideoFile(file);
          const meta = await posterPromise;
          thumbnailUrl = meta.poster_url || "";
        } else {
          finalUrl = await uploadImageFile(file);
        }
        setUploading(false);
      }

      if (!finalUrl) { setUploadError("Please pick a file or enter a URL."); setSaving(false); return; }

      // Refuse to guess the event. This used to fall back to `event_id: 1`,
      // which silently filed the image against whatever edition happens to
      // hold id 1 — a poster for the wrong festival, with no error anywhere.
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

      // reset + reload
      if (preview) URL.revokeObjectURL(preview);
      setFile(null); setPreview(null); setCaption(""); setImageUrl(""); setTag("PHOTO");
      setMediaType("image");
      setShowModal(false);
      await loadGallery();
    } catch (err: any) {
      setUploadError(err.message || "Something went wrong.");
      setUploading(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/hub/gallery?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to delete image");
      }
      await loadGallery();
    } catch (err: any) {
      alert(err.message || "Failed to delete image");
    } finally {
      setDeletingId(null);
    }
  };

  const openModal = () => {
    setFile(null); setPreview(null); setCaption(""); setImageUrl("");
    setTag("PHOTO"); setUploadError(""); setUrlMode(false); setUploading(false);
    setMediaType("image");
    setShowModal(true);
  };

  const visibleImages = images.filter(
    img => !img.image_url?.includes("photo-1540039155732") && !img.image_url?.includes("photo-1470229722913")
  );

  return (
    <div className="w-full min-h-screen bg-brand-off-white text-brand-navy p-4 md:p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-8 border-brand-navy pb-6 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link href="/admin/dashboard" className="p-2 border-2 border-brand-navy bg-white hover:bg-brand-accent transition-colors">
                ←
              </Link>
              <h1 className="font-display text-3xl md:text-4xl uppercase tracking-wider flex items-center gap-3">
                <ImageIcon className="w-7 h-7 text-brand-accent" />
                Gallery
              </h1>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-60">
              {visibleImages.length} item{visibleImages.length !== 1 ? "s" : ""} · Upload posters, photos &amp; videos
            </p>
          </div>
          <button
            onClick={openModal}
            className="flex items-center gap-2 bg-brand-accent text-brand-navy px-5 py-3 border-4 border-brand-navy shadow-(--shadow-brut-md) hover:bg-brand-navy hover:text-brand-accent font-bold uppercase transition-colors"
          >
            <Plus className="w-5 h-5" /> Add Media
          </button>
        </header>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center gap-3 font-bold uppercase text-lg py-12">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading Gallery…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleImages.map(img => {
              const isVideo = resolveGalleryMediaType(img.media_type, img.image_url) === "video";
              const poster = img.thumbnail_url && !isVideoMediaUrl(img.thumbnail_url) ? img.thumbnail_url : "";
              return (
              <div key={img.id} className="bg-white border-4 border-brand-navy shadow-(--shadow-brut-md) flex flex-col group relative">
                <div className="aspect-square bg-brand-navy/10 overflow-hidden relative">
                  {isVideo ? (
                    poster ? (
                      <img src={poster} alt={img.caption} className="w-full h-full object-cover" />
                    ) : (
                      <video src={img.image_url} muted playsInline preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                    )
                  ) : (
                    <img src={img.image_url} alt={img.caption} className="w-full h-full object-cover" />
                  )}
                  {isVideo && (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="bg-brand-navy/80 text-brand-off-white border-2 border-brand-off-white p-2">
                          <Play className="w-5 h-5" />
                        </span>
                      </div>
                      <span className="absolute bottom-2 left-2 bg-brand-accent text-brand-navy border-2 border-brand-navy text-[9px] font-black px-1.5 py-0.5 uppercase pointer-events-none">
                        VIDEO
                      </span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(img.id)}
                    disabled={deletingId === img.id}
                    className="absolute top-2 right-2 bg-red-600 text-white p-2 border-2 border-brand-navy shadow-(--shadow-brut-sm) opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                    title={isVideo ? "Delete video" : "Delete image"}
                  >
                    {deletingId === img.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm uppercase truncate">{img.caption || "No Caption"}</div>
                    <div className="text-[10px] uppercase font-bold opacity-50 mt-0.5">
                      {events.find(e => e.id === img.event_id)?.title || `Event ${img.event_id}`}
                    </div>
                  </div>
                  <span className="bg-brand-navy text-brand-off-white text-[9px] font-bold px-2 py-1 uppercase shrink-0">{img.tag}</span>
                </div>
              </div>
              );
            })}
            {visibleImages.length === 0 && (
              <div className="col-span-full py-16 text-center border-4 border-dashed border-brand-navy font-bold uppercase text-lg opacity-50">
                No media yet — click Add Media to upload the first one.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ADD MEDIA MODAL ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-brand-navy/80 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-brand-off-white border-4 border-brand-navy w-full max-w-lg shadow-(--shadow-brut-2xl) max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b-4 border-brand-navy px-6 py-4">
              <h2 className="font-display text-2xl uppercase tracking-wider">Add Media</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:text-red-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">

              {/* Event picker */}
              <div>
                <label className="block text-xs font-bold uppercase mb-2 tracking-widest">Event</label>
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
                    onChange={e => setEventId(e.target.value)}
                    className="w-full p-3 border-4 border-brand-navy bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-bold text-sm"
                  >
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.title}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Upload / URL toggle */}
              <div>
                <div className="flex gap-2 mb-3">
                  <button type="button" onClick={() => setUrlMode(false)}
                    className={`flex-1 py-2 border-2 border-brand-navy text-xs font-bold uppercase transition-colors ${!urlMode ? "bg-brand-navy text-brand-off-white" : "bg-white hover:bg-brand-accent"}`}>
                    <Upload className="w-3.5 h-3.5 inline mr-1" /> Upload File
                  </button>
                  <button type="button" onClick={() => setUrlMode(true)}
                    className={`flex-1 py-2 border-2 border-brand-navy text-xs font-bold uppercase transition-colors ${urlMode ? "bg-brand-navy text-brand-off-white" : "bg-white hover:bg-brand-accent"}`}>
                    🔗 Paste URL
                  </button>
                </div>

                {urlMode ? (
                  <>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={e => setImageUrl(e.target.value)}
                      placeholder="https://i.ibb.co/…/poster.jpg or https://…/recap.mp4"
                      className="w-full p-3 border-4 border-brand-navy bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-bold text-sm"
                    />
                    <p className="mt-2 text-[10px] font-bold uppercase opacity-50">
                      Video URLs (.mp4, .webm, .mov, .m4v) are detected automatically.
                    </p>
                  </>
                ) : (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-4 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 p-8 ${
                      dragging ? "border-brand-navy bg-brand-accent/30" : "border-brand-navy/40 hover:border-brand-navy hover:bg-brand-accent/10"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      className="sr-only"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
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
                          <img src={preview} alt="preview" className="max-h-40 object-contain border-2 border-brand-navy" />
                        )}
                        <span className="text-xs font-bold uppercase opacity-60">
                          {file?.name} · {mediaType === "video" ? "VIDEO" : "IMAGE"}
                        </span>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); if (preview) URL.revokeObjectURL(preview); setFile(null); setPreview(null); setMediaType("image"); }}
                          className="absolute top-2 right-2 bg-red-600 text-white p-1 hover:bg-red-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 opacity-40" />
                        <div className="text-center">
                          <div className="font-bold uppercase text-sm">Drop image or video here</div>
                          <div className="text-xs opacity-60 mt-1">or click to browse · JPG, PNG, WEBP, MP4, WEBM, MOV · images max 10 MB · videos max 150 MB</div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Caption */}
              <div>
                <label className="block text-xs font-bold uppercase mb-2 tracking-widest">Caption</label>
                <input
                  type="text"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  placeholder="Goodlife 4 — Official Poster"
                  className="w-full p-3 border-4 border-brand-navy bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-bold text-sm"
                />
              </div>

              {/* Tag */}
              <div>
                <label className="block text-xs font-bold uppercase mb-2 tracking-widest">Tag</label>
                <div className="flex flex-wrap gap-2">
                  {TAGS.map(t => (
                    <button
                      key={t} type="button"
                      onClick={() => setTag(t)}
                      className={`px-3 py-1.5 border-2 border-brand-navy text-xs font-bold uppercase transition-colors ${
                        tag === t ? "bg-brand-navy text-brand-off-white" : "bg-white hover:bg-brand-accent"
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>

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
                  className="flex-1 px-4 py-3 bg-white border-4 border-brand-navy font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading || (!file && !imageUrl.trim())}
                  className="flex-1 px-4 py-3 bg-brand-accent text-brand-navy border-4 border-brand-navy font-bold uppercase hover:bg-brand-navy hover:text-brand-accent shadow-(--shadow-brut-md) transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                  ) : saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  ) : (
                    <><CheckCircle className="w-4 h-4" /> Save Media</>
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

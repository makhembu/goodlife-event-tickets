"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Image as ImageIcon, Plus, Upload, X, CheckCircle, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";

const IMGBB_API_KEY = "46a61350ab6bdc4e5ab0ef6e4e47e5be"; // free public key — replace with your own from imgbb.com/api if needed
const TAGS = ["POSTER", "PHOTO", "RECAP", "PROMO", "FLYER"];

type GalleryImage = {
  id: number;
  event_id: number;
  image_url: string;
  caption: string;
  tag: string;
};

type Event = { id: number; title: string };

export default function AdminGalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // form state
  const [eventId, setEventId] = useState("");
  const [caption, setCaption] = useState("");
  const [tag, setTag] = useState("PHOTO");
  const [imageUrl, setImageUrl] = useState(""); // manual URL fallback
  const [urlMode, setUrlMode] = useState(false);

  // upload state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // load gallery + events
  const loadGallery = useCallback(async () => {
    try {
      const [galleryRes, eventsRes] = await Promise.all([
        fetch("/api/hub/gallery").then(r => r.json()).catch(() => []),
        fetch("/api/admin/events").then(r => r.json()).catch(() => []),
      ]);
      const imgs = Array.isArray(galleryRes) ? galleryRes : (galleryRes?.images || []);
      const evts: Event[] = Array.isArray(eventsRes) ? eventsRes : (eventsRes?.events || []);
      setImages(imgs);
      setEvents(evts);
      if (evts.length > 0) setEventId(evts[0].id.toString());
    } catch {
      setImages([]); setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGallery(); }, [loadGallery]);

  // file pick / drag-drop
  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) { setUploadError("Please select an image file."); return; }
    if (f.size > 10 * 1024 * 1024) { setUploadError("Max 10 MB per image."); return; }
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

  // upload to imgbb → get hosted URL
  const uploadToImgbb = async (f: File): Promise<string> => {
    const form = new FormData();
    form.append("image", f);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: "POST", body: form,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "imgbb upload failed");
    return json.data.url as string;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setUploadError("");
    try {
      let finalUrl = imageUrl.trim();

      if (!urlMode && file) {
        setUploading(true);
        finalUrl = await uploadToImgbb(file);
        setUploading(false);
      }

      if (!finalUrl) { setUploadError("Please pick a file or enter a URL."); setSaving(false); return; }

      const res = await fetch("/api/hub/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId ? parseInt(eventId) : 1,
          image_url: finalUrl,
          caption: caption.trim(),
          tag,
        }),
      });

      if (!res.ok) throw new Error("Failed to save image");

      // reset + reload
      setFile(null); setPreview(null); setCaption(""); setImageUrl(""); setTag("PHOTO");
      setShowModal(false);
      await loadGallery();
    } catch (err: any) {
      setUploadError(err.message || "Something went wrong.");
      setUploading(false);
    } finally {
      setSaving(false);
    }
  };

  const openModal = () => {
    setFile(null); setPreview(null); setCaption(""); setImageUrl("");
    setTag("PHOTO"); setUploadError(""); setUrlMode(false); setUploading(false);
    setShowModal(true);
  };

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
              {images.length} image{images.length !== 1 ? "s" : ""} · Upload posters &amp; recap photos
            </p>
          </div>
          <button
            onClick={openModal}
            className="flex items-center gap-2 bg-brand-accent text-brand-navy px-5 py-3 border-4 border-brand-navy shadow-(--shadow-brut-md) hover:bg-brand-navy hover:text-brand-accent font-bold uppercase transition-colors"
          >
            <Plus className="w-5 h-5" /> Add Image
          </button>
        </header>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center gap-3 font-bold uppercase text-lg py-12">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading Gallery…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {images
              .filter(img => !img.image_url?.includes("photo-1540039155732") && !img.image_url?.includes("photo-1470229722913"))
              .map(img => (
                <div key={img.id} className="bg-white border-4 border-brand-navy shadow-(--shadow-brut-md) flex flex-col">
                  <div className="aspect-square bg-brand-navy/10 overflow-hidden">
                    <img src={img.image_url} alt={img.caption} className="w-full h-full object-cover" />
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
              ))}
            {images.length === 0 && (
              <div className="col-span-full py-16 text-center border-4 border-dashed border-brand-navy font-bold uppercase text-lg opacity-50">
                No images yet — click Add Image to upload the first one.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ADD IMAGE MODAL ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-brand-navy/80 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-brand-off-white border-4 border-brand-navy w-full max-w-lg shadow-(--shadow-brut-2xl) max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b-4 border-brand-navy px-6 py-4">
              <h2 className="font-display text-2xl uppercase tracking-wider">Add Image</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:text-red-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">

              {/* Event picker */}
              <div>
                <label className="block text-xs font-bold uppercase mb-2 tracking-widest">Event</label>
                <select
                  value={eventId}
                  onChange={e => setEventId(e.target.value)}
                  className="w-full p-3 border-4 border-brand-navy bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-bold text-sm"
                >
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                  ))}
                </select>
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
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    placeholder="https://i.ibb.co/…/poster.jpg"
                    className="w-full p-3 border-4 border-brand-navy bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-bold text-sm"
                  />
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
                      accept="image/*"
                      className="sr-only"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                    {preview ? (
                      <>
                        <img src={preview} alt="preview" className="max-h-40 object-contain border-2 border-brand-navy" />
                        <span className="text-xs font-bold uppercase opacity-60">{file?.name}</span>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setFile(null); setPreview(null); }}
                          className="absolute top-2 right-2 bg-red-600 text-white p-1 hover:bg-red-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 opacity-40" />
                        <div className="text-center">
                          <div className="font-bold uppercase text-sm">Drop image here</div>
                          <div className="text-xs opacity-60 mt-1">or click to browse · JPG, PNG, WEBP · max 10 MB</div>
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
                    <><CheckCircle className="w-4 h-4" /> Save Image</>
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

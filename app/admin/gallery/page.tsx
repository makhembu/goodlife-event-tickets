"use client";

import React, { useState, useEffect } from "react";
import { Image as ImageIcon, Plus, CheckCircle, Flame } from "lucide-react";
import Link from "next/link";

export default function AdminGalleryPage() {
  const [images, setImages] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ event_id: "", image_url: "", caption: "", tag: "POSTER" });

  useEffect(() => {
    Promise.all([
      fetch("/api/hub/gallery").then((res) => res.json()).catch(() => []),
      fetch("/api/admin/events").then((res) => res.json()).catch(() => [])
    ]).then(([galleryData, eventsData]) => {
      setImages(Array.isArray(galleryData) ? galleryData : (galleryData?.images || []));
      setEvents(Array.isArray(eventsData) ? eventsData : (eventsData?.events || []));
      if (eventsData && eventsData.length > 0) {
        setFormData(prev => ({ ...prev, event_id: eventsData[0].id.toString() }));
      }
      setLoading(false);
    }).catch(err => {
      console.error("Admin gallery fetch error:", err);
      setImages([]);
      setEvents([]);
      setLoading(false);
    });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/hub/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          event_id: formData.event_id ? parseInt(formData.event_id) : 1 // fallback to 1 if no events loaded
        }),
      });
      if (res.ok) {
        setShowAddModal(false);
        const data = await fetch("/api/hub/gallery").then(r => r.json());
        setImages(data || []);
        setFormData({ event_id: formData.event_id, image_url: "", caption: "", tag: "POSTER" });
      } else {
        alert("Failed to add image");
      }
    } catch (err) {
      alert("Error adding image");
    }
  };

  return (
    <div className="w-full min-h-screen bg-brand-off-white text-brand-navy p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-8 border-brand-navy pb-6 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link href="/admin/dashboard" className="p-2 border-2 border-brand-navy bg-white hover:bg-brand-accent transition-colors">
                &larr;
              </Link>
              <h1 className="font-display text-4xl uppercase tracking-wider flex items-center gap-3">
                <ImageIcon className="w-8 h-8 text-brand-accent" />
                Gallery Management
              </h1>
            </div>
            <p className="text-sm font-bold uppercase tracking-widest opacity-70">
              Upload event posters and recap photos
            </p>
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-brand-accent text-brand-navy px-6 py-3 border-4 border-brand-navy shadow-(--shadow-brut-md) hover:bg-brand-navy hover:text-brand-accent font-bold uppercase transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Image
          </button>
        </header>

        {loading ? (
          <div className="animate-pulse font-bold uppercase text-lg">Loading Gallery...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {images.filter(img => !img.image_url?.includes("photo-1540039155732") && !img.image_url?.includes("photo-1470229722913")).map((img) => (
              <div key={img.id} className="bg-white border-4 border-brand-navy shadow-(--shadow-brut-md) p-4 flex flex-col justify-between">
                <div>
                  <div className="aspect-square bg-brand-navy/10 border-2 border-brand-navy mb-4 overflow-hidden relative">
                    <img src={img.image_url} alt={img.caption} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-bold text-lg uppercase truncate">{img.caption || "No Caption"}</div>
                    <span className="bg-brand-navy text-brand-off-white text-[10px] font-bold px-2 py-1 uppercase">{img.tag}</span>
                  </div>
                  <div className="text-xs uppercase font-bold opacity-70 mb-4">Event ID: {img.event_id}</div>
                </div>
              </div>
            ))}
            {images.length === 0 && (
              <div className="col-span-full p-12 text-center border-4 border-brand-navy bg-white font-bold uppercase text-xl">
                No images in gallery.
              </div>
            )}
          </div>
        )}

        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-brand-navy/90 flex items-center justify-center p-4">
            <div className="bg-brand-off-white border-4 border-brand-accent p-8 w-full max-w-md shadow-(--shadow-brut-2xl)">
              <h2 className="font-display text-2xl uppercase mb-6 text-brand-navy border-b-4 border-brand-navy pb-2">Add New Image</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase mb-2">Image URL (Poster/Photo)</label>
                  <input 
                    type="url" 
                    required
                    value={formData.image_url}
                    onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                    className="w-full p-3 border-4 border-brand-navy bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-bold"
                    placeholder="https://example.com/poster.jpg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-2">Caption</label>
                  <input 
                    type="text" 
                    required
                    value={formData.caption}
                    onChange={(e) => setFormData({...formData, caption: e.target.value})}
                    className="w-full p-3 border-4 border-brand-navy bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-bold"
                    placeholder="Goodlife XP Official Poster"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-3 bg-white border-4 border-brand-navy font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 bg-brand-accent text-brand-navy border-4 border-brand-navy font-bold uppercase hover:bg-brand-navy hover:text-brand-accent shadow-(--shadow-brut-md) transition-colors"
                  >
                    Save Image
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

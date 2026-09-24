"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Flame, ArrowLeft, Download, Share2, X, Maximize2 } from "lucide-react";
import Image from "next/image";

interface GalleryImage {
  id: number;
  event_id: number;
  image_url: string;
  thumbnail_url: string;
  caption: string;
  tag: string;
}

export default function GalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string>("ALL");
  const [lightboxImage, setLightboxImage] = useState<GalleryImage | null>(null);

  useEffect(() => {
    fetch("/api/hub/gallery")
      .then(res => res.json())
      .then(data => {
        setImages(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const tags = ["ALL", ...Array.from(new Set(images.map(img => img.tag).filter(Boolean)))];
  
  const filteredImages = selectedTag === "ALL" 
    ? images 
    : images.filter(img => img.tag === selectedTag);

  return (
    <div className="min-h-screen bg-brand-bg py-8 px-4 md:px-12 text-brand-navy font-sans">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20"
           style={{ backgroundImage: 'radial-gradient(rgba(20,43,76,0.18) 1px, transparent 1px), radial-gradient(rgba(199,154,86,0.12) 1px, transparent 1px)', backgroundSize: '24px 24px, 48px 48px', backgroundPosition: '0 0, 12px 12px' }}></div>
      
      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <header className="w-full flex items-center justify-between border-b-4 border-brand-navy pb-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent transition-colors shadow-(--shadow-brut-sm)">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="font-display text-2xl tracking-wide uppercase">GOODLIFE GALLERY</span>
          </div>
          <Flame className="w-6 h-6 text-brand-accent hidden md:block" strokeWidth={2.5} />
        </header>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {tags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest border-2 transition-all shadow-(--shadow-brut-xs) active:translate-y-[2px] active:translate-x-[2px] active:shadow-none cursor-pointer ${
                selectedTag === tag 
                ? "border-brand-navy bg-brand-navy text-brand-accent" 
                : "border-brand-navy bg-brand-off-white text-brand-navy hover:bg-brand-accent"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center font-mono uppercase tracking-widest animate-pulse">
            Loading Archives...
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 md:columns-3 gap-6 space-y-6">
            {filteredImages.map((img) => (
              <div 
                key={img.id} 
                className="break-inside-avoid border-4 border-brand-navy bg-brand-off-white p-2 shadow-(--shadow-brut-md) hover:shadow-(--shadow-brut-xl) hover:-translate-y-1 transition-all group cursor-pointer"
                onClick={() => setLightboxImage(img)}
              >
                <div className="relative w-full aspect-auto overflow-hidden bg-brand-navy/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.thumbnail_url || img.image_url} alt={img.caption || "Festival Photo"} className="w-full h-auto object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-500" loading="lazy" />
                  <div className="absolute top-2 right-2 bg-brand-navy text-brand-off-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-3 h-3" />
                  </div>
                </div>
                {img.caption && (
                  <p className="mt-2 font-mono text-xs uppercase text-brand-navy/80 truncate px-1">
                    {img.caption}
                  </p>
                )}
              </div>
            ))}
            {filteredImages.length === 0 && (
              <div className="col-span-full py-12 text-center font-mono uppercase text-brand-navy/60">
                No photos found for {selectedTag}.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div className="fixed inset-0 z-50 bg-brand-navy/95 backdrop-blur-md flex flex-col p-4 md:p-8">
          <div className="flex justify-between items-center mb-4">
            <div className="text-brand-accent font-display text-xl uppercase">GOODLIFE · MARARA CAMP</div>
            <button 
              onClick={() => setLightboxImage(null)}
              className="text-brand-off-white hover:text-brand-accent transition-colors cursor-pointer"
            >
              <X className="w-8 h-8" />
            </button>
          </div>
          
          <div className="flex-1 relative flex items-center justify-center min-h-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={lightboxImage.image_url} 
              alt="Lightbox" 
              className="max-w-full max-h-full object-contain border-4 border-brand-navy shadow-(--shadow-brut-2xl)" 
            />
            
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
              <a 
                href={lightboxImage.image_url} 
                download
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 bg-brand-accent text-brand-navy font-bold uppercase tracking-widest px-6 py-3 border-4 border-brand-navy shadow-(--shadow-brut-sm) hover:bg-brand-off-white transition-colors cursor-pointer"
              >
                <Download className="w-5 h-5" /> High-Res
              </a>
              <button 
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: "GOODLIFE", url: lightboxImage.image_url });
                  }
                }}
                className="flex items-center gap-2 bg-brand-off-white text-brand-navy font-bold uppercase tracking-widest px-6 py-3 border-4 border-brand-navy shadow-(--shadow-brut-sm) hover:bg-brand-accent transition-colors cursor-pointer"
              >
                <Share2 className="w-5 h-5" /> Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

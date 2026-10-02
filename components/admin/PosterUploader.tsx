"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import { Upload, Image as ImageIcon, Loader2, X, CheckCircle, ExternalLink } from "lucide-react";

const IMGBB_API_KEY = "46a61350ab6bdc4e5ab0ef6e4e47e5be";

interface PosterUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
}

export default function PosterUploader({
  value,
  onChange,
  label = "Poster Artwork / Flyer",
  required = false,
  className = "",
}: PosterUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (f: File) => {
    if (!f.type.startsWith("image/")) {
      setUploadError("Please select a valid image file (PNG, JPG, WEBP).");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setUploadError("File size exceeds 10 MB limit.");
      return;
    }

    setUploadError("");
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("image", f);

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || "Failed to upload to ImgBB");
      }

      const uploadedUrl = data.data.url as string;
      onChange(uploadedUrl);
    } catch (err: any) {
      console.error("Poster upload error:", err);
      setUploadError(err.message || "Failed to upload image. Please try again or paste a URL.");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => {
    setDragging(false);
  };

  const isRemoteImage = value && (value.startsWith("http://") || value.startsWith("https://"));

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-black uppercase text-brand-navy flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-brand-navy" />
          <span>{label} {required && <span className="text-red-600">*</span>}</span>
        </label>
        <button
          type="button"
          onClick={() => setShowManualInput(!showManualInput)}
          className="text-[10px] font-mono font-bold uppercase underline text-brand-navy/70 hover:text-brand-navy cursor-pointer"
        >
          {showManualInput ? "Hide manual URL" : "Edit URL path"}
        </button>
      </div>

      {/* Main Upload / Preview Area */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`border-2 transition-all p-3 bg-white relative ${
          dragging
            ? "border-brand-accent bg-brand-accent/10"
            : "border-brand-navy"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {value ? (
          <div className="flex items-start gap-3">
            {/* Thumbnail Preview */}
            <div className="w-16 h-22 sm:w-20 sm:h-28 relative shrink-0 border-2 border-brand-navy bg-brand-navy/5 overflow-hidden shadow-xs">
              <Image
                src={value}
                alt="Poster preview"
                fill
                sizes="80px"
                className="object-cover"
                unoptimized={!isRemoteImage}
              />
            </div>

            {/* Poster Details & Actions */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-1.5 text-green-700 font-mono text-[11px] font-bold">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Poster Active</span>
              </div>

              <p className="text-[11px] font-mono text-brand-navy/80 truncate break-all" title={value}>
                {value}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-brand-accent text-brand-navy border-2 border-brand-navy text-[10px] font-mono font-bold uppercase tracking-wider shadow-xs hover:bg-brand-accent/80 active:translate-y-[1px] cursor-pointer flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" />
                  <span>Replace Photo</span>
                </button>

                {isRemoteImage && (
                  <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 border border-brand-navy/40 text-brand-navy/70 hover:text-brand-navy hover:border-brand-navy text-[10px] inline-flex items-center gap-1 font-mono"
                    title="Open original image in new tab"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => onChange("")}
                  className="px-2 py-1 border border-red-500/40 text-red-600 hover:bg-red-50 text-[10px] font-mono font-bold uppercase cursor-pointer flex items-center gap-1"
                  title="Remove poster"
                >
                  <X className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Empty State: Dropzone */
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer text-center py-4 px-2 hover:bg-brand-navy/5 transition-colors border border-dashed border-brand-navy/30"
          >
            {uploading ? (
              <div className="flex flex-col items-center justify-center gap-2 text-brand-navy py-2">
                <Loader2 className="w-6 h-6 animate-spin text-brand-navy" />
                <span className="text-xs font-mono font-bold uppercase">Uploading to ImgBB...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 text-brand-navy">
                <div className="p-2 border-2 border-brand-navy bg-brand-accent shadow-xs mb-1">
                  <Upload className="w-4 h-4 text-brand-navy" />
                </div>
                <div className="text-xs font-bold uppercase">
                  Click to Upload or Drag Poster Image Here
                </div>
                <div className="text-[10px] font-mono text-brand-navy/60">
                  PNG, JPG, WEBP up to 10 MB (Hosted on ImgBB)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Uploading Overlay if replacing */}
        {uploading && value && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center gap-2 text-brand-navy z-10">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs font-mono font-bold uppercase">Uploading to ImgBB...</span>
          </div>
        )}
      </div>

      {/* Manual Path / URL input fallback */}
      {showManualInput && (
        <div className="pt-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. /flyer.png or https://i.ibb.co/..."
            className="w-full px-2.5 py-1.5 border-2 border-brand-navy font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-accent bg-white"
          />
          <span className="text-[10px] text-brand-navy/60 font-mono mt-0.5 block">
            Direct local path (e.g. <code>/flyer.png</code>) or hosted CDN URL.
          </span>
        </div>
      )}

      {/* Upload Error Alert */}
      {uploadError && (
        <div className="p-2 bg-red-100 border border-red-500 text-red-800 text-[11px] font-mono font-bold flex items-center justify-between">
          <span>{uploadError}</span>
          <button type="button" onClick={() => setUploadError("")} className="text-red-800 font-bold ml-2">
            &times;
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useRef } from "react";
import { Upload, Film, Loader2, X, CheckCircle, ExternalLink, Play } from "lucide-react";

interface VideoUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
}

export default function VideoUploader({
  value,
  onChange,
  label = "Hero Teaser Video",
  required = false,
  className = "",
}: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (f: File) => {
    // Validate video mime or extension
    const isVideo =
      f.type.startsWith("video/") ||
      /\.(mp4|webm|mov|m4v|ogg|mkv)($|\?)/i.test(f.name);

    if (!isVideo) {
      setUploadError("Please select a valid video file (MP4, WEBM, MOV).");
      return;
    }

    if (f.size > 150 * 1024 * 1024) {
      setUploadError("Video size exceeds 150 MB limit.");
      return;
    }

    setUploadError("");
    setUploading(true);
    setUploadStatus("Uploading video to cloud (Catbox / Pomf fallback)...");

    try {
      const formData = new FormData();
      formData.append("video", f);

      const res = await fetch("/api/admin/upload-video", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to upload video");
      }

      const uploadedUrl = data.url as string;
      onChange(uploadedUrl);
    } catch (err: any) {
      console.error("Video upload error:", err);
      setUploadError(err.message || "Failed to upload video. Please try again or paste a URL.");
    } finally {
      setUploading(false);
      setUploadStatus("");
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  const isRemoteVideo = value && (value.startsWith("http://") || value.startsWith("https://"));

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-black uppercase text-brand-navy flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5 text-brand-navy" />
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
          accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {value ? (
          <div className="flex items-start gap-3">
            {/* Video Preview Box */}
            <div className="w-24 h-16 sm:w-28 sm:h-20 relative shrink-0 border-2 border-brand-navy bg-black overflow-hidden shadow-xs flex items-center justify-center">
              <video
                src={value}
                muted
                playsInline
                preload="metadata"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                <Play className="w-4 h-4 text-white fill-white/80" />
              </div>
            </div>

            {/* Video Details & Actions */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-1.5 text-green-700 font-mono text-[11px] font-bold">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Teaser Video Ready</span>
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
                  <span>Replace Video</span>
                </button>

                {isRemoteVideo && (
                  <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 border border-brand-navy/40 text-brand-navy/70 hover:text-brand-navy hover:border-brand-navy text-[10px] inline-flex items-center gap-1 font-mono"
                    title="Open video URL in new tab"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => onChange("")}
                  className="px-2 py-1 border border-red-500/40 text-red-600 hover:bg-red-50 text-[10px] font-mono font-bold uppercase cursor-pointer flex items-center gap-1"
                  title="Remove video"
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
                <span className="text-xs font-mono font-bold uppercase">{uploadStatus || "Uploading video..."}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 text-brand-navy">
                <div className="p-2 border-2 border-brand-navy bg-brand-accent shadow-xs mb-1">
                  <Upload className="w-4 h-4 text-brand-navy" />
                </div>
                <div className="text-xs font-bold uppercase">
                  Click to Upload or Drag Teaser Video Here
                </div>
                <div className="text-[10px] font-mono text-brand-navy/60">
                  MP4, WEBM, MOV up to 150 MB (Catbox + Multi-Tier Fallback)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Uploading Overlay if replacing */}
        {uploading && value && (
          <div className="absolute inset-0 bg-white/85 backdrop-blur-xs flex items-center justify-center gap-2 text-brand-navy z-10 p-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs font-mono font-bold uppercase">{uploadStatus || "Uploading video..."}</span>
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
            placeholder="e.g. https://...r2.dev/videos/... or https://files.catbox.moe/..."
            className="w-full px-2.5 py-1.5 border-2 border-brand-navy font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-accent bg-white"
          />
          <span className="text-[10px] text-brand-navy/60 font-mono mt-0.5 block">
            Cloudflare R2 or CDN video URL.
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
